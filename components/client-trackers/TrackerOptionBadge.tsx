import type { TrackerField } from "@/lib/clientTrackers";
import {
  TRACKER_OPTION_PALETTE,
  trackerOptionColor,
  trackerOptionTone,
} from "@/lib/tracker-option-colors";

export default function TrackerOptionBadge({
  field,
  value,
}: {
  field: TrackerField;
  value: string;
}) {
  const color = trackerOptionColor(field, value);
  return (
    <span
      data-option-color={color}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${trackerOptionTone(field, value)}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: TRACKER_OPTION_PALETTE[color].swatch }}
      />
      {value}
    </span>
  );
}
