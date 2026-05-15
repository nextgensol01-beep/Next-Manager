import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeBillingBody } from "@/lib/billing-utils";
import { connectDB } from "@/lib/mongoose";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const fy = searchParams.get("fy");

    const query: Record<string, string> = {};
    if (clientId) query.clientId = clientId;
    if (fy) query.financialYear = fy;

    const billings = await Billing.collection
      .aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: Payment.collection.name,
            let: { billingClientId: "$clientId", billingFinancialYear: "$financialYear" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$clientId", "$$billingClientId"] },
                      { $eq: ["$financialYear", "$$billingFinancialYear"] },
                      { $ne: ["$paymentType", "advance"] },
                    ],
                  },
                },
              },
              { $group: { _id: null, totalPaid: { $sum: "$amountPaid" } } },
            ],
            as: "paymentTotals",
          },
        },
        {
          $addFields: {
            totalPaid: { $ifNull: [{ $first: "$paymentTotals.totalPaid" }, 0] },
          },
        },
        { $unset: "paymentTotals" },
        {
          $addFields: {
            pendingAmount: {
              $max: [0, { $subtract: ["$totalAmount", "$totalPaid"] }],
            },
            paymentPercentage: {
              $cond: [
                { $gt: ["$totalAmount", 0] },
                { $min: [100, { $multiply: [{ $divide: ["$totalPaid", "$totalAmount"] }, 100] }] },
                0,
              ],
            },
            paymentStatus: {
              $switch: {
                branches: [
                  {
                    case: { $lte: [{ $max: [0, { $subtract: ["$totalAmount", "$totalPaid"] }] }, 0] },
                    then: "Paid",
                  },
                  {
                    case: { $gt: ["$totalPaid", 0] },
                    then: "Partial",
                  },
                ],
                default: "Unpaid",
              },
            },
            daysOverdue: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$dueDate", false] },
                    { $gt: [{ $max: [0, { $subtract: ["$totalAmount", "$totalPaid"] }] }, 0] },
                  ],
                },
                {
                  $max: [
                    0,
                    {
                      $floor: {
                        $divide: [
                          { $subtract: [new Date(), "$dueDate"] },
                          86_400_000,
                        ],
                      },
                    },
                  ],
                },
                0,
              ],
            },
          },
        },
      ])
      .toArray();

    // All fields (totalPaid, pendingAmount, paymentPercentage, paymentStatus, daysOverdue)
    // are now computed in the aggregation pipeline above — no JS post-processing needed.
    return NextResponse.json(billings);
  } catch (error) {
    console.error("GET /api/billing:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const body = normalizeBillingBody(await req.json());

    const existing = await Billing.collection.findOne({
      clientId: body.clientId,
      financialYear: body.financialYear,
    });

    const now = new Date();

    if (existing) {
      const updated = await Billing.collection.findOneAndUpdate(
        { clientId: body.clientId, financialYear: body.financialYear },
        { $set: { ...body, updatedAt: now } },
        { returnDocument: "after" }
      );
      return NextResponse.json(updated);
    }

    const insertedBilling = {
      ...body,
      createdAt: now,
      updatedAt: now,
    };
    const billing = await Billing.collection.insertOne(insertedBilling);
    return NextResponse.json({ ...insertedBilling, _id: billing.insertedId }, { status: 201 });
  } catch (error) {
    console.error("POST /api/billing:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
