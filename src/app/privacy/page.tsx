import Link from "next/link";
import { InformationPage } from "@/components/public/InformationPage";
export const metadata = { title: "Your privacy controls | Peek & Poke" };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Nearby. On your terms."
      title="Your privacy controls."
      intro="Make connections without making your precise location public. Here’s how the main privacy controls in Peek & Poke work."
    >
      <section>
        <h2>Your profile and interests</h2>
        <p>
          Your name, avatar, chosen interests, and availability help other
          people decide whether to connect. Share only information you are
          comfortable showing. Private photos are not unlocked by buying a
          subscription.
        </p>
      </section>
      <section>
        <h2>Location with a purpose</h2>
        <p>
          With your permission, device location supports nearby discovery and
          meeting checks. The service uses location to make those checks; other
          people receive approximate map areas and coarse distance information.
          You can turn off location permission in your browser or device
          settings.
        </p>
      </section>
      <section>
        <h2>Availability has an end</h2>
        <p>
          Choose a time window when you say what you’re up for. Once it ends,
          your availability is no longer shown as active. You can also end it
          early on Now. Existing invitations and conversations are separate from
          your availability.
        </p>
      </section>
      <section>
        <h2>Conversations and shared Circles</h2>
        <p>
          Conversations are for their participants. Circle QR codes are
          discoverable: anyone scanning the same code can join and read that
          Circle’s history. Don’t use a public QR code for a confidential
          conversation.
        </p>
      </section>
      <section>
        <h2>Shared Plans</h2>
        <p>
          Creating a Plan link deliberately makes its activity, time, public
          meeting place, and attendee count available to anyone with that link.
          Previewing a link does not automatically join the Plan. Review who can
          see a Plan before sharing it.
        </p>
      </section>
      <section>
        <h2>Block, report, or leave</h2>
        <p>
          You can block and report from someone’s profile. Your{" "}
          <Link href="/profile">profile settings</Link> also contain account
          controls, including account deletion. Deletion does not erase copies
          another person has independently saved.
        </p>
      </section>
      <section>
        <h2>Essential service data</h2>
        <p>
          Sign-in requires session cookies or device session storage. The
          service also records operational events to diagnose failures and
          measure whether invitations become Plans. Availability and Poke
          lifecycle events do not include your message text or precise location.
        </p>
      </section>
    </InformationPage>
  );
}
