import mongoose, { Schema, Document } from "mongoose";

/**
 * ClientContact — relationship between a Person and a Client.
 * Stores role/designation and whether this person is the primary contact
 * for that specific company.
 */
export interface IClientContact extends Document {
  clientId:          string;   // references Client.clientId
  personId:          string;   // references Person._id
  designation:       string;
  isPrimaryContact:  boolean;
  selectedPhones?:   string[];
  selectedEmails?:   string[];
  createdAt:         Date;
  updatedAt:         Date;
}

const ClientContactSchema = new Schema<IClientContact>(
  {
    clientId:         { type: String, required: true },
    personId:         { type: String, required: true },
    designation:      { type: String, trim: true, default: "" },
    isPrimaryContact: { type: Boolean, default: false },
    selectedPhones:   { type: [String], default: undefined },
    selectedEmails:   { type: [String], default: undefined },
  },
  { timestamps: true }
);

// One person per company max; fast lookups by either side
ClientContactSchema.index({ clientId: 1, personId: 1 }, { unique: true });
ClientContactSchema.index({ clientId: 1 });
ClientContactSchema.index({ personId: 1 });

export default mongoose.models.ClientContact ||
  mongoose.model<IClientContact>("ClientContact", ClientContactSchema);
