"use client";

import dynamic from "next/dynamic";

export const MapView = dynamic(
  () => import("./MapView").then((mod) => mod.MapViewInner),
  { ssr: false }
);
