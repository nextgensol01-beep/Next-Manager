import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Client from "@/models/Client";
import FinancialYear from "@/models/FinancialYear";
import CreditTransaction from "@/models/CreditTransaction";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import Quotation from "@/models/Quotation";
import QuotationRevision from "@/models/QuotationRevision";
import ClientWorkItem from "@/models/ClientWorkItem";
import AnnualReturn from "@/models/AnnualReturn";
import { isTerminalAnnualReturnStatus, type AnnualReturnStatus } from "@/lib/annualReturnStatus";

type LooseRecord = Record<string, unknown>;
type CreditType = "RECYCLING" | "EOL";
type CategoryKey = "1" | "2" | "3" | "4";
type MetricMap = Record<string, number>;

const CATEGORY_KEYS: CategoryKey[] = ["1", "2", "3", "4"];
const CREDIT_TYPES: CreditType[] = ["RECYCLING", "EOL"];
const PIBO_CATEGORIES = new Set(["Producer", "Importer", "Brand Owner"]);
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  "1": "CAT-I",
  "2": "CAT-II",
  "3": "CAT-III",
  "4": "CAT-IV",
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricKey(clientId: string, categoryId: string, type: CreditType) {
  return `${clientId}|${categoryId}|${type}`;
}

function addMetric(map: MetricMap, key: string, value: number) {
  map[key] = (map[key] ?? 0) + value;
}

function sumMetric(map: MetricMap) {
  return Object.values(map).reduce((sum, value) => sum + value, 0);
}

function normalisedEntries(record: LooseRecord, field: "targets" | "generated") {
  const entries = Array.isArray(record[field]) ? record[field] as LooseRecord[] : [];
  const structured = entries
    .map((entry) => ({
      categoryId: String(entry.categoryId ?? ""),
      type: String(entry.type ?? "").toUpperCase() === "EOL" ? "EOL" as const : "RECYCLING" as const,
      value: numberValue(entry.value),
    }))
    .filter((entry) => CATEGORY_KEYS.includes(entry.categoryId as CategoryKey) && entry.value > 0);

  if (structured.length > 0) return structured;

  const fields = field === "targets"
    ? [["cat1Target", "targetCat1"], ["cat2Target", "targetCat2"], ["cat3Target", "targetCat3"], ["cat4Target", "targetCat4"]]
    : [["cat1Generated", "creditsCat1"], ["cat2Generated", "creditsCat2"], ["cat3Generated", "creditsCat3"], ["cat4Generated", "creditsCat4"]];

  return CATEGORY_KEYS.map((categoryId, index) => ({
    categoryId,
    type: "RECYCLING" as const,
    value: numberValue(record[fields[index][0]]) || numberValue(record[fields[index][1]]),
  })).filter((entry) => entry.value > 0);
}

function transactionQuantity(transaction: LooseRecord, categoryId: CategoryKey) {
  const canonical = numberValue(transaction[`cat${categoryId}Qty`]);
  return canonical > 0 ? canonical : numberValue(transaction[`cat${categoryId}`]);
}

function formatImpactCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const now = new Date();
    const { searchParams } = new URL(req.url);
    const currentStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const defaultFY = `${currentStartYear}-${String(currentStartYear + 1).slice(2)}`;
    const financialYear = searchParams.get("fy") || defaultFY;

    const [clients, financialRecords, transactions, billings, payments, quotations, workItems, annualReturns] = await Promise.all([
      Client.find({}).select("clientId companyName category state").lean() as Promise<LooseRecord[]>,
      FinancialYear.find({ financialYear }).lean() as Promise<LooseRecord[]>,
      CreditTransaction.find({ financialYear }).lean() as Promise<LooseRecord[]>,
      Billing.find({ financialYear }).lean() as Promise<LooseRecord[]>,
      Payment.find({
        $or: [
          { financialYear },
          { paymentType: "advance" },
          { billingId: { $exists: true, $nin: ["", null] } },
        ],
      }).lean() as Promise<LooseRecord[]>,
      Quotation.find({ financialYear }).lean() as Promise<LooseRecord[]>,
      ClientWorkItem.find({ status: "open" }).lean() as Promise<LooseRecord[]>,
      AnnualReturn.find({ financialYear }).lean() as Promise<LooseRecord[]>,
    ]);

    const quotationIds = quotations.map((quotation) => String(quotation._id));
    const revisions = quotationIds.length
      ? await QuotationRevision.find({ quotationId: { $in: quotationIds } }).lean() as LooseRecord[]
      : [];

    const clientById = new Map(clients.map((client) => [String(client.clientId), client]));
    const pwpIds = new Set(clients.filter((client) => client.category === "PWP").map((client) => String(client.clientId)));
    const piboIds = new Set(clients.filter((client) => PIBO_CATEGORIES.has(String(client.category))).map((client) => String(client.clientId)));

    const targetMap: MetricMap = {};
    const generatedMap: MetricMap = {};
    for (const record of financialRecords) {
      const clientId = String(record.clientId ?? "");
      if (piboIds.has(clientId)) {
        for (const entry of normalisedEntries(record, "targets")) {
          addMetric(targetMap, metricKey(clientId, entry.categoryId, entry.type), entry.value);
        }
      }
      if (pwpIds.has(clientId)) {
        for (const entry of normalisedEntries(record, "generated")) {
          addMetric(generatedMap, metricKey(clientId, entry.categoryId, entry.type), entry.value);
        }
      }
    }

    const achievedMap: MetricMap = {};
    const soldMap: MetricMap = {};
    for (const transaction of transactions) {
      const fromClientId = String(transaction.fromClientId ?? "");
      const toClientId = String(transaction.toClientId ?? "");
      const type: CreditType = String(transaction.creditType).toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
      for (const categoryId of CATEGORY_KEYS) {
        const quantity = transactionQuantity(transaction, categoryId);
        if (quantity <= 0) continue;
        if (pwpIds.has(fromClientId)) addMetric(soldMap, metricKey(fromClientId, categoryId, type), quantity);
        if (piboIds.has(toClientId)) addMetric(achievedMap, metricKey(toClientId, categoryId, type), quantity);
      }
    }

    const totalTarget = sumMetric(targetMap);
    const totalAchieved = sumMetric(achievedMap);
    const totalGenerated = sumMetric(generatedMap);
    const totalSold = sumMetric(soldMap);
    let totalTargetRemaining = 0;
    let totalTargetExcess = 0;
    let totalCreditRemaining = 0;
    let totalCreditOversold = 0;
    const targetByClient = new Map<string, { base: number; used: number; remaining: number }>();
    const creditByClient = new Map<string, { base: number; used: number; remaining: number; excess: number }>();

    for (const clientId of piboIds) {
      let base = 0;
      let used = 0;
      let remaining = 0;
      for (const categoryId of CATEGORY_KEYS) {
        for (const type of CREDIT_TYPES) {
          const key = metricKey(clientId, categoryId, type);
          const target = targetMap[key] ?? 0;
          const achieved = achievedMap[key] ?? 0;
          base += target;
          used += achieved;
          remaining += Math.max(0, target - achieved);
          totalTargetExcess += Math.max(0, achieved - target);
        }
      }
      totalTargetRemaining += remaining;
      targetByClient.set(clientId, { base, used, remaining });
    }

    for (const clientId of pwpIds) {
      let base = 0;
      let used = 0;
      let remaining = 0;
      let excess = 0;
      for (const categoryId of CATEGORY_KEYS) {
        for (const type of CREDIT_TYPES) {
          const key = metricKey(clientId, categoryId, type);
          const generated = generatedMap[key] ?? 0;
          const sold = soldMap[key] ?? 0;
          base += generated;
          used += sold;
          remaining += Math.max(0, generated - sold);
          excess += Math.max(0, sold - generated);
        }
      }
      totalCreditRemaining += remaining;
      totalCreditOversold += excess;
      creditByClient.set(clientId, { base, used, remaining, excess });
    }

    const incompleteTargetClients = Array.from(targetByClient.entries()).filter(([, metric]) => (
      metric.base > 0 && metric.remaining > 0
    ));
    const oversoldClients = Array.from(creditByClient.values()).filter((metric) => metric.excess > 0).length;

    const coverage = CATEGORY_KEYS.flatMap((categoryId) => CREDIT_TYPES.map((type) => {
      const target = Array.from(piboIds).reduce((sum, clientId) => sum + (targetMap[metricKey(clientId, categoryId, type)] ?? 0), 0);
      const achieved = Array.from(piboIds).reduce((sum, clientId) => sum + (achievedMap[metricKey(clientId, categoryId, type)] ?? 0), 0);
      const generated = Array.from(pwpIds).reduce((sum, clientId) => sum + (generatedMap[metricKey(clientId, categoryId, type)] ?? 0), 0);
      const sold = Array.from(pwpIds).reduce((sum, clientId) => sum + (soldMap[metricKey(clientId, categoryId, type)] ?? 0), 0);
      const remainingTarget = Math.max(0, target - achieved);
      const availableCredits = Math.max(0, generated - sold);
      const gap = availableCredits - remainingTarget;
      return {
        categoryId,
        category: CATEGORY_LABELS[categoryId],
        type,
        target,
        achieved,
        remainingTarget,
        generated,
        sold,
        availableCredits,
        gap,
        coveragePct: remainingTarget > 0 ? Math.round((availableCredits / remainingTarget) * 100) : availableCredits > 0 ? 100 : 0,
        status: gap < 0 ? (availableCredits === 0 ? "Critical" : "Shortage") : "Covered",
      };
    }));

    const selectedBillingIds = new Set(billings.map((billing) => String(billing._id)));
    const billingPaymentsById = new Map<string, number>();
    const legacyBillingPaymentsByClient = new Map<string, number>();
    const advancesByClient = new Map<string, number>();
    for (const payment of payments) {
      const clientId = String(payment.clientId ?? "");
      const amount = numberValue(payment.amountPaid);
      if (payment.paymentType === "advance") {
        advancesByClient.set(clientId, (advancesByClient.get(clientId) ?? 0) + amount);
      } else {
        const billingId = String(payment.billingId ?? "");
        if (billingId && selectedBillingIds.has(billingId)) {
          billingPaymentsById.set(billingId, (billingPaymentsById.get(billingId) ?? 0) + amount);
        } else if (!billingId && payment.financialYear === financialYear) {
          legacyBillingPaymentsByClient.set(clientId, (legacyBillingPaymentsByClient.get(clientId) ?? 0) + amount);
        }
      }
    }

    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let invoiceGap = 0;
    let paidBillingCount = 0;
    let partialBillingCount = 0;
    let unpaidBillingCount = 0;
    const billingByClient = new Map<string, { billed: number; paid: number; outstanding: number; paymentStatus: "Paid" | "Partial" | "Unpaid"; invoiceMissing: boolean }>();

    for (const billing of billings) {
      const clientId = String(billing.clientId ?? "");
      const billingId = String(billing._id);
      const billed = numberValue(billing.totalAmount);
      const paid = (billingPaymentsById.get(billingId) ?? 0) + (legacyBillingPaymentsByClient.get(clientId) ?? 0);
      const outstanding = Math.max(0, billed - paid);
      const paymentStatus = outstanding <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
      totalBilled += billed;
      totalCollected += paid;
      totalOutstanding += outstanding;
      if (!billing.invoiceCreated) invoiceGap += billed;
      if (paymentStatus === "Paid") paidBillingCount += 1;
      else if (paymentStatus === "Partial") partialBillingCount += 1;
      else unpaidBillingCount += 1;
      billingByClient.set(clientId, {
        billed,
        paid,
        outstanding,
        paymentStatus,
        invoiceMissing: !billing.invoiceCreated,
      });
    }

    const totalUnappliedAdvance = Array.from(advancesByClient.values()).reduce((sum, amount) => sum + amount, 0);

    const latestRevisionByQuotation = new Map<string, LooseRecord>();
    for (const revision of revisions.sort((a, b) => numberValue(b.revisionNumber) - numberValue(a.revisionNumber))) {
      const quotationId = String(revision.quotationId ?? "");
      if (!latestRevisionByQuotation.has(quotationId)) latestRevisionByQuotation.set(quotationId, revision);
    }

    const quotationRows = quotations.map((quotation) => ({
      quotation,
      value: numberValue(latestRevisionByQuotation.get(String(quotation._id))?.grandTotal),
    }));
    const quotationValue = (statuses?: string[]) => quotationRows
      .filter(({ quotation }) => !statuses || statuses.includes(String(quotation.status)))
      .reduce((sum, row) => sum + row.value, 0);
    const quotationCount = (statuses: string[]) => quotationRows.filter(({ quotation }) => statuses.includes(String(quotation.status))).length;
    const billedQuotationIds = new Set(billings.flatMap((billing) => Array.isArray(billing.sourceQuotationIds) ? billing.sourceQuotationIds.map(String) : []));
    const acceptedNotBilled = quotationRows.filter(({ quotation }) => quotation.status === "Accepted" && !billedQuotationIds.has(String(quotation._id)));
    const decidedCount = quotationCount(["Accepted", "Rejected"]);
    // Expired legacy records remain visible as open work; the dashboard does not
    // infer completion or loss from a validity date.
    const openStatuses = ["Draft", "Finalized", "Sent", "RevisionRequested", "Expired"];
    const draftCount = quotationCount(["Draft"]);
    const revisionRequestedCount = quotationCount(["RevisionRequested"]);

    const relevantWorkItems = workItems;
    const highPriorityWork = relevantWorkItems.filter((item) => item.priority === "high");

    const annualReturnByClient = new Map(annualReturns.map((record) => [String(record.clientId), String(record.status ?? "Not Started")]));
    const activeClientIds = new Set<string>();
    financialRecords.forEach((record) => activeClientIds.add(String(record.clientId)));
    billings.forEach((record) => activeClientIds.add(String(record.clientId)));
    quotations.forEach((record) => { if (record.clientId) activeClientIds.add(String(record.clientId)); });
    const annualReturnPending = Array.from(activeClientIds).filter((clientId) => (
      !isTerminalAnnualReturnStatus((annualReturnByClient.get(clientId) ?? "Not Started") as AnnualReturnStatus)
    )).length;

    type AttentionItem = {
      id: string;
      score: number;
      severity: "critical" | "high" | "medium";
      clientId?: string;
      clientName: string;
      issue: string;
      impact: string;
      detailLabel: string;
      href: string;
    };
    const attentionItems: AttentionItem[] = [];

    for (const billing of billings) {
      const clientId = String(billing.clientId ?? "");
      const metric = billingByClient.get(clientId);
      if (!metric) continue;
      if (metric.outstanding > 0) {
        attentionItems.push({
          id: `payment-${String(billing._id)}`,
          score: 900 + metric.outstanding / 100_000,
          severity: metric.paymentStatus === "Unpaid" ? "high" : "medium",
          clientId,
          clientName: String(clientById.get(clientId)?.companyName ?? clientId),
          issue: metric.paymentStatus === "Unpaid" ? "Billing has no payment" : "Billing is partially paid",
          impact: formatImpactCurrency(metric.outstanding),
          detailLabel: `${metric.paymentStatus} balance`,
          href: `/dashboard/billing?fy=${encodeURIComponent(financialYear)}&clientId=${encodeURIComponent(clientId)}`,
        });
      }
      if (metric.invoiceMissing) {
        attentionItems.push({
          id: `invoice-${String(billing._id)}`,
          score: 780 + metric.billed / 100_000,
          severity: "medium",
          clientId,
          clientName: String(clientById.get(clientId)?.companyName ?? clientId),
          issue: "Billing has no invoice",
          impact: formatImpactCurrency(metric.billed),
          detailLabel: "Invoice missing",
          href: `/dashboard/billing?fy=${encodeURIComponent(financialYear)}&clientId=${encodeURIComponent(clientId)}`,
        });
      }
    }

    for (const row of acceptedNotBilled) {
      const clientId = String(row.quotation.clientId ?? "");
      attentionItems.push({
        id: `accepted-${String(row.quotation._id)}`,
        score: 850 + row.value / 100_000,
        severity: "high",
        clientId: clientId || undefined,
        clientName: String(row.quotation.clientName ?? clientById.get(clientId)?.companyName ?? "Unlinked client"),
        issue: "Accepted quotation not billed",
        impact: formatImpactCurrency(row.value),
        detailLabel: "Conversion required",
        href: `/dashboard/quotations/${String(row.quotation._id)}`,
      });
    }

    for (const item of highPriorityWork) {
      const clientId = String(item.clientId ?? "");
      attentionItems.push({
        id: `work-${String(item._id)}`,
        score: 820,
        severity: "high",
        clientId,
        clientName: String(clientById.get(clientId)?.companyName ?? clientId),
        issue: String(item.title ?? "High-priority work item"),
        impact: String(item.kind ?? "Task").replace("_", " "),
        detailLabel: "High priority",
        href: `/dashboard/clients/${encodeURIComponent(clientId)}`,
      });
    }

    for (const [clientId, metric] of incompleteTargetClients.sort((a, b) => b[1].remaining - a[1].remaining).slice(0, 5)) {
      attentionItems.push({
        id: `target-${clientId}`,
        score: 620 + metric.remaining / 100,
        severity: "medium",
        clientId,
        clientName: String(clientById.get(clientId)?.companyName ?? clientId),
        issue: "Target remains incomplete",
        impact: `${metric.remaining.toLocaleString("en-IN", { maximumFractionDigits: 2 })} remaining`,
        detailLabel: `${Math.round(metric.base > 0 ? (metric.used / metric.base) * 100 : 0)}% achieved`,
        href: `/dashboard/clients/${encodeURIComponent(clientId)}`,
      });
    }

    for (const [clientId, metric] of Array.from(creditByClient.entries()).filter(([, value]) => value.excess > 0)) {
      attentionItems.push({
        id: `oversold-${clientId}`,
        score: 940 + metric.excess / 100,
        severity: "critical",
        clientId,
        clientName: String(clientById.get(clientId)?.companyName ?? clientId),
        issue: "Credits sold exceed generated balance",
        impact: `${metric.excess.toLocaleString("en-IN", { maximumFractionDigits: 2 })} oversold`,
        detailLabel: "Reconciliation required",
        href: `/dashboard/clients/${encodeURIComponent(clientId)}`,
      });
    }

    for (const clientId of Array.from(activeClientIds).filter((id) => (
      !isTerminalAnnualReturnStatus((annualReturnByClient.get(id) ?? "Not Started") as AnnualReturnStatus)
    )).slice(0, 5)) {
      const status = annualReturnByClient.get(clientId) ?? "Not Started";
      attentionItems.push({
        id: `return-${clientId}`,
        score: 560,
        severity: "medium",
        clientId,
        clientName: String(clientById.get(clientId)?.companyName ?? clientId),
        issue: "Annual return is incomplete",
        impact: status,
        detailLabel: "Compliance open",
        href: `/dashboard/clients/${encodeURIComponent(clientId)}`,
      });
    }

    const sortedAttentionItems = attentionItems.sort((a, b) => b.score - a.score).slice(0, 12);

    const openQuoteValueByClient = new Map<string, number>();
    quotationRows.filter(({ quotation }) => openStatuses.includes(String(quotation.status))).forEach(({ quotation, value }) => {
      const clientId = String(quotation.clientId ?? "");
      if (clientId) openQuoteValueByClient.set(clientId, (openQuoteValueByClient.get(clientId) ?? 0) + value);
    });
    const workCountByClient = new Map<string, number>();
    relevantWorkItems.forEach((item) => {
      const clientId = String(item.clientId ?? "");
      workCountByClient.set(clientId, (workCountByClient.get(clientId) ?? 0) + 1);
    });

    const clientHealth = Array.from(activeClientIds).map((clientId) => {
      const client = clientById.get(clientId);
      const category = String(client?.category ?? "");
      const targetMetric = targetByClient.get(clientId);
      const creditMetric = creditByClient.get(clientId);
      const operational = targetMetric ?? creditMetric ?? { base: 0, used: 0, remaining: 0 };
      const finance = billingByClient.get(clientId) ?? { billed: 0, paid: 0, outstanding: 0, paymentStatus: "Paid" as const, invoiceMissing: false };
      const annualStatus = annualReturnByClient.get(clientId) ?? "Not Started";
      const openTasks = workCountByClient.get(clientId) ?? 0;
      let health: "Financial risk" | "Compliance risk" | "Needs attention" | "Healthy" = "Healthy";
      let riskRank = 0;
      if (finance.outstanding > 0) {
        health = "Financial risk";
        riskRank = 4;
      } else if (!isTerminalAnnualReturnStatus(annualStatus as AnnualReturnStatus)) {
        health = "Compliance risk";
        riskRank = 3;
      } else if (openTasks > 0 || finance.invoiceMissing || operational.remaining > 0) {
        health = "Needs attention";
        riskRank = 2;
      }
      return {
        clientId,
        clientName: String(client?.companyName ?? clientId),
        category,
        operationalLabel: category === "PWP" ? "Credit inventory" : "Target achievement",
        base: operational.base,
        used: operational.used,
        remaining: operational.remaining,
        progressPct: operational.base > 0 ? Math.round((operational.used / operational.base) * 100) : 0,
        openQuotationValue: openQuoteValueByClient.get(clientId) ?? 0,
        billed: finance.billed,
        paid: finance.paid,
        outstanding: finance.outstanding,
        paymentStatus: finance.paymentStatus,
        openTasks,
        annualReturnStatus: annualStatus,
        health,
        riskRank,
      };
    }).sort((a, b) => b.riskRank - a.riskRank || b.outstanding - a.outstanding || b.remaining - a.remaining).slice(0, 12);

    const acceptedCount = quotationCount(["Accepted"]);
    const billedCount = billings.length;
    const invoicedBillings = billings.filter((billing) => billing.invoiceCreated);
    const clientsWithCollections = Array.from(billingByClient.values()).filter((billing) => billing.paid > 0).length;
    const quoteToCash = [
      { key: "quoted", label: "Quoted", count: quotationRows.length, value: quotationValue(), href: `/dashboard/quotations?fy=${encodeURIComponent(financialYear)}` },
      { key: "accepted", label: "Accepted", count: acceptedCount, value: quotationValue(["Accepted"]), href: `/dashboard/quotations?fy=${encodeURIComponent(financialYear)}` },
      { key: "billed", label: "Billed", count: billedCount, value: totalBilled, href: `/dashboard/billing?fy=${encodeURIComponent(financialYear)}` },
      { key: "invoiced", label: "Invoiced", count: invoicedBillings.length, value: invoicedBillings.reduce((sum, billing) => sum + numberValue(billing.invoiceAmount ?? billing.totalAmount), 0), href: `/dashboard/billing?fy=${encodeURIComponent(financialYear)}` },
      { key: "collected", label: "Collected", count: clientsWithCollections, value: totalCollected, href: `/dashboard/billing?fy=${encodeURIComponent(financialYear)}` },
    ];

    return NextResponse.json({
      financialYear,
      asOf: now.toISOString(),
      context: {
        totalClients: clients.length,
        activeClients: activeClientIds.size,
        attentionCount: attentionItems.length,
        incompleteRelationships: acceptedNotBilled.length + billings.filter((billing) => !billing.invoiceCreated).length,
      },
      target: {
        total: totalTarget,
        achieved: totalAchieved,
        remaining: totalTargetRemaining,
        excess: totalTargetExcess,
        progressPct: totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0,
        incompleteClients: incompleteTargetClients.length,
      },
      credits: {
        generated: totalGenerated,
        sold: totalSold,
        remaining: totalCreditRemaining,
        oversold: totalCreditOversold,
        utilizationPct: totalGenerated > 0 ? Math.round((totalSold / totalGenerated) * 100) : 0,
        oversoldClients,
        supplyCoveragePct: totalTargetRemaining > 0 ? Math.round((totalCreditRemaining / totalTargetRemaining) * 100) : totalCreditRemaining > 0 ? 100 : 0,
      },
      quotations: {
        total: quotationRows.length,
        openCount: quotationCount(openStatuses),
        openValue: quotationValue(openStatuses),
        acceptedCount,
        acceptedValue: quotationValue(["Accepted"]),
        conversionPct: decidedCount > 0 ? Math.round((acceptedCount / decidedCount) * 100) : 0,
        draftCount,
        revisionRequestedCount,
        acceptedNotBilled: acceptedNotBilled.length,
      },
      finance: {
        billed: totalBilled,
        collected: totalCollected,
        outstanding: totalOutstanding,
        collectionPct: totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0,
        unappliedAdvance: totalUnappliedAdvance,
        invoiceGap,
        invoiceMissingCount: billings.filter((billing) => !billing.invoiceCreated).length,
        paidBillingCount,
        partialBillingCount,
        unpaidBillingCount,
      },
      work: {
        open: relevantWorkItems.length,
        highPriority: highPriorityWork.length,
        annualReturnPending,
        invoiceMissing: billings.filter((billing) => !billing.invoiceCreated).length,
      },
      coverage,
      quoteToCash,
      attentionItems: sortedAttentionItems,
      clientHealth,
    });
  } catch (error) {
    console.error("GET /api/dashboard:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
