"use client";
import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import type { PreloadResponse } from "@/stores/appStore";

export function StoreHydrator({ data }: { data: PreloadResponse }) {
  useState(() => {
    useAppStore.getState().hydrateFromPreload(data);
  });
  return null;
}
