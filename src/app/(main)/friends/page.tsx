import { redirect } from "next/navigation";

/** Legacy route retained as a safe alias; social discovery is QR-room scoped. */
export default function FriendsPage() {
  redirect("/");
}
