import { VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash";
import type { AwardRibbon as AwardRibbonType } from "@shared/types/index";

const PLACE_LABEL = { 1: "1st", 2: "2nd", 3: "3rd" } as const;

/**
 * Dark ribbon shown on Gallery cards + Single Monster View. Reads `{PLACE · CATEGORY · DATE}`.
 */
export const AwardRibbon = ({ award }: { award: AwardRibbonType }) => {
  const label = VOTING_CATEGORY_BY_ID[award.category]?.label ?? award.category;
  const dateStr = new Date(award.awardedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <div className="w-fit text-center gap-2 rounded-full mm-bg-accent px-3 p-1 text-xs font-semibold mr-1">
      {PLACE_LABEL[award.place]} · {label.toUpperCase()} · {dateStr}
    </div>
  );
};

export default AwardRibbon;
