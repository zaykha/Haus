type TableRow = Record<string, any>;
export type DatabaseState = Record<string, TableRow[]>;

export type FailureMap = Record<string, string>;

type QueryAction = "select" | "insert" | "update" | "delete" | "upsert";
type SingleMode = "many" | "single" | "maybeSingle";

type QueryResult = {
  data: any;
  error: null | { message: string };
};

type OrderConfig = {
  column: string;
  ascending: boolean;
};

type Filter =
  | { kind: "eq"; column: string; value: any }
  | { kind: "is"; column: string; value: any }
  | { kind: "in"; column: string; values: any[] }
  | { kind: "ilike"; column: string; value: string };

function cloneRow<T extends TableRow>(row: T): T {
  return JSON.parse(JSON.stringify(row)) as T;
}

function makeError(message: string) {
  return { message };
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function parseSelectColumns(value: string | undefined) {
  if (!value) {
    return { columns: null as string[] | null, includeClientOrganizations: false };
  }

  return {
    columns: value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item && !item.startsWith("client_organizations(")),
    includeClientOrganizations: value.includes("client_organizations("),
  };
}

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly filters: Filter[] = [];
  private action: QueryAction = "select";
  private selectValue?: string;
  private singleMode: SingleMode = "many";
  private limitCount?: number;
  private orderConfig?: OrderConfig;
  private mutationPayload: TableRow[] = [];
  private onConflictKeys: string[] = [];

  constructor(
    private readonly state: DatabaseState,
    private readonly table: string,
    private readonly failures: FailureMap,
  ) {}

  select(value: string) {
    this.selectValue = value;
    return this;
  }

  insert(value: TableRow | TableRow[]) {
    this.action = "insert";
    this.mutationPayload = Array.isArray(value) ? value.map(cloneRow) : [cloneRow(value)];
    return this;
  }

  update(value: TableRow) {
    this.action = "update";
    this.mutationPayload = [cloneRow(value)];
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  upsert(value: TableRow | TableRow[], options?: { onConflict?: string }) {
    this.action = "upsert";
    this.mutationPayload = Array.isArray(value) ? value.map(cloneRow) : [cloneRow(value)];
    this.onConflictKeys = String(options?.onConflict ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ kind: "in", column, values });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ kind: "ilike", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderConfig = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    const failureKey = `${this.table}:${this.action}`;
    if (this.failures[failureKey]) {
      return { data: null, error: makeError(this.failures[failureKey]) };
    }

    const tableRows = this.state[this.table] ?? (this.state[this.table] = []);
    const matchedIndexes = tableRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => this.matchesFilters(row))
      .map(({ index }) => index);

    let resultRows: TableRow[] = [];

    if (this.action === "select") {
      resultRows = matchedIndexes.map((index) => cloneRow(tableRows[index] ?? {}));
    } else if (this.action === "insert") {
      const inserted = this.mutationPayload.map((row, index) => this.prepareInsertedRow(row, tableRows.length + index));
      tableRows.push(...inserted);
      resultRows = inserted.map(cloneRow);
    } else if (this.action === "update") {
      const payload = this.mutationPayload[0] ?? {};
      resultRows = matchedIndexes.map((index) => {
        const nextRow = {
          ...(tableRows[index] ?? {}),
          ...payload,
        };
        tableRows[index] = nextRow;
        return cloneRow(nextRow);
      });
    } else if (this.action === "delete") {
      resultRows = matchedIndexes.map((index) => cloneRow(tableRows[index] ?? {}));
      const nextRows = tableRows.filter((_, index) => !matchedIndexes.includes(index));
      this.state[this.table] = nextRows;
    } else if (this.action === "upsert") {
      const nextRows: TableRow[] = [];
      for (const payload of this.mutationPayload) {
        const existingIndex = tableRows.findIndex((row) =>
          this.onConflictKeys.length > 0 &&
          this.onConflictKeys.every((key) => row[key] === payload[key]),
        );

        if (existingIndex >= 0) {
          const updated = { ...tableRows[existingIndex], ...payload };
          tableRows[existingIndex] = updated;
          nextRows.push(cloneRow(updated));
        } else {
          const inserted = this.prepareInsertedRow(payload, tableRows.length);
          tableRows.push(inserted);
          nextRows.push(inserted);
        }
      }

      resultRows = nextRows.map(cloneRow);
    }

    resultRows = this.applyOrderingAndLimit(resultRows);
    const shaped = resultRows.map((row) => this.shapeSelectedRow(row));

    if (this.singleMode === "many") {
      return { data: shaped, error: null };
    }

    if (this.singleMode === "maybeSingle") {
      if (shaped.length === 0) {
        return { data: null, error: null };
      }
      if (shaped.length > 1) {
        return { data: null, error: makeError("Multiple rows returned") };
      }
      return { data: shaped[0], error: null };
    }

    if (shaped.length !== 1) {
      return { data: null, error: makeError(shaped.length === 0 ? "No rows returned" : "Multiple rows returned") };
    }

    return { data: shaped[0], error: null };
  }

  private matchesFilters(row: TableRow) {
    return this.filters.every((filter) => {
      const value = row[filter.column];
      if (filter.kind === "eq") {
        return value === filter.value;
      }
      if (filter.kind === "is") {
        if (filter.value === null) {
          return value === null || value === undefined;
        }
        return value === filter.value;
      }
      if (filter.kind === "in") {
        return filter.values.includes(value);
      }
      if (filter.kind === "ilike") {
        return normalizeEmail(value) === normalizeEmail(filter.value);
      }
      return true;
    });
  }

  private applyOrderingAndLimit(rows: TableRow[]) {
    const nextRows = rows.slice();

    if (this.orderConfig) {
      const { column, ascending } = this.orderConfig;
      nextRows.sort((left, right) => {
        const leftValue = left[column];
        const rightValue = right[column];
        if (leftValue === rightValue) {
          return 0;
        }
        if (leftValue === undefined || leftValue === null) {
          return ascending ? 1 : -1;
        }
        if (rightValue === undefined || rightValue === null) {
          return ascending ? -1 : 1;
        }
        if (leftValue > rightValue) {
          return ascending ? 1 : -1;
        }
        return ascending ? -1 : 1;
      });
    }

    if (typeof this.limitCount === "number") {
      return nextRows.slice(0, this.limitCount);
    }

    return nextRows;
  }

  private shapeSelectedRow(row: TableRow) {
    const { columns, includeClientOrganizations } = parseSelectColumns(this.selectValue);
    const base = columns
      ? columns.reduce<Record<string, any>>((acc, column) => {
          acc[column] = row[column];
          return acc;
        }, {})
      : cloneRow(row);

    if (includeClientOrganizations) {
      const organizations = this.state.client_organizations ?? [];
      const organization = organizations.find((item) => item.id === row.client_organization_id) ?? null;
      base.client_organizations = organization ? { name: organization.name } : null;
    }

    return base;
  }

  private prepareInsertedRow(row: TableRow, indexHint: number) {
    const nextRow = cloneRow(row);
    if (
      nextRow.id === undefined &&
      this.table !== "project_members" &&
      this.table !== "client_organization_liaisons" &&
      this.table !== "storage_cleanup_queue"
    ) {
      nextRow.id = `${this.table}-${indexHint + 1}`;
    }

    return nextRow;
  }
}

class FakeStorageBucket {
  constructor(private readonly failures: FailureMap, private readonly bucketName: string) {}

  async remove(_filePaths: string[]) {
    const failure = this.failures[`storage:${this.bucketName}:remove`];
    return failure ? { error: makeError(failure) } : { error: null };
  }
}

export type AuthUser = {
  id: string;
  email?: string | null;
  password?: string;
  user_metadata?: Record<string, any>;
};

type AuthCreateUserResult = {
  data: { user: AuthUser | null };
  error: null | { message: string };
};

type AuthDeleteUserResult = {
  error: null | { message: string };
};

type AuthListUsersResult = {
  data: { users: AuthUser[] } | null;
  error: null | { message: string };
};

export class FakeSupabaseAdminClient {
  readonly storage = {
    from: (bucketName: string) => new FakeStorageBucket(this.failures, bucketName),
  };

  readonly auth = {
    admin: {
      createUser: async (_payload: {
        email: string;
        password: string;
        user_metadata?: Record<string, any>;
      }): Promise<AuthCreateUserResult> => ({ data: { user: null }, error: null }),
      deleteUser: async (_userId: string): Promise<AuthDeleteUserResult> => ({ error: null }),
      listUsers: async (_input: { page: number; perPage: number }): Promise<AuthListUsersResult> => ({
        data: { users: [] as AuthUser[] },
        error: null,
      }),
    },
  };

  private authIdCounter = 1;

  constructor(
    readonly state: DatabaseState,
    private readonly failures: FailureMap = {},
    initialAuthUsers: AuthUser[] = [],
  ) {
    const authUsers = initialAuthUsers.map(cloneRow);

    this.auth.admin.createUser = async (payload: {
      email: string;
      password: string;
      user_metadata?: Record<string, any>;
    }): Promise<AuthCreateUserResult> => {
      const failure = this.failures["auth:createUser"];
      if (failure) {
        return { data: { user: null }, error: makeError(failure) };
      }

      const user = {
        id: `auth-user-${this.authIdCounter++}`,
        email: payload.email,
        password: payload.password,
        user_metadata: payload.user_metadata ?? {},
      };
      authUsers.push(user);
      return { data: { user: cloneRow(user) }, error: null };
    };

    this.auth.admin.deleteUser = async (userId: string): Promise<AuthDeleteUserResult> => {
      const failure = this.failures["auth:deleteUser"];
      if (failure) {
        return { error: makeError(failure) };
      }

      const index = authUsers.findIndex((user) => user.id === userId);
      if (index < 0) {
        return { error: makeError("User not found") };
      }

      authUsers.splice(index, 1);
      return { error: null };
    };

    this.auth.admin.listUsers = async ({
      page,
      perPage,
    }: {
      page: number;
      perPage: number;
    }): Promise<AuthListUsersResult> => {
      const failure = this.failures["auth:listUsers"];
      if (failure) {
        return { data: null, error: makeError(failure) };
      }

      const start = Math.max(0, (page - 1) * perPage);
      const end = start + perPage;
      return {
        data: {
          users: authUsers.slice(start, end).map(cloneRow),
        },
        error: null,
      };
    };
  }

  from(table: string) {
    return new FakeQuery(this.state, table, this.failures);
  }

  getAuthUsers() {
    return this.auth.admin
      .listUsers({ page: 1, perPage: 10_000 })
      .then((result) => result.data?.users ?? []);
  }
}

export function createFakeSupabaseAdminClient({
  state,
  failures,
  authUsers,
}: {
  state?: DatabaseState;
  failures?: FailureMap;
  authUsers?: AuthUser[];
} = {}) {
  return new FakeSupabaseAdminClient(
    {
      profiles: [],
      client_organizations: [],
      client_organization_liaisons: [],
      invitations: [],
      project_members: [],
      tasks: [],
      project_comments: [],
      project_feedback: [],
      project_activity: [],
      project_files: [],
      storage_cleanup_queue: [],
      chat_conversation_participants: [],
      chat_conversations: [],
      chat_messages: [],
      chat_message_reactions: [],
      ...(state ?? {}),
    },
    failures ?? {},
    authUsers ?? [],
  );
}
