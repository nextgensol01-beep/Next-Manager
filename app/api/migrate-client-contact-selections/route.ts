import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Person from "@/models/Person";
import ClientContact from "@/models/ClientContact";
import {
  resolveCompanySelections,
  sameStringArray,
} from "@/lib/clientContactSelections";

/**
 * Backfills selected phones/emails for existing ClientContact records.
 * Safe to run multiple times.
 * Call: GET /api/migrate-client-contact-selections
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const links = await ClientContact.find({});
  let updated = 0;
  let skipped = 0;
  let missingPersons = 0;

  for (const link of links) {
    const person = await Person.findById(link.personId).lean();
    if (!person) {
      missingPersons++;
      continue;
    }

    const selections = resolveCompanySelections({
      phones: person.phoneNumbers,
      emails: person.emails,
      selectedPhones: link.selectedPhones,
      selectedEmails: link.selectedEmails,
    });

    if (
      sameStringArray(link.selectedPhones || [], selections.selectedPhones) &&
      sameStringArray(link.selectedEmails || [], selections.selectedEmails)
    ) {
      skipped++;
      continue;
    }

    link.selectedPhones = selections.selectedPhones;
    link.selectedEmails = selections.selectedEmails;
    await link.save();
    updated++;
  }

  return NextResponse.json({
    success: true,
    updated,
    skipped,
    missingPersons,
    message: `Client contact selections backfilled. Updated: ${updated}, skipped: ${skipped}, missing persons: ${missingPersons}`,
  });
}
