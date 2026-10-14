"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Calendar, LoaderCircle, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import {
  activeFinancialYearEntries,
  financialYearDraftRow,
  mergeFinancialYearImport,
  type FinancialYearClient,
  type FinancialYearEntry,
  type FinancialYearRecord,
} from "@/lib/financial-year-form";
import FinancialYearForm from "./FinancialYearForm";
import { useFinancialYearForm } from "./useFinancialYearForm";

const ScreenshotImport = dynamic(
  () => import("@/app/dashboard/financial-year/TargetScreenshotImporter"),
  {
    loading: () => (
      <div className="fy-form-skeleton" role="status">
        <span />
        <span />
        <p>Opening screenshot import…</p>
      </div>
    ),
  },
);
export default function FinancialYearModal({
  open,
  onClose,
  clients,
  initialClientId = "",
  initialFinancialYear,
  initialRecord,
  lockClient = false,
  lockFinancialYear = false,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clients: FinancialYearClient[];
  initialClientId?: string;
  initialFinancialYear: string;
  initialRecord?: FinancialYearRecord | null;
  lockClient?: boolean;
  lockFinancialYear?: boolean;
  onSaved: (record: FinancialYearRecord) => void | Promise<void>;
}) {
  const form = useFinancialYearForm({
    open,
    initialClientId,
    initialFinancialYear,
    clients,
    onClose,
    onSaved,
  });
  const reduced = useReducedMotion();
  const formId = useId();
  const [stage, setStage] = useState<"form" | "import" | "importDecision">(
    "form",
  );
  const [imported, setImported] = useState<FinancialYearEntry[]>([]);
  const body = useRef<HTMLDivElement>(null),
    lastFocus = useRef<HTMLElement | null>(null),
    editorScroll = useRef(0);
  useEffect(() => {
    if (open) {
      setStage("form");
      setImported([]);
    }
  }, [open, initialClientId, initialFinancialYear]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (form.confirmation)
        body.current
          ?.querySelector<HTMLButtonElement>("[data-fy-keep]")
          ?.focus({ preventScroll: true });
      else if (stage === "importDecision")
        body.current
          ?.querySelector<HTMLButtonElement>("[data-fy-import-merge]")
          ?.focus({ preventScroll: true });
      else if (stage === "form") {
        if (body.current) body.current.scrollTop = editorScroll.current;
        lastFocus.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [form.confirmation, stage]);
  const returnToForm = () => {
    setStage("form");
    setImported([]);
    requestAnimationFrame(() =>
      body.current
        ?.querySelector<HTMLButtonElement>("[data-fy-import]")
        ?.focus({ preventScroll: true }),
    );
  };
  const close = () => {
    if (form.saving) return;
    if (form.confirmation) form.dismissConfirmation();
    else if (stage !== "form") returnToForm();
    else form.requestClose();
  };
  const applyImport = (values: FinancialYearEntry[], merge: boolean) => {
    const next = merge
      ? mergeFinancialYearImport(form.rows, values)
      : values.filter((entry) => entry.value > 0).map(financialYearDraftRow);
    form.setRows(next.length ? next : [financialYearDraftRow()]);
    form.setReviewedImport(true);
    returnToForm();
  };
  const knownEdit =
    form.record ||
    (form.loading &&
    initialRecord?.clientId === form.identity.clientId &&
    initialRecord.financialYear === form.identity.financialYear
      ? initialRecord
      : null);
  const title = form.confirmation
    ? "Discard unsaved changes?"
    : stage === "import"
      ? "Import from Screenshot"
      : stage === "importDecision"
        ? "Apply reviewed screenshot"
        : knownEdit
          ? "Edit FY Record"
          : "Add FY Record";
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="xl"
      hideHeader
      fluidMotion
      className="fy-record-modal"
      bgColor="var(--color-card)"
      backdropColor="rgba(9,12,18,.4)"
      backdropFilter="blur(8px)"
    >
      <div className="fy-modal-header">
        <span className="fy-modal-icon">
          <Calendar size={20} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>
            {form.client
              ? `${form.client.companyName} · ${form.client.category}`
              : "Category-wise financial year data"}
            <span>
              FY {form.identity.financialYear || initialFinancialYear}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="fy-icon-button"
          onClick={close}
          disabled={form.saving}
          aria-label={`Close ${title}`}
        >
          <X size={18} />
        </button>
      </div>
      <div
        ref={body}
        className="fy-modal-content"
        onFocusCapture={(event) => {
          if (stage === "form" && !form.confirmation)
            lastFocus.current = event.target as HTMLElement;
        }}
        onScroll={() => {
          if (stage === "form" && !form.confirmation && body.current)
            editorScroll.current = body.current.scrollTop;
        }}
      >
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.save();
          }}
        >
          <motion.fieldset
            className="fy-form"
            initial={false}
            animate={{
              opacity: stage === "form" && !form.confirmation ? 1 : 0,
            }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            hidden={stage !== "form" || Boolean(form.confirmation)}
            inert={stage !== "form" || Boolean(form.confirmation)}
            disabled={form.saving || form.loading}
          >
            <legend className="sr-only">Financial year record</legend>
            <FinancialYearForm
              form={form}
              clients={clients}
              lockClient={lockClient}
              lockFinancialYear={lockFinancialYear}
              onImport={() => {
                editorScroll.current = body.current?.scrollTop || 0;
                setStage("import");
              }}
            />
          </motion.fieldset>
        </form>
        {form.confirmation ? (
          <motion.div
            className="fy-discard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          >
            <h4>Your changes haven’t been saved.</h4>
            <p>
              {form.confirmation === "close"
                ? "Keep editing this record or discard your draft."
                : "Discard this draft before loading the selected record."}
            </p>
            <div>
              <button
                type="button"
                className="fy-secondary-button"
                data-fy-keep
                onClick={form.dismissConfirmation}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="fy-danger-button"
                onClick={form.confirmDiscard}
              >
                Discard Changes
              </button>
            </div>
          </motion.div>
        ) : stage === "import" ? (
          <motion.div
            className="fy-import-stage"
            initial={{ opacity: 0, y: reduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          >
            <button
              type="button"
              className="fy-text-button fy-back"
              onClick={returnToForm}
            >
              <ArrowLeft size={14} />
              Back to FY form
            </button>
            <ScreenshotImport
              embedded
              open
              clientId={form.identity.clientId}
              financialYear={form.identity.financialYear}
              existingTargets={activeFinancialYearEntries(form.rows)}
              onClose={returnToForm}
              onConfirm={(values) => {
                if (activeFinancialYearEntries(form.rows).length) {
                  setImported(values);
                  setStage("importDecision");
                } else applyImport(values, false);
              }}
            />
          </motion.div>
        ) : stage === "importDecision" ? (
          <div className="fy-import-decision">
            <h4>Your entered quantities are still here.</h4>
            <p>
              Choose how to use the reviewed screenshot. Nothing is saved until
              you save this record.
            </p>
            <div className="fy-import-choices">
              <button
                type="button"
                data-fy-import-merge
                disabled={Object.keys(form.rowErrors).length > 0}
                onClick={() => applyImport(imported, true)}
              >
                <strong>Merge missing entries</strong>
                <span>
                  Keep entered quantities. Add screenshot values for pairs
                  without a positive quantity.
                </span>
              </button>
              <button
                type="button"
                onClick={() => applyImport(imported, false)}
              >
                <strong>Replace editable quantities</strong>
                <span>
                  Use the reviewed screenshot for every category and type.
                  Credit transactions stay unchanged.
                </span>
              </button>
            </div>
            {Object.keys(form.rowErrors).length > 0 && (
              <p className="fy-validation">
                Resolve the highlighted rows to merge, or choose Replace.
              </p>
            )}
            <button
              type="button"
              className="fy-text-button"
              onClick={returnToForm}
            >
              <ArrowLeft size={14} />
              Keep my current rows
            </button>
          </div>
        ) : null}
      </div>
      {!form.confirmation && (
        <div className="fy-modal-footer">
          <span role="status">
            {form.saving
              ? "Saving record…"
              : stage !== "form"
                ? "Review before saving"
                : form.dirty
                  ? "Unsaved changes"
                  : form.record
                    ? "Saved record"
                    : "New FY record"}
          </span>
          <button
            type="button"
            className="fy-secondary-button"
            disabled={form.saving}
            onClick={close}
          >
            {stage === "form" ? "Cancel" : "Back to form"}
          </button>
          {stage === "form" && (
            <button
              type="submit"
              form={formId}
              className="fy-primary-button"
              disabled={!form.canSave}
            >
              {form.saving && (
                <LoaderCircle size={15} className="animate-spin" />
              )}
              {form.saving
                ? "Saving…"
                : form.record
                  ? "Save Changes"
                  : "Save Record"}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
