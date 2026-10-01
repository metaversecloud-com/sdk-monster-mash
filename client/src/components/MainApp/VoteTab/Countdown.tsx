import { useEffect, useState } from "react";

interface CountdownProps {
  targetMs: number;
}

const formatSegments = (ms: number) => {
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0 };
  const totalSeconds = Math.floor(ms / 1_000);
  const d = Math.floor(totalSeconds / (60 * 60 * 24));
  const h = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
  const m = Math.floor((totalSeconds % (60 * 60)) / 60);
  const s = totalSeconds % 60;
  return { d, h, m, s };
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Countdown chip — "3d : 14h : 22m : 45s" — mockup image28. Ticks every
 * second so the smallest segment visibly counts down (times are still spec-
 * caveat "a guide"; window opens/closes on next-open, not on this timer).
 */
export const Countdown = ({ targetMs }: CountdownProps) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const { d, h, m, s } = formatSegments(targetMs - now);
  return (
    <span
      className="text-3xl font-extrabold tracking-wider mm-text-done"
      aria-label={`${d} days ${h} hours ${m} minutes ${s} seconds left`}
    >
      {d}d : {pad(h)}h : {pad(m)}m : {pad(s)}s
    </span>
  );
};

export default Countdown;
