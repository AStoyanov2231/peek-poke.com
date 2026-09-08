"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  availabilityDurationForEnd,
  type Activity,
  type AvailabilityUpsertRequest,
} from "@peekpoke/shared";

function localInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function AvailabilityEditor({
  activity,
  pending,
  error,
  onSave,
  onCancel,
}: {
  activity: Activity;
  pending: boolean;
  error?: string;
  onSave: (request: AvailabilityUpsertRequest) => void;
  onCancel: () => void;
}) {
  const [duration, setDuration] = useState("60");
  const [customLabel, setCustomLabel] = useState("");
  const [customEnd, setCustomEnd] = useState(() =>
    localInputValue(new Date(Date.now() + 3_600_000)),
  );
  const [validationError, setValidationError] = useState("");
  const now = new Date();
  const afternoon = new Date(now);
  afternoon.setHours(18, 0, 0, 0);
  const tonight = new Date(now);
  tonight.setHours(23, 0, 0, 0);

  return (
    <form
      className="availability-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const end =
          duration === "custom"
            ? customEnd
            : duration === "afternoon"
              ? afternoon
              : tonight;
        const minutes = /^\d+$/.test(duration)
          ? Number(duration)
          : availabilityDurationForEnd(end);
        if (minutes === null) {
          setValidationError(
            "Choose an end time between 15 minutes and 12 hours from now.",
          );
          return;
        }
        setValidationError("");
        onSave({
          activity,
          customLabel: activity === "custom" ? customLabel.trim() : null,
          durationMinutes: minutes,
        });
      }}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
        {activity === "custom" && (
          <label className="grid min-w-0 gap-1 text-xs font-semibold">
            Your activity
            <input
              className="input"
              maxLength={48}
              required
              placeholder="e.g. A gallery visit"
              value={customLabel}
              disabled={pending}
              onChange={(event) => setCustomLabel(event.target.value)}
            />
          </label>
        )}
        <label className="grid gap-1 text-xs font-semibold">
          How long are you free?
          <select
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            className="input min-w-[150px]"
            disabled={pending}
          >
            <option value="30">Next 30 minutes</option>
            <option value="60">Next hour</option>
            <option value="120">Next 2 hours</option>
            <option value="240">Next 4 hours</option>
            {availabilityDurationForEnd(afternoon, now) !== null && (
              <option value="afternoon">This afternoon, until 6 pm</option>
            )}
            {availabilityDurationForEnd(tonight, now) !== null && (
              <option value="tonight">Tonight, until 11 pm</option>
            )}
            <option value="custom">Choose an end time</option>
          </select>
        </label>
        {duration === "custom" && (
          <label className="grid min-w-0 gap-1 text-xs font-semibold">
            Available until
            <input
              type="datetime-local"
              className="input max-w-full"
              value={customEnd}
              min={localInputValue(new Date(now.getTime() + 15 * 60_000))}
              max={localInputValue(new Date(now.getTime() + 720 * 60_000))}
              required
              disabled={pending}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          className="btn btn-accent btn-md"
          disabled={pending || (activity === "custom" && !customLabel.trim())}
        >
          {pending ? "Saving…" : "I’m up for it"}
          <ArrowUpRight size={17} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-md"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      {(validationError || error) && (
        <p role="alert" className="w-full text-sm text-danger-500">
          {validationError || error}
        </p>
      )}
      <p className="w-full text-xs text-ink-6">
        Only visible to people allowed by your privacy settings. Ends
        automatically.
      </p>
    </form>
  );
}
