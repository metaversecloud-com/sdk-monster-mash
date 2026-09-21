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
    <div className={`card p-3 ${isOpen ? "ring-2 ring-blue-500" : ""}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between text-left"
        aria-expanded={isOpen}
        aria-controls={`accordion-panel-${category.id}`}
        onClick={onToggle}
      >
        <span className="font-semibold">{category.label}</span>
        <span className="flex items-center gap-2 text-sm">
          {chosen ? (
            <span className="inline-flex items-center gap-1 text-green-700" aria-label="Chosen">
              chosen
              <span aria-hidden="true">✓</span>
            </span>
          ) : (
            <span className="text-red-600 font-semibold">Required</span>
          )}
          <span aria-hidden="true">{isOpen ? "▲" : "▼"}</span>
        </span>
      </button>
      {isOpen && (
        <div id={`accordion-panel-${category.id}`} className="mt-3">
          {children}
        </div>
      )}
    </div>
  );
};

export default SectionAccordion;
