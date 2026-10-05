"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function formatRemaining(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${minutes}m ${secs}s`;
}

export function remainingSeconds(deadline: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Number(deadline) * 1000 - nowMs) / 1000));
}

export function DeadlineCountdown({
  deadline,
  label,
  onExpire,
  compact = false,
}: {
  deadline: string;
  label: string;
  onExpire?: () => void;
  compact?: boolean;
}) {
  const targetMs = useMemo(() => Number(deadline) * 1000, [deadline]);
  const [now, setNow] = useState(() => Date.now());
  const notified = useRef(false);
  const remaining = remainingSeconds(deadline, now);

  useEffect(() => {
    notified.current = false;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  useEffect(() => {
    if (remaining === 0 && !notified.current) {
      notified.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  if (!Number.isFinite(targetMs) || targetMs <= 0) return null;
  return (
    <div className={compact ? "mt-3 flex items-center justify-between gap-4 border-t border-border-ec pt-3" : "glass-card mt-4 flex items-center justify-between gap-4 p-4"}>
      <span className="label-sm text-text-dim">{label}</span>
      <span className={`data-mono text-sm ${remaining === 0 ? "text-error" : "text-purple"}`}>
        {remaining === 0 ? "Window closed" : formatRemaining(remaining)}
      </span>
    </div>
  );
}
