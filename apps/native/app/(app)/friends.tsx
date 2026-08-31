import { Redirect } from "expo-router";

/** Legacy route retained as a safe alias; social discovery is QR-room scoped. */
export default function FriendsScreen() {
  return <Redirect href="/(app)/rooms" />;
}
