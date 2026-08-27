/**
 * Macromedia Digital Imaging Pvt. Ltd.'s own fixed business particulars --
 * not user input, not a customer's. Sourced from the company's actual GST
 * registration certificate (import-statutory-documents.sql) and the
 * letterhead details already used on generated PDFs (see the MMDI constant
 * duplicated across src/lib/signEstimator/pdf.ts, estimateBuilder/pdf.ts,
 * importDuty/pdf.ts, materialOrdering/pdf.ts). Kept here as the one place
 * the public policy pages (portal/policies/*) pull from, so the Razorpay
 * "registered business website" review sees one consistent set of details.
 */
export const MMDI_COMPANY = {
  legalName: "Macromedia Digital Imaging Private Limited",
  pan: "AABCM9451F",
  // Telangana GSTIN, for the Hyderabad principal place of business the
  // portal actually ships from -- see GST REG-06 cert in
  // import-statutory-documents.sql (GSTIN 36AABCM9451F1ZF).
  gstin: "36AABCM9451F1ZF",
  address: "Plot No. 23B & 24, Phase V, IDA Cherlapally, Medchal-Malkajgiri, Telangana 500051, India",
  phone: "+91 40 2726 7777 / 8888",
  email: "info@mmdi.in",
  web: "www.mmdi.in",
};
