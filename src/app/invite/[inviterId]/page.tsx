import { redirect } from "next/navigation";

/** Legacy social invites no longer mutate connection state in the QR-room client. */
export default function Page() {
  redirect("/");
}
