import Billing from "@/models/Billing";
import Payment from "@/models/Payment";

// Preserve the write response shape and historical payment allocation semantics.
export async function fetchBillingAggregated(id: unknown) {
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
