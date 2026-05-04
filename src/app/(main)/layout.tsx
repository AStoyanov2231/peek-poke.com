import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MobileNav } from "@/components/layout/MobileNav";
import { DesktopNav } from "@/components/layout/DesktopNav";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PreloadProvider } from "@/components/PreloadProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { SplashScreen } from "@/components/SplashScreen";
import { NativeBridgeProvider } from "@/components/NativeBridgeProvider";
import { AuthBridgeProvider } from "@/components/AuthBridgeProvider";
import { PersistentMapHost } from "@/components/map/PersistentMapHost";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <QueryProvider>
      <PreloadProvider>
        <NativeBridgeProvider>
          <AuthBridgeProvider>
            <SplashScreen />
            <div className="h-screen-safe bg-background flex overflow-hidden">
              <PersistentMapHost />
              <DesktopNav />
              <ContentWrapper>{children}</ContentWrapper>
              <MobileNav />
            </div>
          </AuthBridgeProvider>
        </NativeBridgeProvider>
      </PreloadProvider>
    </QueryProvider>
  );
}
