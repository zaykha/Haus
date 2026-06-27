"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { useAppState } from "@/components/app-state";
import { formatLabel, formatRole } from "@/lib/display";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TrashItem = {
  id: string;
  entityType: "project" | "task" | "organization" | "liaison" | "team_member";
  entityId: string;
  entityName: string;
  deletedAt: string | null;
  deletedByName: string;
  deleteReason: string | null;
  summaryPills: string[];
};

async function fetchTrashItems() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Missing authenticated session");
  }

  const response = await fetch("/api/workspace/settings/trash", {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as { error?: string; items?: TrashItem[] } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to load trash log");
  }

  return payload?.items ?? [];
}

async function restoreTrashItem(item: Pick<TrashItem, "entityType" | "entityId">) {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Missing authenticated session");
  }

  const response = await fetch("/api/workspace/settings/trash/restore", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(item),
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to restore trash package");
  }
}

async function permanentlyDeleteTrashItem(item: Pick<TrashItem, "entityType" | "entityId">) {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Missing authenticated session");
  }

  const response = await fetch("/api/workspace/settings/trash/permanent", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(item),
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to permanently delete trash package");
  }
}

function formatTrashDate(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function TrashScreen() {
  const router = useRouter();
  const { user } = useAppState();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentDeletingId, setPermanentDeletingId] = useState<string | null>(null);
  const canManageTrash = user ? user.role !== "client" && user.role !== "designer" : false;

  useEffect(() => {
    if (!canManageTrash) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextItems = await fetchTrashItems();
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load trash log");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [canManageTrash]);

  if (!user) {
    return null;
  }

  return (
    <TrashPage>
      <TrashShell>
        <BackButton
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push("/settings");
          }}
        >
          <BackIcon aria-hidden="true">←</BackIcon>
          <span>Back</span>
        </BackButton>

        <TrashCard>
          <Header>
            <div>
              <Eyebrow>{formatRole(user.role)}</Eyebrow>
              <Title>Trash Log</Title>
              <Subtitle>
                Review archived records, confirm what was deleted, and prepare for restore and scheduled purge flows.
              </Subtitle>
            </div>
          </Header>

          {canManageTrash ? (
            <Grid>

              <LogCard>
                <LogHeader>
                  <div>
                    <SectionTitle>Recent Deletions</SectionTitle>
                    <SectionText>Showing the latest archived records.</SectionText>
                  </div>
                  <RefreshButton
                    type="button"
                    onClick={async () => {
                      setLoading(true);
                      setError(null);
                      try {
                        setItems(await fetchTrashItems());
                      } catch (loadError) {
                        setError(loadError instanceof Error ? loadError.message : "Failed to load trash log");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Refresh
                  </RefreshButton>
                </LogHeader>

                {loading ? <MutedNote>Loading trash log…</MutedNote> : null}
                {error ? <ErrorText>{error}</ErrorText> : null}
                {!loading && !error && items.length === 0 ? (
                  <MutedNote>No deleted records found yet.</MutedNote>
                ) : null}

                {!loading && !error && items.length > 0 ? (
                  <LogList>
                    {items.map((item) => (
                      <LogRow key={item.id}>
                        <LogTopRow>
                          <div>
                            <LogTitle>{item.entityName}</LogTitle>
                            <LogMeta>
                              Deleted by {item.deletedByName} · {formatTrashDate(item.deletedAt)}
                            </LogMeta>
                          </div>
                          <LogActions>
                            <EntityPill>{formatLabel(item.entityType)}</EntityPill>
                            <RestoreButton
                              type="button"
                              disabled={restoringId === item.id || permanentDeletingId === item.id}
                              onClick={async () => {
                                setRestoringId(item.id);
                                setError(null);
                                try {
                                  await restoreTrashItem({
                                    entityType: item.entityType,
                                    entityId: item.entityId,
                                  });
                                  setItems(await fetchTrashItems());
                                } catch (restoreError) {
                                  setError(restoreError instanceof Error ? restoreError.message : "Failed to restore trash package");
                                } finally {
                                  setRestoringId(null);
                                }
                              }}
                            >
                              {restoringId === item.id ? "Restoring…" : "Restore"}
                            </RestoreButton>
                            <DeleteButton
                              type="button"
                              disabled={restoringId === item.id || permanentDeletingId === item.id}
                              onClick={async () => {
                                const confirmed = window.confirm(`Permanently delete "${item.entityName}"? This cannot be undone.`);
                                if (!confirmed) {
                                  return;
                                }

                                setPermanentDeletingId(item.id);
                                setError(null);
                                try {
                                  await permanentlyDeleteTrashItem({
                                    entityType: item.entityType,
                                    entityId: item.entityId,
                                  });
                                  setItems(await fetchTrashItems());
                                } catch (deleteError) {
                                  setError(deleteError instanceof Error ? deleteError.message : "Failed to permanently delete trash package");
                                } finally {
                                  setPermanentDeletingId(null);
                                }
                              }}
                            >
                              {permanentDeletingId === item.id ? "Deleting…" : "Permanent Delete"}
                            </DeleteButton>
                          </LogActions>
                        </LogTopRow>
                        {item.summaryPills.length > 0 ? (
                          <PillRow>
                            {item.summaryPills.map((pill) => (
                              <SummaryPill key={`${item.id}-${pill}`}>{pill}</SummaryPill>
                            ))}
                          </PillRow>
                        ) : null}
                        {item.deleteReason ? <LogReason>{formatLabel(item.deleteReason)}</LogReason> : null}
                      </LogRow>
                    ))}
                  </LogList>
                ) : null}
              </LogCard>
            </Grid>
          ) : (
            <SectionCard>
              <SectionTitle>Access Restricted</SectionTitle>
              <SectionText>Trash and recovery tools are only available to internal management roles.</SectionText>
            </SectionCard>
          )}
        </TrashCard>
      </TrashShell>
    </TrashPage>
  );
}

const TrashPage = styled.main`
  min-height: 100vh;
  padding: 18px 14px 28px;
  display: flex;
  align-items: flex-start;
  justify-content: center;

  @media (min-width: 768px) {
    padding: 48px 24px;
    align-items: center;
  }
`;

const TrashShell = styled.div`
  width: 100%;
  max-width: 880px;
  display: grid;
  gap: 14px;
`;

const BackButton = styled.button`
  width: fit-content;
  min-height: 42px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  color: #4b443c;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(31, 31, 31, 0.06);

  &:hover {
    background: #fff7ef;
  }
`;

const BackIcon = styled.span`
  font-size: 1rem;
  line-height: 1;
`;

const TrashCard = styled.section`
  width: 100%;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(243, 234, 219, 0.9), transparent 34%),
    rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(31, 31, 31, 0.1);
  padding: 20px;
  display: grid;
  gap: 20px;

  @media (min-width: 768px) {
    padding: 28px;
    gap: 24px;
  }
`;

const Header = styled.div`
  display: grid;
  gap: 8px;
`;

const Eyebrow = styled.p`
  margin: 0;
  color: #7f7468;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  color: #1f1f1f;
  font-size: clamp(1.45rem, 4vw, 2.15rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
`;

const Subtitle = styled.p`
  margin: 0;
  color: #6f6a63;
  font-size: 0.92rem;
  line-height: 1.5;
`;

const Grid = styled.div`
  display: grid;
  gap: 14px;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SectionCard = styled.div`
  display: grid;
  gap: 12px;
`;

const LogCard = styled(SectionCard)`
  @media (min-width: 768px) {
    grid-column: 1 / -1;
  }
`;

const LogHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: #1f1f1f;
  font-size: 1rem;
  line-height: 1.2;
`;

const SectionText = styled.p`
  margin: 0;
  color: #6f6a63;
  font-size: 0.9rem;
  line-height: 1.5;
`;

const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Pill = styled.span`
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #f1e8d9;
  color: #7d6338;
  font-size: 0.8rem;
  font-weight: 700;
`;

const EntityPill = styled(Pill)`
  background: #edf3ef;
  color: #2f5d50;
`;

const SummaryPill = styled(Pill)`
  background: #fff7ef;
  color: #7d6338;
`;

const MutedNote = styled.p`
  margin: 0;
  color: #7f7468;
  font-size: 0.82rem;
  line-height: 1.45;
`;

const ErrorText = styled.p`
  margin: 0;
  color: #b33f32;
  font-size: 0.84rem;
  line-height: 1.45;
  font-weight: 700;
`;

const RefreshButton = styled.button`
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: #fff;
  color: #4b443c;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;

  &:hover {
    background: #fff7ef;
  }
`;

const LogList = styled.div`
  display: grid;
  gap: 10px;
`;

const LogRow = styled.div`
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  padding: 14px;
  display: grid;
  gap: 6px;
`;

const LogTopRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
`;

const LogActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
`;

const LogTitle = styled.strong`
  color: #1f1f1f;
  font-size: 0.96rem;
  line-height: 1.25;
`;

const LogMeta = styled.p`
  margin: 0;
  color: #6f6a63;
  font-size: 0.84rem;
  line-height: 1.45;
`;

const LogReason = styled.p`
  margin: 0;
  color: #7d6338;
  font-size: 0.8rem;
  line-height: 1.4;
  font-weight: 700;
`;

const RestoreButton = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(47, 93, 80, 0.2);
  border-radius: 999px;
  background: #2f5d50;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    cursor: wait;
    opacity: 0.7;
  }
`;

const DeleteButton = styled(RestoreButton)`
  border-color: rgba(179, 63, 50, 0.2);
  background: #b33f32;
`;
