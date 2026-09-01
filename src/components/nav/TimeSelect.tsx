"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/Select";
import { setTimeZone, useTimeZone } from "@/lib/useTimeZone";

/**
 * The navbar's clock authority: which timezone every timestamp on screen is
 * rendered in.
 *
 * "Source time" is the default and the honest one — each stream shows its
 * own operating clock (ERCOT settles in US Central; weather publishes in
 * UTC), which is the time the numbers were made in. Picking a zone instead
 * moves every clock on every tile to it: axis ticks, tooltips, table rows,
 * the map's scrubber, and the heatmap's very buckets, since "hour of day" is
 * a claim about a clock somebody keeps.
 *
 * "My time" stores the browser's zone resolved to a concrete IANA name at
 * the moment it is picked — the frames never guess at a locale, and the
 * choice cannot drift when the laptop travels.
 */
const ZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Los_Angeles", label: "US Pacific" },
];

export function TimeSelect() {
  const tz = useTimeZone();
  // Resolved on the client only, so the server render (which has its own
  // zone) cannot disagree with the first client paint.
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLocal(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setLocal(null);
    }
  }, []);

  const options = [
    { value: "source", label: "Source time" },
    // "My time" only when it adds a zone the list does not already name.
    ...(local && !ZONES.some((z) => z.value === local)
      ? [{ value: local, label: `My time (${shortName(local)})` }]
      : []),
    ...ZONES,
  ];

  // A zone picked on another machine may not be in this list; show it rather
  // than silently displaying the wrong current value.
  if (!options.some((o) => o.value === tz)) {
    options.push({ value: tz, label: tz });
  }

  return (
    <Select
      value={tz}
      onChange={setTimeZone}
      options={options}
      size="sm"
      align="right"
      aria-label="Timezone the data is displayed in"
    />
  );
}

/** "CST" for a menu label — the IANA name is the value, not the face. */
function shortName(tz: string): string {
  try {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
      hour: "2-digit",
    })
      .formatToParts(Date.now())
      .find((x) => x.type === "timeZoneName");
    return p?.value ?? tz;
  } catch {
    return tz;
  }
}
