import { GalleryMonster } from "@shared/types/index";

interface MatchupCardProps {
  monster: GalleryMonster;
  onVote: () => void;
  isVoting: boolean;
  disabled: boolean;
}

/** One of the two side-by-side matchup cards (mockup image28). */
export const MatchupCard = ({ monster, onVote, isVoting, disabled }: MatchupCardProps) => {
  return (
    <div className="card p-4 flex flex-col items-center gap-2 flex-1 min-w-[220px]">
      {monster.imageUrl ? (
        <img src={monster.imageUrl} alt={monster.name} className="w-40 h-48 object-contain" />
      ) : (
        <span aria-hidden="true" className="text-5xl text-gray-400">
          ?
        </span>
      )}
      <h4 className="h4 text-center leading-tight">{monster.name || "unnamed"}</h4>
      <button className="btn w-full" onClick={onVote} disabled={isVoting || disabled}>
        {isVoting ? "Voting…" : "Vote for this one"}
      </button>
    </div>
  );
};

export default MatchupCard;
