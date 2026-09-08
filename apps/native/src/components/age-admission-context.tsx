import type { AgeAdmission } from "@peekpoke/shared";
import { createContext, useContext } from "react";

export type AgeAdmissionContextValue = {
  accountId: string | null;
  admission: AgeAdmission | null;
  refreshAdmission: () => Promise<void>;
};

const AgeAdmissionContext = createContext<AgeAdmissionContextValue | null>(null);

export const AgeAdmissionProvider = AgeAdmissionContext.Provider;

export function useAgeAdmission() {
  const value = useContext(AgeAdmissionContext);
  if (!value) throw new Error("Age admission is unavailable outside the authenticated app root");
  return value;
}
