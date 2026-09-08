import { ImageResponse } from "next/og";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(<div style={{ background: "#bd4934", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><svg width="24" height="24" viewBox="0 0 40 40" fill="none"><path d="M18 9a11 11 0 1 0 0 22" stroke="#fffefa" strokeWidth="5" strokeLinecap="round"/><path d="M22 9a11 11 0 1 1 0 22" stroke="#fffefa" strokeWidth="5" strokeLinecap="round"/><circle cx="20" cy="20" r="3" fill="#fffefa"/></svg></div>, size);
}
