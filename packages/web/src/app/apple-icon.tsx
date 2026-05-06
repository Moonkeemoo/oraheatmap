import { ImageResponse } from "next/og";
import { iconImage } from "./icon";

/**
 * Apple touch icon — 180×180 PNG used by iOS for "Add to Home Screen"
 * and by Google as a fallback favicon source. Same 7-cell motif as the
 * 32×32 favicon, scaled up so it reads on a phone home screen.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return iconImage(180, 50, 6);
}
