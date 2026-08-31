import { Redirect } from "expo-router";

/** Legacy route kept as an alias while older deep links propagate. */
export default function InboxScreen() {
  return <Redirect href="/(app)/rooms" />;
}
