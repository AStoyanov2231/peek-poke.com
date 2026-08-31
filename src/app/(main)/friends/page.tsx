import { redirect } from "next/navigation";

export default function FriendsPage() {
  redirect("/inbox?tab=friends");
}
