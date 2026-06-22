export type TaskCompletionVersionKind = "internal" | "submitted";

export type TaskCompletionVersionSnapshot = {
  id: string;
  label: string;
  kind: TaskCompletionVersionKind;
  number: number;
  assets: string[];
  createdAt: string;
};

export type TaskCompletionState = {
  schema: "task-deliverable-history-v1";
  currentAssets: string[];
  currentVersionKind: TaskCompletionVersionKind;
  internalVersion: number;
  submittedVersion: number;
  history: TaskCompletionVersionSnapshot[];
};

const TASK_COMPLETION_SCHEMA = "task-deliverable-history-v1";

function sanitizeAssets(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function createDefaultState(): TaskCompletionState {
  return {
    schema: TASK_COMPLETION_SCHEMA,
    currentAssets: [],
    currentVersionKind: "internal",
    internalVersion: 1,
    submittedVersion: 1,
    history: [],
  };
}

function getVersionLabel(kind: TaskCompletionVersionKind, number: number) {
  return `${kind === "internal" ? "IV" : "SV"}${number}`;
}

export function parseTaskCompletionState(value?: string | null): TaskCompletionState {
  const fallback = createDefaultState();
  if (!value?.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return {
        ...fallback,
        currentAssets: sanitizeAssets(
          parsed.filter((item): item is string => typeof item === "string"),
        ),
      };
    }

    if (parsed && typeof parsed === "object" && (parsed as { schema?: string }).schema === TASK_COMPLETION_SCHEMA) {
      const record = parsed as Partial<TaskCompletionState>;
      const history = Array.isArray(record.history)
        ? record.history
            .filter(
              (item): item is TaskCompletionVersionSnapshot =>
                Boolean(item && typeof item === "object" && typeof (item as any).id === "string"),
            )
            .map((item): TaskCompletionVersionSnapshot => {
              const safeId = typeof item.id === "string" && item.id.trim().length > 0 ? item.id : getVersionLabel("internal", 1);

              const safeKind: TaskCompletionVersionKind = item.kind === "submitted" ? "submitted" : "internal";

              const safeNumber = typeof item.number === "number" && Number.isFinite(item.number) && item.number >= 1 ? item.number : 1;

              const safeAssets = sanitizeAssets(Array.isArray(item.assets) ? item.assets : []);

              const safeLabel =
                typeof item.label === "string" && item.label.trim().length > 0
                  ? item.label
                  : getVersionLabel(safeKind, safeNumber);

              const safeCreatedAt =
                typeof item.createdAt === "string" && item.createdAt.trim().length > 0
                  ? item.createdAt
                  : new Date(0).toISOString();

              return {
                id: safeId,
                label: safeLabel,
                kind: safeKind,
                number: safeNumber,
                assets: safeAssets,
                createdAt: safeCreatedAt,
              };
            })
        : [];


      return {
        schema: TASK_COMPLETION_SCHEMA,
        currentAssets: sanitizeAssets(Array.isArray(record.currentAssets) ? record.currentAssets : []),
        currentVersionKind: record.currentVersionKind === "submitted" ? "submitted" : "internal",
        internalVersion:
          typeof record.internalVersion === "number" && Number.isFinite(record.internalVersion)
            ? Math.max(1, record.internalVersion)
            : 1,
        submittedVersion:
          typeof record.submittedVersion === "number" && Number.isFinite(record.submittedVersion)
            ? Math.max(1, record.submittedVersion)
            : 1,
        history,
      };
    }
  } catch {
    return {
      ...fallback,
      currentAssets: [value],
    };
  }

  return {
    ...fallback,
    currentAssets: [value],
  };
}

export function serializeTaskCompletionAssets(values: string[]) {
  const sanitized = sanitizeAssets(values);
  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length === 1) {
    return sanitized[0] ?? null;
  }

  return JSON.stringify(sanitized);
}

export function serializeTaskCompletionState(state: TaskCompletionState) {
  const currentAssets = sanitizeAssets(state.currentAssets);
  const history = state.history.map((snapshot) => ({
    ...snapshot,
    assets: sanitizeAssets(snapshot.assets),
  }));

  if (
    currentAssets.length === 0 &&
    history.length === 0 &&
    state.currentVersionKind === "internal" &&
    state.internalVersion === 1 &&
    state.submittedVersion === 1
  ) {
    return null;
  }

  return JSON.stringify({
    schema: TASK_COMPLETION_SCHEMA,
    currentAssets,
    currentVersionKind: state.currentVersionKind,
    internalVersion: Math.max(1, state.internalVersion),
    submittedVersion: Math.max(1, state.submittedVersion),
    history,
  });
}

export function parseTaskCompletionAssets(value?: string | null) {
  return parseTaskCompletionState(value).currentAssets;
}

export function getCurrentTaskCompletionLabel(state: TaskCompletionState) {
  const number = state.currentVersionKind === "internal" ? state.internalVersion : state.submittedVersion;
  return getVersionLabel(state.currentVersionKind, number);
}

export function setCurrentTaskCompletionAssets(
  state: TaskCompletionState,
  assets: string[],
): TaskCompletionState {
  return {
    ...state,
    currentAssets: sanitizeAssets(assets),
  };
}

export function recordTaskCompletionSnapshot(
  state: TaskCompletionState,
  kind: TaskCompletionVersionKind,
  assets: string[],
): TaskCompletionState {
  const sanitizedAssets = sanitizeAssets(assets);
  const number = kind === "internal" ? state.internalVersion : state.submittedVersion;
  const id = getVersionLabel(kind, number);
  const snapshot: TaskCompletionVersionSnapshot = {
    id,
    label: id,
    kind,
    number,
    assets: sanitizedAssets,
    createdAt: new Date().toISOString(),
  };

  return {
    ...state,
    currentVersionKind: kind,
    currentAssets: sanitizedAssets,
    history: [...state.history.filter((item) => item.id !== id), snapshot],
  };
}

export function startNextTaskCompletionVersion(
  state: TaskCompletionState,
  kind: TaskCompletionVersionKind,
): TaskCompletionState {
  return {
    ...state,
    currentVersionKind: kind,
    currentAssets: [],
    internalVersion: kind === "internal" ? state.internalVersion + 1 : state.internalVersion,
    submittedVersion: kind === "submitted" ? state.submittedVersion + 1 : state.submittedVersion,
  };
}

export function bumpSubmittedVersion(state: TaskCompletionState): TaskCompletionState {
  return {
    ...state,
    submittedVersion: state.submittedVersion + 1,
  };
}

export function isTaskCompletionImage(value: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(getTaskCompletionPath(value));
}

export function isTaskCompletionLink(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

export function getTaskCompletionLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
    return decodeURIComponent(lastSegment || url.hostname || trimmed);
  } catch {
    return trimmed;
  }
}

function getTaskCompletionPath(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}
