import { useEffect, useState } from "react";

interface CountdownProps {
  targetMs: number;
}

const formatSegments = (ms: number) => {
  if (ms <= 0) return { d: 0, h: 0, m: 0 };
  const totalMinutes = Math.floor(ms / 60_000);
  const d = Math.floor(totalMinutes / (60 * 24));
  const h = Math.floor((totalMinutes % (60 * 24)) / 60);
  const m = totalMinutes % 60;
  return { d, h, m };
};

/**
 * Amber countdown chip — "3d : 14h : 22m" — mockup image28. Ticks every 30s
 * (times are spec-caveat "a guide"; window opens/closes on next-open, not on
 * this timer).
 */
export const Countdown = ({ targetMs }: CountdownProps) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const { d, h, m } = formatSegments(targetMs - now);
  return (
    <span className="text-3xl font-extrabold tracking-wider" aria-label={`${d} days ${h} hours ${m} minutes left`}>
      {d}d : {h}h : {m}m
    </span>
  );
};

export default Countdown;
