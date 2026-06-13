"use client";

import { useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";

const mobile = "@media (max-width: 767px)";

type CustomDatePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseIsoDate(value: string) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string) {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildCalendarDays(month: Date) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const leadingDays = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const dayOffset = index - leadingDays + 1;
    const date = new Date(month.getFullYear(), month.getMonth(), dayOffset);
    return {
      iso: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month.getMonth(),
      isToday: toIsoDate(date) === toIsoDate(new Date()),
    };
  });
}

export function CustomDatePicker({ label, value, onChange }: CustomDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const parsed = parseIsoDate(value);
    return startOfMonth(parsed ?? new Date());
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const parsed = parseIsoDate(value);
    setVisibleMonth(startOfMonth(parsed ?? new Date()));
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(visibleMonth),
    [visibleMonth],
  );
  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const displayValue = formatDisplayDate(value) || "Select date";

  return (
    <FieldWrap>
      {open ? <MobileScrim type="button" aria-label="Close date picker" onClick={() => setOpen(false)} /> : null}
      <Trigger
        type="button"
        $filled={Boolean(value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Label>{label}</Label>
        <Value $filled={Boolean(value)}>{displayValue}</Value>
        <CalendarIcon aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="6" width="16" height="14" rx="2.5" />
            <path d="M8 4v4M16 4v4M4 10h16" />
          </svg>
        </CalendarIcon>
      </Trigger>

      {open ? (
        <Popover role="dialog" aria-label={label}>
          <CalendarHeader>
            <MonthButton type="button" onClick={() => setVisibleMonth((current) => addMonths(current, -1))}>
              <ChevronLeft />
            </MonthButton>
            <MonthLabel>{monthLabel}</MonthLabel>
            <MonthButton type="button" onClick={() => setVisibleMonth((current) => addMonths(current, 1))}>
              <ChevronRight />
            </MonthButton>
          </CalendarHeader>

          <Weekdays>
            {WEEKDAY_LABELS.map((weekday) => (
              <Weekday key={weekday}>{weekday}</Weekday>
            ))}
          </Weekdays>

          <DaysGrid>
            {days.map((day) => (
              <DayButton
                key={day.iso}
                type="button"
                $selected={day.iso === value}
                $muted={!day.inMonth}
                $today={day.isToday}
                onClick={() => {
                  onChange(day.iso);
                  setOpen(false);
                }}
              >
                {day.day}
              </DayButton>
            ))}
          </DaysGrid>
        </Popover>
      ) : null}
    </FieldWrap>
  );
}

const FieldWrap = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
`;

const inputSurface = css`
  width: 100%;
  min-width: 0;
  min-height: 58px;
  padding: 18px 44px 10px 16px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  box-sizing: border-box;

  ${mobile} {
    min-height: 50px;
    padding: 16px 42px 10px 14px;
    border-radius: 13px;
  }
`;

const Trigger = styled.button<{ $filled?: boolean }>`
  ${inputSurface}
  position: relative;
  display: block;
  text-align: left;
`;

const Label = styled.span`
  position: absolute;
  left: 16px;
  top: 1px;
  transform: translateY(-50%);
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.96);
  color: #29463e;
  font-size: 13px;
  font-weight: 500;
  pointer-events: none;

  ${mobile} {
    left: 14px;
  }
`;

const Value = styled.span<{ $filled?: boolean }>`
  display: block;
  color: ${({ $filled }) => ($filled ? "var(--color-text)" : "var(--color-text-muted)")};
  font-size: 16px;
  line-height: 1.2;
`;

const CalendarIcon = styled.span`
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);

  svg {
    width: 18px;
    height: 18px;
  }
`;

const MobileScrim = styled.button`
  display: none;

  ${mobile} {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 149;
    background: rgba(28, 29, 28, 0.28);
    backdrop-filter: blur(4px);
  }
`;

const Popover = styled.div`
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 150;
  width: min(320px, calc(100vw - 40px));
  padding: 12px;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: var(--shadow-md);

  ${mobile} {
    position: fixed;
    left: 50%;
    top: 50%;
    width: min(340px, calc(100vw - 28px));
    transform: translate(-50%, -50%);
    border-radius: 20px;
  }
`;

const CalendarHeader = styled.div`
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 36px;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const MonthButton = styled.button`
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(230, 224, 215, 0.95);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
`;

const MonthLabel = styled.strong`
  text-align: center;
  font-size: 0.92rem;
`;

const Weekdays = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 6px;
`;

const Weekday = styled.span`
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
`;

const DaysGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
`;

const DayButton = styled.button<{ $selected?: boolean; $muted?: boolean; $today?: boolean }>`
  min-height: 36px;
  border: 1px solid
    ${({ $selected, $today }) =>
      $selected ? "#1f4339" : $today ? "rgba(31, 67, 57, 0.45)" : "rgba(230, 224, 215, 0.85)"};
  border-radius: 12px;
  background: ${({ $selected }) => ($selected ? "#1f4339" : "rgba(255, 255, 255, 0.92)")};
  color: ${({ $selected, $muted }) =>
    $selected ? "#fff" : $muted ? "var(--color-text-light)" : "var(--color-text)"};
  font-size: 0.84rem;
  font-weight: ${({ $selected }) => ($selected ? 700 : 500)};
`;

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
