export const ANNUAL_RETURN_STATUSES = [
  "Pending",
  "Not Started",
  "In Progress",
  "Ready to File",
  "Filed",
  "Verified",
  "Not Required This FY",
] as const;

export type AnnualReturnStatus = (typeof ANNUAL_RETURN_STATUSES)[number];

export const MANUAL_ANNUAL_RETURN_STATUSES = [
  "Not Started",
  "In Progress",
  "Ready to File",
  "Filed",
  "Verified",
  "Not Required This FY",
] as const satisfies readonly AnnualReturnStatus[];

export const TERMINAL_ANNUAL_RETURN_STATUSES = [
  "Filed",
  "Verified",
  "Not Required This FY",
] as const satisfies readonly AnnualReturnStatus[];

export type AnnualReturnWorkflowFacts = {
  currentStatus?: AnnualReturnStatus | null;
  hasWorkflowActivity: boolean;
  allPrerequisitesComplete: boolean;
};

export function isTerminalAnnualReturnStatus(
  status?: AnnualReturnStatus | null,
): boolean {
  return Boolean(
    status &&
    (TERMINAL_ANNUAL_RETURN_STATUSES as readonly AnnualReturnStatus[]).includes(status),
  );
}

/**
 * Automatic states only advance. Removing workflow data therefore cannot silently
 * undo a deliberate or previously reached status. Terminal filing decisions are
 * always controlled by a user.
 */
export function deriveAutomaticAnnualReturnStatus({
  currentStatus,
  hasWorkflowActivity,
  allPrerequisitesComplete,
}: AnnualReturnWorkflowFacts): AnnualReturnStatus | null {
  if (isTerminalAnnualReturnStatus(currentStatus)) return currentStatus || null;
  if (currentStatus === "Ready to File") return currentStatus;
  if (allPrerequisitesComplete) return "Ready to File";
  if (currentStatus === "In Progress") return currentStatus;
  if (hasWorkflowActivity) return "In Progress";
  if (currentStatus === "Pending") return "Not Started";
  return currentStatus || null;
}
