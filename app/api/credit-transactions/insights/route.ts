/**
 * GET /api/credit-transactions/insights
 * Read-only. Returns available PWP credits and PIBO target status per category,
 * both filtered by creditType (Recycling | EOL).
 *
 * Query params:
 *   fromClientId  — PWP client ID (omit = External)
 *   toClientId    — PIBO client ID (omit = skip)
 *   financialYear — e.g. "2024-25"
 *   creditType    — "Recycling" | "EOL"
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import CreditTransaction from "@/models/CreditTransaction";
import FinancialYear from "@/models/FinancialYear";
import type { ITargetEntry } from "@/models/FinancialYear";

function toEntryType(ct: string): "RECYCLING" | "EOL" {
  return ct.toUpperCase() === "EOL" ? "EOL" : "RECYCLING";
}

function catQty(tx: Record<string, unknown>, i: number): number {
  const canon = Number(tx[`cat${i}Qty`]);
  if (!isNaN(canon) && canon > 0) return canon;
  return Number(tx[`cat${i}`]) || 0;
}

function entryQty(
  r: Record<string, unknown> | null,
  arrayField: string,
  flatField: string,
  legacyField: string,
  catId: number,
  entryType: "RECYCLING" | "EOL"
): number {
  if (!r) return 0;
  const arr = r[arrayField] as ITargetEntry[] | undefined;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr
      .filter((e) => e.categoryId === String(catId) && e.type === entryType)
      .reduce((s, e) => s + (e.value ?? 0), 0);
  }
  if (entryType === "RECYCLING") {
    const canon = Number(r[flatField]);
    if (!isNaN(canon) && canon > 0) return canon;
    return Number(r[legacyField]) || 0;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const fromClientId = searchParams.get("fromClientId") || "";
    const toClientId   = searchParams.get("toClientId")   || "";
    const fy           = searchParams.get("financialYear") || "";
    const creditType   = searchParams.get("creditType")    || "Recycling";
    const entryType    = toEntryType(creditType);

    let pwp: {
      isExternal: boolean;
      generated?: { cat1: number; cat2: number; cat3: number; cat4: number };
      sold?:      { cat1: number; cat2: number; cat3: number; cat4: number };
      available?: { cat1: number; cat2: number; cat3: number; cat4: number; total: number };
    } | null = null;

    if (!fromClientId) {
      pwp = { isExternal: true };
    } else {
      const fyRec = await FinancialYear.findOne({
        clientId: fromClientId, financialYear: fy,
      }).lean() as Record<string, unknown> | null;

      const generated = {
        cat1: entryQty(fyRec, "generated", "cat1Generated", "creditsCat1", 1, entryType),
        cat2: entryQty(fyRec, "generated", "cat2Generated", "creditsCat2", 2, entryType),
        cat3: entryQty(fyRec, "generated", "cat3Generated", "creditsCat3", 3, entryType),
        cat4: entryQty(fyRec, "generated", "cat4Generated", "creditsCat4", 4, entryType),
      };

      const soldTx = await CreditTransaction.find({
        fromClientId, financialYear: fy, creditType,
      }).lean() as Record<string, unknown>[];

      const sold = {
        cat1: soldTx.reduce((s, t) => s + catQty(t, 1), 0),
        cat2: soldTx.reduce((s, t) => s + catQty(t, 2), 0),
        cat3: soldTx.reduce((s, t) => s + catQty(t, 3), 0),
        cat4: soldTx.reduce((s, t) => s + catQty(t, 4), 0),
      };

      const av = {
        cat1: Math.max(0, generated.cat1 - sold.cat1),
        cat2: Math.max(0, generated.cat2 - sold.cat2),
        cat3: Math.max(0, generated.cat3 - sold.cat3),
        cat4: Math.max(0, generated.cat4 - sold.cat4),
        total: 0,
      };
      av.total = av.cat1 + av.cat2 + av.cat3 + av.cat4;

      pwp = { isExternal: false, generated, sold, available: av };
    }

    let pibo: {
      target:    { cat1: number; cat2: number; cat3: number; cat4: number };
      purchased: { cat1: number; cat2: number; cat3: number; cat4: number };
      pending:   { cat1: number; cat2: number; cat3: number; cat4: number; total: number };
      excess:    { cat1: number; cat2: number; cat3: number; cat4: number; total: number };
    } | null = null;

    if (toClientId && fy) {
      const fyRec = await FinancialYear.findOne({
        clientId: toClientId, financialYear: fy,
      }).lean() as Record<string, unknown> | null;

      const target = {
        cat1: entryQty(fyRec, "targets", "cat1Target", "targetCat1", 1, entryType),
        cat2: entryQty(fyRec, "targets", "cat2Target", "targetCat2", 2, entryType),
        cat3: entryQty(fyRec, "targets", "cat3Target", "targetCat3", 3, entryType),
        cat4: entryQty(fyRec, "targets", "cat4Target", "targetCat4", 4, entryType),
      };

      const purchasedTx = await CreditTransaction.find({
        toClientId, financialYear: fy, creditType,
      }).lean() as Record<string, unknown>[];

      const purchased = {
        cat1: purchasedTx.reduce((s, t) => s + catQty(t, 1), 0),
        cat2: purchasedTx.reduce((s, t) => s + catQty(t, 2), 0),
        cat3: purchasedTx.reduce((s, t) => s + catQty(t, 3), 0),
        cat4: purchasedTx.reduce((s, t) => s + catQty(t, 4), 0),
      };

      const pending = {
        cat1: Math.max(0, target.cat1 - purchased.cat1),
        cat2: Math.max(0, target.cat2 - purchased.cat2),
        cat3: Math.max(0, target.cat3 - purchased.cat3),
        cat4: Math.max(0, target.cat4 - purchased.cat4),
        total: 0,
      };
      pending.total = pending.cat1 + pending.cat2 + pending.cat3 + pending.cat4;

      const excess = {
        cat1: Math.max(0, purchased.cat1 - target.cat1),
        cat2: Math.max(0, purchased.cat2 - target.cat2),
        cat3: Math.max(0, purchased.cat3 - target.cat3),
        cat4: Math.max(0, purchased.cat4 - target.cat4),
        total: 0,
      };
      excess.total = excess.cat1 + excess.cat2 + excess.cat3 + excess.cat4;

      pibo = { target, purchased, pending, excess };
    }

    return NextResponse.json({ pwp, pibo });
  } catch (error) {
    console.error("GET /api/credit-transactions/insights:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
