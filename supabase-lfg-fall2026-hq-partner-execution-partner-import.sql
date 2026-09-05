-- ============================================================
-- Backfills lfg_sites.hq_partner + lfg_sites.partner_id (the
-- "Execution Partner" -- MMDI or I&S) from Srinivas's real Fall LFG
-- execution tracker spreadsheet ("Fall LFG_2511.xlsx"), matched
-- strictly by Apple ID / SFO ID.
--
-- Run this AFTER supabase-lfg-sites-hq-partner-migration.sql.
--
-- 385 sites extracted from the spreadsheet's per-chain sheets
-- (Multi AAR, APR- APP, MONO AAR, Temp Sites, Vijay Sales, Reliance
-- Digital, Croma_2.0 [superseding the older Croma sheet], WC). See
-- STEP 3's own comment below for why 186 of them come
-- through with a NULL hq_partner even though the spreadsheet has SOME
-- value in that cell.
--
-- Nothing here is destructive: hq_partner is only ever SET where the
-- spreadsheet actually gives a usable value (never blanks an existing
-- one), and partner_id is only ever filled in where lfg_sites.partner_id
-- is currently NULL -- an already-assigned partner is never overwritten.
--
-- STEP 1 -- staging table, dropped at the end of this script.
--
-- Deliberately a real table, not a TEMP table -- Supabase's SQL Editor
-- runs through its connection pooler, which can hand each statement in
-- a pasted script to a different backend connection. A TEMP table only
-- exists on the connection that created it, so the very next statement
-- can come back "relation does not exist" even though it looks like one
-- unbroken script. A real table (schema-qualified, dropped explicitly
-- at the end of STEP 3) has no such connection-affinity problem.
-- ============================================================

drop table if exists public._fall_lfg_import;

create table public._fall_lfg_import (
  sfo_id text,
  store_name text,
  hq_partner text,
  installation_team text,
  source_sheet text
);

insert into public._fall_lfg_import (sfo_id, store_name, hq_partner, installation_team, source_sheet) values
  ('1300789', 'IPLANET @ BANASHANKARI', 'CONSOLIDATED PRIVATE LIMITED', 'I&S', 'APR- APP'),
  ('1606231', 'APTRONIX @ M.G ROAD', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'APR- APP'),
  ('1616817', 'UNICORN @ ASHRAM ROAD', 'UNICORN INFOSOLUTIONS PVT LTD', 'MMDI', 'APR- APP'),
  ('1639359', 'INVENT @ IHC', 'P3S VENTURES PRIVATE LIMITED', 'I&S', 'APR- APP'),
  ('1710313', 'APTRONIX @ ABIDS', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'I&S', 'APR- APP'),
  ('1997364', 'IMAGINE @ HSR LAYOUT', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'I&S', 'APR- APP'),
  ('3033485', 'UNICORN @ PACIFIC MALL FLAGSHIP', 'UNICORN INFOSOLUTIONS PVT LTD', 'MMDI', 'APR- APP'),
  ('3203628', 'UNICORN @ AHMEDABAD ONE MALL', 'UNICORN INFOSOLUTIONS PVT LTD', 'MMDI', 'APR- APP'),
  ('3219448', 'IPLANET @ PONDY BAZAAR', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'APR- APP'),
  ('3471560', 'IVENUS @ VASANT CENTER', 'VENUS DATA PRODUCTS PRIVATE LIMITED', 'I&S', 'APR- APP'),
  ('3561342', 'UNICORN @ LULU MALL, SHAHEED PATH', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'APR- APP'),
  ('3579615', 'IMAGINE @ BHARTIYA CITY', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'I&S', 'APR- APP'),
  ('389086', 'UNICORN @ HIMALAYA MALL', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'APR- APP'),
  ('3901876', 'APTRONIX @ PHOENIX MARKETCITY MALL', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'I&S', 'APR- APP'),
  ('544958', 'APTRONIX @ BEGUMPET', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'APR- APP'),
  ('563793', 'APTRONIX @ NUNGABAKKAM', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'APR- APP'),
  ('727945', 'FUTURE WORLD @ ADYAR', 'FUTURE WORLD RETAIL PVT LTD', 'MMDI', 'APR- APP'),
  ('818674', 'UNICORN @ PRAHLAD NAGAR', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'APR- APP'),
  ('820439', 'IMAGINE @ WORLD TRADE PARK', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'APR- APP'),
  ('825652', 'IVENUS @ SHRADDHA MALL', 'VENUS DATA PRODUCTS PRIVATE LIMITED', 'I&S', 'APR- APP'),
  ('841510', 'FUTURE WORLD @ MOHALI', 'FUTURE WORLD RETAIL PVT LTD', 'I&S', 'APR- APP'),
  ('1482332', 'CROMA @ AKSHAR PLAZA (Vashi)', NULL, 'I&S', 'Croma_2.0'),
  ('1482337', 'CROMA @ JANAKPURI', NULL, 'I&S', 'Croma_2.0'),
  ('1497221', 'CROMA @ AS RAO NAGAR', NULL, 'MMDI', 'Croma_2.0'),
  ('1676105', 'CROMA @ BHANDUP', NULL, 'I&S', 'Croma_2.0'),
  ('1679157', 'CROMA @ VARACHCHA', NULL, 'I&S', 'Croma_2.0'),
  ('1721402', 'CROMA @ AMBIANCE MALL- GURGAON', NULL, 'I&S', 'Croma_2.0'),
  ('1816673', 'CROMA @ BLORE-WHITEFIELD-A150', NULL, 'MMDI', 'Croma_2.0'),
  ('1816676', 'CROMA @ MUM-BORIVALI-A147', NULL, 'I&S', 'Croma_2.0'),
  ('1816679', 'CROMA @ NOIDA-MALLOFINDIA-A151', NULL, 'I&S', 'Croma_2.0'),
  ('2003960', 'CROMA @ AVADI', NULL, 'MMDI', 'Croma_2.0'),
  ('2003962', 'CROMA @ YELANKHA', NULL, 'MMDI', 'Croma_2.0'),
  ('2008490', 'CROMA @ INDIRA GANDI RD', NULL, 'I&S', 'Croma_2.0'),
  ('2082395', 'CROMA @ MYSORE DOUBLE ROAD', NULL, 'MMDI', 'Croma_2.0'),
  ('2106532', 'CROMA @ BHUJ', NULL, 'I&S', 'Croma_2.0'),
  ('2106533', 'CROMA @ GHODBUNDER', NULL, 'I&S', 'Croma_2.0'),
  ('2106534', 'CROMA @ SARAT BOSE ROAD', NULL, 'I&S', 'Croma_2.0'),
  ('2106535', 'CROMA @ MC ROAD', NULL, 'MMDI', 'Croma_2.0'),
  ('2106536', 'CROMA @ Kurla LBS Road', NULL, 'I&S', 'Croma_2.0'),
  ('2106537', 'CROMA @ CHROMPET', NULL, 'MMDI', 'Croma_2.0'),
  ('2115831', 'CROMA @ CHEMBUR', NULL, 'I&S', 'Croma_2.0'),
  ('2399438', 'CROMA @ ANAND-CP HOUSE', NULL, 'I&S', 'Croma_2.0'),
  ('2399440', 'CROMA @ Hennur Road', NULL, 'MMDI', 'Croma_2.0'),
  ('2399441', 'Croma @ Achropolicies', NULL, 'I&S', 'Croma_2.0'),
  ('2399444', 'CROMA @ RT GANDHIDHAM', NULL, 'I&S', 'Croma_2.0'),
  ('2399445', 'CROMA @ WESTERN SQUARE', NULL, 'I&S', 'Croma_2.0'),
  ('2399447', 'CROMA @ Ridhi Sidhi', NULL, 'I&S', 'Croma_2.0'),
  ('2399449', 'CROMA @ SEPAL BUILDING', NULL, 'I&S', 'Croma_2.0'),
  ('2399459', 'CROMA @ BARODA-KARELI BAUG', NULL, 'I&S', 'Croma_2.0'),
  ('2399462', 'CROMA @ MVR, VISAKHAPATNAM (INDIA)', NULL, 'MMDI', 'Croma_2.0'),
  ('2551688', 'CROMA @ AVADH ARENA', NULL, 'I&S', 'Croma_2.0'),
  ('2551689', 'CROMA @ RK Prime', NULL, 'I&S', 'Croma_2.0'),
  ('2969225', 'CROMA @ SATVA ICON', NULL, 'I&S', 'Croma_2.0'),
  ('3087686', 'CROMA @ PUSHKAR ICON NIKOL', NULL, 'I&S', 'Croma_2.0'),
  ('3232260', 'CROMA @ South Maninagar', NULL, 'I&S', 'Croma_2.0'),
  ('3232261', 'Croma @ Valsad', NULL, 'I&S', 'Croma_2.0'),
  ('3232262', 'CROMA @ PALANPUR', NULL, 'I&S', 'Croma_2.0'),
  ('3312613', 'CROMA @ SHYAMLAL CROSS AHMEDABAD', NULL, 'I&S', 'Croma_2.0'),
  ('3312614', 'CROMA @ ELURU', NULL, 'MMDI', 'Croma_2.0'),
  ('3372512', 'Croma @ Badnera Road Amravati', NULL, 'I&S', 'Croma_2.0'),
  ('3422678', 'CROMA @ RK CIRCLE', NULL, 'I&S', 'Croma_2.0'),
  ('3422684', 'CROMA @ KATARGAM', NULL, 'I&S', 'Croma_2.0'),
  ('3422688', 'CROMA @ MAKARBA (West gate)', NULL, 'I&S', 'Croma_2.0'),
  ('3422690', 'CROMA @ WAGHOLI', NULL, 'I&S', 'Croma_2.0'),
  ('3435881', 'CROMA @ ELECTRONIC CITY', NULL, 'MMDI', 'Croma_2.0'),
  ('3435882', 'CROMA @ BHILAI SUPELA', NULL, 'I&S', 'Croma_2.0'),
  ('3435886', 'Croma @ Thrissur', NULL, 'MMDI', 'Croma_2.0'),
  ('3435889', 'Croma @ Kandivali', NULL, 'I&S', 'Croma_2.0'),
  ('3435891', 'CROMA @ VIRAR', NULL, 'I&S', 'Croma_2.0'),
  ('3487881', 'CROMA @ SINDHU  BHAVAN AHMEDABAD', NULL, 'I&S', 'Croma_2.0'),
  ('3487887', 'CROMA @ PUNJABI BAGH DELHI', NULL, 'I&S', 'Croma_2.0'),
  ('3487888', 'Croma @ Kohinoor Mall', NULL, 'I&S', 'Croma_2.0'),
  ('3487889', 'COMA @ SELAYUR CHENNAI', NULL, 'MMDI', 'Croma_2.0'),
  ('3517978', 'Croma @ Ahmedabad-Hathijan Circle', NULL, 'I&S', 'Croma_2.0'),
  ('3517981', 'Croma @ Chennai-Sholinganallur', NULL, 'MMDI', 'Croma_2.0'),
  ('3517984', 'CROMA @ KANAKPURA', NULL, 'MMDI', 'Croma_2.0'),
  ('3517987', 'CROMA @ ZUNDAL', NULL, 'I&S', 'Croma_2.0'),
  ('3517993', 'CROMA @ TADEPALLI', NULL, 'MMDI', 'Croma_2.0'),
  ('3517996', 'Croma @ Capital Biz park', NULL, 'I&S', 'Croma_2.0'),
  ('3517998', 'CROMA @ ADYAR', NULL, 'MMDI', 'Croma_2.0'),
  ('3517999', 'CROMA @ URAPAKKAM', NULL, 'MMDI', 'Croma_2.0'),
  ('3565824', 'Croma @ Ambattur', NULL, 'MMDI', 'Croma_2.0'),
  ('3565826', 'CROMA @ NAVA NARODA', NULL, 'I&S', 'Croma_2.0'),
  ('3565830', 'Croma @ Wardha road', NULL, 'I&S', 'Croma_2.0'),
  ('3584811', 'CROMA @ NAGAVARA, BENGALURU', NULL, 'MMDI', 'Croma_2.0'),
  ('368832', 'CROMA @ DEV ARC MALL', NULL, 'I&S', 'Croma_2.0'),
  ('368838', 'CROMA @ CBD BELAPUR', NULL, 'I&S', 'Croma_2.0'),
  ('368841', 'CROMA @ BARODA', NULL, 'I&S', 'Croma_2.0'),
  ('3746454', 'Croma @ Karimnagar - Jagttal Road', NULL, 'MMDI', 'Croma_2.0'),
  ('3746464', 'Croma @ Sargasan', NULL, 'I&S', 'Croma_2.0'),
  ('3746466', 'Croma @ Thane-Dombivali East', NULL, 'I&S', 'Croma_2.0'),
  ('3746468', 'Croma @ Ankleshwar-Apple Plaza', NULL, 'I&S', 'Croma_2.0'),
  ('3746469', 'Croma @ Patparganj', NULL, 'I&S', 'Croma_2.0'),
  ('3850317', 'Croma @ Kalyan Shilphata Road', NULL, 'I&S', 'Croma_2.0'),
  ('3850319', 'Croma @ Patel Nagar', NULL, 'I&S', 'Croma_2.0'),
  ('3850334', 'Croma @ Dindori Road', NULL, 'I&S', 'Croma_2.0'),
  ('386265', 'CROMA @ MOUNT ROAD', NULL, 'MMDI', 'Croma_2.0'),
  ('3910677', 'Croma @ Delhi-Dwarka Sector 12', NULL, 'I&S', 'Croma_2.0'),
  ('3910680', 'Croma @ Surat-Bhagal', NULL, 'I&S', 'Croma_2.0'),
  ('3910681', 'CROMA @ SECTOR18 ULWE', NULL, 'I&S', 'Croma_2.0'),
  ('3910695', 'Croma @ Mohali-TDI Connaught Plaza', NULL, 'I&S', 'Croma_2.0'),
  ('3910699', 'CROMA @ MUMBAI-BORIVALI EAST M G ROAD', NULL, 'I&S', 'Croma_2.0'),
  ('3910705', 'Croma @ CBD Sahadara', NULL, 'I&S', 'Croma_2.0'),
  ('3910706', 'Croma @ Sangrur-Sunami Gate', NULL, 'I&S', 'Croma_2.0'),
  ('3970028', 'Croma @ kadapa', NULL, 'MMDI', 'Croma_2.0'),
  ('3970029', 'Croma @ Satna-Panna Road', NULL, 'I&S', 'Croma_2.0'),
  ('3978500', 'CROMA @ HYDERABAD-SANATH NAGAR', NULL, 'MMDI', 'Croma_2.0'),
  ('3978501', 'CROMA @ Hyderabad-Manikonda', NULL, 'MMDI', 'Croma_2.0'),
  ('4001355', 'CROMA @ Nashik-Govind Nagar', NULL, 'I&S', 'Croma_2.0'),
  ('4102050', 'Croma @ Newa Bhakti Park Airoli', NULL, 'I&S', 'Croma_2.0'),
  ('4119950', 'CROMA @ BOISAR OSTWAL', NULL, 'I&S', 'Croma_2.0'),
  ('4251133', 'Croma @ RT Nagar- 2', NULL, 'MMDI', 'Croma_2.0'),
  ('435052', 'CROMA @ SOUTH EXTENSION', NULL, 'I&S', 'Croma_2.0'),
  ('435055', 'CROMA @ INDIRANAGR', NULL, 'MMDI', 'Croma_2.0'),
  ('438159', 'CROMA @ WOODYS', NULL, 'MMDI', 'Croma_2.0'),
  ('438160', 'CROMA @ INDRAPRASHTA EQUINOX', NULL, 'MMDI', 'Croma_2.0'),
  ('443387', 'CROMA @ RIPPLE MALL', NULL, 'I&S', 'Croma_2.0'),
  ('457891', 'CROMA @ MARATHALI', NULL, 'I&S', 'Croma_2.0'),
  ('554597', 'CROMA @ KHARKHANA, VIKRAMPURI', NULL, 'MMDI', 'Croma_2.0'),
  ('571642', 'CROMA @ Banashankari', NULL, 'I&S', 'Croma_2.0'),
  ('684063', 'CROMA @ MAHAVIR NAGAR', NULL, 'I&S', 'Croma_2.0'),
  ('684064', 'CROMA @ RAJAJINAGAR', NULL, 'I&S', 'Croma_2.0'),
  ('733642', 'CROMA @ SURAT-ADAJAN', NULL, 'I&S', 'Croma_2.0'),
  ('768106', 'CROMA @ RATNA BUSINESS SQUARE', NULL, 'I&S', 'Croma_2.0'),
  ('839583', 'CROMA @ JAYANAGAR', NULL, 'MMDI', 'Croma_2.0'),
  ('850459', 'CROMA @ TOTAL MALL', NULL, 'MMDI', 'Croma_2.0'),
  ('1110206', 'IPLANET @ BYE PASS ROAD', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1341385', 'IPLANET @ AVINASHI ROAD', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1341386', 'IPLANET @ 100 FEET ROAD', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1341387', 'IPLANET @ NORTH VELI STREET', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1341397', 'INEXT @ ASTRON CHOWK', 'INEXT INNOVATIONS PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('1345252', 'UNI @ PATIALA', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('1346259', 'IMPULSE @ CENTRAL AVENUE', 'MAHESH RETAILS LLP', 'I&S', 'MONO AAR'),
  ('1369675', 'ICREST @ CROSS ROADS MALL', 'MARUTI NANDAN TELECOMM LLP', 'I&S', 'MONO AAR'),
  ('1531166', 'IPLANET @ SALEM', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1533290', 'ICREST @ RUDRAPUR', 'MARUTI NANDAN TELECOMM LLP', 'I&S', 'MONO AAR'),
  ('1533301', 'ICONCEPT @ METROPOLIS MALL', 'I CONCEPT', 'I&S', 'MONO AAR'),
  ('1533313', 'I CENTRAL @ SHIMOGA', 'TECHSPARK VENTURES', 'I&S', 'MONO AAR'),
  ('1551107', 'IPLANET @ BALMATTA', 'CONSOLIDATED PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('1565576', 'IASPIRE @ VARANASI', 'MOSARAM BHAGWANDAS (AGENCIES)', 'I&S', 'MONO AAR'),
  ('1588150', 'INEXT @ G T ROAD', 'INEXT INNOVATIONS PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('1589432', 'INVENT @ GANDHI BAZAR', 'P3S VENTURES PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('1600026', 'UNIWORLD @ KALYAN AGRA ROAD', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('1635602', 'IMAGINE @ KOLLAM', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1635603', 'LLOUNGE @ CITY CENTRE MALL', 'LIMTON PVT LTD', 'I&S', 'MONO AAR'),
  ('1635604', 'IPLANET @ TAMBARAM', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1635608', 'INEXT @ PATHANKOT', 'INEXT INNOVATIONS PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('1656917', 'ISTATION @ MADINAGUDA', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('1657381', 'IPLANET @ PROVEDENCE MALL', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1661448', 'IPEARL @ MANINAGAR', 'GREEN MANAGEMENT', 'MMDI', 'MONO AAR'),
  ('1676390', 'PLUTON @ BHATINDA', 'I CONCEPT', 'I&S', 'MONO AAR'),
  ('1696991', 'APTRONIX @ VIJAYANAGAR', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('1696992', 'APTRONIX @ MAIN ROAD', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('1697001', 'ICREST @GANDHI NAGAR', 'MARUTI NANDAN TELECOMM LLP', 'I&S', 'MONO AAR'),
  ('1697008', 'INEXT @ VIP ROAD', 'INEXT INNOVATIONS PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('1697010', 'ISTATION @ KOMPALLY', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('1710356', 'ICENTRAL @ FORUM MALL', 'TECHSPARK VENTURES', 'I&S', 'MONO AAR'),
  ('1710370', 'APTRONIX @ ECR', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('1710842', 'ITECH @ KANKURGACHI', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('1710843', 'ITECH @ DAKBANGLOW ROAD', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('1710849', 'IMAGINE @ MANIPAL ROAD, UDUPI', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('1735046', 'ICREST @ NIT, FARIDABAD', 'MARUTI NANDAN TELECOMM LLP', 'I&S', 'MONO AAR'),
  ('1784218', 'IPEARL @ GATLODIA', 'GREEN MANAGEMENT', 'MMDI', 'MONO AAR'),
  ('1784220', 'APTRONIX @ AMBATTUR', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('1983043', 'IPEARL @ NIKOL', 'GREEN MANAGEMENT', 'MMDI', 'MONO AAR'),
  ('2067885', 'INSPIRE @ TRILLUM MALL', 'NGRT SYSTEMS PVT LTD', 'MMDI', 'MONO AAR'),
  ('2370346', 'IDESTINY @ AVANI MALL', 'CS TRADE LINK PVT LTD', 'I&S', 'MONO AAR'),
  ('3035986', 'IPLANET @ KAMANAHALLI', 'CONSOLIDATED PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('3103405', 'ICREST @ DD PURAM', 'MARUTI NANDAN TELECOMM LLP', 'I&S', 'MONO AAR'),
  ('3334451', 'INEXT @ AJAY TOWER', 'INEXT INNOVATIONS PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('3385941', 'IDESTINY @ MONAL TOWER', 'CS TRADE LINK PVT LTD', 'I&S', 'MONO AAR'),
  ('3419538', 'INVENT @ WORLD STREET', 'P3S VENTURES PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('3458714', 'IPLANET @ MUGAPPAIR', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('3471943', 'IMPULSE @ BADNERA ROAD', 'MAHESH RETAILS LLP', 'I&S', 'MONO AAR'),
  ('3477115', 'IMAGINE @ MALL ROAD', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3480701', 'FUTURE WORLD @ KESSEL MALL', 'FUTURE WORLD RETAIL PVT LTD', 'I&S', 'MONO AAR'),
  ('3546076', 'IMAGINE @ SECTOR 85', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3565782', 'ITECH @ SECTOR 6', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('3579614', 'IPLANET @ VYTHILLA', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('3593480', 'ITECH @ FORUM GALLERIA, ROURKELA', 'UMANG BUSINESS CONSULTANT PVT LTD', 'MMDI', 'MONO AAR'),
  ('3598599', 'INSPIRE @ VIDYA NAGAR', 'NGRT SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3604316', 'ISTATION @ MINI BYPASS ROAD', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('3608643', 'IMAGINE @ PRATAP RD', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3637782', 'IPLANET @ KOTTAYAM', 'CONSOLIDATED PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('3638797', 'ICONCEPT @ SUTHERI ROAD', 'I CONCEPT', 'I&S', 'MONO AAR'),
  ('3672236', 'IMAGINE @ SANGWAN CHOWK', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3677885', 'FUTUREWORLD @ GLOBAL FOYAR', 'FUTURE WORLD RETAIL PVT LTD', 'I&S', 'MONO AAR'),
  ('3677889', 'APTRONIX @ MG ROAD', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'I&S', 'MONO AAR'),
  ('3677890', 'IVENUS @ GEETA COLONY', 'VENUS DATA PRODUCTS PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('3720508', 'ITECH @ NEW ALIPORE', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('3730068', 'ICENTRAL @ OLD JEWARGI ROAD', 'TECHSPARK VENTURES', 'I&S', 'MONO AAR'),
  ('3733985', 'UNICORN @ REACH AIRIA MALL', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('3746352', 'IMAGINE @ ELITE CHOWK', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3759017', 'UNICORN @ PASCHIM VIHAR', 'UNICORN INFOSOLUTIONS PVT LTD', 'MMDI', 'MONO AAR'),
  ('3766657', 'ITECH @ TOLLYGUNGE', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('3781908', 'IDESTINY @ GANGTOK', 'CS TRADE LINK PVT LTD', 'I&S', 'MONO AAR'),
  ('3844809', 'IMAGINE @ THRISSUR', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('3947316', 'UNICORN @ AGRA', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('3952297', 'IDESTINY@SALTLAKE SECTOR 5', 'CS TRADE LINK PVT LTD', 'I&S', 'MONO AAR'),
  ('3966940', 'UNICORN @ SPECTRUM NOIDA', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('3966944', 'INSPIRE @ JALGAON', 'NGRT SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3966945', 'INSPIRE @ AKOLA', 'NGRT SYSTEMS PVT LTD', 'MMDI', 'MONO AAR'),
  ('3966947', 'IPLANET @ VELLORE', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('3970649', 'IMAGINE @ RANI BAZAAR', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3970650', 'IMAGINE @ PLA MARKET', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3973670', 'IMAGINE @ MALWAL ROAD', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('3981506', 'UNICORN @ ICHALKARANJI', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('3994349', 'IPLANET @ ANNANAGAR', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4001404', 'IMAGINE@ RIDHI SIDHI OUTLETS', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4001405', 'IMAGINE@ CITY MALL', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4006988', 'ITECH @ KANKE ROAD', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('4006989', 'ITECH @ SILPUKHRI', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('4006990', 'ITECH @ SONITPUR', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('4007522', 'IPLANET @ MG ROAD', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4013982', 'ITECH @ BENETTON', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('4014182', 'INSPIRE @ SWASTIK COMPLEX', 'NGRT SYSTEMS PVT LTD', 'MMDI', 'MONO AAR'),
  ('4033645', 'TRIBE BY CROMA @ DEWAS', 'CROMA @ HQ', 'I&S', 'MONO AAR'),
  ('4033662', 'UNICORN @ KUTCHERY RD', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('4034662', 'IMAGINE @ RESIDENCY ROAD', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4034663', 'IMAGINE @ MALL ROAD', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4034664', 'IMAGINE @ STATION ROAD', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4036335', 'IMAGINE @ KNS TOWERS', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('4036336', 'IMAGINE @ SM TOWER', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4038163', 'APTRONIX @ MADHURAWADA', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('4041810', 'IPLANET @ TRICHY ROAD', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4041811', 'IPLANET @ KP ROAD', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4041814', 'IPLANET @ KAJAS ROAD', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4044737', 'APTRONIX @ BAJI JUNCTION', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'MMDI', 'MONO AAR'),
  ('4049085', 'TRIBE BY CROMA @ ERODE', 'CROMA @ HQ', 'MMDI', 'MONO AAR'),
  ('4049086', 'TRIBE BY CROMA @ PALANPUR', 'CROMA @ HQ', 'I&S', 'MONO AAR'),
  ('4057046', 'IMAGINE @ CULLEN ROAD', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4057048', 'IMAGINE @ WHITEFIELD', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('4064148', 'IMAGINE @ HEWETT ROAD', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4064149', 'IMAGINE @ ASHOK NAGAR', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4081607', 'ITECH @ APSARA BUSINESS CENTRE', 'UMANG BUSINESS CONSULTANT PVT LTD', 'I&S', 'MONO AAR'),
  ('4094042', 'IMAGINE @ JALANDHAR ROAD', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4094043', 'IMAGINE @ VIDYADHAR NAGAR', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4106601', 'APTRONIX @ SUNVIEW LUDHIANA', 'PREMIUM LIFESTYLE & FASHION INDIA PVT LTD', 'I&S', 'MONO AAR'),
  ('4138055', 'IPLANET @ SAHAKARNAGAR', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4145424', 'UNICORN @ GOA', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('4147785', 'UNICORN @ BELAPUR', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('4151243', 'IPLANET @ AVADI', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4151244', 'IPLANET @ VIDYARANYAPURA', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4151858', 'IPLANET @ KEMPS CORNER', 'CONSOLIDATED PRIVATE LIMITED', 'I&S', 'MONO AAR'),
  ('4195324', 'UNICORN @ AYODHYA', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('4203387', 'UNICORN @ NARELA', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('4206435', 'IPLANET @ ONGOLE', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4206436', 'IPLANET @ VILLIANUR ROAD', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4227976', 'IPLANET @ THOOTHUKUDI', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4227977', 'IPLANET @ SHARADA COLLEGE SALEM', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4227978', 'IPLANET @ MANCHERIAL', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4227979', 'IPLANET @ MIRYALGUDA', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4227980', 'IPLANET @ KOTHAGUDEM', 'CONSOLIDATED PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('4243026', 'UNICORN @ ULHASNAGAR', 'UNICORN INFOSOLUTIONS PVT LTD', 'I&S', 'MONO AAR'),
  ('4261142', 'IMAGINE @ HANUMANGARH', 'TRESOR SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('4341261', 'INSPIRE @ MAKRONIYA', 'NGRT SYSTEMS PVT LTD', 'I&S', 'MONO AAR'),
  ('435047', 'IMAGINE @ MANTRI SQUARE', 'AMPLE TECHNOLOGIES PRIVATE LIMITED', 'MMDI', 'MONO AAR'),
  ('1528172', 'Underground - Jalandhar', 'REPORTING ONLY', 'I&S', 'Multi AAR'),
  ('1565561', 'iTree @ Banashankari', 'REPORTING ONLY', 'I&S', 'Multi AAR'),
  ('1603819', 'Pai International - Marathali', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'Multi AAR'),
  ('1721270', 'Spice communication II Sec 14', 'REPORTING ONLY', 'I&S', 'Multi AAR'),
  ('1721272', 'Spice communication', 'REPORTING ONLY', 'I&S', 'Multi AAR'),
  ('2150123', 'Oxygen - Kottayam', 'OXYGEN DIGITAL SHOP', 'MMDI', 'Multi AAR'),
  ('2150126', 'Pai International - Jayanagar', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'Multi AAR'),
  ('2150127', 'Pai international - RT Nagar', 'PAI INTERNATIONAL ELECTRONICS LTD', 'I&S', 'Multi AAR'),
  ('4000607', 'PHONE WALE @ ACHARYA COMPLEX', 'PHONEWALE LIMITED', 'I&S', 'Multi AAR'),
  ('984562', 'Cell world', 'REPORTING ONLY', 'I&S', 'Multi AAR'),
  ('1034835', 'RELIANCE DIGITAL @ Perambur', NULL, 'MMDI', 'Reliance Digital'),
  ('1341774', 'RELIANCE DIGITAL @ VELLORE', NULL, 'MMDI', 'Reliance Digital'),
  ('1497817', 'RELIANCE DIGITAL @ BANJARA HILLS (NEW)', NULL, 'MMDI', 'Reliance Digital'),
  ('1597873', 'RELIANCE DIGITAL @  JN ROAD', NULL, 'MMDI', 'Reliance Digital'),
  ('1597881', 'RELIANCE DIGITAL @ RRL CDIT NELLORE', NULL, 'MMDI', 'Reliance Digital'),
  ('1597898', 'RELIANCE DIGITAL @ ROHTAK', NULL, 'I&S', 'Reliance Digital'),
  ('1597914', 'RELIANCE DIGITAL @ KATTUPAKKAM,POONAMALLEE ROAD', NULL, 'MMDI', 'Reliance Digital'),
  ('1721406', 'RELIANCE DIGITAL @ PUTTUR', NULL, 'MMDI', 'Reliance Digital'),
  ('1759789', 'RELIANCE DIGITAL @ PERUMBAKKAM', NULL, 'MMDI', 'Reliance Digital'),
  ('1778040', 'RELIANCE DIGITAL @ Jalahalli', NULL, 'MMDI', 'Reliance Digital'),
  ('1784278', 'RELIANCE DIGITAL @ MERREDPALLY', NULL, 'MMDI', 'Reliance Digital'),
  ('1977827', 'RELIANCE DIGITAL @ PANJAGUTTA', NULL, 'MMDI', 'Reliance Digital'),
  ('2082390', 'RELIANCE DIGITAL @ BALANAGAR', NULL, 'MMDI', 'Reliance Digital'),
  ('2115843', 'RELIANCE DIGITAL @ Porur', NULL, 'MMDI', 'Reliance Digital'),
  ('2367131', 'RELIANCE DIGITAL @ NEAR CHENNAI SILKS', NULL, 'MMDI', 'Reliance Digital'),
  ('2367133', 'RELIANCE DIGITAL @ Neeladhri Rd', NULL, 'MMDI', 'Reliance Digital'),
  ('2367137', 'RELIANCE DIGITAL @ North Usaman Rd', NULL, 'MMDI', 'Reliance Digital'),
  ('2367163', 'RELIANCE DIGITAL @ Yelahanka', NULL, 'MMDI', 'Reliance Digital'),
  ('2399450', 'RELIANCE DIGITAL @ Shagun Insignia', NULL, 'I&S', 'Reliance Digital'),
  ('2684806', 'RELIANCE DIGITAL @ Nallagandla', NULL, 'MMDI', 'Reliance Digital'),
  ('2850226', 'RELIANCE DIGITAL @ SAROVAR LANDMARK AHMEDABAD', NULL, 'I&S', 'Reliance Digital'),
  ('2850233', 'RELIANCE DIGITAL @ Gowlidoddy', NULL, 'MMDI', 'Reliance Digital'),
  ('2850245', 'RELIANCE DIGITAL @ 100 Ft Rd, Indiranagar Bengaluru', NULL, 'MMDI', 'Reliance Digital'),
  ('323998', 'Reliance Digital @ Shipra mall', NULL, 'I&S', 'Reliance Digital'),
  ('3312608', 'RELIANCE DIGITAL @ Shastri Bridge, Jabalpur', NULL, 'I&S', 'Reliance Digital'),
  ('3312610', 'RELIANCE DIGITAL @ Dharmpeth, Shewalkar Arcade, Nagpur', NULL, 'I&S', 'Reliance Digital'),
  ('3386108', 'RELIANCE DIGITAL @ Belathur kadugodi', NULL, 'MMDI', 'Reliance Digital'),
  ('3386110', 'RELIANCE DIGITAL @ DANAPUR', NULL, 'I&S', 'Reliance Digital'),
  ('3452806', 'RELIANCE DIGITAL @ Nagol (2nd store)', NULL, 'MMDI', 'Reliance Digital'),
  ('3470929', 'RELIANCE DIGITAL @ Wakad Pune', NULL, 'I&S', 'Reliance Digital'),
  ('3529760', 'RELIANCE DIGITAL @ SRIKANTH VERMA MARG', NULL, 'I&S', 'Reliance Digital'),
  ('3529769', 'RELIANCE DIGITAL @ ADILABAD', NULL, 'MMDI', 'Reliance Digital'),
  ('3620102', 'RELIANCE DIGITAL @ AMALAPURAM, AP', NULL, 'MMDI', 'Reliance Digital'),
  ('3679993', 'RELIANCE DIGITAL @ BM Rd, Kushal Nagar', NULL, 'MMDI', 'Reliance Digital'),
  ('3680004', 'Reliance Digital @ Chakarata R', NULL, 'I&S', 'Reliance Digital'),
  ('3734064', 'Reliance Digital @ Jadugar road', NULL, 'I&S', 'Reliance Digital'),
  ('3746436', 'Reliance Digital @ GT Road Gomti', NULL, 'I&S', 'Reliance Digital'),
  ('3746446', 'Reliance Digital @ Kengeri', NULL, 'MMDI', 'Reliance Digital'),
  ('3781926', 'Reliance Digital @ Oasis, Dehradun', NULL, 'I&S', 'Reliance Digital'),
  ('3781930', 'Reliance Digital @ Jundal Circle Ahmedabad', NULL, 'I&S', 'Reliance Digital'),
  ('3850301', 'Reliance Digital @ Swaroop Nagar,Kanpur', NULL, 'I&S', 'Reliance Digital'),
  ('3850302', 'Reliance Digital @ Manipal Road,Udapi', NULL, 'MMDI', 'Reliance Digital'),
  ('3950378', 'Reliance Digital @ Agartala Tripura', NULL, 'I&S', 'Reliance Digital'),
  ('3970015', 'Reliance Digital@ Basankari, Bengaluru', NULL, 'MMDI', 'Reliance Digital'),
  ('4001330', 'Reliance Digital @ Dumas Road, Surat', NULL, 'I&S', 'Reliance Digital'),
  ('4001332', 'Reliance Digital @ The Galleria Pune', NULL, 'I&S', 'Reliance Digital'),
  ('4021345', 'Reliance Digital @ Tambaram Chennai', NULL, 'MMDI', 'Reliance Digital'),
  ('4102019', 'Reliance Digital @ Govindapuri Road', NULL, 'I&S', 'Reliance Digital'),
  ('4291402', 'Reliance Digital @ Rajkumar Rd', NULL, 'MMDI', 'Reliance Digital'),
  ('503379', 'Reliance Digital @ Kormangala', NULL, 'MMDI', 'Reliance Digital'),
  ('555081', 'RELIANCE DIGITAL @ Kachiguda', NULL, 'MMDI', 'Reliance Digital'),
  ('612319', 'RELIANCE DIGITAL @ BULL TEMPLE ROAD', NULL, 'MMDI', 'Reliance Digital'),
  ('644125', 'RELIANCE DIGITAL @ SPARSH PLAZA, HINJEWADI', NULL, 'I&S', 'Reliance Digital'),
  ('731882', 'RELIANCE DIGITAL @ SUCHITRA JUNCTION', NULL, 'MMDI', 'Reliance Digital'),
  ('749317', 'RELIANCE DIGITAL @ GIP NOIDA', NULL, 'I&S', 'Reliance Digital'),
  ('823985', 'RELIANCE DIGITAL @ CHROMPETH CHENNAI', NULL, 'MMDI', 'Reliance Digital'),
  ('4243772', 'Tribe by Croma @ City Centre Mall', 'CROMA @ HQ', 'I&S', 'Temp Sites'),
  ('4332656', 'INSPIRE @ NEW MARKET', 'NGRT SYSTEMS PVT LTD', 'I&S', 'Temp Sites'),
  ('1008016', 'VIJAY SALES @ PANVEL', NULL, 'I&S', 'Vijay Sales'),
  ('2275385', 'VIJAY SALES @ MANJALPUR', NULL, 'I&S', 'Vijay Sales'),
  ('2275405', 'VIJAY SALES @ MEWLA, SECTOR 27', NULL, 'I&S', 'Vijay Sales'),
  ('3087693', 'VIJAY SALES @ ATTAPUR', NULL, 'MMDI', 'Vijay Sales'),
  ('3402971', 'VIJAY SALES @ DARYAGANJ', NULL, 'I&S', 'Vijay Sales'),
  ('3452803', 'VIJAY SALES @ NALLAKUNTA', NULL, 'MMDI', 'Vijay Sales'),
  ('3470938', 'VIJAY SALES @ NACHARAM', NULL, 'MMDI', 'Vijay Sales'),
  ('3509242', 'VIJAY SALES @ HAUZ KHAS', NULL, 'I&S', 'Vijay Sales'),
  ('3509243', 'VIJAY SALES @ VED ROAD', NULL, 'I&S', 'Vijay Sales'),
  ('3584809', 'VIJAY SALES @ BOPAL', NULL, 'I&S', 'Vijay Sales'),
  ('3584817', 'VIJAY SALES @ ADITYA NAGAR', NULL, 'MMDI', 'Vijay Sales'),
  ('3781923', 'VIJAY SALES @ LEELA MAHAL CIRCLE', NULL, 'MMDI', 'Vijay Sales'),
  ('3808666', 'VIJAY SALES @ BODUPPAL', NULL, 'MMDI', 'Vijay Sales'),
  ('3850310', 'VIJAY SALES @ NARELA', NULL, 'I&S', 'Vijay Sales'),
  ('3850311', 'VIJAY SALES @ NAJAFGARH', NULL, 'I&S', 'Vijay Sales'),
  ('405690', 'VIJAY SALES @ THE HUB', NULL, 'I&S', 'Vijay Sales'),
  ('405692', 'VIJAY SALES @ STATION ROAD', NULL, 'I&S', 'Vijay Sales'),
  ('412939', 'VIJAY SALES @ BORIVILI', NULL, 'I&S', 'Vijay Sales'),
  ('412942', 'VIJAY SALES @ GHATKOPAR', NULL, 'I&S', 'Vijay Sales'),
  ('412956', 'VIJAY SALES @ CHINCHWAD', NULL, 'I&S', 'Vijay Sales'),
  ('4140441', 'VIJAY SALES @ UTTAM NAGAR (NAWADA)', NULL, 'I&S', 'Vijay Sales'),
  ('4171792', 'VIJAY SALES @ BUDH VIHAR', NULL, 'I&S', 'Vijay Sales'),
  ('4338412', 'VIJAY SALES @ PARADISE', NULL, 'MMDI', 'Vijay Sales'),
  ('4338413', 'VIJAY SALES @ JUBILEE HILLS', NULL, 'MARCOM', 'Vijay Sales'),
  ('455062', 'VIJAY SALES @ VIKAS MARG', NULL, 'I&S', 'Vijay Sales'),
  ('1553403', 'BAJAJ ELECTRONICS- HANAMKONDA', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('1688617', 'BAJAJ @ NELLOREÔøΩ', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('1688620', 'BAJAJ @ VIJAYWADA ELLURU', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('2037526', 'BAJAJ @ DIAMOND PARK', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('2037528', 'Pai @ Electronic City', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'WC'),
  ('2082339', 'PAI INTERNATINAL @FRAZER TOWN - MBS/S', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'WC'),
  ('2150128', 'PAI INTERNATIONAL@INDIRANAGAR', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'WC'),
  ('2150129', 'PAI@BANASHANKARI', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'WC'),
  ('2150131', 'PAI@HRBR LAYOUT', 'PAI INTERNATIONAL ELECTRONICS LTD', 'I&S', 'WC'),
  ('2334602', 'BAJAJ ELECTRONICS @ NEW TOWN', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('2685018', 'BAJAJ ELECTRONICS@ ANANTHPOOR', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('3087876', 'PHONE WALE @ ASHRAM ROAD', 'PHONEWALE LIMITED', 'I&S', 'WC'),
  ('3087913', 'BAJAJ ELECTRONICS @SIDDIPET', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('3087914', 'BAJAJ ELECTRONICS @MANCHERIAL', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('3402956', 'BAJAJ ELECTRONICS @ LB NAGAR WARANGAL', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('3402959', 'BAJAJ ELECTRONICS @ SUBHASH RD NALGONDA', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('3402960', 'BAJAJ ELECTRONICS @ SURYAPET', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('3471204', 'POOJARA @ PREMIUM', 'POOJARA TELECOM PVT LTD', 'I&S', 'WC'),
  ('3471239', 'PAI INTERNATIONAL@RAJAJINAGAR - MBS', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'WC'),
  ('3471243', 'PAI INTERNATIONAL@AS RAO NAGAR - MBS', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'WC'),
  ('3487894', 'BAJAJ ELECTRONICS @ SANGAREDDY', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('3509082', 'PAI INERNATIONAL @DAVANAGERE - MBS', 'PAI INTERNATIONAL ELECTRONICS LTD', 'MMDI', 'WC'),
  ('3529775', 'BAJAJ ELECTRONICS @ PUNJABI BAGH', 'ELECTRONICS MART INDIA LIMITED', 'I&S', 'WC'),
  ('3565740', 'BAJAJ ELECTRONICS @ SECTOR-18', 'ELECTRONICS MART INDIA LIMITED', 'I&S', 'WC'),
  ('3565744', 'BAJAJ ELECTRONICS @ INDIRAPURAM', 'ELECTRONICS MART INDIA LIMITED', 'I&S', 'WC'),
  ('3680021', 'BAJAJ ELECTRONICS @ RAJOURI GARDEN', 'ELECTRONICS MART INDIA LIMITED', 'I&S', 'WC'),
  ('3766506', 'BAJAJ ELECTRONICS @ FARIDABAD', 'ELECTRONICS MART INDIA LIMITED', 'I&S', 'WC'),
  ('3951249', 'BAJAJ ELECTRONICS @ GUNTUR - 3', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('4137202', 'PHONE WALE @ BODAKDEV', 'PHONEWALE LIMITED', 'I&S', 'WC'),
  ('4151720', 'Bajaj Electronics @ ROHINI', 'ELECTRONICS MART INDIA LIMITED', 'I&S', 'WC'),
  ('4151729', 'Bajaj Electronics @ ONGOLE', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('4151731', 'BAJAJ ELECTRONICS @ SRIKAKULAM', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('4182139', 'BAJAJ ELECTRONICS - KADAPA2', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC'),
  ('4192177', 'Bajaj Electronics @ RDC', 'ELECTRONICS MART INDIA LIMITED', 'I&S', 'WC'),
  ('4424758', 'BAJAJ ELECTRONICS @ TADIPATRI', 'ELECTRONICS MART INDIA LIMITED', 'MMDI', 'WC');

-- ============================================================
-- STEP 2 -- fill hq_partner, matched by sfo_id. Only overwrites a NULL
-- hq_partner on the lfg_sites side (never clobbers a value someone
-- already entered by hand since the last import) -- re-running this
-- script is safe.
-- ============================================================

update public.lfg_sites s
set hq_partner = i.hq_partner
from public._fall_lfg_import i
where s.sfo_id = i.sfo_id
  and s.hq_partner is null
  and i.hq_partner is not null;

-- ============================================================
-- STEP 3 -- fill partner_id (the Execution Partner), matched by sfo_id,
-- only where lfg_sites.partner_id is currently NULL. installation_team
-- values are normalized (spaces stripped, "&" -> "and", lowercased) on
-- both sides so "I&S" / "I & S" / "IandS" all match the same
-- lfg_partners row regardless of which exact spelling is on file.
--
-- A handful of spreadsheet rows have neither "MMDI" nor an I&S-shaped
-- value in Installation Team (e.g. one row says "MARCOM") -- those
-- simply won't match any lfg_partners.name and are silently skipped
-- here, not force-fit to the wrong partner.
-- ============================================================

update public.lfg_sites s
set partner_id = p.id
from public._fall_lfg_import i
join public.lfg_partners p
  on lower(replace(replace(p.name, ' ', ''), '&', 'and'))
   = lower(replace(replace(i.installation_team, ' ', ''), '&', 'and'))
where s.sfo_id = i.sfo_id
  and s.partner_id is null;

-- ============================================================
-- STEP 4 -- diagnostics. Three separate lists, run these after the
-- updates above to see what's still missing:
-- ============================================================

-- (a) Spreadsheet sites with NO matching lfg_sites row at all, by SFO
--     ID -- these exist in Srinivas's tracker but not yet in LFG
--     Connect. If a site is missing from LFG Connect entirely, it needs
--     to be created (New Site / New Store), not just backfilled.
select i.sfo_id, i.store_name, i.hq_partner, i.installation_team, i.source_sheet
from public._fall_lfg_import i
left join public.lfg_sites s on s.sfo_id = i.sfo_id
where s.id is null
order by i.source_sheet, i.store_name;

-- (b) Sites that DID match by SFO ID, but the spreadsheet's own HQ
--     Partner cell for that row wasn't a real company name (it had
--     junk like "Multi AAR"/"White"/"W/W+"/"Apple Shop 3.0" instead --
--     that's what's actually in those Vijay Sales/Reliance
--     Digital/Croma sheet cells, not an extraction bug). hq_partner is
--     still null for these; the real value has to come from Srinivas
--     directly, this script can't guess it.
select s.id, s.site_id, s.sfo_id, s.outlet_name, s.format
from public.lfg_sites s
join public._fall_lfg_import i on i.sfo_id = s.sfo_id
where s.hq_partner is null
order by s.sfo_id;

drop table if exists public._fall_lfg_import;

-- (c) lfg_sites rows with NO sfo_id at all -- can't be matched against
--     the spreadsheet by this script (it only matches on SFO ID, on
--     purpose, to avoid guessing off free-text store names). These need
--     a manual look -- cross-reference by outlet name/city against the
--     spreadsheet, or ask whoever surveyed the site for its real SFO
--     ID.
select id, site_id, outlet_name, city, format, program_id, store_id
from public.lfg_sites
where sfo_id is null
order by outlet_name;
