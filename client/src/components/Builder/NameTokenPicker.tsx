import { NAME_TOKENS } from "@shared/content/monsterMash";
import { Section } from "@shared/types/index";
import { useBusy } from "@/context/BusyContext";
import { SuccessIcon } from "../shared";

const LABELS: Record<Section, string> = {
  head: "First name",
  torso: "Last name",
  legs: "Title",
};

/**
 * 30-name dropdown for the current section (spec §Name tokens). Renders as
 * a native `<select>` so accessibility comes for free.
 */
export const NameTokenPicker = ({
  section,
  value,
  onChange,
}: {
  section: Section;
  value: string;
  onChange: (v: string) => void;
}) => {
  const options = NAME_TOKENS[section];
  const id = `name-token-${section}`;
  const { isBusy } = useBusy();

  return (
    <div className="mm-section flex flex-col items-center gap-2 p-2">
      <div className="w-full flex items-baseline justify-between gap-3">
        <p className="flex-stretch font-semibold mm-text-white">{LABELS[section]}</p>
        {value ? <SuccessIcon /> : <span className="mm-text-xs mm-text-amber pr-1">Required</span>}
      </div>

      <select
        id={id}
        className="input w-full"
        value={value}
        disabled={isBusy}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— pick one —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
};

export default NameTokenPicker;
