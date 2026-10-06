import { backendAPI } from "@/utils";

interface DownloadBtnProps {
  imageUrl: string | null;
  label?: string;
  showCaption?: boolean;
  className?: string;
  /**
   * When supplied, clicking the button fires a fire-and-forget
   * `/monsters/:id/download` call so the server can emit
   * `monster_downloaded_own` or `_other` based on whether the caller
   * contributed to this monster. Omit for contexts where the ID isn't
   * meaningful (e.g. the mid-build preview of a section not yet finalized).
   */
  monsterId?: string;
}

/**
 * The mandatory "Download PNG" affordance. Iframe sandbox prevents in-app
 * saves, so this opens the composed PNG in a new tab with the spec-mandated
 * red sub-caption underneath.
 *
 * Falls back to a disabled placeholder when the image URL is null (e.g. a
 * finalize step that hasn't landed).
 */
export const DownloadBtn = ({
  imageUrl,
  label = "Download PNG",
  showCaption = true,
  className,
  monsterId,
}: DownloadBtnProps) => {
  if (!imageUrl) {
    return (
      <button className={`btn btn-outline ${className ?? ""}`} disabled aria-label={`${label} - pending`}>
        {label}
      </button>
    );
  }
  const trackDownload = () => {
    if (!monsterId) return;
    backendAPI.post(`/monsters/${monsterId}/download`).catch(() => {});
  };
  return (
    <>
      <a
        className={`grid text-center btn text-sm no-underline ${showCaption && "leading-[.9] h-fit max-h-[50px]"} ${className ?? ""}`}
        href={imageUrl}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`Open the PNG in a new browser tab`}
        onClick={trackDownload}
      >
        {label}
        {showCaption && <p className="mm-text-xs mm-text-amber mb-2">opens the image in a new browser tab to save</p>}
      </a>
    </>
  );
};

export default DownloadBtn;
