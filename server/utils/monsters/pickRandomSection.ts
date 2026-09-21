import { Section, SECTIONS } from "@shared/types/index.js";

/**
 * Pick a random section from a list of available sections. The caller passes
 * the pre-filtered list — this util is deliberately simple so the caller can
 * exclude sections that are `locked` OR `done`.
 *
 * Returns `null` when nothing is available (e.g. every section is done on an
 * in-progress monster that lost a claim race — shouldn't happen but we defend).
 */
export const pickRandomSection = (available: readonly Section[]): Section | null => {
  if (available.length === 0) return null;
  const idx = Math.floor(Math.random() * available.length);
  return available[idx] ?? null;
};

export const allSections = (): readonly Section[] => SECTIONS;
