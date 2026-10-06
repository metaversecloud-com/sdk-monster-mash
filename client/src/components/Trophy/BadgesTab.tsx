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

export const BadgesTab = ({ badges, ownedCount, totalCount }: BadgesTabProps) => {
  const byGroup = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: badges.filter((b) => b.group === group),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wider font-semibold mm-text-accent-lt">Your Badges</p>
        <p className="text-xs mm-text-accent-lt">
          {ownedCount} of {totalCount}
        </p>
      </div>
      {byGroup.map(({ group, label, items }) => (
        <section key={group}>
          <h5 className="mm-text-white mb-1 capitalize">{label}</h5>
          <div className="grid grid-cols-3 gap-2">
            {items.map((badge) => {
              const style: React.CSSProperties = { maxWidth: "100%", filter: "none", opacity: 1 };
              if (!badge.owned) {
                style.filter = "grayscale(1)";
                style.opacity = 0.7;
              }
              return (
                <div className="tooltip" key={badge.name}>
                  <span className="p3 tooltip-content" style={{ width: "115px" }}>
                    {badge.description}
                  </span>
                  {badge.iconUrl ? (
                    <img src={badge.iconUrl} alt={badge.name} style={style} />
                  ) : (
                    <span className="w-24 h-24 rounded-full bg-yellow-400 inline-block" style={style} aria-hidden />
                  )}
                  <p className="text-xs mm-text-accent-lt">{badge.name}</p>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default BadgesTab;
