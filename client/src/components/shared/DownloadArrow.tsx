interface DownloadArrowProps {
  imageUrl: string | null;
  label?: string;
  showCaption?: boolean;
}

/**
 * The mandatory "Download PNG" affordance. Iframe sandbox prevents in-app
 * saves, so this opens the composed PNG in a new tab with the spec-mandated
 * red sub-caption underneath.
 *
 * Falls back to a disabled placeholder when the image URL is null (e.g. a
 * finalize step that hasn't landed).
 */
export const DownloadArrow = ({ imageUrl, label = "Download PNG", showCaption = true }: DownloadArrowProps) => {
  if (!imageUrl) {
    return (
      <button className="btn btn-outline" disabled aria-label={`${label} — pending`}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <a
        className="btn"
        href={imageUrl}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`Open the PNG in a new browser tab`}
      >
        {label}
      </a>
      {showCaption && (
        <p className="text-xs text-red-600 text-center">
          opens the image in a new browser tab to save — not an in-app download
        </p>
      )}
    </div>
  );
};

export default DownloadArrow;
