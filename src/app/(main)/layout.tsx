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
import { StoreHydrator } from "@/components/StoreHydrator";
import { getPreloadData } from "@/lib/preload-server";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getSession reads from cookie — no network call; middleware already validated the session
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const preloadData = await getPreloadData(supabase, session.user.id);

  return (
    <QueryProvider>
      {preloadData && <StoreHydrator data={preloadData} />}
      <PreloadProvider>
        <NativeBridgeProvider>
          <AuthBridgeProvider>
            <SplashScreen />
            <div className="h-screen-safe bg-background flex overflow-hidden native-app-layout">
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
