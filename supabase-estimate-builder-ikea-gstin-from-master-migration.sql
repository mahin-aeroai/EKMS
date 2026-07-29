-- GSTIN (and, for the previously-fully-blank accounts, address + contact
-- too) pulled directly from the uploaded "Customer Master.xlsx" —
-- Master_info_of_Account sheet, columns Code/Name/Address/GSTIN/Contact
-- Person. This is the authoritative source (matches the real accounting
-- ledger), so it's what should win going forward.
--
-- Every SET uses COALESCE, so nothing already on file gets overwritten —
-- in particular Worli's existing "Ms. Riya Patil" attention person stays
-- as-is (the Master file lists a different registered contact, "Mr. Vijay
-- George", for that GSTIN — likely the accounts contact rather than the
-- store contact who actually handles quotes; flagging rather than
-- silently swapping one for the other). Only GSTIN was genuinely missing
-- everywhere, so that's what changes for the six accounts that already
-- had a good address/contact.
--
-- 3 of your 12 real IKEA-family codes (C08068 "DLF AVE Delhi", C03781
-- "MH", C08033 "Ingka Services LLP") aren't in this particular Customer
-- Master file at all — left as whatever they already had from the
-- site-remap migration; if you have their real GSTIN, share the same
-- Code/GSTIN and I'll add it the same way.
--
-- Idempotent: safe to re-run.

update public.customers c
set
  address = coalesce(c.address, m.address),
  gstin = coalesce(c.gstin, m.gstin),
  default_attention_person = coalesce(c.default_attention_person, m.contact)
from (
  values
    ('C07788', '421, DLF Tower A, Jasola, South East Delhi, Delhi – 110025', '07AADCI3006N1ZM', 'Mr. Manish Chowdary'),
    ('C03998', 'Shop No. SH/LGF/21, Pacific Development Corporate Ltd, Najafgarh Rd, Tagore Garden, New Delhi – 110018', '07AADCI3006N1ZM', null),
    ('C06512', 'BBMP Khata 6/1, 6/2, 6/3 of Portion 6, Survey No. 12,13, Greenheart Phase IV Building, Bengaluru – 560073', '29AADCI3006N2ZF', 'Mr. Tameem Pasha'),
    ('C06372', 'E-01, Sector-51, Noida, Gautam Buddha Nagar, Uttar Pradesh – 201301', '09AAFCI0711E1Z1', 'Ms. Seema Agrawal'),
    ('C06268', 'K.No. 61, Site No. 12 & 13, 4th Floor, Plaza Office, Nagasandra, Yeshwanthpur, Bengaluru, Karnataka – 560073', '29AACCI8376C1ZD', 'Ms. Deepa Jose'),
    ('C03516', 'Survey No.12 & 13, Behind Metro Station, Nagasandra Village, Yeshwanthpur Hobli, Bengaluru – 560073', '29AADCI3006N1ZG', 'Mr. James Bennett'),
    ('C03694', 'Plot No. 25, 26(P) & 29(P), Hitech Main Road, Mindspace Junction, Hyderabad, Telangana – 500081', '36AADCI3006N1ZL', 'Ms. Pranita Priyadarshini'),
    ('C04730', '#465, Trade View, Utopia City, Pandurang, Lower Parel, Worli, Mumbai – 400013', '27AADCI3006N1ZK', 'Mr. Vijay George'),
    ('C04792', 'Commercial Plot C1, Sector 47, Gurugram – 122001', '06AADCI3006N1ZO', 'Mr. Muniraj R'),
    ('C05007', 'T-28I & TF-1, 3rd & 4th Floor, R City Mall, 146, CTS No.166/1 to 23, Off Village Ghatkopar, Mumbai – 400086', '27AADCI3006N1ZK', 'Mr. Vijay George'),
    ('C05258', 'Phoenix MarketCity, Survey No.207, Viman Nagar Road, Pune, Maharashtra – 411014', '27AADCI3006N1ZK', 'Ms. Monica Vijay Naik')
) as m(code, address, gstin, contact)
where c.code = m.code;

-- Verification:
-- select code, name, address, gstin, default_attention_person
-- from public.customers
-- where name ilike '%ikea%' or name ilike '%ingka%'
-- order by name;
