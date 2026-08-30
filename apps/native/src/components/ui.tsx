import { buttonVariants, colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import AtSign from "lucide-react-native/icons/at-sign";
import Camera from "lucide-react-native/icons/camera";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import Coins from "lucide-react-native/icons/coins";
import Crown from "lucide-react-native/icons/crown";
import Eye from "lucide-react-native/icons/eye";
import ImageIcon from "lucide-react-native/icons/image";
import { Image } from "expo-image";
import { avatarPalette, initials } from "./ui-helpers";
import {
  iconButtonGeometry,
  minimumTouchTarget,
  segmentAccessibility,
  segmentedControlGeometry,
  type NativeTouchPlatform,
} from "./ui-touch-targets";
import Lock from "lucide-react-native/icons/lock";
import Mail from "lucide-react-native/icons/mail";
import MapPin from "lucide-react-native/icons/map-pin";
import Navigation2 from "lucide-react-native/icons/navigation-2";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Pencil from "lucide-react-native/icons/pencil";
import Search from "lucide-react-native/icons/search";
import Settings from "lucide-react-native/icons/settings";
import Share2 from "lucide-react-native/icons/share-2";
import Shield from "lucide-react-native/icons/shield";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Sparkles from "lucide-react-native/icons/sparkles";
import Trash2 from "lucide-react-native/icons/trash-2";
import User from "lucide-react-native/icons/user";
import Users from "lucide-react-native/icons/users";
import Video from "lucide-react-native/icons/video";
import X from "lucide-react-native/icons/x";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = "sm" | "md" | "lg";
const nativeTouchPlatform = Platform.OS as NativeTouchPlatform;
const minimumActivationSize = minimumTouchTarget(nativeTouchPlatform);
const segmentGeometry = segmentedControlGeometry(nativeTouchPlatform);

export type IconName =
  | "admin"
  | "alert"
  | "arrow-left"
  | "arrow-right"
  | "at-sign"
  | "back"
  | "camera"
  | "check"
  | "chevron-down"
  | "close"
  | "coins"
  | "crown"
  | "edit"
  | "eye"
  | "filter"
  | "image"
  | "inbox"
  | "lock"
  | "map"
  | "message"
  | "premium"
  | "profile"
  | "recenter"
  | "search"
  | "send"
  | "settings"
  | "share"
  | "trash"
  | "video"
  | "users";

const iconGlyphs: Record<IconName, LucideIcon> = {
  admin: Shield,
  alert: CircleAlert,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "at-sign": AtSign,
  back: ChevronLeft,
  camera: Camera,
  check: Check,
  "chevron-down": ChevronDown,
  close: X,
  coins: Coins,
  crown: Crown,
  edit: Pencil,
  eye: Eye,
  filter: SlidersHorizontal,
  image: ImageIcon,
  inbox: Mail,
  lock: Lock,
  map: MapPin,
  message: MessageCircle,
  premium: Sparkles,
  profile: User,
  recenter: Navigation2,
  search: Search,
  send: ArrowUp,
  settings: Settings,
  share: Share2,
  trash: Trash2,
  video: Video,
  users: Users,
};

export function Screen({
  children,
  scroll = false,
  padded = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const baseStyle = [padded ? styles.screenContent : styles.screenContentFlush, contentStyle];
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={baseStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={baseStyle}>{children}</View>
  );

  return <SafeAreaView style={styles.screen}>{content}</SafeAreaView>;
}

export function Title(props: TextProps) {
  return <Text {...props} style={[styles.title, props.style]} />;
}

function Title2(props: TextProps) {
  return <Text {...props} style={[styles.title2, props.style]} />;
}

export function SectionTitle(props: TextProps) {
  return <Text {...props} style={[styles.sectionTitle, props.style]} />;
}

export function Body(props: TextProps) {
  return <Text {...props} style={[styles.body, props.style]} />;
}

export function BodyBold(props: TextProps) {
  return <Text {...props} style={[styles.bodyBold, props.style]} />;
}

export function Muted(props: TextProps) {
  return <Text {...props} style={[styles.muted, props.style]} />;
}

export function Caption(props: TextProps) {
  return <Text {...props} style={[styles.caption, props.style]} />;
}

export function Card({
  flat,
  padded = true,
  ...props
}: ViewProps & { flat?: boolean; padded?: boolean }) {
  return <View {...props} style={[styles.card, flat && styles.cardFlat, !padded && styles.cardNoPadding, props.style]} />;
}

type ButtonProps = Omit<PressableProps, "style"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: IconName;
  rightIcon?: IconName;
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function Button({
  children,
  variant = "primary",
  size = "lg",
  fullWidth,
  loading,
  leftIcon,
  rightIcon,
  pressedScale = 0.98,
  style,
  textStyle,
  ...props
}: ButtonProps) {
  const palette = buttonVariants[variant];
  const sizeStyle = size === "sm" ? styles.button_sm : size === "md" ? styles.button_md : styles.button_lg;
  const accessibilityLabel =
    props.accessibilityLabel ??
    (typeof children === "string" || typeof children === "number" ? String(children) : undefined);
  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{
        ...props.accessibilityState,
        busy: loading || props.accessibilityState?.busy,
        disabled: props.disabled || props.accessibilityState?.disabled,
      }}
      style={({ pressed }) => [
        styles.button,
        sizeStyle,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: "borderColor" in palette ? palette.borderColor : "transparent",
          opacity: props.disabled ? 0.5 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? pressedScale : 1 }],
        },
        style,
        { minHeight: minimumActivationSize },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.color} />
      ) : (
        <>
          {leftIcon ? <IconGlyph name={leftIcon} color={palette.color} size={size === "sm" ? 14 : 16} /> : null}
          <Text style={[styles.buttonText, size === "sm" && styles.buttonTextSmall, { color: palette.color }, textStyle]}>
            {children}
          </Text>
          {rightIcon ? <IconGlyph name={rightIcon} color={palette.color} size={size === "sm" ? 14 : 16} /> : null}
        </>
      )}
    </Pressable>
  );
}

export function IconGlyph({
  name,
  color = colors.ink[7],
  size = 18,
  strokeWidth = 2,
  style,
}: {
  name: IconName;
  color?: string;
  size?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const Icon = iconGlyphs[name];
  return <Icon accessible={false} size={size} stroke={color} strokeWidth={strokeWidth} style={style} />;
}

export function IconButton({
  icon,
  iconColor,
  iconSize,
  label,
  loading = false,
  variant = "surface",
  size = 40,
  style,
  visualStyle,
  ...props
}: Omit<PressableProps, "style"> & {
  icon: IconName;
  iconColor?: string;
  iconSize?: number;
  label: string;
  loading?: boolean;
  variant?: "surface" | "dark" | "ghost" | "primary";
  size?: number;
  style?: StyleProp<ViewStyle>;
  visualStyle?: StyleProp<ViewStyle>;
}) {
  const geometry = iconButtonGeometry(size, nativeTouchPlatform);
  const palette = {
    surface: { bg: colors.surface, fg: colors.ink[7], border: colors.hairline },
    dark: { bg: colors.ink[9], fg: colors.surface, border: colors.ink[9] },
    ghost: { bg: "transparent", fg: colors.ink[7], border: "transparent" },
    primary: { bg: colors.primary[500], fg: colors.surface, border: colors.primary[500] },
  }[variant];

  return (
    <Pressable
      accessibilityLabel={label}
      {...props}
      accessibilityRole="button"
      accessibilityState={{
        ...props.accessibilityState,
        disabled: props.disabled || props.accessibilityState?.disabled,
      }}
      style={[
        styles.iconButton,
        {
          width: geometry.activationSize,
          height: geometry.activationSize,
          opacity: props.disabled ? 0.5 : 1,
        },
        style,
        {
          minWidth: geometry.activationSize,
          minHeight: geometry.activationSize,
        },
      ]}
    >
      {({ pressed }) => (
        <View
          pointerEvents="none"
          style={[
            styles.iconButtonVisual,
            {
              width: geometry.visualSize,
              height: geometry.visualSize,
              borderRadius: geometry.visualSize / 2,
              backgroundColor: palette.bg,
              borderColor: palette.border,
              opacity: pressed ? 0.82 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
            visualStyle,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={iconColor ?? palette.fg} size="small" />
          ) : (
            <IconGlyph
              name={icon}
              color={iconColor ?? palette.fg}
              size={iconSize ?? (geometry.visualSize <= 36 ? 15 : 18)}
            />
          )}
        </View>
      )}
    </Pressable>
  );
}

export function Badge({
  children,
  tone = "accent",
  style,
  textStyle,
}: {
  children: ReactNode;
  tone?: "accent" | "primary" | "dark" | "muted" | "success" | "danger";
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const palette = {
    accent: { bg: colors.accent[500], fg: colors.surface },
    primary: { bg: colors.primary[500], fg: colors.surface },
    dark: { bg: colors.ink[9], fg: colors.surface },
    muted: { bg: colors.ink[1], fg: colors.ink[6] },
    success: { bg: colors.success[500], fg: colors.surface },
    danger: { bg: colors.danger[500], fg: colors.surface },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }, style]}>
      <Text style={[styles.badgeText, { color: palette.fg }, textStyle]}>{children}</Text>
    </View>
  );
}

export function PremiumBadge({ showText = false }: { showText?: boolean }) {
  return (
    <View style={styles.premiumBadge}>
      <IconGlyph name="premium" color={colors.surface} size={11} />
      {showText ? <Text style={styles.premiumBadgeText}>Premium</Text> : null}
    </View>
  );
}

export function Avatar({
  uri,
  name,
  size = 44,
  online,
  ringColor,
  style,
}: {
  uri?: string | null;
  name: string;
  size?: number;
  online?: boolean;
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = avatarPalette(name);
  const fallbackTextSize = size >= 96 ? 32 : size >= 64 ? 22 : 15;
  return (
    <View style={[styles.avatarWrap, { width: size, height: size }, ringColor ? { borderColor: ringColor, borderWidth: 3 } : null, style]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.avatarImage, { width: size, height: size } as ImageStyle]} />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: palette.bg }]}>
          <Text style={[styles.avatarFallbackText, { color: palette.fg, fontSize: fallbackTextSize }]}>
            {initials(name)}
          </Text>
        </View>
      )}
      {online ? <View style={styles.statusDot} /> : null}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; badge?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        const accessibility = segmentAccessibility(option.label, option.badge, active);
        return (
          <Pressable
            accessibilityLabel={accessibility.label}
            accessibilityRole={accessibility.role}
            accessibilityState={accessibility.state}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              { minHeight: segmentGeometry.segmentMinHeight },
              active && styles.segmentActive,
              pressed && styles.segmentPressed,
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
            {option.badge ? (
              <Badge tone={option.value === "requests" ? "accent" : "primary"} style={styles.segmentBadge} textStyle={styles.segmentBadgeText}>
                {option.badge > 9 ? "9+" : option.badge}
              </Badge>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({
  icon = "premium",
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <IconGlyph name={icon} color={colors.ink[5]} size={30} />
      </View>
      <Title2 style={styles.emptyTitle}>{title}</Title2>
      {description ? <Muted style={styles.emptyDescription}>{description}</Muted> : null}
      {actionLabel && onAction ? (
        <Button size="md" variant="accent" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.skeleton, style]} />;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {
    flexGrow: 1,
    padding: spacing[4],
    paddingBottom: 112,
    gap: spacing[4],
  },
  screenContentFlush: {
    flexGrow: 1,
    paddingBottom: 112,
  },
  display: {
    ...typography.display,
    color: colors.ink[9],
  },
  title: {
    ...typography.title1,
    color: colors.ink[9],
  },
  title2: {
    ...typography.title2,
    color: colors.ink[9],
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.ink[9],
  },
  body: {
    ...typography.body,
    color: colors.ink[8],
  },
  bodyBold: {
    ...typography.bodyBold,
    color: colors.ink[9],
  },
  muted: {
    ...typography.callout,
    color: colors.ink[5],
  },
  caption: {
    ...typography.caption,
    color: colors.ink[5],
  },
  micro: {
    ...typography.micro,
    color: colors.ink[5],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.e1,
  },
  cardFlat: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    boxShadow: "none",
  },
  cardNoPadding: {
    padding: 0,
  },
  translucentSurface: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    ...shadows.e2,
  },
  field: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    color: colors.ink[9],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...typography.body,
  },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing[2],
  },
  button_sm: {
    minHeight: 32,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[3],
  },
  button_md: {
    minHeight: 40,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
  },
  button_lg: {
    minHeight: 48,
    borderRadius: radii.md,
    paddingHorizontal: spacing[5],
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  buttonText: {
    ...typography.bodyBold,
  },
  buttonTextSmall: {
    fontSize: 13,
    lineHeight: 18,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonVisual: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.e1,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: radii.pill,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    lineHeight: 12,
    fontWeight: "700",
  },
  premiumBadge: {
    height: 22,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary[500],
  },
  premiumBadgeText: {
    color: colors.surface,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    lineHeight: 13,
    fontWeight: "700",
  },
  avatarWrap: {
    borderRadius: radii.pill,
    backgroundColor: colors.ink[2],
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarImage: {
    borderRadius: radii.pill,
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontFamily: fontFamilies.bold,
    fontWeight: "700",
  },
  statusDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.success[500],
  },
  segmented: {
    minHeight: segmentGeometry.containerMinHeight,
    borderRadius: radii.pill,
    paddingHorizontal: 4,
    flexDirection: "row",
    gap: 3,
    backgroundColor: colors.ink[2],
  },
  segment: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  segmentPressed: {
    opacity: 0.82,
  },
  segmentText: {
    ...typography.caption,
    color: colors.ink[5],
    fontFamily: fontFamilies.semibold,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: colors.ink[9],
  },
  segmentBadge: {
    height: 16,
    minWidth: 16,
  },
  segmentBadgeText: {
    fontSize: 9,
    lineHeight: 11,
  },
  emptyState: {
    minHeight: 196,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[10],
    gap: spacing[3],
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[1],
  },
  emptyTitle: {
    textAlign: "center",
  },
  emptyDescription: {
    textAlign: "center",
    maxWidth: 280,
  },
  skeleton: {
    backgroundColor: colors.ink[2],
    borderRadius: radii.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
});
