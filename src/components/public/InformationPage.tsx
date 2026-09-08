import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
export function InformationPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="public-page">
      <header className="public-header">
        <Link href="/" className="wordmark">
          <BrandMark />
          peek & poke<span>.</span>
        </Link>
        <Link href="/now" className="text-link">
          <ArrowLeft size={16} /> Back to Peek
        </Link>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-2xl px-6 py-12"
      >
        <p className="eyebrow text-primary">{eyebrow}</p>
        <h1 className="text-4xl font-semibold tracking-[-.05em] sm:text-5xl">
          {title}
        </h1>
        <p className="mb-10 mt-5 text-base leading-relaxed text-ink-6">
          {intro}
        </p>
        <div className="information-sections">{children}</div>
      </main>
      <footer className="public-footer">
        <p>Online just long enough to meet offline.</p>
        <nav aria-label="Legal and safety">
          <Link href="/safety">Safety</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Ground rules</Link>
        </nav>
      </footer>
    </div>
  );
}
