import { StoredWinnerPayload } from "@shared/types/index";
import { VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash";

interface LastWeeksWinnersProps {
  winners: StoredWinnerPayload[];
}

const PLACE_LABEL = { 1: "1st", 2: "2nd", 3: "3rd" } as const;

/**
 * Top-right winners row on the Vote tab. Hidden when there are no past winners.
 */
export const LastWeeksWinners = ({ winners }: LastWeeksWinnersProps) => {
  if (!winners || winners.length === 0) return null;
  const categoryLabel = VOTING_CATEGORY_BY_ID[winners[0].category]?.label ?? winners[0].category;
  return (
    <div className="flex flex-col gap-1 mx-auto min-w-[660px]">
      <p className="text-xs uppercase tracking-wider mm-text-accent-lt text-center">
        Last week's winners · {categoryLabel.toUpperCase()}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {winners.map((w) => {
          return (
            <div
              key={w.monsterId}
              className={`flex gap-0.5 rounded-2xl bg-white p-2 flex flex-col items-center mm-border-2  ${
                w.deleted ? "mm-border-danger" : "mm-border-success"
              }`}
            >
              <span className="rounded-full bg-gray-900 text-white mm-text-xs px-2 py-0.5">{PLACE_LABEL[w.place]}</span>

              <div className="h-16 overflow-hidden">
                {w.imageUrl && !w.deleted ? (
                  <img src={w.imageUrl} alt={w.name} className="h-full object-contain" />
                ) : (
                  <p aria-hidden="true" className="h-full pt-4 text-2xl mm-text-on-card-subtle">
                    ?
                  </p>
                )}
              </div>

              <p className="text-[11px] font-semibold leading-tight text-center">
                {w.deleted ? <span className="mm-text-danger">Monster Deleted</span> : w.name || "unnamed"}
              </p>
              {w.contributorDisplayNames.length > 0 ? (
                <p className="text-[9px] mm-text-on-card-muted truncate max-w-full">
                  {w.contributorDisplayNames.join(" · ")}
                </p>
              ) : w.deleted ? (
                <span className="text-[9px] mm-text-danger">removed by an admin</span>
              ) : (
                <div />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LastWeeksWinners;
