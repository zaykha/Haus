"use client";

import styled, { css } from "styled-components";

type ConfirmActionModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmActionModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  if (!open) {
    return null;
  }

  return (
    <Overlay onClick={onCancel}>
      <Card onClick={(event) => event.stopPropagation()}>
        <Header>
          <Copy>
            <Title>{title}</Title>
            <Description>{description}</Description>
          </Copy>
          <IconButton type="button" aria-label="Close" onClick={onCancel}>
            <IconClose />
          </IconButton>
        </Header>

        <Actions>
          <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </SecondaryButton>
          <PrimaryButton type="button" $tone={tone} onClick={() => void onConfirm()} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </PrimaryButton>
        </Actions>
      </Card>
    </Overlay>
  );
}

const surfaceCss = css`
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--shadow-md);
`;

const controlCss = css`
  min-height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 0.84rem;
  font-weight: 700;
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 29, 28, 0.36);
  backdrop-filter: blur(8px);
`;

const Card = styled.section`
  ${surfaceCss}
  width: min(100%, 440px);
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 22px;
  border-radius: 26px;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const Copy = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.08rem;
`;

const Description = styled.p`
  margin: 0;
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
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--color-text);
  flex: 0 0 40px;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

const SecondaryButton = styled.button`
  ${controlCss}
  border: 1px solid rgba(230, 224, 215, 0.95);
  background: rgba(255, 255, 255, 0.9);
  color: var(--color-text);
`;

const PrimaryButton = styled.button<{ $tone: "default" | "danger" }>`
  ${controlCss}
  border: 0;
  background: ${({ $tone }) => ($tone === "danger" ? "#c2544a" : "#1f4339")};
  color: #fff;
`;

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
