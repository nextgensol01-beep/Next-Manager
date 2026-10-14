"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { readJsonResponse } from "@/lib/http-response";
import {
  activeFinancialYearEntries,
  financialYearDraftRows,
  financialYearDraftSignature,
  financialYearRowErrors,
  financialYearSavedSnapshot,
  nextFinancialYearRow,
  type FinancialYearClient,
  type FinancialYearDraftRow,
  type FinancialYearRecord,
} from "@/lib/financial-year-form";

export type FinancialYearIdentity = { clientId: string; financialYear: string };
export function useFinancialYearForm({
  open,
  initialClientId,
  initialFinancialYear,
  clients,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialClientId: string;
  initialFinancialYear: string;
  clients: FinancialYearClient[];
  onClose: () => void;
  onSaved: (record: FinancialYearRecord) => void | Promise<void>;
}) {
  const [identity, setIdentity] = useState<FinancialYearIdentity>({
    clientId: initialClientId,
    financialYear: initialFinancialYear,
  });
  const [record, setRecord] = useState<FinancialYearRecord | null>(null);
  const [rows, setRows] = useState<FinancialYearDraftRow[]>([]);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(""),
    [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false),
    [reviewedImport, setReviewedImport] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "close" | "reload" | FinancialYearIdentity | null
  >(null);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    savingRef = useRef(false);
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const client = clients.find((item) => item.clientId === identity.clientId);
  const isPWP = client?.category === "PWP",
    isSIMP = client?.category === "SIMP";
  const load = useCallback(async (next: FinancialYearIdentity) => {
    controller.current?.abort();
    const request = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setIdentity(next);
    setLoading(Boolean(next.clientId));
    setLoadError("");
    setSaveError("");
    setConflict(false);
    setReviewedImport(false);
    setRecord(null);
    setRows([]);
    setBaseline("");
    if (!next.clientId) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/financial-year?clientId=${encodeURIComponent(next.clientId)}&fy=${encodeURIComponent(next.financialYear)}`,
        { cache: "no-store", signal: abort.signal },
      );
      const data = await readJsonResponse(response);
      if (!response.ok) throw Error(data.error || "Unable to load FY data.");
      if (!Array.isArray(data))
        throw Error("The FY response was invalid. Please retry.");
      if (request !== generation.current || abort.signal.aborted) return;
      const matches = (data as FinancialYearRecord[]).filter(
        (item) =>
          item.clientId === next.clientId &&
          item.financialYear === next.financialYear,
      );
      if (matches.length > 1)
        throw Error(
          "More than one record exists for this client and year. Resolve the duplicate records before editing.",
        );
      const existing = matches[0] || null;
      if (existing && !existing._id)
        throw Error(
          "This record has no identifier and cannot be safely edited.",
        );
      const section =
        clientsRef.current.find((item) => item.clientId === next.clientId)
          ?.category === "PWP"
          ? "generated"
          : "targets";
      const initial = financialYearDraftRows(existing, section);
      setRecord(existing);
      setRows(initial);
      setBaseline(financialYearDraftSignature(initial));
    } catch (error) {
      if (request === generation.current && !abort.signal.aborted)
        setLoadError(
          error instanceof Error ? error.message : "Unable to load FY data.",
        );
    } finally {
      if (request === generation.current && !abort.signal.aborted)
        setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (open) {
      setConfirmation(null);
      void load({
        clientId: initialClientId,
        financialYear: initialFinancialYear,
      });
    }
    return () => {
      controller.current?.abort();
    };
  }, [open, initialClientId, initialFinancialYear, load]);
  const rowErrors = useMemo(() => financialYearRowErrors(rows), [rows]);
  const active = useMemo(() => activeFinancialYearEntries(rows), [rows]);
  const total = active.reduce((sum, entry) => sum + entry.value, 0);
  const dirty = Boolean(
    baseline && financialYearDraftSignature(rows) !== baseline,
  );
  const validation = !client
    ? "Choose a client to manage FY data."
    : isSIMP
      ? "SIMP clients do not need targets or generated credits."
      : !identity.financialYear
        ? "Choose a financial year."
        : Object.keys(rowErrors).length
          ? "Check the highlighted rows before saving."
          : !record && !active.length
            ? `Enter at least one positive ${isPWP ? "generated credit" : "target"} quantity to create this record.`
            : "";
  const canSave =
    !loading &&
    !saving &&
    !loadError &&
    !conflict &&
    !validation &&
    (!record || dirty);
  const requestClose = () => {
    if (savingRef.current || confirmation) return;
    if (dirty) setConfirmation("close");
    else onClose();
  };
  const requestIdentity = (next: FinancialYearIdentity) => {
    if (savingRef.current) return;
    if (dirty) setConfirmation(next);
    else void load(next);
  };
  const reload = () => {
    if (dirty) setConfirmation("reload");
    else void load(identity);
  };
  const confirmDiscard = () => {
    const action = confirmation;
    setConfirmation(null);
    if (action === "close") onClose();
    else if (action === "reload") void load(identity);
    else if (action) void load(action);
  };
  const add = () => {
    const row = nextFinancialYearRow(rows);
    if (!row) return;
    setRows((previous) => [...previous, row]);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(`[data-fy-row="${row.id}"] button`)
        ?.focus({ preventScroll: false }),
    );
  };
  const save = async () => {
    if (savingRef.current || !canSave) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    let saved: FinancialYearRecord;
    try {
      const payload = {
        ...identity,
        generated: isPWP ? active : [],
        targets: isPWP ? [] : active,
        ...(record
          ? { expectedUpdatedAt: record.updatedAt || null }
          : { createOnly: true }),
        ...(!isPWP && reviewedImport
          ? { targetImportReviewConfirmed: true }
          : {}),
      };
      const response = await fetch(
        record ? `/api/financial-year/${record._id}` : "/api/financial-year",
        {
          method: record ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await readJsonResponse(response);
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw Error(result.error || "Unable to save this FY record.");
      }
      saved = financialYearSavedSnapshot(result as FinancialYearRecord, record);
      // Mutation responses contain stored data; GET supplies actual transaction-derived usage.
      try {
        const fresh = await fetch(
          `/api/financial-year?clientId=${encodeURIComponent(identity.clientId)}&fy=${encodeURIComponent(identity.financialYear)}`,
          { cache: "no-store" },
        );
        const records = await readJsonResponse(fresh);
        if (!fresh.ok || !Array.isArray(records))
          throw Error("Unable to refresh the FY summary.");
        const enriched = (records as FinancialYearRecord[]).find(
          (item) => item._id === saved._id,
        );
        if (!enriched)
          throw Error("The saved FY record was missing from the refresh.");
        saved = enriched;
      } catch {
        toast.error(
          "Record saved. The latest transaction summary could not be refreshed; reopen FY Data to retry.",
        );
      }
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save this FY record.",
      );
      savingRef.current = false;
      setSaving(false);
      return;
    }
    setBaseline(financialYearDraftSignature(rows));
    setRecord(saved);
    try {
      await onSaved(saved);
      toast.success(record ? "FY record updated." : "FY record saved.");
      onClose();
    } catch {
      setSaveError(
        "The record was saved, but the profile could not refresh. Reopen FY Data to reload it.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return {
    identity,
    record,
    rows,
    setRows,
    client,
    isPWP,
    isSIMP,
    loading,
    saving,
    loadError,
    saveError,
    conflict,
    reviewedImport,
    setReviewedImport,
    dirty,
    rowErrors,
    total,
    validation,
    canSave,
    confirmation,
    dismissConfirmation: () => setConfirmation(null),
    confirmDiscard,
    requestClose,
    requestIdentity,
    reload,
    add,
    save,
    canAdd:
      new Set(rows.map((row) => `${row.categoryId}|${row.type}`)).size < 8,
    retryLoad: () => void load(identity),
  };
}
