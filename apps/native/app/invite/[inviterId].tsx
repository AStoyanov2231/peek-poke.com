import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@peekpoke/design";
import { Button } from "@/components/ui";
import { acceptInvite } from "@/data/social/api";
import { invalidateSocialQueries } from "@/data/social/queries";

export default function InviteScreen() {
  const { inviterId } = useLocalSearchParams<{ inviterId: string }>();
  const queryClient = useQueryClient();
  const startedFor = useRef<string | null>(null);
  const inviteMutation = useMutation({
    mutationFn: acceptInvite,
    onSuccess: async (response) => {
      await invalidateSocialQueries(queryClient);
      router.replace(`/(app)/profile/${response.profile_id}` as never);
    },
  });
  const acceptInvitation = inviteMutation.mutate;

  useEffect(() => {
    if (!inviterId || startedFor.current === inviterId) return;
    startedFor.current = inviterId;
    acceptInvitation(inviterId);
  }, [acceptInvitation, inviterId]);

  function retry() {
    if (!inviterId) return;
    inviteMutation.mutate(inviterId);
  }

  return (
    <View style={styles.root}>
      {inviteMutation.isError ? (
        <>
          <Text style={styles.title}>{"Couldn't accept invite"}</Text>
          <Text style={styles.body}>An unexpected error occurred.</Text>
          <Button onPress={retry} size="md" variant="secondary">Try again</Button>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary[500]} size="large" />
          <Text style={styles.body}>Opening invitation…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
    padding: spacing[6],
    backgroundColor: colors.ink[1],
  },
  title: {
    ...typography.title2,
    color: colors.ink[9],
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: colors.ink[5],
    textAlign: "center",
  },
});
