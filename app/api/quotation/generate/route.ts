import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export interface QuotationItem {
  description: string; category: string; type: string;
  quantity: number; rate: number; gstPercent: number;
  subtotal: number; gstAmount: number; totalAmount: number;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { clientName, financialYear, items, consultationCharges, consultationGst, governmentFees, notes } = body;

    const calculatedItems: QuotationItem[] = (items || []).map((item: Partial<QuotationItem>) => {
      const subtotal = (item.quantity || 0) * (item.rate || 0);
      const gstAmount = subtotal * ((item.gstPercent || 0) / 100);
      return {
        description: item.description || "", category: item.category || "", type: item.type || "",
        quantity: item.quantity || 0, rate: item.rate || 0, gstPercent: item.gstPercent || 0,
        subtotal, gstAmount, totalAmount: subtotal + gstAmount,
      };
    });

    const itemsSubtotal = calculatedItems.reduce((s, i) => s + i.subtotal, 0);
    const itemsGst = calculatedItems.reduce((s, i) => s + i.gstAmount, 0);
    const cc = Number(consultationCharges) || 0;
    const ccGst = cc * ((Number(consultationGst) || 0) / 100);
    const gf = Number(governmentFees) || 0;
    const grandTotal = itemsSubtotal + itemsGst + cc + ccGst + gf;

    return NextResponse.json({
      quoteNumber: `QT-${Date.now()}`,
      clientName, financialYear,
      items: calculatedItems,
      itemsSubtotal, itemsGst,
      consultationCharges: cc,
      consultationGstPercent: Number(consultationGst) || 0,
      consultationGstAmount: ccGst,
      governmentFees: gf,
      grandTotal,
      notes: notes || "",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/quotation/generate:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
