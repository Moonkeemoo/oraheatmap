"use client";

import { useState } from "react";

/**
 * Round whale avatar — Polymarket profile image when available, else a
 * deterministic colored disc keyed off the address. Used everywhere we
 * surface a whale (drawer header, top-whales lists, tooltip rows).
 */
export function WhaleAvatar({
  profileImage,
  color,
  size = 24,
}: {
  profileImage: string | null | undefined;
  color: string;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  if (!profileImage || errored) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          display: "inline-block",
        }}
      />
    );
  }
  return (
    <img
      src={profileImage}
      width={size}
      height={size}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        background: color,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}
