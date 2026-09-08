import Link from "next/link";
import { InformationPage } from "@/components/public/InformationPage";
export const metadata = { title: "Meet with confidence | Peek & Poke" };
export default function Page() {
  return (
    <InformationPage
      eyebrow="Good company. Good judgement."
      title="Meet on your terms."
      intro="A little spontaneity works best when everyone feels comfortable. Keep these habits with you, from the first poke to the way home."
    >
      <section>
        <h2>Start somewhere public</h2>
        <p>
          Choose a busy café, park, or other public place for a first meetup.
          Keep your home address and personal details private. Arrange your own
          way there and back.
        </p>
      </section>
      <section>
        <h2>A poke is an invitation, not an obligation</h2>
        <p>
          You can say later or not today. You can change your mind after
          accepting. Respect someone else’s answer, and stop contacting them if
          they ask.
        </p>
      </section>
      <section>
        <h2>Keep someone you trust in the loop</h2>
        <p>
          Share the time and public meeting place with a trusted person. A Plan
          link reveals its activity, place, time, and attendee count to anyone
          who has it, so share thoughtfully.
        </p>
      </section>
      <section>
        <h2>Nearby doesn’t mean an exact pin</h2>
        <p>
          Discovery uses approximate areas. Distance is a guide, not a live
          tracking tool. End your availability whenever you want and review
          visibility in <Link href="/profile">your profile settings</Link>.
        </p>
      </section>
      <section>
        <h2>Block and report</h2>
        <p>
          Open someone’s profile to block them or report concerning behavior.
          Blocking removes contact and discovery between you. Reports help
          moderators review abuse; they are not an emergency response service.
        </p>
      </section>
      <section>
        <h2>If something feels wrong, leave</h2>
        <p>
          Trust your judgement. For immediate danger, contact local emergency
          services. Peek & Poke cannot verify someone’s identity or guarantee a
          safe meeting.
        </p>
      </section>
      <section>
        <h2>A space for adults</h2>
        <p>
          Peek & Poke is intended for people aged 18 and over. Do not use it to
          contact or arrange meetings with minors.
        </p>
      </section>
    </InformationPage>
  );
}
