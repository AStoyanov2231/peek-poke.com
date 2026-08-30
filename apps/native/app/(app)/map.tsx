import { Redirect } from "expo-router";

/** Legacy route retained for old deep links; discovery is QR-scoped now. */
export default function MapScreen() {
  return <Redirect href="/(app)/rooms" />;
}
