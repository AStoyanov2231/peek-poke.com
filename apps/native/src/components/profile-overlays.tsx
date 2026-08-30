import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import CircleHelp from "lucide-react-native/icons/circle-question-mark";
import Copy from "lucide-react-native/icons/copy";
import FileText from "lucide-react-native/icons/file-text";
import Trash2 from "lucide-react-native/icons/trash-2";
import Share2 from "lucide-react-native/icons/share-2";
import X from "lucide-react-native/icons/x";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import QRCode from "react-native-qrcode-svg";
import type { OwnerProfilePhoto } from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { IconGlyph } from "@/components/ui";
import { fetchInviteLink } from "@/data/social/api";

type SettingsView = "main" | "help" | "terms" | "delete";

const faqs = [
  {
    q: "How do I find people nearby?",
    a: "Open the map on the home screen. Pins show users who are currently sharing their location near you.",
  },
  {
    q: "How do I send a friend request?",
    a: "Tap on a pin or visit a user's profile, then tap Add Friend. They'll receive a request in their inbox.",
  },
  {
    q: "What is Premium?",
    a: "Premium unlocks private photo access and other exclusive features. Upgrade from your profile page.",
  },
  {
    q: "How do I change my avatar?",
    a: "Go to your profile, tap any photo in the gallery, and select Set as avatar.",
  },
  {
    q: "How do I delete my account?",
    a: "Open Settings, choose Delete Account, and confirm. Your app account and personal content are erased. App Store and Google Play subscriptions must be canceled separately.",
  },
] as const;

export function SettingsSheet({
  open,
  onClose,
  onSignOut,
  onDeleteAccount,
}: {
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<SettingsView>("main");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleClose() {
    if (deleting) return;
    setView("main");
    setDeleteError(null);
    onClose();
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteAccount();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "We couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={handleClose} presentationStyle="overFullScreen" transparent visible={open}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close settings" onPress={handleClose} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            {view === "main" ? (
              <Text style={styles.sheetTitle}>Settings</Text>
            ) : (
              <CircleButton label="Back" onPress={() => setView("main")}>
                <ChevronLeft color={colors.ink[5]} size={16} strokeWidth={2} />
              </CircleButton>
            )}
            <CircleButton label="Close" onPress={handleClose}>
              <X color={colors.ink[5]} size={16} strokeWidth={2} />
            </CircleButton>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {view === "main" ? (
              <>
                <Text style={styles.eyebrow}>SUPPORT</Text>
                <View style={styles.settingsRows}>
                  <SettingsRow icon={<CircleHelp color={colors.primary[500]} size={18} />} label="Help Center" onPress={() => setView("help")} />
                  <SettingsRow icon={<FileText color={colors.primary[500]} size={18} />} label="Terms & Privacy" onPress={() => setView("terms")} />
                </View>
                <Pressable accessibilityRole="button" onPress={onSignOut} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}>
                  <Text style={styles.logoutText}>Log Out</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setView("delete")} style={({ pressed }) => [styles.deleteAccount, pressed && styles.pressed]}>
                  <Trash2 color={colors.danger[500]} size={16} />
                  <Text style={styles.deleteAccountText}>Delete Account</Text>
                </Pressable>
                <Text style={styles.version}>Peek &amp; Poke v{Constants.expoConfig?.version ?? "0.1.0"}</Text>
              </>
            ) : view === "help" ? (
              <>
                <Text style={styles.subTitle}>Help Center</Text>
                {faqs.map(({ q, a }) => (
                  <View key={q} style={styles.infoCard}>
                    <Text style={styles.infoHeading}>{q}</Text>
                    <Text style={styles.infoBody}>{a}</Text>
                  </View>
                ))}
              </>
            ) : view === "terms" ? (
              <>
                <Text style={styles.subTitle}>Terms &amp; Privacy</Text>
                <LegalCard
                  body="By using Peek & Poke you agree to our terms of service. We may update these terms from time to time and will notify you of significant changes."
                  title="Terms of Service"
                />
                <LegalCard
                  body="We collect only the data needed to provide the Peek & Poke service. Your location is only shared when you choose to enable it. We never sell your data."
                  title="Privacy Policy"
                />
              </>
            ) : (
              <>
                <Text style={styles.subTitle}>Delete Account</Text>
                <View style={styles.deleteWarning}>
                  <Text style={styles.deleteWarningTitle}>This action cannot be undone.</Text>
                  <Text style={styles.deleteWarningBody}>
                    Your personal profile, photos, location, authored messages, billing identifiers, and sign-in account will be erased. Shared conversations retain only an anonymous deleted-member placeholder and minimal safety records.
                  </Text>
                  <Text style={styles.deleteWarningBody}>
                    App Store and Google Play subscriptions are not canceled by deleting your account. Cancel the subscription in the store first. A web subscription billed by Stripe is canceled immediately.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="link"
                  disabled={deleting}
                  onPress={() => void Linking.openURL(
                    Platform.OS === "ios"
                      ? "https://apps.apple.com/account/subscriptions"
                      : "https://play.google.com/store/account/subscriptions"
                  )}
                  style={({ pressed }) => [styles.storeManage, deleting && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.storeManageText}>Manage Store Subscription</Text>
                </Pressable>
                {deleteError ? <Text accessibilityRole="alert" style={styles.deleteError}>{deleteError}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={deleting}
                  onPress={() => void handleDeleteAccount()}
                  style={({ pressed }) => [styles.deleteConfirm, deleting && styles.disabled, pressed && styles.pressed]}
                >
                  {deleting ? <ActivityIndicator color={colors.surface} size="small" /> : null}
                  <Text style={styles.deleteConfirmText}>{deleting ? "Deleting…" : "Delete My Account"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={deleting}
                  onPress={() => setView("main")}
                  style={({ pressed }) => [styles.logout, deleting && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.logoutText}>Keep My Account</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// These modal variants intentionally share one file and one style system.
// react-doctor-disable-next-line no-multi-comp
export function ShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const inviteQuery = useQuery({
    queryKey: ["profile", "share-invite"],
    queryFn: ({ signal }) => fetchInviteLink(signal),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });
  const inviteUrl = inviteQuery.data?.invite_url ?? null;
  const inviteError = inviteQuery.isError
    ? inviteQuery.error instanceof Error
      ? inviteQuery.error.message
      : "Invite links are unavailable."
    : null;

  function handleClose() {
    setCopied(false);
    onClose();
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal animationType="slide" onRequestClose={handleClose} presentationStyle="overFullScreen" transparent visible={open}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close invite" onPress={handleClose} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Invite Friend</Text>
            <CircleButton label="Close" onPress={handleClose}>
              <X color={colors.ink[5]} size={16} strokeWidth={2} />
            </CircleButton>
          </View>
          <View style={styles.inviteContent}>
            {inviteUrl ? (
              <View style={styles.qrCard}>
                <QRCode backgroundColor="#ffffff" color="#17151d" size={200} value={inviteUrl} />
              </View>
            ) : (
              <View style={[styles.qrCard, { width: 232, height: 232, alignItems: "center", justifyContent: "center" }]}>
                <ActivityIndicator color={colors.primary[500]} size="large" />
              </View>
            )}
            <Text accessibilityRole={inviteError ? "alert" : undefined} style={styles.inviteUrl}>
              {inviteError ?? inviteUrl ?? "Creating a secure invite…"}
            </Text>
            {inviteError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void inviteQuery.refetch()}
                style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
              >
                <Text style={styles.shareButtonText}>Try again</Text>
              </Pressable>
            ) : null}
            <View style={styles.shareActions}>
              <Pressable accessibilityRole="button" disabled={!inviteUrl} onPress={copyLink} style={({ pressed }) => [styles.shareButton, !inviteUrl && styles.disabled, pressed && styles.pressed]}>
                {copied ? <IconGlyph color={colors.success[500]} name="check" size={16} /> : <Copy color={colors.ink[9]} size={16} />}
                <Text style={styles.shareButtonText}>{copied ? "Copied!" : "Copy Link"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!inviteUrl}
                onPress={() => inviteUrl ? Share.share({ message: inviteUrl, title: "Join me on Peek & Poke!", url: inviteUrl }) : undefined}
                style={({ pressed }) => [styles.shareButton, styles.shareButtonDark, !inviteUrl && styles.disabled, pressed && styles.pressed]}
              >
                <Share2 color={colors.surface} size={16} />
                <Text style={[styles.shareButtonText, styles.shareButtonTextDark]}>Share</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// react-doctor-disable-next-line no-multi-comp
export function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: OwnerProfilePhoto[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const currentIndex = index;
  if (currentIndex == null) return null;
  const photo = photos[currentIndex];
  if (!photo) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible>
      <StatusBar animated style="light" />
      <View style={styles.viewer}>
        <Pressable accessibilityLabel="Close photo" onPress={onClose} style={[styles.viewerClose, { top: insets.top + spacing[3] }]}>
          <X color={colors.surface} size={20} strokeWidth={2} />
        </Pressable>
        {photo.url ? (
          <Image resizeMode="contain" source={{ uri: photo.url }} style={styles.viewerImage} />
        ) : (
          <View style={styles.viewerImage} />
        )}
        <Text style={[styles.viewerCounter, { bottom: insets.bottom + spacing[5] }]}>{currentIndex + 1} / {photos.length}</Text>
        {currentIndex > 0 ? (
          <Pressable accessibilityLabel="Previous photo" onPress={() => onIndexChange(currentIndex - 1)} style={[styles.viewerNav, styles.viewerPrev]}>
            <ChevronLeft color={colors.surface} size={24} />
          </Pressable>
        ) : null}
        {currentIndex < photos.length - 1 ? (
          <Pressable accessibilityLabel="Next photo" onPress={() => onIndexChange(currentIndex + 1)} style={[styles.viewerNav, styles.viewerNext]}>
            <ChevronRight color={colors.surface} size={24} />
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

// react-doctor-disable-next-line no-multi-comp
function CircleButton({ children, label, onPress }: { children: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

// react-doctor-disable-next-line no-multi-comp
function SettingsRow({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}>
      {icon}
      <Text style={styles.settingsLabel}>{label}</Text>
      <ChevronRight color={colors.ink[5]} size={16} />
    </Pressable>
  );
}

// react-doctor-disable-next-line no-multi-comp
function LegalCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoHeading}>{title}</Text>
      <Text style={styles.infoBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    maxHeight: "85%",
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline, alignSelf: "center", marginTop: spacing[3], marginBottom: spacing[2] },
  sheetHeader: { minHeight: 48, paddingHorizontal: spacing[6], paddingBottom: spacing[4], flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { ...typography.title1, color: colors.ink[9] },
  circleButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", ...shadows.e1 },
  sheetContent: { paddingHorizontal: spacing[6], paddingBottom: spacing[4], gap: spacing[3] },
  eyebrow: { ...typography.caption, fontFamily: fontFamilies.semibold, color: colors.ink[5], letterSpacing: 1, paddingHorizontal: spacing[1] },
  settingsRows: { gap: 6 },
  settingsRow: { height: 52, borderRadius: radii.sm, paddingHorizontal: spacing[4], flexDirection: "row", alignItems: "center", gap: spacing[3], backgroundColor: colors.background, ...shadows.e2 },
  settingsLabel: { ...typography.body, fontFamily: fontFamilies.semibold, color: colors.ink[9], flex: 1 },
  deleteAccount: { height: 48, borderRadius: radii.sm, backgroundColor: "#fff1f0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2] },
  deleteAccountText: { ...typography.body, fontFamily: fontFamilies.semibold, color: colors.danger[500] },
  deleteWarning: { borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: "#f1b4b0", backgroundColor: "#fff1f0", padding: spacing[4], gap: spacing[2] },
  deleteWarningTitle: { ...typography.body, fontFamily: fontFamilies.semibold, color: colors.danger[500] },
  deleteWarningBody: { ...typography.caption, color: colors.danger[500], lineHeight: 19 },
  storeManage: { height: 44, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, ...shadows.e2 },
  storeManageText: { ...typography.caption, fontFamily: fontFamilies.semibold, color: colors.ink[9] },
  deleteError: { ...typography.caption, color: colors.danger[500] },
  deleteConfirm: { height: 48, borderRadius: radii.sm, backgroundColor: colors.danger[500], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2] },
  deleteConfirmText: { ...typography.body, fontFamily: fontFamilies.semibold, color: colors.surface },
  disabled: { opacity: 0.6 },
  logout: { height: 48, borderRadius: radii.sm, marginTop: spacing[2], alignItems: "center", justifyContent: "center", backgroundColor: colors.background, ...shadows.e2 },
  logoutText: { ...typography.body, fontFamily: fontFamilies.semibold, color: colors.ink[5] },
  version: { ...typography.caption, color: colors.ink[5], textAlign: "center", paddingTop: spacing[1] },
  subTitle: { ...typography.title2, color: colors.ink[9] },
  infoCard: { borderRadius: radii.sm, padding: spacing[4], gap: 6, backgroundColor: colors.background, ...shadows.e1 },
  infoHeading: { fontFamily: fontFamilies.semibold, fontSize: 14, lineHeight: 19, color: colors.ink[9] },
  infoBody: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 19, color: colors.ink[5] },
  inviteContent: { paddingHorizontal: spacing[6], paddingBottom: spacing[4], alignItems: "center", gap: spacing[5] },
  qrCard: { padding: spacing[4], borderRadius: radii.xl, backgroundColor: "#ffffff", ...shadows.e1 },
  inviteUrl: { ...typography.caption, color: colors.ink[5], textAlign: "center", paddingHorizontal: spacing[4] },
  shareActions: { flexDirection: "row", gap: spacing[3], width: "100%" },
  shareButton: { flex: 1, height: 48, borderRadius: radii.sm, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing[2], ...shadows.e2 },
  shareButtonDark: { backgroundColor: colors.ink[9], ...shadows.e1 },
  shareButtonText: { ...typography.body, fontFamily: fontFamilies.semibold, color: colors.ink[9] },
  shareButtonTextDark: { color: colors.surface },
  viewer: { flex: 1, backgroundColor: colors.ink[9], alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "82%" },
  viewerClose: { position: "absolute", right: spacing[4], zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink[7], alignItems: "center", justifyContent: "center" },
  viewerCounter: { position: "absolute", ...typography.caption, color: colors.surface },
  viewerNav: { position: "absolute", top: "48%", width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink[7], alignItems: "center", justifyContent: "center" },
  viewerPrev: { left: spacing[3] },
  viewerNext: { right: spacing[3] },
  pressed: { opacity: 0.72 },
});
