"use client";

import LiquidGlassDropdown from "@/components/ui/LiquidGlassDropdown";
import { FINANCIAL_YEARS } from "@/lib/utils";
import type { FinancialYearClient } from "@/lib/financial-year-form";
import FinancialYearTargetRows from "./FinancialYearTargetRows";
import FinancialYearSummary from "./FinancialYearSummary";
import type { useFinancialYearForm } from "./useFinancialYearForm";

export default function FinancialYearForm({
  form,
  clients,
  lockClient,
  lockFinancialYear,
  onImport,
}: {
  form: ReturnType<typeof useFinancialYearForm>;
  clients: FinancialYearClient[];
  lockClient: boolean;
  lockFinancialYear: boolean;
  onImport: () => void;
}) {
  return (
    <>
      <div className="fy-context">
        <div className="fy-field">
          <span className="fy-label">Client</span>
          {lockClient || form.record ? (
            <div className="fy-readonly">
              <strong>
                {form.client?.companyName || form.identity.clientId}
              </strong>
              <small>
                {form.client?.category} · {form.identity.clientId}
              </small>
            </div>
          ) : (
            <LiquidGlassDropdown
              label="Client"
              variant="condition"
              portal
              value={form.identity.clientId}
              options={[
                { value: "", label: "Select Client" },
                ...clients.map((client) => ({
                  value: client.clientId,
                  label: `${client.companyName} (${client.category})`,
                })),
              ]}
              onChange={(clientId) =>
                form.requestIdentity({ ...form.identity, clientId })
              }
            />
          )}
        </div>
        <div className="fy-field">
          <span className="fy-label">Financial Year</span>
          {lockFinancialYear || form.record ? (
            <div className="fy-readonly fy-readonly-year">
              <strong>{form.identity.financialYear}</strong>
              <small>
                {form.record ? "Saved record" : "Selected profile year"}
              </small>
            </div>
          ) : (
            <LiquidGlassDropdown
              label="Financial Year"
              variant="condition"
              portal
              value={form.identity.financialYear}
              options={FINANCIAL_YEARS.map((value) => ({
                value,
                label: value,
              }))}
              onChange={(financialYear) =>
                form.requestIdentity({ ...form.identity, financialYear })
              }
            />
          )}
        </div>
      </div>
      {form.loading ? (
        <div
          className="fy-form-skeleton"
          role="status"
          aria-label="Loading financial year record"
        >
          <span />
          <span />
          <span />
          <p>Loading the latest record and transaction totals…</p>
        </div>
      ) : form.loadError ? (
        <div className="fy-error" role="alert">
          <p>{form.loadError}</p>
          <button
            type="button"
            className="fy-text-button"
            onClick={form.retryLoad}
          >
            Retry loading
          </button>
        </div>
      ) : form.client && !form.isSIMP ? (
        <>
          <FinancialYearTargetRows form={form} onImport={onImport} />
          <FinancialYearSummary form={form} />
        </>
      ) : null}
      {!form.loading && !form.loadError && form.validation && (
        <p className="fy-validation" role="status">
          {form.validation}
        </p>
      )}
      {form.saveError && (
        <div className="fy-error" role="alert">
          <p>{form.saveError}</p>
          {form.conflict && (
            <button
              type="button"
              className="fy-text-button"
              onClick={form.reload}
            >
              Reload current record
            </button>
          )}
        </div>
      )}
    </>
  );
}
