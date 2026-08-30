import { Redirect } from "expo-router";

/** Legacy social invites no longer mutate connection state in the QR-room client. */
export default function LegacyInviteScreen() {
  return <Redirect href="/(app)/rooms" />;
}
