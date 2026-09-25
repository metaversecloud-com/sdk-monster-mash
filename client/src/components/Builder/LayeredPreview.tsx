import { CategoryDef } from "@shared/content/monsterMash";
import { Section, SECTIONS } from "@shared/types/index";
import { SectionSilhouette } from "@/components/shared/SectionSilhouette";
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
    <div className="mm-section flex flex-col items-center gap-3 p-2">
      {/* Header row: "Live preview" + "pinned" chip. */}
      <p className="mm-text-white font-semibold">Live preview</p>

      {/* Section stack — head, torso, legs, each in its own block. Order
          matches the visual monster (head on top, legs on bottom). */}
      <div className="w-full flex flex-col items-center gap-2">
        {SECTIONS.map((s) => {
          const isMine = s === section;
          const peer = peerDoneSections[s];
          const isPeerDone = !!peer;
          const crop = SECTION_CROP[s];

          if (isMine) {
            return (
              <div key={s} className="w-full flex flex-col items-center gap-1">
                <div
                  className="relative w-full rounded-xl justify-center mm-bg-app"
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
                    <p className="text-xs mm-text-accent-lt text-center pt-4 p-2">Select parts to see preview</p>
                  )}
                </div>
                <span className="text-xs font-semibold mm-text-accent-lt">your {SECTION_LABELS[s].toLowerCase()}</span>
              </div>
            );
          }

          // Peer sections always render as a placeholder — the server no
          // longer composes per-section art, so peers can't see each other's
          // picks. Amber tint when the peer already submitted (someone is
          // there), subtle dashed when nothing's been built yet. Everyone
          // sees the composed final image at monster completion.
          void crop;
          return (
            <div key={s} className="w-full flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-xl flex flex-col items-center justify-center gap-1 p-2 text-center mm-bg-app ${
                  isPeerDone ? "mm-border-amber mm-text-white" : "border-white/20  mm-text-accent-lt"
                }`}
              >
                <SectionSilhouette section={s} variant="dark" className="w-16 h-16 object-contain opacity-80" />
                {isPeerDone ? (
                  <>
                    <span className="text-sm font-semibold">
                      {peer!.contributorDisplayName ?? "someone"}'s {SECTION_LABELS[s].toLowerCase()}
                    </span>
                    <span className="mm-text-xs">done · hidden until monster complete</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{SECTION_LABELS[s].toLowerCase()}</span>
                    <span className="mm-text-xs">not built yet</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LayeredPreview;
