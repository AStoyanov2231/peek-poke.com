import { Redirect } from "expo-router";

/** Legacy route retained as a safe alias; direct-message entry is no longer exposed. */
export default function MessagesScreen() {
  return <Redirect href="/(app)/rooms" />;
}
