"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { useAppState } from "@/components/app-state";
import { formatRole } from "@/lib/display";
import { Role } from "@/lib/types";

type InviteVariant = "team" | "client";

const teamRoleOptions: Role[] = [
  "communication_manager",
  "creative_manager",
  "designer",
];

type InviteWorkspaceModalProps = {
  open: boolean;
  onClose: () => void;
  variant: InviteVariant;
};

export function InviteWorkspaceModal({
  open,
  onClose,
  variant,
}: InviteWorkspaceModalProps) {
  const { createInvitation } = useAppState();
  const roleFieldRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("designer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [roleOpen, setRoleOpen] = useState(false);
  const [dropdownDirection, setDropdownDirection] = useState<"up" | "down">("down");
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState(220);

  const resolvedRole = variant === "client" ? "client" : role;
  const title = inviteLink
    ? "Invitation ready"
    : variant === "client"
      ? "Invite client"
      : "Invite team member";
  const description = inviteLink
    ? "Copy the onboarding link and share it in any channel."
    : variant === "client"
      ? "Create a manual onboarding link for a client."
      : "Create a manual onboarding link for a team member.";

  const expiresAt = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 7);
    next.setHours(23, 59, 59, 0);
    return next.toISOString();
  }, []);

  useEffect(() => {
    if (!open) {
      setRoleOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!roleOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!roleFieldRef.current?.contains(event.target as Node)) {
        setRoleOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRoleOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [roleOpen]);

  useLayoutEffect(() => {
    if (!roleOpen || !roleFieldRef.current) {
      return;
    }

    const updatePlacement = () => {
      if (!roleFieldRef.current) {
        return;
      }

      const rect = roleFieldRef.current.getBoundingClientRect();
      const spaceAbove = rect.top - 20;
      const spaceBelow = window.innerHeight - rect.bottom - 20;
      const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;

      setDropdownDirection(shouldOpenUp ? "up" : "down");
      setDropdownMaxHeight(Math.max(120, Math.min(220, shouldOpenUp ? spaceAbove : spaceBelow)));
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [roleOpen]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await createInvitation({
        email,
        role: resolvedRole,
        projectId: null,
        expiresAt,
      });

      setInviteLink(result.inviteLink);
      setEmail("");
      setRole("designer");
      setCopyState("idle");
      setRoleOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create invite");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) {
      return;
    }

    await navigator.clipboard.writeText(inviteLink);
    setCopyState("copied");
  };

  return (
    <Overlay onClick={onClose}>
      <ModalCard onClick={(event) => event.stopPropagation()}>
        <Header>
          <HeaderActions>
            {inviteLink ? (
              <IconButton
                type="button"
                aria-label="Back"
                onClick={() => {
                  setInviteLink("");
                  setCopyState("idle");
                  setError("");
                }}
              >
                <IconChevronLeft />
              </IconButton>
            ) : (
              <IconButtonPlaceholder aria-hidden="true" />
            )}
          </HeaderActions>
          <HeaderCopy>
            <Title>{title}</Title>
            <Subtitle>{description}</Subtitle>
          </HeaderCopy>
          <HeaderActions>
            <IconButton type="button" aria-label="Close" onClick={onClose}>
              <IconClose />
            </IconButton>
          </HeaderActions>
        </Header>

        {!inviteLink ? (
          <Form onSubmit={handleSubmit}>
            <FloatingField className={email ? "auth-field is-filled" : "auth-field"}>
              <TextInput
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder=" "
                autoComplete="email"
                required
              />
              <span>Email</span>
            </FloatingField>

            {variant === "team" ? (
              <FloatingSelectField ref={roleFieldRef} $filled $open={roleOpen}>
                <SelectTrigger
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={roleOpen}
                  onClick={() => setRoleOpen((current) => !current)}
                >
                  <SelectValue>{formatRole(role)}</SelectValue>
                  <SelectChevron $open={roleOpen}>
                    <IconChevronDown />
                  </SelectChevron>
                </SelectTrigger>
                <FieldLabel>Role</FieldLabel>
                {roleOpen ? (
                  <SelectMenu $direction={dropdownDirection} $maxHeight={dropdownMaxHeight} role="listbox" aria-label="Role">
                    {teamRoleOptions.map((option) => (
                      <SelectOption
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={role === option}
                        $active={role === option}
                        onClick={() => {
                          setRole(option);
                          setRoleOpen(false);
                        }}
                      >
                        {formatRole(option)}
                      </SelectOption>
                    ))}
                  </SelectMenu>
                ) : null}
              </FloatingSelectField>
            ) : null}

            {error ? <InlineError>{error}</InlineError> : null}

            <Actions>
              <PrimaryButton type="submit" disabled={submitting}>
                {submitting ? "Generating..." : "Generate Link"}
              </PrimaryButton>
            </Actions>
          </Form>
        ) : (
          <ResultBlock>
            <ResultLabel>Onboarding link</ResultLabel>
            <LinkBox>{inviteLink}</LinkBox>
            <PrimaryButton type="button" onClick={handleCopy}>
              {copyState === "copied" ? "Copied" : "Copy link"}
            </PrimaryButton>
          </ResultBlock>
        )}
      </ModalCard>
    </Overlay>
  );
}

const surfaceCss = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--shadow-md);
`;

const controlCss = css`
  width: 100%;
  min-height: 52px;
  padding: 0 14px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);
`;

const ModalCard = styled.section`
  ${surfaceCss}
  width: min(100%, 560px);
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 22px 22px 24px;
  border-radius: 28px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
`;

const HeaderCopy = styled.div`
  flex: 1;
  text-align: center;
`;

const HeaderActions = styled.div`
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.16rem;
`;

const Subtitle = styled.p`
  margin: 4px 0 0;
  color: var(--color-text-muted);
  line-height: 1.5;
  font-size: 0.88rem;
`;

const IconButton = styled.button`
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);

  svg {
    width: 18px;
    height: 18px;
  }
`;

const IconButtonPlaceholder = styled.div`
  width: 40px;
  height: 40px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FloatingField = styled.label`
  width: 100%;
`;

const FloatingSelectField = styled.div<{ $filled?: boolean; $open?: boolean }>`
  position: relative;
  display: block;
  width: 100%;
  z-index: ${({ $open }) => ($open ? 8 : 2)};
`;

const FieldLabel = styled.span`
  position: absolute;
  left: 16px;
  top: 1px;
  transform: translateY(-50%);
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.96);
  color: #29463e;
  font-size: 13px;
  font-weight: 500;
  z-index: 3;
  pointer-events: none;
`;

const TextInput = styled.input`
  ${controlCss};
  min-height: 58px;
  padding: 0 16px;
  font-size: 16px;
`;

const SelectTrigger = styled.button`
  ${controlCss};
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  padding: 18px 16px 12px;
  font-size: 16px;
  text-align: left;
`;

const SelectValue = styled.span`
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.2;
`;

const SelectChevron = styled.span<{ $open?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transform: rotate(${({ $open }) => ($open ? "180deg" : "0deg")});
  transition: transform 140ms ease;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const SelectMenu = styled.div<{ $direction: "up" | "down"; $maxHeight: number }>`
  ${surfaceCss}
  position: absolute;
  left: 0;
  right: 0;
  ${({ $direction }) => ($direction === "up" ? "bottom: calc(100% + 8px);" : "top: calc(100% + 8px);")}
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 18px;
  max-height: ${({ $maxHeight }) => `${$maxHeight}px`};
  overflow-y: auto;
`;

const SelectOption = styled.button<{ $active?: boolean }>`
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: ${({ $active }) => ($active ? "rgba(31, 67, 57, 0.1)" : "transparent")};
  color: ${({ $active }) => ($active ? "#1f4339" : "var(--color-text)")};
  font-size: 0.94rem;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  text-align: left;

  &:hover {
    background: rgba(31, 67, 57, 0.08);
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: stretch;
`;

const PrimaryButton = styled.button`
  width: 100%;
  min-height: 52px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: #1f4339;
  color: #fff;
  font-size: 0.88rem;
  font-weight: 700;
`;

const InlineError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: 0.82rem;
`;

const ResultBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ResultLabel = styled.span`
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const LinkBox = styled.div`
  ${controlCss};
  min-height: auto;
  padding: 12px 14px;
  overflow-wrap: anywhere;
  font-size: 0.84rem;
  line-height: 1.45;
`;

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
