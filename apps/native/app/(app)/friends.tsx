import { Redirect } from "expo-router";

export default function FriendsRedirect() {
  return <Redirect href={{ pathname: "/(app)/inbox", params: { tab: "friends" } }} />;
}
