import { Section } from "@shared/types/index";

const SECTION_LABELS: Record<Section, string> = {
  head: "Head",
  torso: "Torso",
  legs: "Legs",
};

export const BuildingPill = ({ section, stepIndex }: { section: Section; stepIndex: number }) => {
  return (
    <div className="w-fit text-center gap-2 rounded-full mm-bg-accent px-3 p-1 text-xs font-semibold mr-1">
      Building: {SECTION_LABELS[section]} · {stepIndex} of 3
    </div>
  );
};

export default BuildingPill;
