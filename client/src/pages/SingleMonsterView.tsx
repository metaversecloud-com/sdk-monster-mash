import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// components
import { AwardRibbon, ConfirmationModal, DownloadArrow, PageContainer } from "@/components";

// context
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
  const navigate = useNavigate();
  const { hasInteractiveParams } = useContext(GlobalStateContext);

  const [payload, setPayload] = useState<SingleMonsterResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!monsterId) return;
    setIsDeleting(true);
    try {
      await backendAPI.delete(`/monsters/${monsterId}`);
      navigate("/", { replace: true });
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    } finally {
      setIsDeleting(false);
      setShowDelete(false);
    }
  };

  return (
    <PageContainer isLoading={isLoading}>
      <div className="w-full max-w-md mx-auto flex flex-col gap-4 items-center text-center py-4">
        <p className="p2 uppercase tracking-wider text-gray-500">Monster Mash</p>

        {payload?.canDelete && (
          <button
            type="button"
            className="btn btn-icon self-end text-red-700"
            aria-label="Delete this monster (admin only)"
            onClick={() => setShowDelete(true)}
            disabled={isDeleting || !monster}
          >
            🗑
          </button>
        )}

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

            <button className="btn btn-outline w-full" onClick={() => navigate("/", { replace: true })}>
              Back to Monster Mash
            </button>
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
