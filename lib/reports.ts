export const REPORT_DEFINITIONS = [
  {
    id: "targets",
    label: "Targets Report",
    description: "Category-wise targets split by Recycling and EOL, with achieved values per Producer, Importer, and Brand Owner",
    summary: "Recycling and EOL target, achieved, and remaining values by category",
    filePrefix: "targets-report",
  },
  {
    id: "pwp",
    label: "PWP Credits",
    description: "Category-wise Recycling and EOL credits generated, sold, and remaining for all PWP clients",
    summary: "Recycling and EOL credit allocation, sold credits, and remaining balance",
    filePrefix: "pwp-credits",
  },
  {
    id: "transactions",
    label: "Credit Transactions",
    description: "Full transaction log with per-category quantities, rates, and credit type (Recycling or EOL)",
    summary: "Credit transfers with quantities, rates, and credit type",
    filePrefix: "credit-transactions",
  },
  {
    id: "payments",
    label: "Payment Summary",
    description: "Billing status with billed payments, advance receipts, and pending amounts for the selected FY",
    summary: "Billing status, advance receipts, and pending amounts per client",
    filePrefix: "payment-summary",
  },
  {
    id: "invoices",
    label: "Invoice Tracking",
    description: "Sale and purchase invoice month coverage by client, with done and left months for the selected FY",
    summary: "Sale and purchase month coverage, pending months, and entry details",
    filePrefix: "invoice-tracking",
  },
  {
    id: "annual-return",
    label: "EPR Annual Return",
    description: "Filing status for all clients with Pending, In Progress, Filed, and Verified states",
    summary: "Filing status for every client in the selected FY",
    filePrefix: "annual-return",
  },
  {
    id: "uploads",
    label: "Upload Records",
    description: "Category-wise quantities uploaded to the CPCB portal per company and financial year",
    summary: "CPCB portal upload quantity records",
    filePrefix: "upload-records",
  },
] as const;

export type CustomClientExportFieldDefinition = {
  id: string;
  label: string;
  description: string;
  group: string;
  width: number;
  fyScoped?: boolean;
};

export const CUSTOM_EXPORT_CLIENT_CATEGORIES = [
  "PWP",
  "Producer",
  "Importer",
  "Brand Owner",
  "SIMP",
] as const;

export type CustomExportClientCategory = (typeof CUSTOM_EXPORT_CLIENT_CATEGORIES)[number];

export const CUSTOM_CLIENT_EXPORT_FIELDS = [
  { id: "companyName", label: "Company Name", description: "Registered client/company name", group: "Client", width: 32 },
  { id: "legalName", label: "Legal Name", description: "Legal entity name saved on the client", group: "Client", width: 34 },
  { id: "state", label: "State", description: "Primary operating state", group: "Client", width: 18 },
  { id: "gstNumber", label: "GST Number", description: "GST registration number", group: "Client", width: 22 },
  { id: "clientId", label: "Client ID", description: "Internal unique client ID", group: "Client", width: 14 },
  { id: "category", label: "Category", description: "Client category such as PWP or Producer", group: "Client", width: 16 },
  { id: "registrationNumber", label: "Registration Number", description: "Registration or license number", group: "Client", width: 24 },
  { id: "address", label: "Address", description: "Saved company address", group: "Client", width: 40 },
  { id: "cpcbLoginId", label: "CPCB Login ID", description: "Portal login username", group: "Portal", width: 24 },
  { id: "cpcbPassword", label: "CPCB Password", description: "Portal password", group: "Portal", width: 24 },
  { id: "otpMobileNumber", label: "OTP Mobile Number", description: "Portal OTP mobile number", group: "Portal", width: 18 },
  { id: "createdAt", label: "Created At", description: "Client record creation date", group: "Client", width: 16 },
  { id: "updatedAt", label: "Last Updated", description: "Most recent update date", group: "Client", width: 16 },

  { id: "contactCount", label: "Contact Count", description: "Number of linked contacts", group: "Contacts", width: 14 },
  { id: "primaryContactName", label: "Primary Contact Name", description: "Primary linked contact for the client", group: "Contacts", width: 24 },
  { id: "primaryContactDesignation", label: "Primary Contact Designation", description: "Primary contact designation for this company", group: "Contacts", width: 24 },
  { id: "primaryContactPhones", label: "Primary Contact Phones", description: "Selected phone numbers for the primary contact", group: "Contacts", width: 26 },
  { id: "primaryContactEmails", label: "Primary Contact Emails", description: "Selected email addresses for the primary contact", group: "Contacts", width: 30 },
  { id: "allContactNames", label: "All Contact Names", description: "All linked contact names", group: "Contacts", width: 36 },
  { id: "allContactDesignations", label: "All Contact Designations", description: "All linked contact designations", group: "Contacts", width: 32 },
  { id: "allSelectedPhones", label: "All Selected Phones", description: "All company-selected phone numbers across contacts", group: "Contacts", width: 36 },
  { id: "allSelectedEmails", label: "All Selected Emails", description: "All company-selected email addresses across contacts", group: "Contacts", width: 40 },

  { id: "selectedFy", label: "Selected FY", description: "Financial year applied to FY-scoped export fields", group: "FY Context", width: 14, fyScoped: true },

  { id: "fyGeneratedRecyclingTotal", label: "FY Generated Recycling", description: "Generated Recycling credits for the selected FY", group: "Credits & Targets", width: 20, fyScoped: true },
  { id: "fyGeneratedEolTotal", label: "FY Generated EOL", description: "Generated EOL credits for the selected FY", group: "Credits & Targets", width: 18, fyScoped: true },
  { id: "fyGeneratedTotal", label: "FY Generated Total", description: "Total generated credits for the selected FY", group: "Credits & Targets", width: 18, fyScoped: true },
  { id: "fySoldRecyclingTotal", label: "FY Sold Recycling", description: "Sold Recycling credits for the selected FY", group: "Credits & Targets", width: 18, fyScoped: true },
  { id: "fySoldEolTotal", label: "FY Sold EOL", description: "Sold EOL credits for the selected FY", group: "Credits & Targets", width: 16, fyScoped: true },
  { id: "fySoldTotal", label: "FY Sold Total", description: "Total sold credits for the selected FY", group: "Credits & Targets", width: 16, fyScoped: true },
  { id: "fyRemainingCredits", label: "FY Remaining Credits", description: "Generated minus sold credits for the selected FY", group: "Credits & Targets", width: 18, fyScoped: true },
  { id: "fyTargetRecyclingTotal", label: "FY Target Recycling", description: "Target Recycling values for the selected FY", group: "Credits & Targets", width: 19, fyScoped: true },
  { id: "fyTargetEolTotal", label: "FY Target EOL", description: "Target EOL values for the selected FY", group: "Credits & Targets", width: 17, fyScoped: true },
  { id: "fyTargetTotal", label: "FY Target Total", description: "Total target values for the selected FY", group: "Credits & Targets", width: 16, fyScoped: true },
  { id: "fyAchievedRecyclingTotal", label: "FY Achieved Recycling", description: "Achieved Recycling values for the selected FY", group: "Credits & Targets", width: 21, fyScoped: true },
  { id: "fyAchievedEolTotal", label: "FY Achieved EOL", description: "Achieved EOL values for the selected FY", group: "Credits & Targets", width: 19, fyScoped: true },
  { id: "fyAchievedTotal", label: "FY Achieved Total", description: "Total achieved values for the selected FY", group: "Credits & Targets", width: 18, fyScoped: true },
  { id: "fyRemainingTargetTotal", label: "FY Remaining Target", description: "Target minus achieved values for the selected FY", group: "Credits & Targets", width: 19, fyScoped: true },

  { id: "fyBillingTotal", label: "FY Billing Total", description: "Total billed amount for the selected FY", group: "Billing & Payments", width: 16, fyScoped: true },
  { id: "fyBillingGovtCharges", label: "FY Govt Charges", description: "Government charges in billing for the selected FY", group: "Billing & Payments", width: 16, fyScoped: true },
  { id: "fyBillingConsultancyCharges", label: "FY Consultancy Charges", description: "Consultancy charges in billing for the selected FY", group: "Billing & Payments", width: 20, fyScoped: true },
  { id: "fyBillingTargetCharges", label: "FY Target Charges", description: "Target charges in billing for the selected FY", group: "Billing & Payments", width: 18, fyScoped: true },
  { id: "fyBillingOtherCharges", label: "FY Other Charges", description: "Other charges in billing for the selected FY", group: "Billing & Payments", width: 16, fyScoped: true },
  { id: "fyBillingNotes", label: "FY Billing Notes", description: "Billing notes for the selected FY", group: "Billing & Payments", width: 30, fyScoped: true },
  { id: "fyBillingPaid", label: "FY Billing Paid", description: "Billing-linked payments for the selected FY", group: "Billing & Payments", width: 16, fyScoped: true },
  { id: "fyAdvancePaid", label: "FY Advance Paid", description: "Advance payments for the selected FY", group: "Billing & Payments", width: 16, fyScoped: true },
  { id: "fyTotalReceived", label: "FY Total Received", description: "All received payments for the selected FY", group: "Billing & Payments", width: 17, fyScoped: true },
  { id: "fyPendingAmount", label: "FY Pending Amount", description: "Pending billed amount for the selected FY", group: "Billing & Payments", width: 18, fyScoped: true },
  { id: "fyPaymentCount", label: "FY Payment Count", description: "Number of payments for the selected FY", group: "Billing & Payments", width: 16, fyScoped: true },
  { id: "fyLatestPaymentDate", label: "FY Latest Payment Date", description: "Latest payment date in the selected FY", group: "Billing & Payments", width: 18, fyScoped: true },
  { id: "fyPaymentModes", label: "FY Payment Modes", description: "Payment modes used in the selected FY", group: "Billing & Payments", width: 24, fyScoped: true },

  { id: "fyAnnualReturnStatus", label: "FY Annual Return Status", description: "Annual return status for the selected FY", group: "Annual Return", width: 20, fyScoped: true },
  { id: "fyAnnualReturnFilingDate", label: "FY Annual Return Filing Date", description: "Annual return filing date for the selected FY", group: "Annual Return", width: 22, fyScoped: true },
  { id: "fyAnnualReturnAckNumber", label: "FY Annual Return Ack Number", description: "Acknowledgement number for the selected FY", group: "Annual Return", width: 26, fyScoped: true },
  { id: "fyAnnualReturnRemarks", label: "FY Annual Return Remarks", description: "Annual return remarks for the selected FY", group: "Annual Return", width: 32, fyScoped: true },
  { id: "fyAnnualReturnUpdatedAt", label: "FY Annual Return Updated At", description: "Last update date of annual return for the selected FY", group: "Annual Return", width: 23, fyScoped: true },

  { id: "fyInvoiceCount", label: "FY Invoice Count", description: "Number of invoice records in the selected FY", group: "Invoices & Uploads", width: 15, fyScoped: true },
  { id: "fyLatestInvoiceType", label: "FY Latest Invoice Type", description: "Sale or purchase type for the latest invoice record", group: "Invoices & Uploads", width: 20, fyScoped: true },
  { id: "fyLatestInvoiceReceivedVia", label: "FY Latest Invoice Received Via", description: "How the latest invoice record was received", group: "Invoices & Uploads", width: 24, fyScoped: true },
  { id: "fyLatestInvoiceFromDate", label: "FY Latest Invoice From", description: "Latest invoice from-date in the selected FY", group: "Invoices & Uploads", width: 20, fyScoped: true },
  { id: "fyLatestInvoiceToDate", label: "FY Latest Invoice To", description: "Latest invoice to-date in the selected FY", group: "Invoices & Uploads", width: 18, fyScoped: true },
  { id: "fyLatestInvoiceCreatedAt", label: "FY Latest Invoice Added", description: "Latest invoice creation date in the selected FY", group: "Invoices & Uploads", width: 20, fyScoped: true },
  { id: "fySaleInvoiceMonthsDone", label: "FY Sale Invoice Months Done", description: "Number of Sale invoice months covered in the selected FY", group: "Invoices & Uploads", width: 24, fyScoped: true },
  { id: "fySaleInvoiceMonthsLeft", label: "FY Sale Invoice Months Left", description: "Number of Sale invoice months still pending in the selected FY", group: "Invoices & Uploads", width: 23, fyScoped: true },
  { id: "fySaleInvoiceDoneMonths", label: "FY Sale Invoice Done Months", description: "Sale invoice months covered in the selected FY", group: "Invoices & Uploads", width: 32, fyScoped: true },
  { id: "fySaleInvoiceLeftMonths", label: "FY Sale Invoice Left Months", description: "Sale invoice months still pending in the selected FY", group: "Invoices & Uploads", width: 38, fyScoped: true },
  { id: "fyPurchaseInvoiceMonthsDone", label: "FY Purchase Invoice Months Done", description: "Number of Purchase invoice months covered in the selected FY", group: "Invoices & Uploads", width: 28, fyScoped: true },
  { id: "fyPurchaseInvoiceMonthsLeft", label: "FY Purchase Invoice Months Left", description: "Number of Purchase invoice months still pending in the selected FY", group: "Invoices & Uploads", width: 28, fyScoped: true },
  { id: "fyPurchaseInvoiceDoneMonths", label: "FY Purchase Invoice Done Months", description: "Purchase invoice months covered in the selected FY", group: "Invoices & Uploads", width: 36, fyScoped: true },
  { id: "fyPurchaseInvoiceLeftMonths", label: "FY Purchase Invoice Left Months", description: "Purchase invoice months still pending in the selected FY", group: "Invoices & Uploads", width: 42, fyScoped: true },
  { id: "fyUploadRecordCount", label: "FY Upload Record Count", description: "Number of upload records in the selected FY", group: "Invoices & Uploads", width: 18, fyScoped: true },
  { id: "fyUploadedCat1", label: "FY Uploaded CAT-I", description: "Uploaded CAT-I quantity in the selected FY", group: "Invoices & Uploads", width: 17, fyScoped: true },
  { id: "fyUploadedCat2", label: "FY Uploaded CAT-II", description: "Uploaded CAT-II quantity in the selected FY", group: "Invoices & Uploads", width: 17, fyScoped: true },
  { id: "fyUploadedCat3", label: "FY Uploaded CAT-III", description: "Uploaded CAT-III quantity in the selected FY", group: "Invoices & Uploads", width: 18, fyScoped: true },
  { id: "fyUploadedCat4", label: "FY Uploaded CAT-IV", description: "Uploaded CAT-IV quantity in the selected FY", group: "Invoices & Uploads", width: 17, fyScoped: true },
  { id: "fyUploadedTotal", label: "FY Uploaded Total", description: "Total uploaded quantity in the selected FY", group: "Invoices & Uploads", width: 17, fyScoped: true },
  { id: "fySaleUploadedCat1", label: "FY Sale Uploaded CAT-I", description: "Sale uploaded CAT-I quantity in the selected FY", group: "Invoices & Uploads", width: 21, fyScoped: true },
  { id: "fySaleUploadedCat2", label: "FY Sale Uploaded CAT-II", description: "Sale uploaded CAT-II quantity in the selected FY", group: "Invoices & Uploads", width: 21, fyScoped: true },
  { id: "fySaleUploadedCat3", label: "FY Sale Uploaded CAT-III", description: "Sale uploaded CAT-III quantity in the selected FY", group: "Invoices & Uploads", width: 22, fyScoped: true },
  { id: "fySaleUploadedCat4", label: "FY Sale Uploaded CAT-IV", description: "Sale uploaded CAT-IV quantity in the selected FY", group: "Invoices & Uploads", width: 21, fyScoped: true },
  { id: "fySaleUploadedTotal", label: "FY Sale Uploaded Total", description: "Total Sale uploaded quantity in the selected FY", group: "Invoices & Uploads", width: 22, fyScoped: true },
  { id: "fySaleUploadedInvoiceCount", label: "FY Sale Uploaded Invoice Count", description: "Number of Sale invoices uploaded in the selected FY", group: "Invoices & Uploads", width: 28, fyScoped: true },
  { id: "fyPurchaseUploadedCat1", label: "FY Purchase Uploaded CAT-I", description: "Purchase uploaded CAT-I quantity in the selected FY", group: "Invoices & Uploads", width: 25, fyScoped: true },
  { id: "fyPurchaseUploadedCat2", label: "FY Purchase Uploaded CAT-II", description: "Purchase uploaded CAT-II quantity in the selected FY", group: "Invoices & Uploads", width: 25, fyScoped: true },
  { id: "fyPurchaseUploadedCat3", label: "FY Purchase Uploaded CAT-III", description: "Purchase uploaded CAT-III quantity in the selected FY", group: "Invoices & Uploads", width: 26, fyScoped: true },
  { id: "fyPurchaseUploadedCat4", label: "FY Purchase Uploaded CAT-IV", description: "Purchase uploaded CAT-IV quantity in the selected FY", group: "Invoices & Uploads", width: 25, fyScoped: true },
  { id: "fyPurchaseUploadedTotal", label: "FY Purchase Uploaded Total", description: "Total Purchase uploaded quantity in the selected FY", group: "Invoices & Uploads", width: 26, fyScoped: true },
  { id: "fyPurchaseUploadedInvoiceCount", label: "FY Purchase Uploaded Invoice Count", description: "Number of Purchase invoices uploaded in the selected FY", group: "Invoices & Uploads", width: 32, fyScoped: true },
  { id: "fyUploadedTotalInvoiceCount", label: "FY Uploaded Total Invoice Count", description: "Total number of Sale and Purchase invoices uploaded in the selected FY", group: "Invoices & Uploads", width: 29, fyScoped: true },
  { id: "fyLatestUploadDate", label: "FY Latest Upload Date", description: "Latest upload record date in the selected FY", group: "Invoices & Uploads", width: 19, fyScoped: true },

  { id: "documentCount", label: "Document Count", description: "Number of linked documents", group: "Documents", width: 15 },
  { id: "latestDocumentName", label: "Latest Document Name", description: "Most recently uploaded document name", group: "Documents", width: 30 },
  { id: "latestDocumentLink", label: "Latest Document Link", description: "Drive link of the latest document", group: "Documents", width: 42 },
  { id: "latestDocumentDate", label: "Latest Document Date", description: "Upload date of the latest document", group: "Documents", width: 18 },

  { id: "emailCount", label: "Email Count", description: "Total number of email history records for the client", group: "Email History", width: 13 },
  { id: "fyEmailCount", label: "FY Email Count", description: "Number of email history records for the selected FY", group: "Email History", width: 14, fyScoped: true },
  { id: "lastEmailSubject", label: "Last Email Subject", description: "Subject of the latest logged email", group: "Email History", width: 34 },
  { id: "lastEmailStatus", label: "Last Email Status", description: "Status of the latest logged email", group: "Email History", width: 16 },
  { id: "lastEmailType", label: "Last Email Type", description: "Type of the latest logged email", group: "Email History", width: 18 },
  { id: "lastEmailDate", label: "Last Email Date", description: "Date of the latest logged email", group: "Email History", width: 16 },
  { id: "lastEmailRecipients", label: "Last Email Recipients", description: "Recipients of the latest logged email", group: "Email History", width: 38 },
] as const satisfies readonly CustomClientExportFieldDefinition[];

export type ReportType = (typeof REPORT_DEFINITIONS)[number]["id"];
export type CustomClientExportField = string;
export type CustomExportSortBy =
  | "companyName"
  | "category"
  | "state"
  | "fyBillingTotal"
  | "fyPendingAmount"
  | "latestActivity"
  | "createdAt";

export type CustomExportPresetConfig = {
  fields: CustomClientExportField[];
  categories?: CustomExportClientCategory[];
  clientIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  includeOnlyNonEmpty?: boolean;
  sortBy?: CustomExportSortBy;
  fy?: string;
};

export type CustomExportPresetDefinition = {
  id: string;
  name: string;
  description: string;
  config: CustomExportPresetConfig;
};

export const CUSTOM_EXPORT_SORT_OPTIONS: Array<{ id: CustomExportSortBy; label: string; description: string }> = [
  { id: "companyName", label: "Company Name", description: "Alphabetical by company name" },
  { id: "category", label: "Category", description: "Grouped by client category" },
  { id: "state", label: "State", description: "Grouped by state" },
  { id: "fyBillingTotal", label: "Billed Amount", description: "Highest billing total first" },
  { id: "fyPendingAmount", label: "Pending Amount", description: "Highest pending amount first" },
  { id: "latestActivity", label: "Latest Activity", description: "Most recently active clients first" },
  { id: "createdAt", label: "Created Date", description: "Newest clients first" },
];

export const CUSTOM_EXPORT_PRESETS: readonly CustomExportPresetDefinition[] = [
  {
    id: "gst-list",
    name: "GST List",
    description: "Quick client master sheet for GST and registration lookups",
    config: {
      fields: ["companyName", "clientId", "category", "state", "gstNumber", "registrationNumber"],
      sortBy: "companyName",
    },
  },
  {
    id: "billing-follow-up",
    name: "Billing Follow-up",
    description: "Use for collection work and reminder planning",
    config: {
      fields: [
        "companyName",
        "clientId",
        "category",
        "selectedFy",
        "fyBillingTotal",
        "fyBillingPaid",
        "fyAdvancePaid",
        "fyPendingAmount",
        "fyLatestPaymentDate",
        "allSelectedEmails",
        "allSelectedPhones",
        "lastEmailDate",
      ],
      includeOnlyNonEmpty: true,
      sortBy: "fyPendingAmount",
    },
  },
  {
    id: "portal-audit",
    name: "Portal Audit",
    description: "Review CPCB access details and client identifiers",
    config: {
      fields: [
        "companyName",
        "clientId",
        "category",
        "state",
        "cpcbLoginId",
        "cpcbPassword",
        "otpMobileNumber",
      ],
      sortBy: "companyName",
    },
  },
  {
    id: "contact-directory",
    name: "Contact Directory",
    description: "Export linked contact names, phones, emails, and primary contact details",
    config: {
      fields: [
        "companyName",
        "clientId",
        "category",
        "contactCount",
        "primaryContactName",
        "primaryContactDesignation",
        "primaryContactPhones",
        "primaryContactEmails",
        "allContactNames",
        "allSelectedPhones",
        "allSelectedEmails",
      ],
      includeOnlyNonEmpty: true,
      sortBy: "companyName",
    },
  },
] as const;

export const REPORT_FILE_PREFIX: Record<ReportType, string> = REPORT_DEFINITIONS.reduce((acc, report) => {
  acc[report.id] = report.filePrefix;
  return acc;
}, {} as Record<ReportType, string>);

export const VALID_REPORT_TYPES = new Set<ReportType>(
  REPORT_DEFINITIONS.map((report) => report.id)
);

export const VALID_CUSTOM_CLIENT_EXPORT_FIELDS = new Set<string>(
  CUSTOM_CLIENT_EXPORT_FIELDS.map((field) => field.id)
);

export function isReportType(value: string): value is ReportType {
  return VALID_REPORT_TYPES.has(value as ReportType);
}

export function isCustomClientExportField(value: string): value is CustomClientExportField {
  return VALID_CUSTOM_CLIENT_EXPORT_FIELDS.has(value) || value.startsWith("custom:");
}
