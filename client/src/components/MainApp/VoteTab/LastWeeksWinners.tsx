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
    <aside className="flex flex-col gap-1">
      <p className="text-xs uppercase tracking-wider mm-text-accent-lt">
        Last week's winners · {categoryLabel.toUpperCase()}
      </p>
      <div className="flex gap-2">
        {winners.map((w) => (
          <div
            key={w.monsterId}
            className={`card p-2 flex flex-col items-center min-w-[100px] max-w-[130px] ${
              w.deleted ? "border-dashed mm-border-danger" : ""
            }`}
          >
            <span className="rounded-full bg-gray-900 text-white mm-text-xs px-2 py-0.5">{PLACE_LABEL[w.place]}</span>
            {w.deleted ? (
              <div className="w-14 h-14 border-2 border-dashed mm-border-danger flex items-center justify-center mm-text-danger text-[10px] text-center px-1 leading-tight">
                [Monster Deleted]
              </div>
            ) : w.imageUrl ? (
              <img src={w.imageUrl} alt={w.name} className="w-14 h-14 object-contain" />
            ) : (
              <span aria-hidden="true" className="text-2xl mm-text-on-card-subtle">
                ?
              </span>
            )}
            {!w.deleted && <p className="text-[11px] font-semibold leading-tight text-center">{w.name || "unnamed"}</p>}
            {!w.deleted && w.contributorDisplayNames.length > 0 && (
              <p className="text-[9px] mm-text-on-card-muted truncate max-w-full">
                {w.contributorDisplayNames.join(" · ")}
              </p>
            )}
            {w.deleted && <p className="text-[9px] mm-text-danger text-center">removed by an admin - place is kept</p>}
          </div>
        ))}
      </div>
    </aside>
  );
};

export default LastWeeksWinners;
