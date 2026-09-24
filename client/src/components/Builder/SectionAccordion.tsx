import { ReactNode } from "react";
import { CategoryDef } from "@shared/content/monsterMash";

interface SectionAccordionProps {
  category: CategoryDef;
  chosen: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Collapsible category row inside the Builder. Header shows the category
 * label + a state chip (`chosen ✓` green ring or `Required` red text).
 * Only one is expanded at a time; content lives in `children` (PartGrid).
 */
export const SectionAccordion = ({ category, chosen, isOpen, onToggle, children }: SectionAccordionProps) => {
  return (
    <div className={`card p-1 gap-1 ${isOpen ? "ring-1 ring-blue-500" : ""}`}>
      <a
        className="w-full flex items-center justify-between gap-1 text-left"
        aria-expanded={isOpen}
        aria-controls={`accordion-panel-${category.id}`}
        onClick={onToggle}
      >
        <span className="font-semibold flex-1 pt-1 pl-1 text-xs text-gray-700">{category.label}</span>
        <span className="flex items-center gap-1 pt-1 pr-1 text-[10px] font-semibold whitespace-nowrap flex-shrink-0">
          {chosen ? (
            <span className="inline-flex items-center gap-1 text-green-700" aria-label="Chosen">
              Chosen
              <span aria-hidden="true">✓</span>
            </span>
          ) : (
            <span className="text-[10px] text-red-600 font-semibold">Required</span>
          )}
          <span aria-hidden="true">{isOpen ? "˄" : "˅"}</span>
        </span>
      </a>
      {isOpen && <div id={`accordion-panel-${category.id}`}>{children}</div>}
    </div>
  );
};

export default SectionAccordion;
