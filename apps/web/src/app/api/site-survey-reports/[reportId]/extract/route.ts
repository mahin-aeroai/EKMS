import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import {
  emptyFormData,
  emptyMeasurement,
  FORM_DATA_KEYS,
  type FieldSourceKey,
  type FieldSources,
  type SiteSurveyFormData,
  type SiteSurveyMeasurement,
  type SiteSurveyReportRow,
} from "@/lib/siteSurveyReport/types";

export const dynamic = "force-dynamic";

// AI extraction for an uploaded Site Survey PDF -- the "A. Create from PDF"
// path (see the plan's extraction-workflow section). One forced tool call
// (tool_choice: {type:"tool", ...}) rather than the free-form tool-use loop
// ai-copilot/route.ts uses, since this needs one guaranteed, fully-typed
// JSON object back, not a conversational answer built from several tool
// calls.
//
// CRITICAL, per the user's explicit requirement: never invent a value.
// Every scalar field in the extraction schema is `required` (so the model
// can never silently omit one) but allows an empty string, and the system
// prompt below repeats, in plain terms, that an empty string is the
// correct answer whenever the PDF doesn't clearly state something --
// guessing is explicitly forbidden. Numeric measurement fields are
// digits-only STRINGS in the schema (not JSON numbers) so the model has an
// unambiguous way to say "not found" (empty string) without leaning on a
// nullable-number distinction that's easy to get wrong; this route parses
// them into real numbers (or null) before writing to the DB.
//
// Merge rule: extraction only ever fills a field that is currently BLANK
// on the report. A field the user already typed something into (in
// Complete Details, before running extraction) is never overwritten --
// their own edit always wins. Every field extraction actually fills gets
// field_sources[key] = "ai" (renders the amber "please confirm" indicator
// in the Review step); fields left alone (already had a user value) keep
// whatever field_sources they already had.
//
// POST /api/site-survey-reports/[reportId]/extract

const PHOTO_CATEGORIES = ["main_site", "orientation_right", "orientation_left", "orientation_opposite", "measurement", "other"] as const;

const HEADER_KEYS = ["storeName", "address", "sfoId", "program", "surveyDate", "surveyorName"] as const;
const MEASUREMENT_STRING_KEYS = [
  "visualWidthMm",
  "visualHeightMm",
  "materialWidthMm",
  "materialHeightMm",
  "bleedTopMm",
  "bleedRightMm",
  "bleedBottomMm",
  "bleedLeftMm",
  "materialType",
  "installationType",
  "equipmentDetail",
  "equipmentSource",
  "installedBy",
  "measurementNotes",
] as const;
const MEASUREMENT_NUMERIC_KEYS = new Set([
  "visualWidthMm",
  "visualHeightMm",
  "materialWidthMm",
  "materialHeightMm",
  "bleedTopMm",
  "bleedRightMm",
  "bleedBottomMm",
  "bleedLeftMm",
]);

const EXTRACT_TOOL: Tool = {
  name: "extract_site_survey",
  description:
    "Structured extraction of every field on an Apple-format Site Survey Report PDF. Call this exactly once, after reading every page of the document (text, tables, and any visible photo captions or section headers).",
  input_schema: {
    type: "object",
    properties: {
      header: {
        type: "object",
        description: "Top-of-report identity fields.",
        properties: {
          storeName: { type: "string", description: "Site/store name, e.g. 'iMaging @ Model Town, Jalandhar'." },
          address: { type: "string", description: "Full store address." },
          sfoId: { type: "string", description: "SFO ID, e.g. '681008'." },
          program: { type: "string", description: "Apple program name, e.g. 'Mono AAR'." },
          surveyDate: { type: "string", description: "Date of inspection/survey, as YYYY-MM-DD if a full date is stated, otherwise the original text." },
          surveyorName: { type: "string", description: "Surveyor's name." },
        },
        required: [...HEADER_KEYS],
      },
      formData: {
        type: "object",
        description: "One-off Q&A fields from the on-site details / site suitability / store description / installation details / additional details sections.",
        properties: {
          storePersonContacted: { type: "string" },
          printer: { type: "string" },
          siteVisibility: { type: "string", enum: ["yes", "no", ""], description: "Does the site have high, uninterrupted visibility?" },
          premiumLocation: { type: "string", enum: ["yes", "no", ""], description: "Would this be considered a premium location?" },
          potentialIssues: { type: "string", description: "Potential issues with the location." },
          siliconJoinsCondition: { type: "string", description: "Condition of silicon joins and edges." },
          perspexCondition: { type: "string", description: "Condition of the Perspex cover for backlit." },
          lightingDescription: { type: "string", description: "Lighting for the location / backlit potential." },
          existingCreative: { type: "string", description: "Current artwork or store stickers on window." },
          creativeRemovable: { type: "string", enum: ["yes", "no", ""], description: "Can existing creative be removed?" },
          additionalStoreNotes: { type: "string" },
          installationDateTime: { type: "string", description: "Time and date of installation." },
          deliveryTimes: { type: "string", description: "Delivery times into store." },
          permitRequired: { type: "string", enum: ["yes", "no", ""], description: "Are mall or work permits required?" },
          permitDetails: { type: "string" },
          generalNotes: { type: "string" },
        },
        required: [...FORM_DATA_KEYS],
      },
      measurement: {
        type: "object",
        description:
          "The Site Photo & Measurement page. Numeric size/bleed fields are DIGITS-ONLY STRINGS in millimetres (e.g. '5522') -- convert cm/inches to mm and add the field to `flagged` if you had to convert. Empty string for any value not found.",
        properties: {
          visualWidthMm: { type: "string" },
          visualHeightMm: { type: "string" },
          materialWidthMm: { type: "string" },
          materialHeightMm: { type: "string" },
          bleedTopMm: { type: "string" },
          bleedRightMm: { type: "string" },
          bleedBottomMm: { type: "string" },
          bleedLeftMm: { type: "string" },
          materialType: { type: "string" },
          installationType: { type: "string" },
          equipmentDetail: { type: "string", description: "Equipment required for installation." },
          equipmentSource: { type: "string" },
          installedBy: { type: "string" },
          measurementNotes: { type: "string" },
        },
        required: [...MEASUREMENT_STRING_KEYS],
      },
      flagged: {
        type: "array",
        items: { type: "string" },
        description:
          "Dot-path field names (e.g. 'header.surveyDate', 'formData.permitRequired', 'measurement.visualWidthMm') that were ambiguous, conflicted across pages, or needed a unit conversion -- flagged for a human to double-check. Empty array if nothing needs flagging.",
      },
      pageHints: {
        type: "array",
        items: {
          type: "object",
          properties: {
            page: { type: "integer", description: "1-based page number." },
            likelyCategory: { type: "string", enum: [...PHOTO_CATEGORIES] },
            note: { type: "string", description: "Short note, e.g. the page's own caption. Empty string if none." },
          },
          required: ["page", "likelyCategory", "note"],
        },
        description:
          "Your best read of which PDF pages contain which category of photo, based on captions/section headers/layout -- used to help a human quickly find and crop the right photos afterwards. You do not crop or extract the images yourself.",
      },
    },
    required: ["header", "formData", "measurement", "flagged", "pageHints"],
  },
};

const SYSTEM_PROMPT = `You extract structured data from Apple-format "Site Survey Report" / "Site Inspection Report" PDFs for a signage/print production company reviewing a site before installation.

Read the ENTIRE document page by page -- text, tables, and any layout cues (section headers, photo captions) -- before calling the tool. Call extract_site_survey exactly once.

CRITICAL -- never invent or guess a value. If a field cannot be confidently read from the document, output an empty string ("") for it. Do not infer a plausible-sounding value, do not fill in a typical/default value, and do not paraphrase into something more specific than what's actually written. Preserve the document's own wording where reasonable rather than rewording it.

If the same fact appears more than once with different values, or the wording is genuinely ambiguous, pick the most explicit/prominent statement and add that field's dot-path name to \`flagged\` so a person double-checks it.

Measurement fields are digits-only strings in millimetres. If the source states cm or inches, convert to mm and add that field to \`flagged\` so the conversion gets a human sanity check.`;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

function parseMm(value: string): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

interface ExtractedPayload {
  header: Record<(typeof HEADER_KEYS)[number], string>;
  formData: Record<string, string>;
  measurement: Record<string, string>;
  flagged: string[];
  pageHints: { page: number; likelyCategory: string; note: string }[];
}

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "not_configured", message: "ANTHROPIC_API_KEY isn't set. Add it as a Vercel environment variable to enable AI extraction." },
      { status: 503 }
    );
  }
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: reportData, error: reportErr } = await supabase.from("site_survey_reports").select("*").eq("id", reportId).maybeSingle();
  if (reportErr || !reportData) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const report = reportData as SiteSurveyReportRow;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const canWrite = profile?.role === "admin" || profile?.role === "editor";
  if (!canWrite) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!report.source_pdf_relative_path) {
    return NextResponse.json({ error: "no_source_pdf", message: "Upload a source PDF before running extraction." }, { status: 400 });
  }

  const previousStatus = report.status;
  await supabase.from("site_survey_reports").update({ status: "extracting" }).eq("id", reportId);

  try {
    const getCommand = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: report.source_pdf_relative_path });
    const signedGetUrl = await getSignedUrl(r2, getCommand, { expiresIn: 60 });
    const pdfRes = await fetch(signedGetUrl);
    if (!pdfRes.ok) throw new Error(`Couldn't fetch the source PDF from storage (${pdfRes.status})`);
    const pdfBytes = await pdfRes.arrayBuffer();
    const base64 = Buffer.from(pdfBytes).toString("base64");

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Extract every field from this Site Survey Report PDF using the extract_site_survey tool." },
          ],
        },
      ],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_site_survey" },
    });

    const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === "extract_site_survey");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("The model didn't return a structured extraction.");
    }
    const extracted = toolUse.input as ExtractedPayload;

    // Merge: only ever fill a currently-blank field; a value the user
    // already typed in always wins. Every field extraction actually fills
    // is marked field_sources[key] = "ai".
    const mergedHeader: Record<(typeof HEADER_KEYS)[number], string> = {
      storeName: report.store_name,
      address: report.address,
      sfoId: report.sfo_id,
      program: report.program,
      surveyDate: report.survey_date ?? "",
      surveyorName: report.surveyor_name,
    };
    const dbHeaderKey: Record<(typeof HEADER_KEYS)[number], FieldSourceKey> = {
      storeName: "store_name",
      address: "address",
      sfoId: "sfo_id",
      program: "program",
      surveyDate: "survey_date",
      surveyorName: "surveyor_name",
    };
    const fieldSources: FieldSources = { ...report.field_sources };
    for (const key of HEADER_KEYS) {
      const extractedValue = (extracted.header?.[key] ?? "").trim();
      if (!mergedHeader[key] && extractedValue) {
        mergedHeader[key] = extractedValue;
        fieldSources[dbHeaderKey[key]] = "ai";
      }
    }

    const mergedFormData: SiteSurveyFormData = { ...emptyFormData(), ...report.form_data };
    for (const key of FORM_DATA_KEYS) {
      const extractedValue = (extracted.formData?.[key] ?? "").trim();
      if (!mergedFormData[key] && extractedValue) {
        (mergedFormData as unknown as Record<string, string>)[key] = extractedValue;
        fieldSources[key] = "ai";
      }
    }

    const mergedMeasurement: SiteSurveyMeasurement = { ...emptyMeasurement(), ...report.measurement };
    for (const key of MEASUREMENT_STRING_KEYS) {
      const raw = (extracted.measurement?.[key] ?? "").trim();
      if (!raw) continue;
      if (MEASUREMENT_NUMERIC_KEYS.has(key)) {
        const numKey = key as keyof SiteSurveyMeasurement;
        if (mergedMeasurement[numKey] == null) {
          (mergedMeasurement as unknown as Record<string, number | null>)[numKey] = parseMm(raw);
        }
      } else {
        const strKey = key as keyof SiteSurveyMeasurement;
        if (!mergedMeasurement[strKey]) {
          (mergedMeasurement as unknown as Record<string, string>)[strKey] = raw;
        }
      }
    }

    const pageHints = (extracted.pageHints ?? []).filter(
      (h) => typeof h.page === "number" && (PHOTO_CATEGORIES as readonly string[]).includes(h.likelyCategory)
    );
    const flagged = extracted.flagged ?? [];
    const extractionMeta = { flagged, pageHints };

    const { error: updateErr } = await supabase
      .from("site_survey_reports")
      .update({
        store_name: mergedHeader.storeName,
        address: mergedHeader.address,
        sfo_id: mergedHeader.sfoId,
        program: mergedHeader.program,
        survey_date: mergedHeader.surveyDate || null,
        surveyor_name: mergedHeader.surveyorName,
        form_data: mergedFormData,
        measurement: mergedMeasurement,
        field_sources: fieldSources,
        extraction_meta: extractionMeta,
        status: "review_required",
      })
      .eq("id", reportId);

    if (updateErr) throw new Error(updateErr.message);

    return NextResponse.json({
      report: {
        store_name: mergedHeader.storeName,
        address: mergedHeader.address,
        sfo_id: mergedHeader.sfoId,
        program: mergedHeader.program,
        survey_date: mergedHeader.surveyDate || null,
        surveyor_name: mergedHeader.surveyorName,
        form_data: mergedFormData,
        measurement: mergedMeasurement,
        field_sources: fieldSources,
        extraction_meta: extractionMeta,
        status: "review_required",
      },
      flagged,
      pageHints,
    });
  } catch (err) {
    await supabase.from("site_survey_reports").update({ status: previousStatus }).eq("id", reportId);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "extraction_failed", message }, { status: 502 });
  }
}
