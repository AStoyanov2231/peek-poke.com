"use client";

import type { ReportAction, ReportStatus } from "@/data/admin-query";

export type ReportMutationAttemptView = {
  action: ReportAction;
  message: string | null;
  phase: "pending" | "failed";
};

type Props = {
  attempt: ReportMutationAttemptView | null;
  reportId: string;
  status: ReportStatus;
  onAction: (action: ReportAction) => void;
  onCancel: () => void;
  onRetry: () => void;
};

function actionLabel(action: ReportAction) {
  if (action === "reviewing") return "Start review";
  if (action === "resolved") return "Resolve";
  return "Dismiss";
}

export function AdminReportMutationControls({
  attempt,
  reportId,
  status,
  onAction,
  onCancel,
  onRetry,
}: Props) {
  if (attempt?.phase === "failed") {
    return (
      <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3" aria-busy="false">
        <p id={`report-error-${reportId}`} role="alert" className="text-sm text-red-700">
          {attempt.message}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            aria-describedby={`report-error-${reportId}`}
            aria-label={`Retry ${actionLabel(attempt.action).toLowerCase()} for report`}
            onClick={onRetry}
            className="btn btn-primary"
          >
            Retry
          </button>
          <button
            type="button"
            aria-label="Cancel report update retry"
            onClick={onCancel}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (status !== "pending" && status !== "reviewing") return null;
  const pending = attempt?.phase === "pending";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" aria-busy={pending}>
      {status === "pending" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAction("reviewing")}
          className="btn btn-secondary"
        >
          Start review
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => onAction("resolved")}
        className="btn btn-primary"
      >
        Resolve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => onAction("dismissed")}
        className="btn btn-secondary"
      >
        Dismiss
      </button>
      {pending ? (
        <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {actionLabel(attempt.action)} pending…
        </span>
      ) : null}
    </div>
  );
}
