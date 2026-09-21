import { TrophyBadgeRow } from "@shared/types/index";

const GROUP_ORDER: Array<TrophyBadgeRow["group"]> = ["building", "voting", "visiting", "winning"];
const GROUP_LABELS: Record<TrophyBadgeRow["group"], string> = {
  building: "For building",
  voting: "For voting",
  visiting: "For visiting",
  winning: "For winning",
};

interface BadgesTabProps {
  badges: TrophyBadgeRow[];
  ownedCount: number;
  totalCount: number;
}

/**
 * Trophy Badges tab (mockup image24). Four groups × 38 badges:
 *   - Earned → gold circle + name, yellow tile.
 *   - Locked → padlock icon, dim tile.
 */
export const BadgesTab = ({ badges, ownedCount, totalCount }: BadgesTabProps) => {
  const byGroup = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: badges.filter((b) => b.group === group),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm uppercase tracking-wider text-gray-600 font-semibold">Your Badges</p>
        <p className="text-xs text-gray-500">
          {ownedCount} of {totalCount}
        </p>
      </div>
      {byGroup.map(({ group, label, items }) => (
        <section key={group}>
          <h4 className="h4 mb-2">{label}</h4>
          <div className="grid grid-cols-3 gap-2">
            {items.map((badge) => (
              <div
                key={badge.name}
                className={`p-2 rounded-lg border flex flex-col items-center gap-1 text-center ${
                  badge.owned ? "bg-yellow-50 border-yellow-400" : "bg-gray-50 border-gray-200 opacity-70"
                }`}
              >
                {badge.owned ? (
                  badge.iconUrl ? (
                    <img src={badge.iconUrl} alt="" aria-hidden="true" className="w-10 h-10 rounded-full" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-yellow-400" aria-hidden="true" />
                  )
                ) : (
                  <span
                    className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-500"
                    aria-hidden="true"
                  >
                    🔒
                  </span>
                )}
                <p className="text-xs leading-tight">{badge.name}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default BadgesTab;
