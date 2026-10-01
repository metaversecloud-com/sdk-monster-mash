import { useCallback, useContext, useEffect, useMemo, useState } from "react";

// components
import { ConfirmationModal } from "@/components";
import { GalleryCard } from "./GalleryCard.js";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { CLEAR_GALLERY_DEEP_LINK, ErrorType } from "@/context/types";

// shared
import { GalleryMonster, GalleryResponseData } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage, setMainAppState } from "@/utils";

type SortValue = "newest" | "oldest";

/**
 * Filter row: Sort dropdown · "Show only my monsters" · "Show only award winners".
 *
 * The server returns the FULL union (roster + caller history) in one shot;
 * the three UI controls apply as pure client-side derived state via
 * `useMemo`. No round-trip per toggle — the dataset is bounded
 * (FINISHED_CAP = 200 + caller history), so the extra payload beats the
 * repeated latency.
 *
 * Card click surfaces the Single Monster View drawer via /?screen=single-monster&monsterId=…
 */
export const GalleryTab = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { hasInteractiveParams, galleryDeepLink, isAdmin } = useContext(GlobalStateContext);
  const { isBusy, run } = useBusy();

  const [sort, setSort] = useState<SortValue>(galleryDeepLink?.sort ?? "newest");
  const [mine, setMine] = useState(!!galleryDeepLink?.mine);
  const [winners, setWinners] = useState(false);
  const [gallery, setGallery] = useState<GalleryResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<GalleryMonster | null>(null);

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

  // Server fetch — one call per mount (and after a delete, to re-sync). The
  // filter/sort controls do NOT re-fetch.
  const fetchGallery = useCallback(() => {
    if (!hasInteractiveParams) return Promise.resolve();
    setIsLoading(true);
    return backendAPI
      .get("/gallery")
      .then((response) => {
        if (response?.data?.success) setGallery(response.data.data);
      })
      .catch((error) => setErrorMessage(dispatch, error as ErrorType))
      .finally(() => setIsLoading(false));
  }, [hasInteractiveParams, dispatch]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  // Pure derived state — filter + sort reactively on every toggle.
  const visibleMonsters = useMemo(() => {
    const all = gallery?.monsters ?? [];
    let next = all;
    if (mine) next = next.filter((m) => m.callerContributed);
    if (winners) next = next.filter((m) => !!m.latestAward);
    // Server defaults to newest-first; only re-sort when the user flips the
    // dropdown. Birthdate is monotonic per completion so a stable `.slice()
    // + sort` is cheap.
    if (sort === "oldest") {
      next = [...next].sort((a, b) => a.birthdate - b.birthdate);
    } else if (next !== all) {
      // mine/winners filter stripped some entries; re-sort newest-first on
      // the surviving set so order stays stable.
      next = [...next].sort((a, b) => b.birthdate - a.birthdate);
    }
    return next;
  }, [gallery, mine, winners, sort]);

  // Refresh the top-level main-app payload too so pinned banner state (a
  // queued win/completion banner pointing at the just-deleted monster)
  // clears without a page reload.
  const refreshMainApp = () =>
    backendAPI
      .get("/main-app")
      .then((response) => {
        if (response?.data?.success && response.data.data) setMainAppState(dispatch, response.data.data);
      })
      .catch(() => {});

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    return run(async () => {
      try {
        await backendAPI.delete(`/monsters/${target.monsterId}`);
        setDeleteTarget(null);
        await Promise.all([fetchGallery(), refreshMainApp()]);
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });
  };

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

      {isLoading ? (
        <p className="p2 text-center mm-text-muted py-10">Loading gallery…</p>
      ) : visibleMonsters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleMonsters.map((m) => (
            <GalleryCard key={m.monsterId} monster={m} callerIsAdmin={!!isAdmin} onAdminDelete={setDeleteTarget} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <h3 className="mm-text-white">The gallery is empty</h3>
          <p className="p2 mm-text-muted">
            {mine
              ? "You haven't contributed to any monsters yet."
              : winners
                ? "No monsters have won yet."
                : "No finished monsters - start one on the Create tab."}
          </p>
        </div>
      )}

      {deleteTarget && (
        <ConfirmationModal
          title={`Delete ${deleteTarget.name || "this monster"}?`}
          message="Deletion is permanent. It will be removed from the gallery and the world. If it's in this week's vote, it will be disqualified."
          confirmLabel="Delete Monster"
          cancelLabel="Keep Monster"
          handleOnConfirm={confirmDelete}
          handleToggleShowConfirmationModal={() => setDeleteTarget(null)}
        />
      )}

      {isBusy && !isLoading && <p className="sr-only">Working…</p>}
    </div>
  );
};

export default GalleryTab;
