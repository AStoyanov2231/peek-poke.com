import CalendarPlus from "lucide-react-native/icons/calendar-plus";
import Sparkles from "lucide-react-native/icons/sparkles";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontFamilies, radii, spacing, typography } from "@peekpoke/design";
import type { ChatSuggestionsResponse } from "@peekpoke/shared";
import { nativeChatSuggestionFallback } from "@/data/chat-suggestions";

type ChatMomentumActionsProps = {
  hasMessages: boolean;
  isError: boolean;
  isLoading: boolean;
  onChooseReply: (reply: string) => void;
  onMakePlan: () => void;
  suggestions?: ChatSuggestionsResponse["suggestions"];
};

/** These suggestions are deterministic, editable draft starters. They never send a message. */
export function ChatMomentumActions({
  hasMessages,
  isError,
  isLoading,
  onChooseReply,
  onMakePlan,
  suggestions,
}: ChatMomentumActionsProps) {
  const visibleSuggestions = suggestions ?? nativeChatSuggestionFallback(hasMessages);
  const replySuggestions = visibleSuggestions.filter((suggestion) => suggestion.id !== "plan");
  const planLabel = visibleSuggestions.find((suggestion) => suggestion.id === "plan")?.text
    ?? "Make a plan";

  return (
    <View accessibilityLabel="Conversation suggestions" style={styles.wrap}>
      <View style={styles.heading}>
        <Sparkles color={colors.ink[6]} size={14} />
        <Text style={styles.title}>Keep it moving</Text>
        {isLoading ? <ActivityIndicator accessibilityLabel="Loading suggestions" color={colors.primary[500]} size="small" /> : null}
      </View>
      <View style={styles.actions}>
        {replySuggestions.map((suggestion) => (
          <Pressable
            key={suggestion.id}
            accessibilityHint="Adds this editable text to your message"
            accessibilityLabel={`Use reply suggestion: ${suggestion.text}`}
            accessibilityRole="button"
            onPress={() => onChooseReply(suggestion.text)}
            style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
          >
            <Text numberOfLines={2} style={styles.suggestionText}>{suggestion.text}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityHint="Opens a plan draft. It does not send a message."
          accessibilityLabel={planLabel}
          accessibilityRole="button"
          onPress={onMakePlan}
          style={({ pressed }) => [styles.plan, pressed && styles.planPressed]}
        >
          <CalendarPlus color={colors.primary[600]} size={15} />
          <Text style={styles.planText}>{planLabel}</Text>
        </Pressable>
      </View>
      {isError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Suggestions are unavailable. You can still write your own message.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[2],
    marginBottom: spacing[2],
    paddingTop: spacing[1],
  },
  heading: { alignItems: "center", flexDirection: "row", gap: spacing[1] },
  title: { ...typography.caption, color: colors.ink[6], fontFamily: fontFamilies.medium },
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  suggestion: {
    minHeight: 44,
    maxWidth: "100%",
    justifyContent: "center",
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  suggestionPressed: { backgroundColor: colors.ink[2] },
  suggestionText: { ...typography.caption, color: colors.ink[7], fontFamily: fontFamilies.medium },
  plan: {
    minHeight: 44,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[1],
    justifyContent: "center",
    paddingHorizontal: spacing[3],
    borderRadius: radii.pill,
    backgroundColor: colors.primary[50],
  },
  planPressed: { backgroundColor: colors.primary[100] },
  planText: { ...typography.caption, color: colors.primary[600], fontFamily: fontFamilies.semibold },
  error: { ...typography.caption, color: colors.ink[6] },
});
