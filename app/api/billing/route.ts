import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureBillingSchema, normalizeBillingBody } from "@/lib/billing-utils";
import { connectDB } from "@/lib/mongoose";
import Billing from "@/models/Billing";
import Payment from "@/models/Payment";
import { syncAnnualReturnStatus } from "@/lib/server/annual-return-status-service";
import { recordActivityEvent } from "@/lib/server/activity-events";
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    await ensureBillingSchema(Billing.collection);
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
            let: {
              billingRecordId: { $toString: "$_id" },
              billingClientId: "$clientId",
              billingFinancialYear: "$financialYear",
              billingType: { $ifNull: ["$billType", "annual_return"] },
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $ne: ["$paymentType", "advance"] },
                      {
                        $or: [
                          { $eq: ["$billingId", "$$billingRecordId"] },
                          {
                            $and: [
                              { $eq: ["$$billingType", "annual_return"] },
                              { $eq: ["$clientId", "$$billingClientId"] },
                              { $eq: ["$financialYear", "$$billingFinancialYear"] },
                              { $in: [{ $ifNull: ["$billingId", ""] }, ["", null]] },
                            ],
                          },
                        ],
                      },
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

// ── Shared helper: fetch a single billing doc through the full aggregation pipeline
// so every write response has the same shape as GET (totalPaid, pendingAmount, etc.)
async function fetchBillingAggregated(id: unknown) {
  const { ObjectId } = await import("mongodb");
  const _id = typeof id === "string" ? new ObjectId(id) : id;
  const [doc] = await Billing.collection
    .aggregate([
      { $match: { _id } },
      {
        $lookup: {
          from: Payment.collection.name,
          let: {
            billingRecordId: { $toString: "$_id" },
            billingClientId: "$clientId",
            billingFinancialYear: "$financialYear",
            billingType: { $ifNull: ["$billType", "annual_return"] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$paymentType", "advance"] },
                    {
                      $or: [
                        { $eq: ["$billingId", "$$billingRecordId"] },
                        {
                          $and: [
                            { $eq: ["$$billingType", "annual_return"] },
                            { $eq: ["$clientId", "$$billingClientId"] },
                            { $eq: ["$financialYear", "$$billingFinancialYear"] },
                            { $in: [{ $ifNull: ["$billingId", ""] }, ["", null]] },
                          ],
                        },
                      ],
                    },
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
          pendingAmount: { $max: [0, { $subtract: ["$totalAmount", "$totalPaid"] }] },
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
                { case: { $gt: ["$totalPaid", 0] }, then: "Partial" },
              ],
              default: "Unpaid",
            },
          },
        },
      },
    ])
    .toArray();
  return doc ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    await ensureBillingSchema(Billing.collection);
    const body = normalizeBillingBody(await req.json());

    if (!body.clientId || !body.financialYear) {
      return NextResponse.json({ error: "Client and financial year are required" }, { status: 400 });
    }
    if (body.billType === "general" && !body.billTitle) {
      return NextResponse.json({ error: "A title or purpose is required for a general bill" }, { status: 400 });
    }
    if (body.billType === "general" && body.lineItems.length === 0) {
      return NextResponse.json({ error: "Add at least one valid line item to the general bill" }, { status: 400 });
    }

    const existing = body.billType === "annual_return"
      ? await Billing.collection.findOne({
          clientId: body.clientId,
          financialYear: body.financialYear,
          billType: "annual_return",
        })
      : null;

    const now = new Date();

    if (existing) {
      await Billing.collection.updateOne(
        { clientId: body.clientId, financialYear: body.financialYear },
        { $set: { ...body, updatedAt: now } }
      );
      const full = await fetchBillingAggregated(existing._id);
      await syncAnnualReturnStatus(body.clientId, body.financialYear);
      await recordActivityEvent({
        clientId: body.clientId,
        category: "financial",
        type: "billing_updated",
        label: "Billing Updated",
        detail: `Total changed from INR ${Number(existing.totalAmount || 0).toLocaleString("en-IN")} to INR ${Number(body.totalAmount || 0).toLocaleString("en-IN")}`,
        color: "violet",
        badge: "Updated",
        financialYear: body.financialYear,
        entityId: String(existing._id),
        entityType: "billing",
        relatedEntityIds: [String(existing._id)],
      }, session);
      return NextResponse.json(full);
    }

    const insertedBilling = { ...body, createdAt: now, updatedAt: now };
    const result = await Billing.collection.insertOne(insertedBilling);
    const full = await fetchBillingAggregated(result.insertedId);
    if (body.billType === "annual_return") {
      await syncAnnualReturnStatus(body.clientId, body.financialYear);
    }
    await recordActivityEvent({
      clientId: body.clientId,
      category: "financial",
      type: "billing_created",
      label: body.billType === "general" ? "General Bill Created" : "Annual Return Bill Created",
      detail: `${body.billTitle} · Total INR ${Number(body.totalAmount || 0).toLocaleString("en-IN")}`,
      color: "brand",
      badge: "Created",
      financialYear: body.financialYear,
      entityId: String(result.insertedId),
      entityType: "billing",
      relatedEntityIds: [String(result.insertedId)],
    }, session);
    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("POST /api/billing:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
