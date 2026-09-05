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

export type AnnualReturnPrerequisiteFacts = {
  clientCategory?: string | null;
  invoiceCoveragePercent: number;
  hasUpload: boolean;
  hasBilling: boolean;
  hasAcceptedQuotation: boolean;
};

export type AnnualReturnProgressFacts = AnnualReturnPrerequisiteFacts & {
  status?: string | null;
  uploadRecordCount: number;
  linkedQuotationCount: number;
  hasSentQuotation: boolean;
};

export type AnnualReturnProgressStepId = "quotation" | "invoice-coverage" | "cpcb-upload" | "billing" | "annual-return";

export type AnnualReturnProgressStepValue = {
  id: AnnualReturnProgressStepId;
  progress: number;
};

const ACCEPTED_QUOTATION_REQUIRED_CATEGORIES = new Set(["Importer", "Brand Owner"]);

function boundedPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function annualReturnRequiresAcceptedQuotation(clientCategory?: string | null) {
  return ACCEPTED_QUOTATION_REQUIRED_CATEGORIES.has(String(clientCategory || ""));
}

export function annualReturnPrerequisitesComplete(facts: AnnualReturnPrerequisiteFacts) {
  return boundedPercent(facts.invoiceCoveragePercent) >= 100
    && facts.hasUpload
    && facts.hasBilling
    && (!annualReturnRequiresAcceptedQuotation(facts.clientCategory) || facts.hasAcceptedQuotation);
}

/**
 * Measures actual Annual Return workflow progress instead of treating the status
 * as a binary 0/100 flag. Invoice coverage contributes proportionally, while
 * CPCB upload activity, billing, an accepted quotation when applicable, and
 * the filing status use the same milestones shown on the client profile.
 * "Not Required" and absent Annual Return records are excluded rather than
 * counted as 100%.
 */
export function annualReturnWorkflowProgressSteps(facts: AnnualReturnProgressFacts): AnnualReturnProgressStepValue[] {
  const status = String(facts.status || "").trim();
  if (!status || status === "Not recorded" || status === "Not Required This FY") return [];

  const requiresAcceptedQuotation = annualReturnRequiresAcceptedQuotation(facts.clientCategory);
  const isPwp = facts.clientCategory === "PWP";
  const steps: AnnualReturnProgressStepValue[] = [];

  if (requiresAcceptedQuotation) {
    steps.push({ id: "quotation", progress: facts.hasAcceptedQuotation ? 1 : facts.hasSentQuotation ? 0.5 : 0 });
  } else if (!isPwp && facts.linkedQuotationCount > 0) {
    steps.push({ id: "quotation", progress: facts.hasAcceptedQuotation ? 1 : facts.hasSentQuotation ? 0.5 : 0.25 });
  }

  const invoiceCoverageProgress = boundedPercent(facts.invoiceCoveragePercent) / 100;
  steps.push({ id: "invoice-coverage", progress: invoiceCoverageProgress });
  steps.push({
    id: "cpcb-upload",
    progress: facts.uploadRecordCount <= 0
      ? 0
      : invoiceCoverageProgress >= 1
        ? 1
        : facts.uploadRecordCount > 1 ? 0.6 : 0.3,
  });
  steps.push({ id: "billing", progress: facts.hasBilling ? 1 : 0 });
  steps.push({
    id: "annual-return",
    progress: ["Filed", "Verified"].includes(status)
      ? 1
      : status === "Ready to File" ? 0.9 : status === "In Progress" ? 0.5 : 0,
  });
  return steps;
}

export function annualReturnWorkflowProgressPercent(facts: AnnualReturnProgressFacts): number | null {
  const steps = annualReturnWorkflowProgressSteps(facts);
  if (steps.length === 0) return null;
  return (steps.reduce((sum, step) => sum + step.progress, 0) / steps.length) * 100;
}

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
