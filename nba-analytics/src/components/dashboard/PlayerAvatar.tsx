"use client";
import { useState } from "react";

/**
 * NBA.com headshot, loaded by the viewer's browser straight from cdn.nba.com (the CDN blocks
 * cloud servers, so this must stay a plain <img>, not a server-proxied next/image).
 * Falls back to initials when there is no URL (e.g. demo players) or the image fails.
 */
export function PlayerAvatar({ name, headshotUrl, size = 32 }: { name: string; headshotUrl: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  // The ETL stores the 1040x760 original; the 260x190 rendition is ~15x smaller
  const src = headshotUrl?.replace("/1040x760/", "/260x190/");
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!src || failed) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 align-middle items-center justify-center rounded-full bg-lakers-purple/20 text-heading font-semibold"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {initials}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- browser-side load from cdn.nba.com; see comment above
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="inline-block shrink-0 align-middle rounded-full bg-input object-cover object-top"
      style={{ width: size, height: size }}
    />
  );
}
