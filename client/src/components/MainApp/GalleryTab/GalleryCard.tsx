import { useContext } from "react";
import { AwardRibbon, DownloadArrow } from "@/components/shared";
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";
import { GalleryMonster } from "@shared/types/index";
import { backendAPI, setErrorMessage } from "@/utils";

interface GalleryCardProps {
  monster: GalleryMonster;
}

/**
 * One monster card on the Gallery tab (mockup image3 / image25).
 *   - Green outline when the caller contributed (spec §Gallery: "Green outline = yours").
 *   - Award ribbon at the top when awarded.
 *   - Contributor names dot-separated.
 *   - "Born {date}" caption.
 *   - Per-card Download button (opens PNG in a new tab).
 *
 * Card click triggers a modal → drawer iframe transition (server closes the
 * main-app modal and reopens as the Single Monster View drawer) so the
 * detail surface matches the fixed-width look reached from clicking the
 * finished-monster asset in the world.
 */
export const GalleryCard = ({ monster }: GalleryCardProps) => {
  const dispatch = useContext(GlobalDispatchContext);
  const { isBusy, run } = useBusy();
  const born = monster.birthdate
    ? new Date(monster.birthdate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  const openDetail = () => {
    if (isBusy) return;
    return run(async () => {
      try {
        await backendAPI.post(`/monsters/${monster.monsterId}/open`);
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });
  };

  return (
    <div
      className={`card p-3 flex flex-col gap-2 min-h-[320px] ${
        monster.callerContributed ? "border-2 border-green-500" : ""
      }`}
    >
      {monster.latestAward && (
        <div className="flex justify-start">
          <AwardRibbon award={monster.latestAward} />
        </div>
      )}

      <button
        type="button"
        onClick={openDetail}
        disabled={isBusy}
        className="flex-1 flex items-center justify-center rounded-lg mm-border-section mm-bg-card"
        aria-label={`Open ${monster.name || "monster"} details`}
      >
        {monster.imageUrl ? (
          <img src={monster.imageUrl} alt={monster.name || "monster"} className="w-40 h-44 object-contain" />
        ) : (
          <span aria-hidden="true" className="text-5xl text-gray-400">
            ?
          </span>
        )}
      </button>

      <div className="flex flex-col items-center text-center gap-1">
        <p className="h4 leading-tight">{monster.name || "unnamed"}</p>
        {monster.contributorDisplayNames.length > 0 && (
          <p className="p2 text-gray-700 text-sm">{monster.contributorDisplayNames.join(" · ")}</p>
        )}
        {born && <p className="text-xs text-gray-500">Born {born}</p>}
      </div>

      <DownloadArrow imageUrl={monster.imageUrl} label="Download" showCaption={false} />
    </div>
  );
};

export default GalleryCard;
