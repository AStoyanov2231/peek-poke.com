/**
 * Reward claims require a server-issued attestation capability. No such
 * capability exists while `/api/coins/meeting` is fail-closed, so app runtime
 * must not send speculative reward requests from coarse discovery positions.
 * The API still independently rejects every unsupported claim.
 */
export type ValidatedMeetingRewardCapability = Readonly<{
  kind: "server-attested-location";
  token: string;
}>;

const unavailableCapability: ValidatedMeetingRewardCapability | null = null;

export function canAttemptMeetingReward(
  capability: ValidatedMeetingRewardCapability | null | undefined = unavailableCapability,
) {
  return capability?.kind === "server-attested-location"
    && capability.token.length >= 16;
}
