import { redirect } from "next/navigation";

/** Legacy direct-message URLs are not an entry point in the QR-room client. */
export default function LegacyChatPage() {
  redirect("/");
}
