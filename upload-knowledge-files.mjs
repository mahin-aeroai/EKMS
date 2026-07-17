#!/usr/bin/env node
// Uploads real Knowledge-module files (Documents, Drawings, SOPs) to
// Cloudflare R2 and upserts their metadata + extracted text into Supabase,
// in one step per file. Same architecture as upload-lfg-site-surveys.mjs
// (R2 for the actual bytes -- Supabase's free tier caps Storage at 1GB --
// Postgres only holds metadata + relative_path as the R2 object key), and
// the same "service role key writes the metadata row directly" pattern that
// script used for its linkage table.
//
// SETUP (one-time):
//   1. Create the R2 bucket + API token in the Cloudflare dashboard if you
//      haven't already (same bucket the LFG site surveys use is fine -- this
//      just writes under a different key prefix, knowledge/<table>/...).
//   2. In the Supabase dashboard: Settings -> API -> copy the
//      "service_role" secret key (NOT the anon key -- this script needs to
//      write past RLS). Never commit this key or put it in NEXT_PUBLIC_*.
//   3. Export these env vars before running (or put them in a local
//      .env.knowledge-upload file -- see below):
//        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//        R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
//
// USAGE:
//   For each file to publish, put two files side by side in
//   knowledge-uploads/<table>/ (table = documents | drawings | sops):
//     my-file.pdf         <- the real file
//     my-file.json        <- metadata (see shape below), same basename
//   Then run:  node upload-knowledge-files.mjs
//   Already-uploaded files (matched by relative_path) are upserted, not
//   duplicated -- safe to re-run, and safe to add more files to the folder
//   and re-run incrementally.
//
// METADATA JSON SHAPE (documents/sops):
//   { "title": "...", "summary": "...", "tags": ["..."], "category": "...",
//     "content_text": "...", "superseded": false }
// For "documents" specifically, category should be one of the fixed values
// in DOCUMENT_CATEGORIES (src/app/workspaces/documents/page.tsx): IKEA IWAY,
// FSC COC Audit, ISO 9001, Statutory Documents, Drawings, Other -- the
// Documents page filters by exactly these values, so anything else won't
// show up under any filter chip (still visible under "All", just orphaned
// from every specific category).
// METADATA JSON SHAPE (drawings):
//   { "number": "DWG-...", "title": "...", "status": "success|warning|danger|neutral",
//     "status_label": "...", "category": "...", "content_text": "..." }
//
// content_text is what the AI Copilot's search_knowledge_base tool searches
// and grounds answers in -- plain extracted text (PDF/DOCX text layer, or
// OCR'd text for scanned docs). Leave it "" if you just want the file
// browsable, not searchable by the Copilot.

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, basename } from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(process.cwd(), "knowledge-uploads");
const TABLES = ["documents", "drawings", "sops"];

const ENV_FILE = join(process.cwd(), ".env.knowledge-upload");
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  console.error(`Set them directly or create ${ENV_FILE} with KEY=value lines.`);
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".dwg": "image/vnd.dwg",
  ".dxf": "image/vnd.dxf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

async function run() {
  if (!existsSync(ROOT)) {
    console.error(`No ${ROOT} folder found. Create knowledge-uploads/documents (or drawings / sops) and add files first.`);
    process.exit(1);
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const table of TABLES) {
    const dir = join(ROOT, table);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => !f.endsWith(".json") && statSync(join(dir, f)).isFile());

    for (const file of files) {
      const filePath = join(dir, file);
      const jsonPath = join(dir, `${basename(file, extname(file))}.json`);
      if (!existsSync(jsonPath)) {
        console.warn(`  [skip] ${table}/${file} -- no matching ${basename(jsonPath)} metadata file`);
        skipped++;
        continue;
      }

      let meta;
      try {
        meta = JSON.parse(readFileSync(jsonPath, "utf8"));
      } catch (e) {
        console.error(`  [fail] ${table}/${file} -- invalid JSON in ${basename(jsonPath)}: ${e.message}`);
        failed++;
        continue;
      }

      const bytes = readFileSync(filePath);
      const relativePath = `knowledge/${table}/${file}`;
      const ext = extname(file).toLowerCase();

      try {
        await r2.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: relativePath,
            Body: bytes,
            ContentType: MIME_TYPES[ext] ?? "application/octet-stream",
          })
        );
      } catch (e) {
        console.error(`  [fail] ${table}/${file} -- R2 upload failed: ${e.message}`);
        failed++;
        continue;
      }

      const row = {
        ...meta,
        relative_path: relativePath,
        file_name: file,
        file_size_bytes: bytes.length,
        mime_type: MIME_TYPES[ext] ?? "application/octet-stream",
        uploaded_at: new Date().toISOString(),
      };

      const { error } = await supabase.from(table).upsert(row, { onConflict: "relative_path" });
      if (error) {
        console.error(`  [fail] ${table}/${file} -- Supabase upsert failed: ${error.message}`);
        failed++;
        continue;
      }

      console.log(`  [ok]   ${table}/${file}  (${(bytes.length / 1024).toFixed(0)} KB)`);
      uploaded++;
    }
  }

  console.log(`\nDone. ${uploaded} uploaded, ${skipped} skipped (no metadata), ${failed} failed.`);
}

run();
