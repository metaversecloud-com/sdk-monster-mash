import { ReactNode } from "react";
import { SuccessIcon } from "../shared";

interface SectionAccordionProps {
  catId: string;
  label: string;
  chosen: boolean;
  /**
   * Required = category has no NONE option, so submit stays blocked until
   * the user picks something. Non-required rows show no "Required" chip
   * (and no SuccessIcon until the user actively picks — including picking
   * NONE, which is recorded as a real pick).
   */
  required: boolean;
  isExpandable: boolean;
  isOpen: boolean;
  onToggle?: () => void;
  children: ReactNode;
}

/**
 * Collapsible category row inside the Builder. Header shows the category
 * label + a state chip (`chosen ✓` green ring, `Required` red text for
 * required categories, nothing for optional ones until the user picks).
 * Only one is expanded at a time; content lives in `children` (PartGrid).
 */
export const SectionAccordion = ({
  catId,
  label,
  chosen,
  required,
  isExpandable,
  isOpen,
  onToggle,
  children,
}: SectionAccordionProps) => {
  return (
    <div className="w-full mm-bg-card rounded-lg p-1 gap-1 ring-1">
      <a
        className="w-full flex items-center justify-between gap-1 text-left cursor-pointer"
        aria-expanded={isOpen || !isExpandable}
        aria-controls={`accordion-panel-${catId}`}
        onClick={onToggle}
      >
        <p className="font-semibold flex-1 p-1 text-sm mm-text-done">{label}</p>
        <span className="flex gap-1 flex-shrink-0">
          {chosen ? (
            <SuccessIcon />
          ) : required ? (
            <span className="mm-text-xs mm-text-amber pt-2">Required</span>
          ) : null}
          {isExpandable && (
            <span aria-hidden="true" className="text-lg mm-text-done px-1">
              <img
                className={`w-[12px] {isOpen ? "mm-flip-vertical" : ""}`}
                src="https://sdk-style.s3.amazonaws.com/icons/chevronDown.svg"
              />
            </span>
          )}
        </span>
      </a>
      {isOpen && <div id={`accordion-panel-${catId}`}>{children}</div>}
    </div>
  );
};

export default SectionAccordion;
