import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main id="main-content" className="flex h-full min-h-0 flex-col items-center overflow-y-auto bg-background px-4 py-9"><div className="my-auto w-full max-w-md py-6"><Link href="/" className="wordmark mb-8 flex justify-center"><BrandMark/>peek & poke<span>.</span></Link>{children}<p className="mx-auto mt-6 max-w-sm text-center text-xs leading-relaxed text-ink-6">Good company starts with respect. For adults 18+.<br/><Link href="/safety" className="underline underline-offset-4">Meeting safely</Link> · <Link href="/privacy" className="underline underline-offset-4">Privacy controls</Link> · <Link href="/terms" className="underline underline-offset-4">Ground rules</Link></p></div></main>;
}
