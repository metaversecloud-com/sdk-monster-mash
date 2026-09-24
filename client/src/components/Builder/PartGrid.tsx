import { CategoryDef } from "@shared/content/monsterMash";
import { useBusy } from "@/context/BusyContext";
import { SECTION_CROP, makePartUrl, useContent } from "@/utils";

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
 *
 * Each tile crops the part image to just the section's art region (see
 * `SECTION_CROP`) so heads, torsos, and legs each fill their tile without
 * the empty top/bottom whitespace that ships with the full-body canvas.
 */
export const PartGrid = ({ category, value, onChange, disabledIds }: PartGridProps) => {
  const { partsByCategory, partById } = useContent();
  const { isBusy } = useBusy();
  const parts = partsByCategory[category.id] ?? [];
  const partUrl = makePartUrl(partById);
  const crop = SECTION_CROP[category.section];

  const renderTile = (tileId: string, label: string, imageSrc: string | null, isNone = false) => {
    const isPicked = value === tileId;
    const hasNoFeet = disabledIds?.has(tileId) ?? false;
    const isDisabled = hasNoFeet || isBusy;
    return (
      <button
        key={tileId}
        type="button"
        className={`card flex flex-col items-center justify-center gap-1 p-[2px] overflow-hidden transition ${
          isPicked ? "ring-1 ring-blue-500" : ""
        } ${isNone ? "border-dashed border-red-300 text-red-500" : ""} ${isDisabled ? "opacity-40" : ""}`}
        style={{ height: crop.parts?.[category.id as keyof NonNullable<typeof crop.parts>]?.height || crop.height }}
        aria-pressed={isPicked}
        aria-label={label}
        disabled={isDisabled}
        onClick={() => onChange(tileId)}
      >
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            aria-hidden="true"
            className="block w-full"
            style={{
              objectFit: "cover",
              objectPosition: crop.objectPosition,
              marginTop: crop.parts?.[category.id as keyof NonNullable<typeof crop.parts>]?.marginTop || 0,
            }}
          />
        ) : (
          <span aria-hidden="true" className="text-2xl">
            {isNone ? "🚫" : "?"}
          </span>
        )}
        {hasNoFeet && <span className="rounded-full bg-red-100 text-red-700 text-[10px] px-1 py-0.5">no feet</span>}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={`${category.label} options`}>
      {parts.map((p) => renderTile(p.id, p.id, partUrl(p.id), false))}
      {category.allowsNone && renderTile("NONE", "NONE", null, true)}
    </div>
  );
};

export default PartGrid;
