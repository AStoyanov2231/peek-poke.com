import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useEffect, useState } from "react";
// react-doctor-disable-next-line rn-prefer-reanimated
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { getRecoveryContent } from "@/components/recovery-copy";

const logoSource = require("../../../../public/images/logo.png");

export function BootstrapSplash({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const [pulse] = useState(() => new Animated.Value(1));
  const recovery = error ? getRecoveryContent(error) : null;

  useEffect(() => {
    if (error) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [error, pulse]);

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Animated.View style={[styles.logoTile, !recovery && { opacity: pulse }]}>
          <Image accessibilityIgnoresInvertColors source={logoSource} style={styles.logo} />
        </Animated.View>
        <Text style={styles.title}>Peek &amp; Poke</Text>
        <Text style={styles.caption}>{recovery?.title ?? "Setting things up…"}</Text>

        {recovery ? (
          <View style={styles.errorContent}>
            <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorText}>
              {recovery.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
            >
              <RefreshCw accessible={false} color={colors.ink[8]} size={16} strokeWidth={2} />
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.ink[1],
  },
  content: {
    alignItems: "center",
    gap: spacing[4],
  },
  logoTile: {
    width: 64,
    height: 64,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[500],
  },
  logo: {
    width: 36,
    height: 36,
  },
  title: {
    ...typography.title2,
    color: colors.ink[9],
    textAlign: "center",
  },
  caption: {
    ...typography.caption,
    color: colors.ink[5],
    textAlign: "center",
  },
  errorContent: {
    width: "100%",
    maxWidth: 320,
    marginTop: spacing[2],
    alignItems: "center",
    gap: spacing[3],
  },
  errorText: {
    ...typography.caption,
    color: colors.danger[500],
    textAlign: "center",
  },
  retryButton: {
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingHorizontal: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  retryPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  retryText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.semibold,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
});
