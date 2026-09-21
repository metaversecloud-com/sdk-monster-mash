import { CATEGORIES_BY_SECTION, CategoryDef, LAYER_ORDER } from "@shared/content/monsterMash";
import { Section, SECTIONS } from "@shared/types/index";
import { partUrl } from "@/utils";

interface LayeredPreviewProps {
  section: Section;
  picks: { [categoryId: string]: string };
  /**
   * Peer-contributed sections. If `sectionImageUrl` is populated AND the
   * caller has already submitted their own section (spec §Reveal rule) the
   * component renders that art; otherwise a dashed silhouette + status
   * caption is shown.
   */
  peerDoneSections: Partial<Record<Section, { contributorDisplayName?: string; sectionImageUrl?: string }>>;
  /** True once the caller's own section is submitted. Gates peer-image reveal. */
  hasSubmittedOwnSection?: boolean;
}

/**
 * Left column of the Builder — pinned live preview.
 *
 * Epic 2 rendering rules:
 *   - Layers picked for the current section render live at their proper
 *     `LAYER_ORDER` z-index.
 *   - Peer-`done` sections show a dashed silhouette + "{name}'s {section} · done"
 *     caption. Actual peer art is Epic 3's per-section compositor.
 *   - Not-yet-built sections show a dashed silhouette + "not built yet".
 */
export const LayeredPreview = ({
  section,
  picks,
  peerDoneSections,
  hasSubmittedOwnSection = false,
}: LayeredPreviewProps) => {
  // Build the live layers for MY section only.
  const myCategoryIds = new Set(CATEGORIES_BY_SECTION[section].map((c: CategoryDef) => c.id));
  const layerToPick = new Map<string, string>();
  for (const [catId, pickId] of Object.entries(picks)) {
    if (!myCategoryIds.has(catId)) continue;
    const cat = CATEGORIES_BY_SECTION[section].find((c: CategoryDef) => c.id === catId);
    if (!cat) continue;
    layerToPick.set(cat.layerKey, pickId);
  }

  return (
    <div className="flex flex-col items-center gap-3 border rounded-2xl p-3 bg-gray-50">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-600">
        <span>Live preview</span>
        <span className="rounded bg-gray-200 px-2 py-0.5">pinned</span>
      </div>

      {/* Rendering: stack an <img> per LAYER_ORDER slot at absolute positions.
          A monster is ~220px wide × 320px tall for the placeholder view. */}
      <div className="relative w-56 h-80" role="img" aria-label={`Preview: ${section} in progress`}>
        {SECTIONS.map((s) => {
          if (s === section) return null;
          const peer = peerDoneSections[s];
          const isDone = !!peer;
          const canRevealPeer = isDone && hasSubmittedOwnSection && !!peer?.sectionImageUrl;
          return (
            <div
              key={s}
              className="absolute inset-x-0 flex items-center justify-center text-center text-[10px] text-gray-500"
              style={{
                top: s === "head" ? "0%" : s === "torso" ? "35%" : "70%",
                height: "30%",
              }}
            >
              {canRevealPeer ? (
                <img
                  src={peer!.sectionImageUrl!}
                  alt={`${peer!.contributorDisplayName ?? "peer"}'s ${s}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div
                  className={`w-full h-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1 ${
                    isDone ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-300"
                  }`}
                >
                  <span className="text-xl" aria-hidden="true">
                    {isDone ? "🎭" : "·"}
                  </span>
                  {isDone ? (
                    <>
                      <span>{peer?.contributorDisplayName ?? "someone"}'s {s}</span>
                      <span className="text-[9px]">done · hidden until you submit</span>
                    </>
                  ) : (
                    <>
                      <span>{s}</span>
                      <span className="text-[9px]">not built yet</span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* My section, layered live at the correct anchor. */}
        <div
          className="absolute inset-x-0 flex items-center justify-center"
          style={{
            top: section === "head" ? "0%" : section === "torso" ? "35%" : "70%",
            height: "30%",
          }}
        >
          <div className="relative w-full h-full flex items-center justify-center">
            {LAYER_ORDER.map((layerKey) => {
              const pickId = layerToPick.get(layerKey);
              const url = partUrl(pickId);
              if (!url) return null;
              return (
                <img
                  key={layerKey}
                  src={url}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              );
            })}
            {/* Empty-state hint when nothing picked yet. */}
            {[...layerToPick.values()].filter(Boolean).length === 0 && (
              <span className="text-[10px] text-gray-500">your {section}</span>
            )}
          </div>
        </div>
      </div>

      <p className="p2 text-center text-[11px] text-gray-500">
        Dashed = where your {section} meets the adjacent section. So you can't match your art to theirs — the reveal
        happens once you submit.
      </p>
    </div>
  );
};

export default LayeredPreview;
