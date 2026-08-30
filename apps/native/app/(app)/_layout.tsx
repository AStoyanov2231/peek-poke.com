import { Tabs, router, usePathname, type ErrorBoundaryProps } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontFamilies, radii, shadows, spacing } from "@peekpoke/design";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, IconGlyph, type IconName } from "@/components/ui";
import { RouteErrorRecovery } from "@/components/error-recovery";
import { useForegroundRefresh } from "@/hooks/use-foreground-refresh";
import { fetchCurrentProfile } from "@/data/api";
import { fetchRooms } from "@/data/rooms";
import { nativeQueryKeys } from "@/data/query-keys";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorRecovery {...props} />;
}

const tabs = [
  { href: "/(app)/rooms", path: "/rooms", label: "Rooms", icon: "inbox", badge: true },
  { href: "/(app)/profile", path: "/profile", label: "Me", icon: "profile" },
] as const;

export default function AppLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const roomsQuery = useQuery({
    queryKey: nativeQueryKeys.rooms.list,
    queryFn: ({ signal }) => fetchRooms(signal),
    enabled: Boolean(profileQuery.data?.id),
  });
  const profileId = profileQuery.data?.id;
  const roles = profileQuery.data?.roles ?? [];
  const unread = roomsQuery.data?.rooms.reduce((total, room) => total + room.unread_count, 0) ?? 0;
  const isAdmin = roles.includes("admin");
  const badgeCount = unread;
  useForegroundRefresh(Boolean(profileId));
  const allTabs: {
    href: string;
    path: string;
    label: string;
    icon: IconName;
    badge?: boolean;
  }[] = isAdmin ? [...tabs, { href: "/(app)/admin", path: "/admin", label: "Admin", icon: "admin" }] : [...tabs];

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Tabs
          backBehavior="history"
          screenOptions={{
            animation: "none",
            headerShown: false,
            sceneStyle: styles.scene,
          }}
          tabBar={() => null}
        />
      </View>
      <View style={[styles.nav, { bottom: insets.bottom + 22 }]}>
        {allTabs.map(({ href, path, label, icon, badge }) => {
          const active = pathname === path || pathname.startsWith(`${path}/`);
          return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={href}
                onPress={() => router.navigate(href as never)}
                style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
              >
                {active ? <View style={styles.activeIndicator} /> : null}
                <View style={styles.iconWrap}>
                  <IconGlyph
                    name={icon}
                    color={active ? colors.primary[500] : colors.ink[5]}
                    size={22}
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  {badge && badgeCount > 0 ? (
                    <Badge tone="accent" style={styles.badge}>
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </Badge>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={[styles.navText, active && styles.navTextActive]}>
                  {label}
                </Text>
              </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  scene: {
    backgroundColor: colors.background,
  },
  nav: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(221,221,229,0.72)",
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: 64,
    borderRadius: radii.lg,
  },
  navItemPressed: {
    opacity: 0.72,
  },
  activeIndicator: {
    position: "absolute",
    top: 0,
    width: 28,
    height: 3,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: colors.primary[500],
  },
  iconWrap: {
    position: "relative",
  },
  navText: {
    width: "100%",
    textAlign: "center",
    color: colors.ink[5],
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "500",
  },
  navTextActive: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontWeight: "600",
  },
  badge: {
    position: "absolute",
    top: -7,
    right: -11,
    height: 16,
    minWidth: 16,
  },
});
