interface DownloadBtnProps {
  imageUrl: string | null;
  label?: string;
  showCaption?: boolean;
  className?: string;
}

/**
 * The mandatory "Download PNG" affordance. Iframe sandbox prevents in-app
 * saves, so this opens the composed PNG in a new tab with the spec-mandated
 * red sub-caption underneath.
 *
 * Falls back to a disabled placeholder when the image URL is null (e.g. a
 * finalize step that hasn't landed).
 */
export const DownloadBtn = ({ imageUrl, label = "Download PNG", showCaption = true, className }: DownloadBtnProps) => {
  if (!imageUrl) {
    return (
      <button className={`btn btn-outline ${className ?? ""}`} disabled aria-label={`${label} — pending`}>
        {label}
      </button>
    );
  }
  return (
    <>
      <a
        className={`grid text-center btn text-sm no-underline ${showCaption && "leading-[.9] h-fit max-h-[50px]"} ${className ?? ""}`}
        href={imageUrl}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`Open the PNG in a new browser tab`}
      >
        {label}
        {showCaption && <p className="mm-text-xs mm-text-amber mb-2">opens the image in a new browser tab to save</p>}
      </a>
    </>
  );
};

export default DownloadBtn;
