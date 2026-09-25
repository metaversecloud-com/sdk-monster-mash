import { Section } from "@shared/types/index";

const SECTION_LABELS: Record<Section, string> = {
  head: "Head",
  torso: "Torso",
  legs: "Legs",
};

/**
 * Blue pill under the Builder header — "Building: Head · N of 3".
 * `stepIndex` is 1-based (1..3): how many sections were already done
 * plus one, per the mockup convention.
 */
export const BuildingPill = ({ section, stepIndex }: { section: Section; stepIndex: number }) => {
  return (
    <div className="w-fit text-center gap-2 rounded-full mm-bg-pill px-3 p-1 text-xs font-semibold mr-1">
      Building: {SECTION_LABELS[section]} · {stepIndex} of 3
    </div>
  );
};

export default BuildingPill;
