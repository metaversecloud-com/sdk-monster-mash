import { useContext, useEffect, useState } from "react";

// components
import { GalleryCard } from "./GalleryCard.js";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { CLEAR_GALLERY_DEEP_LINK, ErrorType } from "@/context/types";

// shared
import { GalleryResponseData } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

type SortValue = "newest" | "oldest";

/**
 * Epic 5 Gallery tab (mockup image3 / image25).
 *
 * Filter row: Sort dropdown · "Show only my monsters" · "Show only award winners".
 * `mine` reads from visitor.contributedMonsters on the server, so evicted
 * monsters the caller made still surface (spec §Gallery).
 *
 * Card click surfaces the Single Monster View drawer via /?screen=single-monster&monsterId=…
 * (Epic 5's world drop already wires the same route from the finished-monster asset click.)
 */
export const GalleryTab = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { hasInteractiveParams, galleryDeepLink } = useContext(GlobalStateContext);

  const [sort, setSort] = useState<SortValue>(galleryDeepLink?.sort ?? "newest");
  const [mine, setMine] = useState(!!galleryDeepLink?.mine);
  const [winners, setWinners] = useState(false);
  const [gallery, setGallery] = useState<GalleryResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Apply-once handling of a deep-link intent from another surface (e.g.
  // the completion banner's "See Your Monster" button). We seed local
  // filter state from `galleryDeepLink` on mount, then clear the intent so
  // it doesn't fight the user's later filter changes.
  useEffect(() => {
    if (!galleryDeepLink) return;
    if (galleryDeepLink.sort) setSort(galleryDeepLink.sort);
    if (typeof galleryDeepLink.mine === "boolean") setMine(galleryDeepLink.mine);
    dispatch?.({ type: CLEAR_GALLERY_DEEP_LINK });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryDeepLink]);

  useEffect(() => {
    if (!hasInteractiveParams) return;
    setIsLoading(true);
    backendAPI
      .get("/gallery", {
        params: {
          sort,
          mine: mine ? "true" : undefined,
          winners: winners ? "true" : undefined,
        },
      })
      .then((response) => {
        if (response?.data?.success) setGallery(response.data.data);
      })
      .catch((error) => setErrorMessage(dispatch, error as ErrorType))
      .finally(() => setIsLoading(false));
  }, [sort, mine, winners, hasInteractiveParams, dispatch]);

  return (
    <div
      role="tabpanel"
      id="monster-mash-tab-gallery"
      aria-labelledby="monster-mash-tab-btn-gallery"
      className="flex flex-col gap-4 py-2"
    >
      <div className="flex flex-wrap items-center gap-4 px-2">
        <label className="flex items-center gap-2">
          <span className="p2 mm-text-muted">Sort:</span>
          <select
            className="input"
            value={sort}
            onChange={(e) => setSort((e.target.value as SortValue) === "oldest" ? "oldest" : "newest")}
            aria-label="Sort monsters"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            className="input-checkbox"
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
          />
          Show only my monsters
        </label>
        <label className="flex items-center gap-2">
          <input
            className="input-checkbox"
            type="checkbox"
            checked={winners}
            onChange={(e) => setWinners(e.target.checked)}
          />
          Show only award winners
        </label>
      </div>

      {mine && (
        <p className="p2 mm-text-amber px-2">
          Your own monsters are never dropped from the gallery — and they keep their awards forever.
        </p>
      )}

      {isLoading ? (
        <p className="p2 text-center mm-text-muted py-10">Loading gallery…</p>
      ) : gallery && gallery.monsters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {gallery.monsters.map((m) => (
            <GalleryCard key={m.monsterId} monster={m} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <h3 className="h3">The gallery is empty</h3>
          <p className="p2 mm-text-muted">
            {mine
              ? "You haven't contributed to any monsters yet."
              : "No finished monsters — start one on the Create tab."}
          </p>
        </div>
      )}
    </div>
  );
};

export default GalleryTab;
