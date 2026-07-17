-- Incremental patches to public.compliance_findings as real baseline dates
-- come in for items that import-compliance-schedule.sql couldn't date.
-- Safe to run any time after that import -- each patch just updates the
-- matching row by chapter + item.

-- G1.5 — Supply Value Chain Report. Source: "G1_5 supply Value Chain
-- Management.pdf" (Drive), dated at the bottom "Date: 1st March, 2024,
-- Auth. By: Srinivas Babu N." Annual cadence -> next due 01 Mar 2027.
update public.compliance_findings
set baseline_date = '2024-03-01',
    due_date = '2027-03-01',
    status = 'info',
    status_label = 'Due 01 Mar 2027'
where chapter = 'G1.5' and item = 'Supply Value Chain Report';

-- G5.8 — Wages Report / Minimum Wages Act. Source: "G5_8 Minimum wages
-- Act.pdf" (Drive) -- a Telangana Gazette notification on the state's
-- Minimum Wages Act cost-of-living index, masthead dated "HYDERABAD,
-- SATURDAY, APRIL 29, 2023." Annual cadence -> next due 29 Apr 2027.
-- Note: MMDI's copy of this file is filed under both G4.2 and G5.8 in
-- Drive, since it's the same evidence for two checklist items.
update public.compliance_findings
set baseline_date = '2023-04-29',
    due_date = '2027-04-29',
    status = 'info',
    status_label = 'Due 29 Apr 2027'
where chapter = 'G5.8' and item in ('Wages Report', 'Minimum Wages Act');
