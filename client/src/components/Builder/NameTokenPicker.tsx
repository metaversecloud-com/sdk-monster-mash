import { NAME_TOKENS } from "@shared/content/monsterMash";
import { Section } from "@shared/types/index";
import { useBusy } from "@/context/BusyContext";

const CAPTIONS: Record<Section, string> = {
  head: "Your pick becomes the monster's FIRST name (torso picks the last name, legs picks the title).",
  torso: "Your pick becomes the monster's LAST name (head picks the first name, legs picks the title).",
  legs: "Your pick becomes the monster's TITLE (head picks the first name, torso picks the last name).",
};

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
    <div className={`card p-3 ${value ? "ring-1 ring-blue-500" : ""}`}>
      <label htmlFor={id} className="label flex items-center justify-between gap-3">
        <span className="font-semibold flex-1 min-w-0 text-xs text-gray-700">{LABELS[section]}</span>
        <span
          className={`whitespace-nowrap ${
            value ? "text-green-700 text-[10px]" : "text-red-600 text-[10px] font-semibold"
          }`}
        >
          {value ? "chosen" : "Required"}
        </span>
      </label>
      <select
        id={id}
        className="input mt-2 w-full"
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
      <p className="p3 mt-2 text-gray-500">{CAPTIONS[section]}</p>
    </div>
  );
};

export default NameTokenPicker;
