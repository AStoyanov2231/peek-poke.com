import { Redirect } from "expo-router";

/** Legacy direct-message deep links are no longer an entry point in the QR-room client. */
export default function LegacyChatScreen() {
  return <Redirect href="/(app)/rooms" />;
}
