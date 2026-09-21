import { VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash";
import type { AwardRibbon as AwardRibbonType } from "@shared/types/index";

const PLACE_LABEL = { 1: "1st", 2: "2nd", 3: "3rd" } as const;

/**
 * Dark ribbon shown on Gallery cards + Single Monster View. Reads
 * `{PLACE · CATEGORY · DATE}` — mockups image9 / image25.
 */
export const AwardRibbon = ({ award }: { award: AwardRibbonType }) => {
  const label = VOTING_CATEGORY_BY_ID[award.category]?.label ?? award.category;
  const dateStr = new Date(award.awardedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <div className="inline-block rounded-full bg-gray-900 text-white text-xs uppercase tracking-wider px-3 py-1">
      {PLACE_LABEL[award.place]} · {label.toUpperCase()} · {dateStr}
    </div>
  );
};

export default AwardRibbon;
