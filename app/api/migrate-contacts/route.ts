/**
 * ONE-TIME migration: converts legacy Contact documents into Person + ClientContact records.
 * Safe to run multiple times (skips already-migrated).
 * Call: GET /api/migrate-contacts
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Contact from "@/models/Contact";
import Client from "@/models/Client";
import Person from "@/models/Person";
import ClientContact from "@/models/ClientContact";
import {
  resolveCompanySelections,
  sameStringArray,
} from "@/lib/clientContactSelections";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();

  const contacts = await Contact.find({});
  let created = 0, merged = 0, skipped = 0, backfilled = 0;

  for (const contact of contacts) {
    const mobile = contact.mobile || "";
    const email  = contact.email  || "";

    // Check if a Person with same phone already exists
    let person = mobile ? await Person.findOne({ phoneNumbers: mobile }) : null;

    if (person) {
      // Merge email if needed
      if (email && !person.emails.includes(email)) {
        person.emails = [...person.emails, email];
        await person.save();
      }
      merged++;
    } else {
      // Create new Person
      person = await Person.create({
        name:         contact.name,
        phoneNumbers: mobile ? [mobile] : [],
        emails:       email  ? [email]  : [],
      });
      created++;
    }

    // Find clients that reference this contact (legacy)
    const linkedClients = await Client.find({
      $or: [{ contactId: contact._id.toString() }, { contactIds: contact._id.toString() }],
    });

    for (const client of linkedClients) {
      const existingLink = await ClientContact.findOne({ clientId: client.clientId, personId: person._id.toString() });
      const selections = resolveCompanySelections({
        phones: person.phoneNumbers,
        emails: person.emails,
        selectedPhones: existingLink?.selectedPhones,
        selectedEmails: existingLink?.selectedEmails,
      });

      if (existingLink) {
        if (
          !sameStringArray(existingLink.selectedPhones || [], selections.selectedPhones) ||
          !sameStringArray(existingLink.selectedEmails || [], selections.selectedEmails)
        ) {
          existingLink.selectedPhones = selections.selectedPhones;
          existingLink.selectedEmails = selections.selectedEmails;
          await existingLink.save();
          backfilled++;
        } else {
          skipped++;
        }
        continue;
      }

      await ClientContact.create({
        clientId:         client.clientId,
        personId:         person._id.toString(),
        designation:      contact.designation || "",
        isPrimaryContact: !client.contactId || client.contactId === contact._id.toString(),
        selectedPhones:   selections.selectedPhones,
        selectedEmails:   selections.selectedEmails,
      });
    }
  }

  return NextResponse.json({
    success: true,
    message: `Migration complete. Persons created: ${created}, merged: ${merged}, ClientContact links skipped: ${skipped}, selections backfilled: ${backfilled}`,
    created, merged, skipped, backfilled,
  });
}
