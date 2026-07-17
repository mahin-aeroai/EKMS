-- Real IKEA IWAY audit documents imported from Google Drive
-- ("IKEA IWAY Audit 2024" / "Audit Documents" folder, owned by
-- srinivas@mmdi.in). category = 'IKEA IWAY' throughout (per the fixed
-- Documents taxonomy). source_url is the original Drive viewUrl -- these
-- files were NOT copied into R2 (impractical to pipe dozens of multi-MB
-- binaries through a chat session; Drive remains the source of truth, see
-- supabase-knowledge-files-source-url-migration.sql for why).
--
-- 91 files total. content_text (real extracted/OCR'd text, used by the AI
-- Copilot's search_knowledge_base tool for grounding) is populated for 21
-- of them so far; the rest are staged with title/category/Drive link only
-- (content_text NULL) so the full library is browsable immediately --
-- content_text will be backfilled for the rest via re-running this same
-- file as more get processed (ON CONFLICT (source_url) DO UPDATE, safe to
-- re-run/extend any number of times).
--
-- Run AFTER supabase-knowledge-files-migration.sql,
-- supabase-knowledge-files-source-url-migration.sql, AND
-- supabase-knowledge-files-fix-conflict-indexes.sql (all three already
-- confirmed run in production as of 17 July 2026).

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_2 Approved Plan 3rd Floor$mmdi_iway$,
  $mmdi_iway$Approved industrial building plan (3rd floor) for MMDI's Cherlapally plant, filed with the local commissioner.$mmdi_iway$,
  ARRAY[$mmdi_iway$G2.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_2 Approved Plan 3rd Floor .pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1sMEs-aRehE4ghYHKgC4v1a8eHSUiPn0b/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  5739247,
  $mmdi_iway$PLAN SHOWING THE PROPOSED INDUSTRIAL BUILDING SHED AND OFFICE BUILDING G-2 ON PLOT NOS 21 IN SURVEY NOS 23 & 24, SITUATED AT INDUSTRIAL DEVELOPMENT AREA CHERLAPALLY PHASE-V, KAPRA MANDAL MEDCHAL-MALKAJGIRI DISTRICT TELANGANA STATE. BELONGS TO M/S. MACRO MEDIA DIGITAL IMAGING (P) LTD. Total plot area, ground/first/second/third floor plinth areas, parking area, and open area schedules included. Revised Building plan approved vide Proceeding No. 110/0515/2020, dated 11/02/2021, by the Local Commissioner, GHMC Cherlapally, Hyderabad-500051.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_2 Internal IWAY Audit Checklist$mmdi_iway$,
  $mmdi_iway$Master internal IWAY audit checklist mapping every IKEA IWAY requirement chapter to MMDI's compliance evidence, responsible/accountable owners, and renewal cadence.$mmdi_iway$,
  ARRAY[$mmdi_iway$G1.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_2 Internal IWAY Audit Checklist.xlsx$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1x38bB4mH9fNZOAjdJixwTBvSCd1KpVhT/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/vnd.openxmlformats-officedocument.spreadsheetml.sheet$mmdi_iway$,
  82224,
  $mmdi_iway$Internal IWAY Audit Checklist. Columns: Standard, Chapter Name, IWAY Requirement (English + Telugu), Chapter #, Scope, MMDI Scope of Process/document, Evidence, Type of evidence, Conformity, Document Validity Tenure, Next renewal, Responsible/Accountable/Consulted/Informed. Sample rows: G1.1 Accountability and responsibility for IWAY granted to management-level representatives -- evidence: IWAY Organisation Chart, owner Dy. Manager HR & Admin. G1.2 Internal audits to assess IWAY compliance conducted at least every 12 months -- evidence: Internal IWAY audit Record, annual, next renewal 18/05/2024. G1.3 Written policies/routines covering IWAY in place. G1.4 Indicators/plans to measure and improve IWAY performance (supplier compliance, energy efficiency, waste reduction, carbon emissions targets). G1.5 Sub-contractors of products/services/materials in the IKEA value chain are mapped -- evidence: Supply Value Chain Report, annual. G1.6 IWAY implemented and verified at sub-contractors -- evidence: Security Services Agreement, Sub Suppliers Audit records.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$MMDI IKEA IWAT Audit List of Documents$mmdi_iway$,
  $mmdi_iway$Master index of all IKEA IWAY audit documents, grouped by category (Legal, Policy, Agreement, Audit Record, Manifest, Committee, Training, General) with responsible department and owner.$mmdi_iway$,
  ARRAY[$mmdi_iway$Index$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$MMDI IKEA IWAT Audit List of Documents.xlsx$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1yFd6fzsLGi5-gIZprS8as2ocKfirroWi/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/vnd.openxmlformats-officedocument.spreadsheetml.sheet$mmdi_iway$,
  28307,
  $mmdi_iway$Index of IWAY audit documents (Doc Name, Category, Priority, Responsible Dept, Person, Validity, Next Renewal, Status). Legal Documents: Standing Orders, Approved Plans, Stability Certificate, Labour Certificate, Electrical Permission/Inspection cert, PCB Consent, Minimum Wages Act Updates (owners: Vamsi Krishna Reddy B - HR & Admin; Rajasekhar Chintala - Operations). Policy Documents: IWAY Organisation Chart, Young Workers Working Areas, Employee DOB records, Service Rules Book, Recruitment/Discrimination/Anti-harassment/Business Ethics/Disciplinary/Alcohol & drugs policies, Lunch & tea break timings, Outstation allowances, List of Holidays. Agreements: Security Services Agreement, RE Enviro Engg. Agreement. Audit Records: Chemical Management System, Sub Supplier Audit Records (Raghuram Cherukuri - Stores/Purchase/Inventory), Emergency Action Plan, Water test Reports, Workplace risk Assessment, Occupational Health & Safety, Supply Value Chain Record. Manifest Records: Form 4, Form 5, Wastage Manifest, Pressure Vessel test Reports, Air & Noise Pollution test Reports, Non-Hazardous Waste Collection reports. Committee Reports: Grievances Committee, Health & Safety Committee, Anti-sexual Committee. Training Records: Chemical Handling & Storage, Evacuation Drill, First Aid, Operator training, Color Management, Pre-press, QC, Wastage Segregation, Health and Safety, Environmental Compliance. General records: In/Out Register, Accident/Incident Report, Near Miss Report, PPE Distribution, Wages report, Solar Power sustainability, Pay Slips, Bank Statement, Staff Advances, Appointment Letters, ESIC records, Health Insurance Records.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_4_ WASTE HANDLING$mmdi_iway$,
  $mmdi_iway$Waste handling training session record (25 Jan 2024) covering waste categorization and segregation, with attendee sign-off, Finishing department.$mmdi_iway$,
  ARRAY[$mmdi_iway$G9.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_4_ WASTE HANDLING.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1gNcVKKoFiPLONegJS48v7R5M3spNspwf/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  63657,
  $mmdi_iway$MACRO MEDIA DIGITAL IMAGING PRIVATE LIMITED. 25th January 2024. WASTE HANDLING training. Given By: Srinivas Babu N. Topics covered: check the category of waste before you dump; separate the waste according to the list of category; do not mix the waste; deposit the material in designated place. Attendee list (Finishing department): Madapa Srinivas Reddy, Rekulapally Narender Reddy, Powar Goutham Krishna, Bandirala Bal Raj, Pachimadla Parshuramulu, A Sai Kumar, Siddenki Jayapal, Chetti Srikanth, with signatures. Confirmed delivered by Srinivas Babu N, AGM-Operations.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_4 PCB CFO order$mmdi_iway$,
  $mmdi_iway$Telangana State Pollution Control Board Consent & Authorization Order (Orange Category) for MMDI's Cherlapally plant -- effluent discharge, emissions, hazardous waste handling. Valid through 31 Mar 2032.$mmdi_iway$,
  ARRAY[$mmdi_iway$G9.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_4 PCB CFO order.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/17Od2aV686C0GtIhFOJLFBosb89JLpket/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  553815,
  $mmdi_iway$TELANGANA STATE POLLUTION CONTROL BOARD. CONSENT & AUTHORIZATION ORDER - ORANGE CATEGORY. Consent Order No: 1364-RR-II/TSPCB/ZOH/TS-iPASS/CFO/2022-10, Date 10.05.2022. Granted under Water (Prevention & Control of Pollution) Act 1974, Air (Prevention & Control of Pollution) Act 1981, and Hazardous and Other Wastes (Management and Transboundary Movement) Rules 2016, to M/s. Macro Media Digital Imaging (P) Ltd., Plot No. 23B & 24, Sy.No.184 & 185, Phase-V, IDA Cherlapally, Medchal-Malkajgiri District. Outlets: domestic effluents, max daily discharge 0.5 KLD, disposed via septic tank/soak pit. Chimney emissions: DG Set 125 KVA, SPM 115 mg/Nm3. Hazardous waste authorization (Form-2): waste oils 50 LPA (sent to authorized re-processors), PVC Flex/Polyester fabric waste 1.75 TPA and oil/ink soaked cotton/PPE waste 200 Kg/annum and discarded chemical containers 450 Kg/annum (disposed to M/s. TSDF, Dundigal). Valid for manufacture of Digital Printing, capacity 300 Sq.ft/hour (6000 Sq.ft/day, 3 shifts, 20 hours). Order valid until 31.03.2032; annual consent fee payable from FY2027-28.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_5 Pressure Vessel test Report June 2024 M3$mmdi_iway$,
  $mmdi_iway$Statutory pressure vessel (air receiver) inspection certificate for Machine 3 (500L capacity), certified 11 June 2024, valid to 10 Dec 2024.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.5$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_5 Pressure Vessel test Report June 2024 M3.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1cJKUoisuBOwmmDapIHvW9Atl9zLkqP7U/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1328823,
  $mmdi_iway$FORM NO. 8 (Report of Examination of Pressure Vessel or Plant, Under Rule 56 of Factories Rules). TC No: SSC-MDIPL-11-06-24-001. Occupier: M/s. Macromedia Digital Imaging Private Limited, IDA Plot 23B & 24, Cherlapally, Phase-V, Hyderabad-500051. Location: Utilities Room. Vessel: Horizontal Air Receiver, 500 Ltrs capacity, S.No: ALP0634, manufactured by M/s. ANEST IWATA, used for storing & supplying compressed air. Constructed 2022. Wall thickness Shell 4.9/5.0mm, DE 5.9/6.0mm. Max permissible working pressure 12.0 Kg/Cm2g (18.0 Kg/Cm2g by manufacturer). Thorough visual examination and ultrasonic thickness testing carried out; external condition good. Pressure gauge, safety valve, drain valve provided and properly maintained. Certified 11-06-2024 by F.Srinivasa Rao, B.Tech, MIE, Chartered Engineer, Competent Person (License No. A4/4697/2020, Telangana Factories Act). Certificate valid up to 10-12-2024.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_5 Pressure Vessel test Report June 2024 M1$mmdi_iway$,
  $mmdi_iway$Statutory pressure vessel (air receiver) inspection certificate for Machine 1 (500L capacity), certified 11 June 2024, valid to 10 Dec 2024.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.5$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_5 Pressure Vessel test Report June 2024 M1.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1ZJ_nlV3SIB_wVjaBqzfp9gOwKp1TgjvN/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1335948,
  $mmdi_iway$FORM NO. 8 (Report of Examination of Pressure Vessel or Plant, Under Rule 56 of Factories Rules). TC No: SSC-MDIPL-11-06-24-003. Occupier: M/s. Macromedia Digital Imaging Private Limited, IDA Plot 23B & 24, Cherlapally, Phase-V, Hyderabad-500051. Location: Utilities Room. Vessel: Horizontal Air Receiver, 500 Ltrs capacity, S.No: TGFS322, manufactured by M/s. ANEST IWATA, used for storing & supplying compressed air. Constructed 2016. Wall thickness Shell 5.0/5.1mm, DE 5.8/5.9mm. Max permissible working pressure 12.0 Kg/Cm2g (18.0 Kg/Cm2g by manufacturer). Thorough visual examination and ultrasonic thickness testing carried out; external condition good. Pressure gauge, safety valve, drain valve provided and properly maintained. Certified 11-06-2024 by F.Srinivasa Rao, B.Tech, MIE, Chartered Engineer, Competent Person (License No. A1/4697/2023, Telangana Factories Act). Certificate valid up to 10-12-2024.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_5 Pressure Vessel test Report June 2024 M2$mmdi_iway$,
  $mmdi_iway$Statutory pressure vessel (air receiver) inspection certificate for Machine 2 (500L capacity), certified 11 June 2024, valid to 10 Dec 2024.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.5$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_5 Pressure Vessel test Report June 2024 M2.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1TLzk4WLGLV-SgfMa-7jBn0sZNCcKSAq0/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1314076,
  $mmdi_iway$FORM NO. 8 (Report of Examination of Pressure Vessel or Plant, Under Rule 56 of Factories Rules). TC No: SSC-MDIPL-11-06-24-002. Occupier: M/s. Macromedia Digital Imaging Private Limited, IDA Plot 23B & 24, Cherlapally, Phase-V, Hyderabad-500051. Location: Utilities Room. Vessel: Horizontal Air Receiver, 500 Ltrs capacity, S.No: KHP0232, manufactured by M/s. ANEST IWATA, used for storing & supplying compressed air. Constructed 2010. Wall thickness Shell 4.8/4.9mm, DE 5.9/6.0mm. Max permissible working pressure 12.0 Kg/Cm2g (18.0 Kg/Cm2g by manufacturer). Thorough visual examination and ultrasonic thickness testing carried out; external condition good. Pressure gauge, safety valve, drain valve provided and properly maintained. Certified 11-06-2024 by F.Srinivasa Rao, B.Tech, MIE, Chartered Engineer, Competent Person (License No. A4/4697/2020, Telangana Factories Act). Certificate valid up to 10-12-2024.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$Air and Noise Pollution test$mmdi_iway$,
  $mmdi_iway$Ambient air quality and noise pollution test report (Kiwis Eco Laboratories, June 2024) for the Cherlapally plant -- PM10, PM2.5, SO2, NOx, and day/night noise levels, all within CPCB/NAAQ standards.$mmdi_iway$,
  ARRAY[]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$Air and Noise Pollution test.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1svt-YoEOmRGrkn8yQzuvCK0Z38fEwmm6/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  3355109,
  $mmdi_iway$KIWIS Eco Laboratories Pvt Ltd (NABL/ISO 9001:2015 accredited) test report for M/s. Macromedia Digital Imaging Private Limited, Plot No.23 B&24, Phase-V, IDA, Cherlapally, Hyderabad-500051. Ambient Air Quality Monitoring (sampled 03-06-2024, report 05-06-2024) at 4 locations: Near Maingate, Ground Floor Mission Room, First Floor Mission Room, First Floor Seaming Area. Results vs NAAQ standards: PM10 60.8-75.4 ug/m3 (std 100), PM2.5 25.3-29.6 ug/m3 (std 60), SO2 18.1-26.8 ug/m3 (std 80), NOx 23.7-33.4 ug/m3 (std 80) -- all within limits. Ambient Noise Monitoring: Near Maingate 61.3/55.9 dB(A) day/night (std 75/70), Ground Floor Mission Room 63.4/54.5, First Floor Mission Room 70.7/68.6, First Floor Seaming Area 77.2/67.7 -- within CPCB day/night standards.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G8_6 Environmental Performance Policy$mmdi_iway$,
  $mmdi_iway$MMDI's Environmental Improvement Plan/Policy -- commitments to pollution prevention, legal compliance, eco-friendly inks, solar power, and a 2019-2023 environmental performance scorecard.$mmdi_iway$,
  ARRAY[$mmdi_iway$G8.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G8_6 Environmental Performance Policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1mk0g13479yAyGUqRRWpga8eUrkRxHhZd/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  303396,
  $mmdi_iway$Environmental Improvement Plan. MMDI commits to: environmental stewardship, pollution prevention, compliance with legal requirements, voluntary commitments, sustainability performance. Environmental aspects: competence/training/awareness, operational control. Pollution prevention: replacing solvent-based inks with eco-friendly inks, bio-based/recycled-content materials, solar energy, waste audits. Compliance: permissions from Pollution Control Board and local authorities for waste disposal/recycling. Environmental Evaluation Impact and Performance Report (2019-2023 targets/results): Power consumption (target -5-10%): 354,409 / 331,363 / 386,821. Solvent-ink print volume (target -10-15%): 31,57,264 / 41,52,991 / 32,72,640. Eco-friendly UV & Latex ink print volume (target +30-40%): 23,38,376 / 20,14,094 / 22,73,830. Hazardous waste (target -10-15%): 2.95% / 2.74% / 4.45%. Non-hazardous waste (target -5%): 20.14 / 15.87 / 14.10. Solar power generation (target 75,000 units): 18,948 / 142,497 / 140,810 units. Eco-friendly printing machines installed (target +1-2): 2-8 / 2-8 / 3-10. Plantation: green belt increase target 5-10%. Prepared by Srinivas Babu N, 3 June 2024.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_5 supply Value Chain Management$mmdi_iway$,
  $mmdi_iway$Supply Value Chain Management report -- MMDI's supplier selection, contract management, logistics, and ethical/sustainable sourcing commitments, plus a full materials and supplier list.$mmdi_iway$,
  ARRAY[$mmdi_iway$G1.5$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_5 supply Value Chain Management.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1rST0ig6IgtEs_L66gDjOVOx4Xpf4jMzY/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  460752,
  $mmdi_iway$Supply Chain Management. MACROMEDIA Digital Imaging Pvt. Ltd. supplies papers, films, banners, fabrics, rigid boards, and signage materials. Process: need identification, planning/requirements specification, supplier/contractor selection (reliability, quality, pricing, deadlines), contract award and management, logistics and delivery, end-of-life asset management (waste handling/disposal), ethical and sustainable practices (business ethics, no child labor, workers' freedom, working hours, minimum wages, OH&S, minimizing environmental impact). Materials list: Papers (FSC COC Papers, Sappi Magno Satin), Wallpapers, Films (PVC Self Adhesive Vinyl from LG/3M/Avery, Non-PVC 3M IJ 48C), Banners (PVC Flex), Fabrics (Dye-Sublimation polyester, UV-printed polyester), Rigid Boards (paper/corrugated, PP bubble, 3MM ACP, Acrylic/Plexi 3-8MM, Wood/MDF 4-8MM, PVC Foam 8-10MM), Signage Materials (Aluminium/MS Profiles). Key suppliers: Arrow Digital Private Limited and Fujifilm Sericol India (inks/cleaning agents), Sappi Papier Holding GMBH and Sentec International BV (paper/wallpaper), Laxmi Sales Corporation, Viradi Enterprises, AM Innovations, Jai Karni Associates, Anaadi Enterprises (films), Sun Sign & Technologies (PVC banners, UV fabrics), A.Berger GMBH (dye-sub fabrics), Sapthagiri Packaging Industries, Sarla Polymers, Aludecor Lamination, Hari Om Acrylic House, Ninth Avenue Industries, Nagori Ply Arcade (rigid materials), Cosign India, Karni Alufab, BD Steels (signage/MS).$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G8_6 Net Metering Connection Agreement$mmdi_iway$,
  $mmdi_iway$Net Metering Connection Agreement between MMDI and Southern Power Distribution Company of Telangana (DISCOM) for a 120kW rooftop solar PV grid-interactive system.$mmdi_iway$,
  ARRAY[$mmdi_iway$G8.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G8_6 Net Metering Connection Agreement.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1X1eM74opRf7u4Wn4hWSMSBiD89ZhyR81/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  493955,
  $mmdi_iway$Net Metering Connection Agreement, executed on non-judicial stamp paper (Telangana), between Macro Media Digital Imaging Pvt Ltd (First Party / Eligible Consumer) and Southern Power Distribution Company of Telangana Limited (DISCOM, Second Party). Approves a Net Metering arrangement at Plot 23-B & 24, Cherlapally, Phase-V, under TSERC (Net Metering Rooftop Solar PV Grid Interactive System) Regulation No. 06 of 2016. DISCOM agrees to provide grid connectivity for injection of electricity from a Rooftop Solar PV System of capacity 120 kilowatts. Both parties agree to comply with Electricity Act 2003 and TSERC terms. Net metering facility: consumer generates solar power for self-consumption and feeds excess into DISCOM grid; a bidirectional meter records import/export. Safety: consumer responsible for system up to interconnection point; DISCOM responsible beyond. DISCOM may disconnect for emergencies, maintenance, or hazardous conditions. Signed by Directors of Macro Media Digital Imaging (P) Ltd and Superintending Engineer, Habsiguda Circle, TSSPDCL.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_4 Form 4_2023$mmdi_iway$,
  $mmdi_iway$Form IV environmental audit report submission letter to APPCB/TSPCB Joint Chief Environmental Engineer for the year 2022, referencing Consent Order No. 1364-RR-II/TSPCB/ZOH/TS-Ipass/CFO/2022-10.$mmdi_iway$,
  ARRAY[$mmdi_iway$G9.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_4 Form 4_2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1TegAg8Qo2XE_mXMYhaqLiBHM7dwm3HEp/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1678441,
  $mmdi_iway$Macromedia Digital Imaging Private Limited letter dated 03-07-2023 to the Joint Chief Environmental Engineer, APPCB/TSPCB Regional Office. Subject: submission of Form IV (environmental audit report) for the year 2022, as specified in Schedule C, Part 2 of the CFO Consent Order No. 1364-RR-II/TSPCB/ZOH/TS-Ipass/CFO/2022-10 dated 10/05/2022. Branch Office: Plot No 23B & 24, IDA Phase V, Cherlapally, Hyderabad. Registered Office: Plot No.44, Apparel Export Park, Auto Nagar, Visakhapatnam.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_4 Waste Handling Training Record$mmdi_iway$,
  $mmdi_iway$Waste handling training session record (4 Feb 2023) covering waste categorization and segregation, with attendee sign-off.$mmdi_iway$,
  ARRAY[$mmdi_iway$G9.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_4 Waste Handling Training Record.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1STBY1Fb6fNmtAxDzA9RaRLuzBAzLRSzW/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  63290,
  $mmdi_iway$MACRO MEDIA DIGITAL IMAGING PRIVATE LIMITED. WASTE HANDLING training, 04/02/2023. Given By: Srinivas Babu N. Topics covered: check the category of waste before you dump; separate the waste according to the list of category; do not mix the waste; deposit the material in designated place. Attendee list with employee ID, department, and signature (approx 6 attendees). Confirmed delivered by Srinivas Babu N, AGM.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_12 First AID Training Certificates$mmdi_iway$,
  $mmdi_iway$First Aid Training Certificates (10 June 2024) issued to multiple MMDI employees by Dr. G.V. Raju, MBBS, covering CPR, wound care, and emergency response.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.12$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_12 First AID Training Certificates$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1bt1scJ0sF9F3Wq4cMRtqRkRjVXPi_7nG/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  590398,
  $mmdi_iway$FIRST AID TRAINING CERTIFICATEs, Macromedia Digital Imaging Pvt. Ltd., 23B & 24, IDA-Cherlapally, Hyderabad-500051. Multiple individual certificates (Certificate IDs MMDI/2024/FA/01 through at least 07+), each certifying an employee completed the First Aid Training Course conducted by Dr. G.V. Raju, MBBS, on 10th June 2024, covering CPR, wound care, and emergency response. Certified employees include: Fayaz SK, Hassain Sha CK, Srinath V, Praveen Kumar S, Mahesh Kumar M, Jashwanth Reddy V, Hanumandlu M, Buchaiah Chowdary V, and others.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_9 Emergency Evacuation Plan_First Floor$mmdi_iway$,
  $mmdi_iway$Emergency evacuation plan diagram for the First Floor (CDR/CorelDRAW-sourced layout drawing) -- minimal extractable text, primarily a floor-plan graphic.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.9$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_9 Emergency Evacuation Plan_First Floor.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1QYIIys9I0H946mElFjkIUti0Jiy032Nm/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  282634,
  $mmdi_iway$G6_9 Emergency Evacuation Plan_Final.cdr. Macromedia Digital Imaging. (Primarily a graphical floor-plan diagram showing evacuation routes for the First Floor; source file was a CorelDRAW export, minimal machine-extractable text.)$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_14 EVACUATION DRILL REPORT$mmdi_iway$,
  $mmdi_iway$Fire evacuation drill report (18 Jan 2024) -- 47 people evacuated in under 6 minutes, with per-department attendance sign-off.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.14$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_14 EVACUATION DRILL REPORT.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1ivFe-b37-CvguOg8uVms8FO1__ekp0hd/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  237003,
  $mmdi_iway$EVACUATION DRILL REPORT. Date of drill: 18/01/24. Floor No. 4/2. Departments participating: Printing, Finishing, Stores, Accounts, Logistics, Pre-press, Security. Total people on floor: 47. Time alarm sounded: 1:54PM. Time evacuation started/completed: 1:54PM - 2:01PM. Pre-movement time: 21 seconds. Total building evacuation time: 1-6 minutes. Sample individual evacuation times recorded for 2 employees. Effectiveness rated Satisfactory across personnel response, familiarity with egress routes, communication, and speed of evacuation. MMDI Emergency coordinator: Srinivas Babu N. Full attendee sign-off list (~40 employees) with name, designation, division/department, and signature, spanning Printing, Finishing, Prepress, Logistics, Accounts & Admin, Stores, Operations, House Keeping departments.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_12 First AID Training Certificates$mmdi_iway$,
  $mmdi_iway$Collection of First Aid training certificates (badges: NEBOSH, British Safety Council, CILA, IOSH) -- mostly scanned certificate graphics with minimal extractable text.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.12$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_12 First AID Training Certificates.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1zZCC1iFEUNRcR6ZfDv9BSAGa2ENgQEPw/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  28228672,
  $mmdi_iway$First Aid Training Certificates.pdf -- a scanned collection of individual training certificates bearing accreditation badges (NEBOSH, British Safety Council, CILA, IOSH). Predominantly graphical/scanned content; minimal machine-extractable text beyond the accreditation body names, repeated across many certificate pages.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_9 Emergency Response Team$mmdi_iway$,
  $mmdi_iway$Emergency response team roster -- designated responsible official, emergency coordinators, emergency phone numbers, and the full list of First Aid trained employees by location/department.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.9$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_9 Emergency Response Team.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1CSqqDxy4O21pKeMC4MR9txDw6b22gwZO/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  69767,
  $mmdi_iway$EMERGENCY PERSONNEL NAMES AND PHONE NUMBERS. Designated Responsible Official: Srinivas Babu Nandipa, AGM-Operations, 9866078800. Emergency Coordinators: Sridhar Nandipa (Asst. Manager - Printing, 8341164105), SK. Fayaz (Asst. Manager - Printing, 8143880162). Emergency phone numbers: Fire Department 101, Paramedics 9849046887, Ambulance 102, Police 100. List of First Aid trained employees by location (Ground Floor Office, Production, Production 2, Post-production, Maintenance, First Floor Production) including Fayaz SK, Hassain Sha CK, Srinath V, Praveen Kumar S, Mahesh Kumar M, Jashwanth Reddy V, Hanumandlu M, Buchaiah Chowdary V, George K, Balaraj B, Srinivas Reddy M, Gowtham Krishna P, Mahamod Yakub, Naveen Kumar G, Murthy DVVKNSN, Srinivas B, Rajanikanth Reddy V, Jaipal S, Mahendar V, with contact numbers. Macromedia Digital Imaging Private Limited, 23B & 24, Phase 5, IDA-Cherlapally, Hyderabad-500051.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_^ Sub Supplier Audit documents$mmdi_iway$,
  $mmdi_iway$MMDI's Business Ethics Policy plus a sub-supplier ethical/sustainability audit report (Vision Security Services, July 2023) -- fully compliant across all checklist categories.$mmdi_iway$,
  ARRAY[$mmdi_iway$G1.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_^ Sub Supplier Audit documents.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1JgTFxKRxNz3maz4n8FxwFeO3HVsBZJJV/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  3012158,
  $mmdi_iway$BUSINESS ETHICS POLICY: MMDI commits to elimination of child labour, protection of workers' freedom (association/collective bargaining), compliance with working hours/time off, ensuring minimum wages, safe occupational health and safety conditions, and minimizing environmental impacts. Sub-Supplier Audit: Supplier Vision Security Services, Bhavani Plaza, ECIL, Hyderabad, contact Mr. Ravi. Purpose: assess supplier compliance with MMDI's ethical/sustainable practices. Methodology: on-site inspection, document review, interviews, checklist assessment. Checklist categories (A-G: Business Ethics, Elimination of Child Labour, Protection of Workers' Freedom, Working Hours Compliance, Minimum Wages, Occupational Health & Safety, Environmental Impacts) -- all criteria marked Yes/compliant. Conclusion: meets required standards in all assessed areas, no improvement recommendations. Audited 01-07-2023.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_3 HEALTH AND SAFETY TRAINING RECORD$mmdi_iway$,
  $mmdi_iway$Health and safety training record (29 Jan 2024) covering risk management, safe work procedures, PPE, hazardous substance handling, and emergency procedures, with 10 attendee sign-offs.$mmdi_iway$,
  ARRAY[$mmdi_iway$G6.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_3 HEALTH AND SAFETY TRAINING RECORD.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1FKeMYbhalXXPHDWxYXosaiIFcYWBZq4e/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  69285,
  $mmdi_iway$MACRO MEDIA DIGITAL IMAGING PRIVATE LIMITED. Health and Safety Training Record. Date: 29th January 2024. Trainer: Srinivas Babu N. Topics: health and safety responsibilities, risk identification and management, incident recording/reporting, safe work procedures, safe use of plant/equipment, PPE use and maintenance, safe use/storage of hazardous substances (chemicals), emergency procedures (evacuation, emergency equipment), OOS (Occupational Overuse Syndrome) prevention, stress management, managing extreme behaviour, safe handling and lifting. Attendees (10): Nandipa Sridhar, Vogulam Raji Reddy, Vogulam Rajanikanth Reddy, Gundelly Narsimlu, Mangolu Pramod, Thallapalli Ashok, DVVK NSN Murthy, Kapalla Sathish, B Maheshwar, Gundlli Ramesh -- spanning Printing, Finishing, Operations, Stores departments, with signatures.$mmdi_iway$,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_24 Workplace risk assessment$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.24$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_24 Workplace risk assessment.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1rqOyIxPLcdTpEPVfcAwUCjR6mP7KpIVB/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  105238,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_3 An Assessment on Ergonomics Conditions$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_3 An Assessment on Ergonomics Conditions.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1ZhQTY8UwchIchfAHacyo68T-5d2cPeH5/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  243190,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_3 Health & safety policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_3 Health & safety policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/12OgoKX9msKa1SBh5rEl8uzfuraXekrgW/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1272592,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_3 health and Safety Training Record_3rd July 2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_3 health and Safety Training Record_3rd July 2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1Pp8nUY2nDtfKExJHBH8fqmy_nTSdF2sc/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  423283,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_1 Child Bonded and Labour$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.1$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_1 Child Bonded and Labour.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1nFo7jmRwSYIii5SrvkOW5D98cP-e1WY6/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  118272,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_3 Freedom of association$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_3 Freedom of association.docx$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1bbzpEJy7qPlo9Pj5X7-am08Vdohmi4j0/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/vnd.openxmlformats-officedocument.wordprocessingml.document$mmdi_iway$,
  22425,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_9 Anti Discrimination$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.9$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_9 Anti Discrimination.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1FaNgdjC-XRIsDl8lq5uMmbNPpbVDfZn4/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  117760,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_2 IKEA IWAY TRAINING$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G1.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_2 IKEA IWAY TRAINING.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1if0kY2s_JK6S8qJNXZpPHE9kjcXUNQCq/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  188394,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$CHEMICAL MANAGEMENT SYSTEM$mmdi_iway$,
  NULL,
  ARRAY[]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$CHEMICAL MANAGEMENT SYSTEM.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1347O1D9f8iKmWsIEt7cUzlIq2PlHjxfi/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  258838,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_1_IWAY Organisation Chart$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G1.1$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_1_IWAY Organisation Chart.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1p5TO9tceKMVJwH08LHZ1LS83L22Eb9Ea/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  34475,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_1_IWAY Organisation Chart$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G1.1$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_1_IWAY Organisation Chart.pptx$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/13d-SYXSR4c8xu-oT2J9tdMzOqT2okoIc/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/vnd.openxmlformats-officedocument.presentationml.presentation$mmdi_iway$,
  309539,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_2_Approved Plans$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_2_Approved Plans.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1aY6aNxWj-rSJSB1j8LaV7hCIgv159Vwt/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1420255,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_1 Factory Licence$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.1$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_1 Factory Licence.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1z1BQ4YIlhFKt4qiVym-S2SvM9BdFr7rw/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  224648,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_1 Factory License fee$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.1$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_1 Factory License fee.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1vQp295BsoNRLJLTRrqdJrtHElg8-Ubx6/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  47318,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_2 Iway Training on 9th Aug 2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G1.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_2 Iway Training on 9th Aug 2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1k1DnWtLaW6CK9cbw-TFahTrIubnLwu3v/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  193831,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_6 Security Service Agreement$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G1.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_6 Security Service Agreement.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1YnU7xBQlCQ5-tHFQEuvBffadq0VRMgg1/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  413076,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_6_Sub Supplier Audit Document$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G1.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_6_Sub Supplier Audit Document.docx$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1gH2VYAqLbQ1Z3YJsJscCQckVeV6zpqOD/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/vnd.openxmlformats-officedocument.wordprocessingml.document$mmdi_iway$,
  19917,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_5 supply Value Chain Management$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G1.5$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_5 supply Value Chain Management.docx$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/115LQ4wyLIXN2h503MvVZyVnZ5YApdnvU/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/vnd.openxmlformats-officedocument.wordprocessingml.document$mmdi_iway$,
  313697,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_1 Inspector of factories InspectionReport$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.1$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_1 Inspector of factories InspectionReport.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1sTZvi6HC_ij-ZIufrQ3pEf5-VnmsiDN2/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  14336,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G1_6 Sub Supplier Audit Report Security Services$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G1.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G1_6 Sub Supplier Audit Report Security Services.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1yKUx9ZKaF7R7t7XI-zmGJ9IpOrOljXO1/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  127253,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_6 RE Sustainability Oct 2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G9.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_6 RE Sustainability Oct 2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1aLW_gFAQn1qDjQtJIvHaT9ej6daJjTrN/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  194079,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_6 RE Sustainability June 2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G9.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_6 RE Sustainability June 2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1n7X2gvZMfLqVxi6O2W-vRiwwDumG_jdi/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  358565,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_4 RE Engineers Service Agreement$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G9.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_4 RE Engineers Service Agreement.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1vbl4NQ2b1uvjgPUjG6d_JuIzvbHrcVSr/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  793151,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_4 FORM 5_2022-23$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G9.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_4 FORM 5_2022-23.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1dzqNu6S13CKxac9Qzj9sJBTTvCzXdAMM/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  968271,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_2 Stability Certificate$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_2 Stability Certificate.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1JVBWQW0SG0IowZ35QkNLHc7ly5soZmST/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  340630,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_2 Electrical Inspector Certificate 2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_2 Electrical Inspector Certificate 2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1UXvAAe_hmORq-rYZtFKFeOUHCXHRx--U/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  378804,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G8_6 Power Restoration agreement$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G8.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G8_6 Power Restoration agreement.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/12CTB_wcTyV8Wez_CUDpONUIYX2ciUNgw/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  466531,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_9 Emergency Evacuation Plan_Ground Floor$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.9$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_9 Emergency Evacuation Plan_Ground Floor.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1NztkQ8rI8L8_k3f570njCjl1ByuWUajt/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  301079,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_5 Machinery Installation certificate Compressor$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.5$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_5 Machinery Installation certificate Compressor.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1tVCLsvPPN_j-rvyBGJkQA5MykO6OZiJQ/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  517821,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$I Way Standard data  - IKEA$mmdi_iway$,
  NULL,
  ARRAY[]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$I Way Standard data  - IKEA.xlsx$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/17WFInCe2wP3UNafc-tF6n_JXiErhCNGQ/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/vnd.openxmlformats-officedocument.spreadsheetml.sheet$mmdi_iway$,
  15556,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_18 CHEMICAL HANDLING & STORAGE TRAINING RECORD$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.18$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_18 CHEMICAL HANDLING & STORAGE TRAINING RECORD.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/13LDDNEbqhLuVJu8m8Tgx0qTium7IFfTy/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  80737,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_6 RE Sustainability Dec 2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G9.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_6 RE Sustainability Dec 2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1icExTmS5CyflXaYeQMx5-4isEvtR5rwB/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  170310,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G3_5 Operator Training  Record$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G3.5$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G3_5 Operator Training  Record.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1f0eJJgf1OwavleO84uhthCYQ4Q0xvFYC/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  329869,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_7 Near Miss Report$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.7$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_7 Near Miss Report.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1jembnYhm1u-QxACYFd0Uz1F5LkleNkCo/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  44691,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_2 Labor Department ACK$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_2 Labor Department ACK.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/15eMGC0ChojKfKc4zElHIXLSRTbgCJQt5/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  57250,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_2 Labor Department Certificate$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_2 Labor Department Certificate.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/14ovMAizArW1AVNe3hvqAI6-pnO1vz-JJ/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  318517,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_7 Near Miss Reporting Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.7$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_7 Near Miss Reporting Policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1Aiwesr14AjaF2fHaVEIoOo0fmdvL14Fl/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  65833,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G3_4 Scope Of Working Areas For Young Workers$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G3.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G3_4 Scope Of Working Areas For Young Workers.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1QPgRIG1ucSHokXRqQ4fKbiF559r6fQGP/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  61925,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_14 Evacuation Drill Report_4th July 2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.14$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_14 Evacuation Drill Report_4th July 2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1Ph3JIAIqQUF0glHWX2fo2yC6evdW1Ls2/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1130626,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_18 Chemical Management System$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.18$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_18 Chemical Management System.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/15Pov8uaeU5Aj1-IHGb7pH2Ai-cZFa9Y3/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  137682,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_2 Accidental Endorsement$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_2 Accidental Endorsement.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1cAYiQcJWmWZ0toXBidaKQnm2NN6Fjxg0/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  89294,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_15 Fire Safety training record 2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.15$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_15 Fire Safety training record 2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1IQZgv4B4rgn0-IBGiYrClFKSeh5zBvXT/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  936845,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_9 Discipilinary action Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.9$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_9 Discipilinary action Policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1MUVi_6a8CGp1IIl46Dr88W7JmR6_3zYx/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  553918,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_2 Standing Orders_THE  INDUSTRIAL  EMPLOYMENT$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_2 Standing Orders_THE  INDUSTRIAL  EMPLOYMENT.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1oP3-FrIpKc86stpHSdPemj7syeGuVOH8/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  142502,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G2_2 Standing order$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G2.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G2_2 Standing order.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1fh9wySYCKlK98xvEs5PSAC9-otg3nBak/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  481976,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G9_4 Waste Management -Permission letter to TS Pollution control board$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G9.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G9_4 Waste Management -Permission letter to TS Pollution control board.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1DR1OEkQazkrCpxntwHxOOqUewUcoTxW6/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  337634,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_7 Near Miss Report Form$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.7$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_7 Near Miss Report Form.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1RwR08gKP7wbFWTKv14vtRh0GXvflY836/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  37380,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G5_3 Lunch breaks$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G5.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G5_3 Lunch breaks.docx$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1TgYqkBG5qcEFlyfS3q8-D212GAfKPU6y/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/vnd.openxmlformats-officedocument.wordprocessingml.document$mmdi_iway$,
  15628,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G3_3 Amendment Young worker policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G3.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G3_3 Amendment Young worker policy.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/13hAqWITCEXmaAjJPLharqRTstTKpV53G/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  118784,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G8_6 Power Restoration agreement 2024$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G8.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G8_6 Power Restoration agreement 2024.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1Y5NPTc0Xpn63ZwqutiHLGUR4g65L8Qh6/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  113924,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_18 Chemical Handling & Storage Training Record 04-07-2023$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.18$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_18 Chemical Handling & Storage Training Record 04-07-2023.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1ke5Xl6SJDlzm52fjhCLzIwusTqEJsL0u/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  82265,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G3_5 Operator Training record 06-02-2019$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G3.5$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G3_5 Operator Training record 06-02-2019.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1q7TeB33XZEgZq3S3MSCVhnuNyKTMZdc2/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  684497,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G5_8 Minimum wages Act$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G5.8$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G5_8 Minimum wages Act.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1FtyQ97BOwBxEe075Cq9UTXqboNsjJdoF/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1015478,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_3 Works comittee NA Declaration$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_3 Works comittee NA Declaration .pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1xFBg3YPxcvpxJPM6XKmEz-cOAAUOgHjq/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  198333,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_2 Minimum wages Act$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_2 Minimum wages Act.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1EG1EqxMMaN7AzFBpK8g4mQlW2WIQg147/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1015478,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_15 Fire NOC NA$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.15$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_15 Fire NOC NA.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/140G6Ge4X3Ohjd3HR1JsbAJZfcGLd9GuE/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  449147,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_2 List of Holidays 2024$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_2 List of Holidays 2024.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1S-_lMquRYSqKXlyEqM-foMkGt6RIA_oP/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  230934,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_6 PPE Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_6 PPE Policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1zI9LYYkBf8eOArUkwba6KIMYiI0Ss7Am/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  361177,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G6_24 Employee Fitness Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G6.24$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G6_24 Employee Fitness Policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1uqCzNjYkSvAO7OTb5LOpwKeeuaO84juq/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  247013,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_6 Recruitment policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.6$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_6 Recruitment policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1jJuJuleN65v_hGddDeXXBtGImX2eh24I/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1064490,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_2 Overtime Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_2 Overtime Policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1OwbfTZ5T8zlnT9mn7c_tUP_C2QXbOOhq/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  726419,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_12 Termination Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.12$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_12 Termination Policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1b-Xf5GW5CcFaZA2kaqkkWlBSoEtDIyt0/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  512121,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_9 Business Ethics Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.9$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_9 Business Ethics Policy.pdf$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1b7HNtC8ZNKibkrjlYq0uFAtS3_Ljq76q/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/pdf$mmdi_iway$,
  1604676,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_3 Collective Bargaining$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.3$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_3 Collective Bargaining.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1YB20x_BekKnRAC2czEd_Qow6vdHiAFw0/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  139776,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_4 Grievance Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.4$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_4 Grievance Policy.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1mNOEeF65GD6oZ3T5Ij37sZQ8XU1laTJy/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  55808,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_9 Anti Harassment Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.9$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_9 Anti Harassment Policy.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1UQmeREuCiNJjAbJgyM_J1OrojvJvHePn/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  138240,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_7 Recruitment and Selection Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.7$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_7 Recruitment and Selection Policy.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/17zsYug3qEyccayzJ11_Y8JtJlVOrcYEK/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  114176,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_9 General conditions$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.9$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_9 General conditions.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/1qAY0Xk18ezXyyNMKuOb0qDXzaxWig56u/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  130048,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_2 Leave Policy$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_2 Leave Policy.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/13BcW1em68PHdftibORdmQi3gMC40wPrH/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  119808,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

insert into documents (title, summary, tags, category, file_name, source_url, mime_type, file_size_bytes, content_text, uploaded_at)
values (
  $mmdi_iway$G4_2 Hours of Work and  Attendance$mmdi_iway$,
  NULL,
  ARRAY[$mmdi_iway$G4.2$mmdi_iway$]::text[],
  $mmdi_iway$IKEA IWAY$mmdi_iway$,
  $mmdi_iway$G4_2 Hours of Work and  Attendance.doc$mmdi_iway$,
  $mmdi_iway$https://drive.google.com/file/d/19g0KQWpEWTa9VPb4F10ZqyaqW9PEmrCB/view?usp=drivesdk$mmdi_iway$,
  $mmdi_iway$application/msword$mmdi_iway$,
  111104,
  NULL,
  now()
)
on conflict (source_url) do update set
  content_text = excluded.content_text,
  file_size_bytes = excluded.file_size_bytes,
  uploaded_at = excluded.uploaded_at;

