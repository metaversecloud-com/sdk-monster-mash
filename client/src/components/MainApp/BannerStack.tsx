import { useContext, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { SET_ACTIVE_TAB } from "@/context/types";

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
 * Full banner stack (spec §Banner priority order + mockup image2 / image7):
 *   1. GREEN winner banner ("Your monster placed 1st in Silliest…")
 *   2. BLUE completion banner ("Your section finished the monster!")
 *   3. AMBER countdown ("3 days and 14 hours left to VOTE …")
 *   4. BLUE next-week advisory ("Next week's voting category: Cutest…")
 *
 * On first render we POST /banners/acknowledge to clear the win + completion
 * queues so they don't surface again on subsequent opens.
 */
export const BannerStack = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const navigate = useNavigate();
  const { mainApp } = useContext(GlobalStateContext);

  const shownWin = mainApp?.banners?.win ?? null;
  const shownCompletion = mainApp?.banners?.completion ?? null;
  const cycle = mainApp?.currentVoteCycle;
  const nextCategory = useMemo(() => {
    if (!mainApp?.weeklyVotingEnabled) return null;
    const schedule = (mainApp as any)?.categorySchedule as { orderIds: string[]; nextIndex: number } | undefined;
    if (!schedule?.orderIds?.length) return null;
    const id = schedule.orderIds[schedule.nextIndex % schedule.orderIds.length];
    return VOTING_CATEGORY_BY_ID[id]?.label ?? id;
  }, [mainApp]);

  useEffect(() => {
    // Acknowledge both queues on mount if anything is present.
    if (!shownWin && !shownCompletion) return;
    backendAPI.post("/banners/acknowledge", { win: !!shownWin, completion: !!shownCompletion }).catch(() => {});
  }, [shownWin, shownCompletion]);

  if (!mainApp) return null;

  const now = Date.now();
  const cycleEnds = cycle?.endAt ?? null;
  const countdownActive = !!cycleEnds && cycleEnds > now;

  return (
    <div aria-live="polite" aria-label="Monster Mash announcements" className="flex flex-col gap-2">
      {shownWin && (
        <div className="rounded-xl border-2 border-green-500 bg-green-50 px-4 py-3 flex items-center justify-between gap-2">
          <p className="text-green-800 font-semibold">
            Your monster placed {PLACE_LABEL[shownWin.place]} in{" "}
            {VOTING_CATEGORY_BY_ID[shownWin.category]?.label ?? shownWin.category} in the vote that ended{" "}
            {fmtDate(shownWin.awardedAt)}!
          </p>
          <button
            type="button"
            className="btn-text text-green-800 underline"
            onClick={() => {
              dispatch?.({ type: SET_ACTIVE_TAB, payload: { activeTab: "gallery" } });
              navigate(`/?screen=single-monster&monsterId=${shownWin.monsterId}`);
            }}
          >
            See your monster →
          </button>
        </div>
      )}

      {shownCompletion && (
        <div className="rounded-xl border-2 border-blue-500 bg-blue-50 px-4 py-3">
          <p className="text-blue-800 font-semibold">
            Your section finished the monster
            {shownCompletion.monsterName ? ` — ${shownCompletion.monsterName}` : ""}!
          </p>
        </div>
      )}

      {countdownActive && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 flex items-center justify-between gap-2">
          <p className="text-amber-900">
            <span className="font-semibold">{formatCountdown((cycleEnds as number) - now)}</span> left to VOTE on last week's monsters!
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => dispatch?.({ type: SET_ACTIVE_TAB, payload: { activeTab: "vote" } })}
          >
            VOTE
          </button>
        </div>
      )}

      {!countdownActive && mainApp.weeklyVotingEnabled && nextCategory && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-blue-900 text-sm">
            Next week's voting category: <strong>{nextCategory}</strong> — FINISH your monsters by Sat 11:59 PM ET to
            enter them in next week's vote!
          </p>
        </div>
      )}
    </div>
  );
};

export default BannerStack;
