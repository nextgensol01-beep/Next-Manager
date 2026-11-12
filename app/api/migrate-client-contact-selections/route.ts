import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { withAdminMaintenance } from "@/lib/server/maintenance-api";
import Person from "@/models/Person";
import ClientContact from "@/models/ClientContact";
import {
  resolveCompanySelections,
  sameStringArray,
} from "@/lib/clientContactSelections";

/**
 * Backfills selected phones/emails for existing ClientContact records.
 * Safe to run multiple times.
 * Administrator maintenance: POST /api/migrate-client-contact-selections
 */
export const POST = withAdminMaintenance(async () => {
  await connectDB();

  const links = await ClientContact.find({});
  let updated = 0;
  let skipped = 0;
  let missingPersons = 0;

  for (const link of links) {
    const person = await Person.findById(link.personId)
      .lean() as { phoneNumbers?: string[]; emails?: string[] } | null;
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
});
