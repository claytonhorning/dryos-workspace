"use client";

import { useEffect, useState } from "react";

/**
 * The display timezone the whole product renders clocks in.
 *
 * The value is a directive, not always a zone: `"source"` (the default) means
 * every component shows its own stream's operating time — ERCOT talks in US
 * Central, weather in UTC — and anything else is an IANA name the viewer
 * chose in the navbar. "My time" is resolved to a concrete IANA name at the
 * moment it is picked, so the frames never guess at the browser's locale
 * themselves and a stored choice cannot drift when the laptop travels.
 *
 * Kept in localStorage per machine (a reading preference, not a property of
 * the page) and announced with a window event, the same shape the saved-mark
 * uses — the navbar sets it, every Runner hears it, and each forwards it into
 * its frame by message.
 */
const KEY = "dryos:tz";
const EVENT = "dryos:tzchange";

export function readTimeZone(): string {
  try {
    return localStorage.getItem(KEY) || "source";
  } catch {
    return "source";
  }
}

export function setTimeZone(value: string) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // A machine that will not keep it still gets it for this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useTimeZone(): string {
  // "source" until mounted, so server and first client render agree.
  const [tz, setTz] = useState("source");
  useEffect(() => {
    const read = () => setTz(readTimeZone());
    read();
    window.addEventListener(EVENT, read);
    // Another tab changing the preference reaches this one through storage.
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return tz;
}
