import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@peekpoke/design";
import { Avatar, Button } from "@/components/ui";
import { acceptInvite, fetchInvitePreview } from "@/data/social/api";
import { invalidateSocialQueries } from "@/data/social/queries";
import { useAgeAdmission } from "@/components/age-admission-context";
import { inviteTokenForReturn } from "@/lib/invite-qr-link";

export default function InviteScreen() {
  const { admission, accountId } = useAgeAdmission();
  const { inviterId } = useLocalSearchParams<{ inviterId: string }>();
  const token = inviteTokenForReturn(inviterId);
  if (admission?.status !== "adult" || !accountId) {
    return <View style={styles.root}><ActivityIndicator accessibilityLabel="Checking invitation access" color={colors.primary[500]} /></View>;
  }
  if (!token) {
    return <View style={styles.root}><Text style={styles.title}>This invite is invalid.</Text><Button onPress={() => router.replace("/(app)/now" as never)} variant="secondary">Back to Now</Button></View>;
  }
  return <AdmittedInviteScreen key={`${accountId}:${token}`} accountId={accountId} token={token} />;
}

function AdmittedInviteScreen({ accountId, token }: { accountId: string; token: string }) {
  const queryClient = useQueryClient();
  const lifetime = useRef<object | null>(null);
  useEffect(() => {
    lifetime.current = {};
    return () => { lifetime.current = null; };
  }, []);
  const preview = useQuery({
    queryKey: ["invite-preview", accountId, token],
    queryFn: ({ signal }) => fetchInvitePreview(token, signal),
    retry: false,
    gcTime: 0,
  });
  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!lifetime.current || !preview.data || preview.isError) throw new Error("Review the invitation before connecting.");
      return acceptInvite(token);
    },
    onSuccess: async (response) => {
      const owner = lifetime.current;
      if (!owner) return;
      await invalidateSocialQueries(queryClient);
      if (lifetime.current !== owner) return;
      router.replace(`/(app)/profile/${response.profile_id}` as never);
    },
  });
  const profile = preview.data?.profile;
  const name = profile?.display_name ?? profile?.username;

  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.root}>
      {preview.isPending ? <>
        <ActivityIndicator color={colors.primary[500]} />
        <Text style={styles.body}>Checking this invitation…</Text>
      </> : preview.isError || !profile ? <>
        <Text style={styles.title}>This invite is unavailable</Text>
        <Text accessibilityRole="alert" style={styles.body}>It may be invalid, expired, or no longer available.</Text>
        <Button onPress={() => void preview.refetch()} disabled={preview.isFetching} variant="secondary">{preview.isFetching ? "Checking…" : "Try again"}</Button>
      </> : <>
        <Avatar uri={profile.avatar_url} name={name!} size={80} />
        <Text style={styles.title}>Connect with {name}?</Text>
        <Text style={styles.body}>You’ll appear in each other’s Friends list.</Text>
        {inviteMutation.isError ? <Text accessibilityRole="alert" style={styles.error}>Couldn’t connect. Please try again.</Text> : null}
        <Button onPress={() => inviteMutation.mutate()} disabled={inviteMutation.isPending} size="md">{inviteMutation.isPending ? "Connecting…" : "Connect"}</Button>
      </>}
      <Button onPress={() => router.replace("/(app)/now" as never)} size="md" variant="secondary">Not now</Button>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  root: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    padding: spacing[6],
    backgroundColor: colors.background,
  },
  title: { ...typography.title2, color: colors.ink[9], textAlign: "center" },
  body: { ...typography.body, color: colors.ink[6], textAlign: "center" },
  error: { ...typography.body, color: colors.danger[500], textAlign: "center" },
});
