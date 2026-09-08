import { Redirect } from "expo-router";
import { nativeAuthenticatedHomeRoute } from "@/lib/navigation-policy";

export default function Index() {
  return <Redirect href={nativeAuthenticatedHomeRoute} />;
}
