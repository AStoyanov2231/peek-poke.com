import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MobileNav } from "@/features/layout/components/MobileNav";
import { DesktopNav } from "@/features/layout/components/DesktopNav";
import { ContentWrapper } from "@/features/layout/components/ContentWrapper";
import { PreloadProvider } from "@/components/providers/PreloadProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SplashScreen } from "@/components/providers/SplashScreen";
import { PersistentMapHost } from "@/features/map/components/PersistentMapHost";
import { CallProvider } from "@/features/call/components/CallProvider";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getSession reads from cookie — no network call; middleware already validated the session
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  return (
    <QueryProvider>
      <PreloadProvider>
        <SplashScreen />
        <div className="h-screen-safe bg-background flex overflow-hidden">
          <PersistentMapHost />
          <DesktopNav />
          <ContentWrapper>{children}</ContentWrapper>
          <MobileNav />
          <CallProvider />
        </div>
      </PreloadProvider>
    </QueryProvider>
  );
}
