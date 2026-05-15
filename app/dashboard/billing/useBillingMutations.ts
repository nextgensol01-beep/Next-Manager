import { useCallback } from "react";
import { invalidate } from "@/lib/useCache";
import type { Billing, Payment } from "./types";

interface UseBillingMutationsOptions {
  billings: Billing[];
  payments: Payment[];
  mutateBillings: (updater: ((current: Billing[] | undefined) => Billing[]) | Billing[]) => void;
  mutatePayments: (updater: ((current: Payment[] | undefined) => Payment[]) | Payment[]) => void;
  refetchBillings: () => void;
  refetchPayments: () => void;
}

export function useBillingMutations({
  billings,
  payments,
  mutateBillings,
  mutatePayments,
  refetchBillings,
  refetchPayments,
}: UseBillingMutationsOptions) {
  const refreshBillingData = useCallback(() => {
    invalidate("/api/billing", "/api/payments", "/api/dashboard");
    refetchBillings();
    refetchPayments();
  }, [refetchBillings, refetchPayments]);

  const withBillingPaymentDelta = useCallback(
    (billing: Billing, paidDelta: number): Billing => {
      const totalPaid = Math.max(0, Number(billing.totalPaid || 0) + paidDelta);
      const pendingAmount = Math.max(0, Number(billing.totalAmount || 0) - totalPaid);
      const paymentPercentage = billing.totalAmount
        ? Math.min(100, (totalPaid / billing.totalAmount) * 100)
        : 0;
      const paymentStatus =
        pendingAmount <= 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Unpaid";
      return { ...billing, totalPaid, pendingAmount, paymentPercentage, paymentStatus } as Billing;
    },
    []
  );

  const applyOptimisticPayment = useCallback(
    (payment: Omit<Payment, "_id">) => {
      const previousBillings = billings;
      const previousPayments = payments;
      const optimisticPayment: Payment = {
        ...payment,
        _id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };

      mutatePayments((current) => [optimisticPayment, ...(current || [])]);
      if (payment.paymentType !== "advance") {
        mutateBillings((current) =>
          (current || []).map((billing) =>
            billing.clientId === payment.clientId &&
            billing.financialYear === payment.financialYear
              ? withBillingPaymentDelta(billing, Number(payment.amountPaid || 0))
              : billing
          )
        );
      }

      return () => {
        mutateBillings(previousBillings);
        mutatePayments(previousPayments);
      };
    },
    [billings, payments, mutateBillings, mutatePayments, withBillingPaymentDelta]
  );

  const applyOptimisticAdvanceApplication = useCallback(
    (input: {
      clientId: string;
      financialYear: string;
      amountToApply: number;
      applyDate: string;
      notes?: string;
    }) => {
      const previousBillings = billings;
      const previousPayments = payments;
      const optimisticPayment: Payment = {
        _id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        clientId: input.clientId,
        financialYear: input.financialYear,
        amountPaid: input.amountToApply,
        paymentType: "billing",
        paymentDate: input.applyDate,
        paymentMode: "Advance Applied",
        referenceNumber: "",
        notes: input.notes || "Applied from advance",
        source: "advance_application",
      };

      mutatePayments((current) => {
        let remaining = input.amountToApply;
        const adjusted = (current || []).flatMap((payment) => {
          if (
            remaining <= 0.005 ||
            payment.clientId !== input.clientId ||
            payment.financialYear !== input.financialYear ||
            payment.paymentType !== "advance"
          ) {
            return [payment];
          }
          const amount = Number(payment.amountPaid || 0);
          if (amount - remaining <= 0.005) {
            remaining -= amount;
            return [];
          }
          const nextPayment = { ...payment, amountPaid: amount - remaining };
          remaining = 0;
          return [nextPayment];
        });
        return [optimisticPayment, ...adjusted];
      });

      mutateBillings((current) =>
        (current || []).map((billing) =>
          billing.clientId === input.clientId &&
          billing.financialYear === input.financialYear
            ? withBillingPaymentDelta(billing, input.amountToApply)
            : billing
        )
      );

      return () => {
        mutateBillings(previousBillings);
        mutatePayments(previousPayments);
      };
    },
    [billings, payments, mutateBillings, mutatePayments, withBillingPaymentDelta]
  );

  return {
    refreshBillingData,
    applyOptimisticPayment,
    applyOptimisticAdvanceApplication,
  };
}
