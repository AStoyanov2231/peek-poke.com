import { observeMeetingAuthOwner } from "@/data/web-query";
import { observeReadReceiptAuthOwner } from "@/data/read-receipt";
import { useCallStore } from "@/stores/callStore";

export function recoverUnauthorizedWebSession(
  replace: (path: string) => void = (path) => window.location.replace(path),
) {
  observeMeetingAuthOwner(null);
  observeReadReceiptAuthOwner(null);
  useCallStore.getState().observeAccount(null);
  replace("/login");
}
