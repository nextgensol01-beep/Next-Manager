const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nextgen-erp";
const DRY_RUN = process.argv.includes("--dry-run");

const CLIENT_ID_PREFIXES = {
  PWP: "PWP",
  Producer: "PRD",
  Importer: "IMP",
  "Brand Owner": "BRD",
  SIMP: "SMP",
};

const ClientSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },
    category: { type: String, required: true },
  },
  { collection: "clients" }
);

const ClientIdCounterSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: "clientidcounters" }
);

const Client = mongoose.models.ClientResync || mongoose.model("ClientResync", ClientSchema);
const ClientIdCounter = mongoose.models.ClientIdCounterResync || mongoose.model("ClientIdCounterResync", ClientIdCounterSchema);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSequence(clientId, prefix) {
  const match = String(clientId || "").match(new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`));
  if (!match) return 0;
  const seq = parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : 0;
}

async function main() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });

  const categories = Object.keys(CLIENT_ID_PREFIXES);
  const summary = [];

  for (const category of categories) {
    const prefix = CLIENT_ID_PREFIXES[category];
    const clients = await Client.find({ category }).select("clientId").lean();
    const maxSeq = clients.reduce((max, client) => {
      const seq = extractSequence(client.clientId, prefix);
      return seq > max ? seq : max;
    }, 0);

    summary.push({
      category,
      prefix,
      activeClients: clients.length,
      nextClientId: `${prefix}-${String(maxSeq + 1).padStart(3, "0")}`,
      seq: maxSeq,
    });

    if (!DRY_RUN) {
      await ClientIdCounter.findOneAndUpdate(
        { category },
        {
          $set: {
            category,
            prefix,
            seq: maxSeq,
          },
        },
        { upsert: true }
      );
    }
  }

  console.table(summary);
  console.log(DRY_RUN ? "Dry run only. No counters were updated." : "Client ID counters updated successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to resync client ID counters:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (error) {
      console.error("Failed to disconnect from MongoDB:", error);
    }
  });
