import { useContext, useEffect, useState } from "react";

// components
import { AwardRibbon, ConfirmationModal, DownloadArrow, PageContainer } from "@/components";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// shared
import { SingleMonsterResponseData } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

interface SingleMonsterViewProps {
  monsterId: string;
}

/**
 * Drawer surface reached from clicking a monster dropped in the world.
 * Renders per mockup image9 (player) and image27 (admin variant):
 *   - Monster name + optional award chip
 *   - Composited monster art
 *   - Contributor attribution + Born date
 *   - Download PNG (with mandatory "opens in new tab" caption)
 *   - Admin: trash icon + delete confirm ("removed from gallery and world…")
 */
export const SingleMonsterView = ({ monsterId }: SingleMonsterViewProps) => {
  const dispatch = useContext(GlobalDispatchContext);
  const { hasInteractiveParams } = useContext(GlobalStateContext);

  const { isBusy, run } = useBusy();
  const [payload, setPayload] = useState<SingleMonsterResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (!hasInteractiveParams || !monsterId) return;
    setIsLoading(true);
    backendAPI
      .get(`/monsters/${monsterId}`)
      .then((response) => {
        if (response?.data?.success) setPayload(response.data.data);
      })
      .catch((error) => setErrorMessage(dispatch, error as ErrorType))
      .finally(() => setIsLoading(false));
  }, [monsterId, hasInteractiveParams, dispatch]);

  const monster = payload?.monster;
  const born = monster?.birthdate
    ? new Date(monster.birthdate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  // Drawer → wide modal transition. Server closes this iframe and
  // reopens the main-app modal with credentials preserved.
  const returnToMainApp = () => {
    if (isBusy) return;
    run(() => backendAPI.post("/main-app/return").catch(() => {}));
  };

  const handleDelete = () => {
    if (!monsterId) return;
    return run(async () => {
      try {
        await backendAPI.delete(`/monsters/${monsterId}`);
        await backendAPI.post("/main-app/return").catch(() => {});
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      } finally {
        setShowDelete(false);
      }
    });
  };

  return (
    <PageContainer isLoading={isLoading}>
      <div className="w-full max-w-md mx-auto flex flex-col gap-4 items-center text-center py-4">
        <p className="uppercase tracking-wider">Monster Mash</p>

        {monster ? (
          <>
            <h2 className="h2 leading-tight">{monster.name || "unnamed"}</h2>
            {monster.latestAward && <AwardRibbon award={monster.latestAward} />}
            {monster.imageUrl ? (
              <img
                src={monster.imageUrl}
                alt={monster.name || "monster"}
                className="w-56 h-72 object-contain rounded-2xl bg-gray-50 border"
              />
            ) : (
              <div className="w-56 h-72 rounded-2xl bg-gray-50 border-2 border-dashed flex items-center justify-center text-gray-500 p-4">
                Composite pending.
              </div>
            )}
            {monster.contributorDisplayNames.length > 0 && (
              <p className="p2 text-gray-700">by {monster.contributorDisplayNames.join(" · ")}</p>
            )}
            {born && <p className="text-sm text-gray-500">Born {born}</p>}

            <DownloadArrow imageUrl={monster.imageUrl} />

            <button className="btn btn-outline w-full" onClick={returnToMainApp} disabled={isBusy}>
              Back to Monster Mash
            </button>

            {payload?.canDelete && (
              <button
                type="button"
                className="btn btn-danger"
                aria-label="Delete this monster (admin only)"
                onClick={() => setShowDelete(true)}
                disabled={isBusy || !monster}
              >
                Delete monster
              </button>
            )}
          </>
        ) : (
          !isLoading && <p className="p2">Monster not found.</p>
        )}

        {showDelete && monster && (
          <ConfirmationModal
            title={`Delete ${monster.name || "this monster"}?`}
            message={
              `It will be removed from the gallery and the world. ` +
              `If it's in this week's vote, it will be disqualified. ` +
              `Deletion is permanent: cleared from the key asset AND from all three user records.`
            }
            confirmLabel="Delete monster"
            cancelLabel="Keep monster"
            handleOnConfirm={handleDelete}
            handleToggleShowConfirmationModal={() => setShowDelete(false)}
          />
        )}
      </div>
    </PageContainer>
  );
};

export default SingleMonsterView;
