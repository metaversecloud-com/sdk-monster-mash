import { CategoryDef } from "@shared/content/monsterMash";
import { Section, SECTIONS } from "@shared/types/index";
import { SECTION_CROP, makePartUrl, useContent } from "@/utils";

interface LayeredPreviewProps {
  section: Section;
  picks: { [categoryId: string]: string };
  /**
   * Peer-contributed sections. Server no longer produces per-section art, so
   * only the contributor display name is exposed here — peers always render
   * as a placeholder until the whole monster finalizes and everyone sees the
   * composed final image.
   */
  peerDoneSections: Partial<Record<Section, { contributorDisplayName?: string }>>;
}

const SECTION_LABELS: Record<Section, string> = {
  head: "Head",
  torso: "Torso",
  legs: "Legs",
};

/**
 * Left column of the Builder — pinned live preview.
 *
 * Layout: each section (head, torso, legs) is its own bordered block in a
 * vertical stack. The caller's active section has a solid taupe border with
 * live-picked art layered inside; peer-done sections show an taupe dashed
 * placeholder; not-yet-built sections show a grey dashed placeholder. Nothing
 * overlaps — every block is a normal-flow flex child.
 */
export const LayeredPreview = ({ section, picks, peerDoneSections }: LayeredPreviewProps) => {
  const { categoriesBySection, layerOrder, partById } = useContent();
  const partUrl = makePartUrl(partById);

  // Build the live layers for MY section only.
  const myCategoryIds = new Set(categoriesBySection[section].map((c: CategoryDef) => c.id));
  const layerToPick = new Map<string, string>();
  for (const [catId, pickId] of Object.entries(picks)) {
    if (!myCategoryIds.has(catId)) continue;
    const cat = categoriesBySection[section].find((c: CategoryDef) => c.id === catId);
    if (!cat) continue;
    layerToPick.set(cat.layerKey, pickId);
  }
  const hasAnyPicks = [...layerToPick.values()].some(Boolean);

  return (
    <div className="flex flex-col items-center gap-3 border-taupe-300 border-2 rounded-2xl p-3 bg-taupe-50 text-gray-900">
      {/* Header row: "Live preview" + "pinned" chip. */}
      <div className="text-sm uppercase tracking-wider text-gray-700 font-semibold">Live preview</div>

      {/* Section stack — head, torso, legs, each in its own block. Order
          matches the visual monster (head on top, legs on bottom). */}
      <div className="w-full flex flex-col items-center gap-2">
        {SECTIONS.map((s) => {
          const isMine = s === section;
          const peer = peerDoneSections[s];
          const isPeerDone = !!peer;
          const crop = SECTION_CROP[s];

          if (isMine) {
            // Active section: solid taupe border, white background, live
            // <img> stack rendered in LAYER_ORDER z-index. Container's aspect
            // ratio + each layer's object-position crop out the full-body
            // canvas whitespace above/below this section's art.
            return (
              <div key={s} className="w-full flex flex-col items-center gap-1">
                <div
                  className="relative w-full rounded-xl border-1 border-gray-900 bg-white  justify-center"
                  style={{ height: crop.height || "110px", objectFit: "cover", objectPosition: crop.objectPosition }}
                  role="img"
                  aria-label={`Preview: your ${SECTION_LABELS[s].toLowerCase()} in progress`}
                >
                  {hasAnyPicks ? (
                    layerOrder.map((layerKey) => {
                      const pickId = layerToPick.get(layerKey);
                      const url = partUrl(pickId);
                      if (!url) return null;
                      return (
                        <img
                          key={layerKey}
                          src={url}
                          alt=""
                          aria-hidden="true"
                          className="absolute w-full"
                          style={{ marginTop: crop.marginTop || 0 }}
                        />
                      );
                    })
                  ) : (
                    <p className="text-xs text-gray-600 text-center p-2">Select parts to see preview</p>
                  )}
                </div>
                <span className="text-xs font-semibold">your {SECTION_LABELS[s].toLowerCase()}</span>
              </div>
            );
          }

          // Peer sections always render as a placeholder — the server no
          // longer composes per-section art, so peers can't see each other's
          // picks. Amber tint when the peer already submitted (someone is
          // there), grey dashed when nothing's been built yet. Everyone
          // sees the composed final image at monster completion.
          void crop;
          return (
            <div key={s} className="w-full flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 p-2 text-center ${
                  isPeerDone ? "border-taupe-500 bg-taupe-100 text-taupe-900" : "border-gray-300 bg-white text-gray-500"
                }`}
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  ?
                </span>
                {isPeerDone ? (
                  <>
                    <span className="text-sm font-semibold">
                      {peer!.contributorDisplayName ?? "someone"}'s {SECTION_LABELS[s].toLowerCase()}
                    </span>
                    <span className="text-[10px]">done · hidden until monster complete</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{SECTION_LABELS[s].toLowerCase()}</span>
                    <span className="text-[10px]">not built yet</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="w-full h-px bg-taupe-200 my-1" aria-hidden="true" />

      <p className="text-center text-[11px] text-gray-600 leading-snug">
        Dashed = where your {SECTION_LABELS[section].toLowerCase()} meets the adjacent section.
        <br />
        <span className="italic text-gray-500">(so you can't match your art to theirs)</span>
      </p>
      <p className="text-center text-[10px] text-gray-400 italic">( preview stays pinned while the list scrolls )</p>
    </div>
  );
};

export default LayeredPreview;
