"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminReports,
  moderationReportMutationErrorMessage,
  updateAdminReport,
  type ReportAction,
  type ReportStatus,
} from "@/data/admin-query";
import { bootstrapQueryOptions } from "@/data/web-query";
import {
  AdminReportMutationControls,
  type ReportMutationAttemptView,
} from "@/features/admin/components/AdminReportMutationControls";

const STATUSES: ReportStatus[] = ["pending", "reviewing", "resolved", "dismissed"];

type OwnedReportAttempt = ReportMutationAttemptView & {
  attemptId: number;
  ownerId: string | null;
  reportId: string;
  sourceStatus: ReportStatus;
};

function withoutAttempt(
  attempts: Record<string, OwnedReportAttempt>,
  reportId: string,
) {
  const next = { ...attempts };
  delete next[reportId];
  return next;
}

export function AdminReportsTab() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReportStatus>("pending");
  const accountId = useQuery(bootstrapQueryOptions).data?.identity.id ?? null;
  const [attempts, setAttempts] = useState<Record<string, OwnedReportAttempt>>({});
  const nextAttemptId = useRef(0);
  const ownership = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const accountIdRef = useRef(accountId);
  const statusRef = useRef(status);
  const query = useQuery({
    queryKey: ["admin-reports", accountId, status],
    queryFn: ({ signal }) => fetchAdminReports(status, signal),
    enabled: accountId !== null,
  });

  useEffect(() => {
    const activeOwnership = ownership.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeOwnership.clear();
    };
  }, []);

  useEffect(() => {
    accountIdRef.current = accountId;
    statusRef.current = status;
  }, [accountId, status]);

  function isCurrentAttempt(attempt: OwnedReportAttempt) {
    return mounted.current
      && ownership.current.get(attempt.reportId) === attempt.attemptId
      && accountIdRef.current === attempt.ownerId
      && statusRef.current === attempt.sourceStatus;
  }

  async function executeReportUpdate(
    reportId: string,
    nextStatus: ReportAction,
  ) {
    const attempt: OwnedReportAttempt = {
      action: nextStatus,
      attemptId: ++nextAttemptId.current,
      message: null,
      ownerId: accountId,
      phase: "pending",
      reportId,
      sourceStatus: status,
    };
    ownership.current.set(reportId, attempt.attemptId);
    setAttempts((current) => ({ ...current, [reportId]: attempt }));

    try {
      await updateAdminReport(reportId, nextStatus);
      if (!isCurrentAttempt(attempt)) return;

      await queryClient.invalidateQueries({
        exact: true,
        queryKey: ["admin-reports", attempt.ownerId, attempt.sourceStatus],
      });
      if (!isCurrentAttempt(attempt)) return;

      ownership.current.delete(reportId);
      setAttempts((current) => withoutAttempt(current, reportId));
    } catch (error) {
      if (!isCurrentAttempt(attempt)) return;
      setAttempts((current) => ({
        ...current,
        [reportId]: {
          ...attempt,
          message: moderationReportMutationErrorMessage(error),
          phase: "failed",
        },
      }));
    }
  }

  function startReportUpdate(reportId: string, nextStatus: ReportAction) {
    void executeReportUpdate(reportId, nextStatus);
  }

  function cancelReportUpdate(reportId: string) {
    ownership.current.delete(reportId);
    setAttempts((current) => withoutAttempt(current, reportId));
  }

  function changeStatus(nextStatus: ReportStatus) {
    ownership.current.clear();
    setAttempts({});
    setStatus(nextStatus);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => changeStatus(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${
              value === status ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading reports…</p> : null}
      {query.isError ? <p role="alert" className="text-sm text-red-600">Reports could not be loaded.</p> : null}
      {!query.isLoading && query.data?.reports.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No {status} reports.</p>
      ) : null}

      {query.data?.reports.map((report) => (
        <article key={report.id} className="rounded-md border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                Reported: {report.reported_user?.display_name || report.reported_user?.username || "Deleted account"}
              </p>
              <p className="text-sm text-muted-foreground">
                By {report.reporter?.display_name || report.reporter?.username || "Deleted account"} · {new Date(report.created_at).toLocaleString("en-US", { timeZone: "UTC" })}
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              {report.category.replaceAll("_", " ")}
            </span>
          </div>
          {report.details ? <p className="mt-3 whitespace-pre-wrap text-sm">{report.details}</p> : null}
          <AdminReportMutationControls
            attempt={
              attempts[report.id]?.ownerId === accountId
              && attempts[report.id]?.sourceStatus === status
                ? attempts[report.id]
                : null
            }
            reportId={report.id}
            status={status}
            onAction={(nextStatus) => startReportUpdate(report.id, nextStatus)}
            onCancel={() => cancelReportUpdate(report.id)}
            onRetry={() => {
              const attempt = attempts[report.id];
              if (
                attempt?.ownerId === accountId
                && attempt.sourceStatus === status
              ) {
                startReportUpdate(report.id, attempt.action);
              }
            }}
          />
        </article>
      ))}
    </div>
  );
}
