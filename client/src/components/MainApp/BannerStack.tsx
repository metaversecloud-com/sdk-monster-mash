import { useContext, useEffect } from "react";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { SET_ACTIVE_TAB, SET_GALLERY_DEEP_LINK } from "@/context/types";

// shared
import { VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash";

// utils
import { backendAPI } from "@/utils";

const PLACE_LABEL = { 1: "1st", 2: "2nd", 3: "3rd" } as const;

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const formatCountdown = (ms: number) => {
  if (ms <= 0) return "0 days";
  const totalMinutes = Math.floor(ms / 60_000);
  const d = Math.floor(totalMinutes / (60 * 24));
  const h = Math.floor((totalMinutes % (60 * 24)) / 60);
  if (d > 0) return `${d} days and ${h} hours`;
  return `${h} hours`;
};

/**
 * Order - top to bottom:
 *   1. BLUE completion banner ("{Name} is complete! A monster you helped
 *      build is finished.")
 *   2. GREEN winner banner ("Your monster placed 1st in Silliest…").
 *   3. AMBER countdown ("3 days and 14 hours left to VOTE …").
 */
export const BannerStack = ({ activeTab }: { activeTab: string }) => {
  const dispatch = useContext(GlobalDispatchContext);
  const { mainApp } = useContext(GlobalStateContext);
  const { isBusy } = useBusy();

  const shownWin = mainApp?.banners?.win ?? null;
  const shownCompletion = mainApp?.banners?.completion ?? null;
  const cycle = mainApp?.currentVoteCycle;

  useEffect(() => {
    // Acknowledge both queues on mount if anything is present.
    if (!shownWin && !shownCompletion) return;
    backendAPI.post("/banners/acknowledge", { win: !!shownWin, completion: !!shownCompletion }).catch(() => {});
  }, [shownWin, shownCompletion]);

  if (!mainApp) return null;

  const now = Date.now();
  const cycleEnds = cycle?.endAt ?? null;
  const countdownActive = !!cycleEnds && cycleEnds > now;

  const openGalleryForMyMonsters = () => {
    dispatch?.({
      type: SET_GALLERY_DEEP_LINK,
      payload: { galleryDeepLink: { mine: true, sort: "newest" } },
    });
    dispatch?.({ type: SET_ACTIVE_TAB, payload: { activeTab: "gallery" } });
  };

  if (!shownWin && !shownCompletion && !countdownActive) return null;

  return (
    <div aria-live="polite" aria-label="Monster Mash announcements" className="flex flex-col gap-2">
      {shownCompletion && (
        <div className="rounded-xl mm-border-2 mm-border-accent mm-bg-accent-lt px-4 py-3 flex items-center justify-between gap-2">
          <p className="mm-text-done font-semibold">
            {shownCompletion.monsterName || "Your monster"} is complete! A monster you helped build is finished.
          </p>
          <a className="mm-text-done underline cursor-pointer" onClick={openGalleryForMyMonsters}>
            See Your Monster →
          </a>
        </div>
      )}

      {shownWin && (
        <div className="rounded-xl mm-border-2 mm-border-success mm-bg-success-lt px-4 py-3 flex items-center justify-between gap-2">
          <p className="mm-text-done font-semibold">
            Your monster placed {PLACE_LABEL[shownWin.place]} in{" "}
            {VOTING_CATEGORY_BY_ID[shownWin.category]?.label ?? shownWin.category} in the vote that ended{" "}
            {fmtDate(shownWin.awardedAt)}!
          </p>
          <a className="mm-text-done underline cursor-pointer" onClick={openGalleryForMyMonsters}>
            See Your Monster →
          </a>
        </div>
      )}

      {activeTab !== "vote" && countdownActive && (
        <div className="rounded-xl mm-border-2 mm-border-amber mm-bg-amber px-4 py-2 flex items-center justify-between gap-2">
          <p className="mm-text-done font-semibold">
            <span className="font-semibold">{formatCountdown((cycleEnds as number) - now)}</span> left to VOTE on last
            week's monsters!
          </p>
          <button
            type="button"
            className="btn mm-btn-sm"
            disabled={isBusy}
            onClick={() => dispatch?.({ type: SET_ACTIVE_TAB, payload: { activeTab: "vote" } })}
          >
            VOTE
          </button>
        </div>
      )}
    </div>
  );
};

export default BannerStack;
