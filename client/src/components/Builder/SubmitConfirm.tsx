import { Section } from "@shared/types/index";
import { ConfirmationModal } from "../ConfirmationModal.js";

const SECTION_TITLES: Record<Section, string> = {
  head: "Head",
  torso: "Torso",
  legs: "Legs",
};

const SECTION_PHRASE: Record<Section, string> = {
  head: "this head",
  torso: "this torso",
  legs: "these legs",
};

interface SubmitConfirmProps {
  section: Section;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SubmitConfirm = ({ section, onConfirm, onCancel }: SubmitConfirmProps) => {
  return (
    <ConfirmationModal
      title={`Submit this Monster's ${SECTION_TITLES[section]}?`}
      message={`You cannot change it afterward - the monster keeps ${SECTION_PHRASE[section]} forever!`}
      confirmLabel={`Submit ${SECTION_TITLES[section]}`}
      cancelLabel="Keep Building"
      confirmVariant="primary"
      handleOnConfirm={onConfirm}
      handleToggleShowConfirmationModal={onCancel}
    />
  );
};

export default SubmitConfirm;
