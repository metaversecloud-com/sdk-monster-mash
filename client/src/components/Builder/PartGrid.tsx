import { CategoryDef, PARTS_BY_CATEGORY } from "@shared/content/monsterMash";
import { partUrl } from "@/utils";

interface PartGridProps {
  category: CategoryDef;
  /** Currently-picked part id for this category ("NONE" is a valid pick). */
  value: string | undefined;
  onChange: (partId: string) => void;
  /**
   * Optional disabled-ids set. Used by legs.feet when the picked `legs.legs`
   * has `supportsFeet: false` — tile shows a "no feet" pill and is unclickable.
   */
  disabledIds?: Set<string>;
}

/**
 * Card-grid part picker for one category. NONE-allowing categories render a
 * dashed-red NONE tile with a no-entry glyph (mockup image29).
 */
export const PartGrid = ({ category, value, onChange, disabledIds }: PartGridProps) => {
  const parts = PARTS_BY_CATEGORY[category.id] ?? [];

  const renderTile = (tileId: string, label: string, imageSrc: string | null, isNone = false) => {
    const isPicked = value === tileId;
    const isDisabled = disabledIds?.has(tileId) ?? false;
    return (
      <button
        key={tileId}
        type="button"
        className={`card flex flex-col items-center justify-center gap-1 p-2 min-h-[96px] transition ${
          isPicked ? "ring-2 ring-blue-500" : ""
        } ${isNone ? "border-dashed border-red-300 text-red-500" : ""} ${isDisabled ? "opacity-40" : ""}`}
        aria-pressed={isPicked}
        aria-label={label}
        disabled={isDisabled}
        onClick={() => onChange(tileId)}
      >
        {imageSrc ? (
          <img src={imageSrc} alt="" aria-hidden="true" className="w-14 h-14 object-contain" />
        ) : (
          <span aria-hidden="true" className="text-3xl">
            {isNone ? "🚫" : "?"}
          </span>
        )}
        <span className="text-xs">{label}</span>
        {isDisabled && (
          <span className="rounded-full bg-red-100 text-red-700 text-[10px] px-1 py-0.5">no feet</span>
        )}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={`${category.label} options`}>
      {parts.map((p) => renderTile(p.id, p.id, partUrl(p.id), false))}
      {category.allowsNone && renderTile("NONE", "NONE", null, true)}
    </div>
  );
};

export default PartGrid;
