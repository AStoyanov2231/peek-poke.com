import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Coffee,
  Footprints,
  MapPin,
  MessageCircle,
  Check,
  Clock3,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";

export function LandingPage() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Link href="/" className="wordmark">
          <BrandMark />
          peek & poke<span>.</span>
        </Link>
        <nav aria-label="Public navigation">
          <a href="#how-it-works" className="hidden sm:inline-flex">
            How it works
          </a>
          <Link href="/login">
            Sign in <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="landing-hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="active-dot" /> Less scrolling. More living.
            </p>
            <h1>
              Find out
              <br />
              who’s{" "}
              <span className="hero-free">
                free
                <svg viewBox="0 0 280 20" aria-hidden="true">
                  <path
                    d="M3 13 Q133 -2 276 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              .<br />
              Go do something.
            </h1>
            <p className="hero-description">
              Coffee round the corner. A walk with someone new. Good plans start
              with a little poke.
            </p>
            <div className="hero-actions">
              <Link
                href="/login?redirectTo=%2Fnow"
                className="btn btn-accent btn-lg btn-pill"
              >
                See who’s around <ArrowUpRight size={19} />
              </Link>
              <a href="#how-it-works" className="text-link">
                Take a peek <ArrowRight size={17} />
              </a>
            </div>
            <p className="hero-note">
              Free to connect. Built for real life. For adults 18+.
            </p>
          </div>
          <div
            className="hero-scene"
            aria-label="Illustrated example of turning a coffee invitation into a plan"
          >
            <div className="scene-map" aria-hidden="true">
              <svg viewBox="0 0 520 580" preserveAspectRatio="xMidYMid slice">
                <rect width="520" height="580" fill="#eae9df" />
                <path
                  d="M-50 390 Q140 270 290 410 T580 310"
                  stroke="#d3dfda"
                  strokeWidth="84"
                  fill="none"
                />
                <path
                  d="M-20 125 L550 435 M100 -20 L250 610 M420 -20 L315 600 M-20 320 L580 140"
                  stroke="#faf8f4"
                  strokeWidth="23"
                  fill="none"
                />
                <path
                  d="M-20 500L540 40 M-20 200 L530 520"
                  stroke="#faf8f4"
                  strokeWidth="9"
                  fill="none"
                />
                <rect
                  x="48"
                  y="43"
                  width="72"
                  height="87"
                  rx="20"
                  fill="#d5ddc5"
                  transform="rotate(-20 48 43)"
                />
                <rect
                  x="345"
                  y="376"
                  width="98"
                  height="93"
                  rx="28"
                  fill="#d5ddc5"
                  transform="rotate(15 345 376)"
                />
                <circle
                  cx="273"
                  cy="267"
                  r="114"
                  fill="none"
                  stroke="#bd4934"
                  opacity=".12"
                  strokeWidth="2"
                />
                <circle
                  cx="273"
                  cy="267"
                  r="75"
                  fill="none"
                  stroke="#bd4934"
                  opacity=".15"
                  strokeWidth="2"
                />
              </svg>
              <div className="scene-area">A GOOD AFTERNOON, NEARBY</div>
            </div>
            <div className="scene-person scene-person-one">
              <span className="preview-avatar">M</span>
              <span>
                <b>Up for a coffee</b>
                <small>Mila · nearby</small>
              </span>
              <Coffee size={22} />
            </div>
            <div className="scene-person scene-person-two">
              <span className="preview-avatar preview-avatar-green">A</span>
              <span>
                <b>A little fresh air?</b>
                <small>Alex · free for an hour</small>
              </span>
              <Footprints size={22} />
            </div>
            <article className="scene-plan">
              <div className="scene-plan-top">
                <span className="activity-medallion">
                  <Coffee size={25} />
                </span>
                <span className="tiny-status">
                  <Check size={13} /> It’s a plan
                </span>
              </div>
              <h2>Coffee & a catch-up</h2>
              <p>
                <Clock3 size={15} /> Today, 16:30
              </p>
              <p>
                <MapPin size={15} /> Your local café
              </p>
              <div className="scene-plan-footer">
                <div className="preview-avatars">
                  <span>M</span>
                  <span>You</span>
                </div>
                <span>
                  Less “we should.”
                  <br />
                  <b>More “see you there.”</b>
                </span>
              </div>
            </article>
            <div className="scene-poke">
              <MessageCircle size={17} /> Coffee?{" "}
              <span>
                I’m in <Check size={14} />
              </span>
            </div>
            <span className="scene-caption">
              A peek at how it works · illustrative example
            </span>
          </div>
        </section>
        <section id="how-it-works" className="landing-loop">
          <div className="loop-intro">
            <p className="eyebrow">From maybe to see you there</p>
            <h2>
              Your next good plan
              <br />
              is closer than you think.
            </h2>
          </div>
          <ol>
            <li>
              <span className="step-number">01</span>
              <h3>Peek.</h3>
              <p>
                Say what you’re up for and see who nearby has the same idea.
              </p>
            </li>
            <li>
              <span className="step-number">02</span>
              <h3>Poke.</h3>
              <p>
                A coffee? A walk? Send a small invitation. No big introduction
                needed.
              </p>
            </li>
            <li>
              <span className="step-number">03</span>
              <h3>Meet.</h3>
              <p>
                Pick a public place and a time. Put the phone down. Take it from
                there.
              </p>
            </li>
          </ol>
        </section>
        <section className="landing-safety">
          <div>
            <p className="eyebrow">Nearby. On your terms.</p>
            <h2>
              Be spontaneous.
              <br />
              Stay in control.
            </h2>
          </div>
          <div>
            <p>
              Your availability has an expiry. Your precise location stays off
              other people’s maps. You choose who to meet, and you can block or
              report someone at any time.
            </p>
            <Link href="/safety" className="text-link">
              A few good ground rules <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
        <section className="landing-last">
          <BrandMark className="h-14 w-14" />
          <h2>
            Make room for
            <br />a little unexpected.
          </h2>
          <Link
            href="/login?redirectTo=%2Fnow"
            className="btn btn-accent btn-lg btn-pill"
          >
            Find your next plan <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="public-footer">
        <Link href="/" className="wordmark">
          peek & poke<span>.</span>
        </Link>
        <p>Online just long enough to meet offline.</p>
        <nav aria-label="Legal and safety">
          <Link href="/safety">Safety</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
