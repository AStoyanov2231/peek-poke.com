import { View } from "react-native";
import type { ModerationReportAction, ModerationReportStatus } from "@peekpoke/shared";
import { spacing } from "@peekpoke/design";
import { Button } from "@/components/ui";

type Props = {
  pending: boolean;
  status: ModerationReportStatus;
  onAction: (action: ModerationReportAction) => void;
};

export function AdminReportActions({ pending, status, onAction }: Props) {
  if (status !== "pending" && status !== "reviewing") return null;

  return (
    <View
      accessibilityLabel="Report moderation actions"
      accessibilityState={{ busy: pending }}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[2], marginTop: spacing[2] }}
    >
      {status === "pending" ? (
        <Button disabled={pending} onPress={() => onAction("reviewing")} size="sm" variant="secondary">
          Review
        </Button>
      ) : null}
      <Button disabled={pending} onPress={() => onAction("resolved")} size="sm">
        Resolve
      </Button>
      <Button disabled={pending} onPress={() => onAction("dismissed")} size="sm" variant="secondary">
        Dismiss
      </Button>
    </View>
  );
}
