import { InformationPage } from "@/components/public/InformationPage";
export const metadata = { title: "Community ground rules | Peek & Poke" };
export default function Page() {
  return (
    <InformationPage
      eyebrow="A good place to meet"
      title="A few ground rules."
      intro="Real-world connections start with how we treat each other. These community rules apply to profiles, Pokes, conversations, Circles, and Plans."
    >
      <section>
        <h2>Be an adult. Be yourself.</h2>
        <p>
          This community is intended for people aged 18 and over. Use an honest
          profile and do not impersonate someone else or misrepresent a meetup.
        </p>
      </section>
      <section>
        <h2>Respect a no</h2>
        <p>
          Invitations are optional. Do not repeatedly contact someone who has
          declined, blocked you, or asked you to stop. Harassment, threats,
          hate, stalking, and sexual exploitation are not welcome.
        </p>
      </section>
      <section>
        <h2>Keep it real</h2>
        <p>
          Do not use fake location signals, duplicate accounts, spam, scams, or
          manufactured meetings to gain rewards. Do not collect or publish other
          people’s personal information without permission.
        </p>
      </section>
      <section>
        <h2>Take care of your plans</h2>
        <p>
          Choose public meeting places, communicate changes, and cancel if you
          cannot make it. The app helps coordinate; participants remain
          responsible for their decisions and activities.
        </p>
      </section>
      <section>
        <h2>Share with care</h2>
        <p>
          Only upload content you have permission to share. Do not post illegal
          content or use invitations and Circles for unwanted promotion. A
          shared code or link may reach people beyond its original audience.
        </p>
      </section>
      <section>
        <h2>Keep the community comfortable</h2>
        <p>
          Report concerning content or conduct through the app. Accounts and
          content may be restricted or removed when they violate these rules.
          Core connection features are free; any optional paid purchase must
          show its price before you confirm it.
        </p>
      </section>
    </InformationPage>
  );
}
