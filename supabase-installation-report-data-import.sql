-- MMDI ONE — Installation Report master data import
-- Generated from "Apple LFG Sites Data sheet with prices.xlsx" (5 sheets, 184 site rows,
-- deduplicated down to 154 unique stores by SFO ID — see Apple_LFG_Sites_Cleaned.xlsx's
-- "Duplicates Removed" tab for exactly what was dropped and why).
--
-- Run this AFTER supabase-installation-report-master-migration.sql (needs the tables and
-- unique indexes it creates). Safe to re-run — every insert is ON CONFLICT DO NOTHING, so
-- running this twice (or after you've already added some records by hand) won't duplicate
-- anything or overwrite edits you've since made in Manage Master Data.

-- ============================================================
-- STEP 1 — unique indexes needed for ON CONFLICT (idempotent)
-- ============================================================

create unique index if not exists installation_report_stores_sfo_id_uidx
  on public.installation_report_stores (sfo_id)
  where sfo_id is not null and sfo_id <> '';

create unique index if not exists installation_report_teams_name_uidx
  on public.installation_report_teams (name);

-- ============================================================
-- STEP 2 — Store Master (154 stores)
-- ============================================================

insert into public.installation_report_stores (store_name, address, sfo_id, program, campaign, active) values
  ('Aptronix - Phoenix Mall - Chennai', '16, Ground Floor, Phoenix Market City Mall, Velachery Rd, Velachery, Chennai, Tamil Nadu 600042', '3901876', 'APP', '', true),
  ('Aptronix @ Ambattur', 'Plot Nos. E, F1 & F2, Door No. 428/B1, C.T.H. Road, Ambattur, Chennai - 600053', '1784220', 'Mono AAR', '', true),
  ('Aptronix @ BAJI JUNCTION NAD Gopalapatnam', 'D. No: 1, 114, Baji Junction, beside KFC, Nad Junction, Gopalapatnam, Dungalavanipalem, Visakhapatnam, Andhra Pradesh 530027', '4044737', 'Mono AAR', '', true),
  ('Aptronix @ M.G. Road', 'Door No:39-1-50&52/1,opp Malabar Gold, M.G. Road,Vijayawada,A.P. VIJAYAWADA 520010', '1606231', 'APR', '', true),
  ('Aptronix @ Madurawada', '4-25/5/3, Chandu Central, Ground Floor, (Besides Cell Point) Chandrapalem, Madhurawada, Visakhapatnam- 530048, Andhra Pradesh I Cell: 076800 72135', '4038163', 'Mono AAR', '', true),
  ('APTRONIX @ MAIN ROAD, KAKINADA', 'Aptronix Kakinda, Kakinada, Surya Rao Peta, Kakinada, Andhra Pradesh 533001', '1696992', 'Mono AAR', '', true),
  ('Aptronix @ MG Road Kochi', 'Plot#628/2, Theatre, 628/3, Mahatma Gandhi Rd, opp. Shenoys, Shenoys Junction, Shenoys, Kochi, Kerala 682035', '3677889', 'Mono AAR', '', true),
  ('Aptronix @ Sunview, Ludhiana, Punjab', 'Aptronix, Sunview | Ground Floor & First Floor, S.C.O NO. 49, Sunview Plaza, Village- Ayali Kalan, Ludhiana, Punjab, India - 142027', '4106601', 'Mono AAR', '', true),
  ('Aptronix @ Vijaynagar', '#1737/37, MRCR LAYOUT, SERVICE RD, VIJAYANAGAR, BENGALURU - 560040', '1696991', 'Mono AAR', '', true),
  ('Aptronix Begumpet', 'Guldarsingh, No. 6-3-1192/13, Ground Floor, White House, Begumpet, Hyderabad - 500016', '544958', 'APR', '', true),
  ('Aptronix@ Abids', 'Door No: 5-9-190,Shop No.1 & 1B,Methodist Complex,Abids,Hyderabad,Telanaga HYDERABAD 500001', '1710313', 'APR', '', true),
  ('Cell world', 'Shop No: 52 Mehroli Road, DLF Colony, Sector 14, Gurugram, Haryana 122001', '984562', 'Multi AAR', '', true),
  ('Future world @ Global Foyer, Palam- Gurgaon', 'FUTURE WORLD RETAIL PVT. LTD. GF-02, Ground Floor, Global Foyer Mall, Sector-1, H-Block, Palam Vihar, Gurugram, Haryana-122017', '3677885', 'Mono AAR', '', true),
  ('FUTURE WORLD @ MOHALI', 'V R Punjab Mall , Shop No- G 34, NH – 21, Mohali Kharar Road, Mohali , Punjab MOHALI 140307', '2010319', 'APR', '', true),
  ('Future_World_Adyar', 'Future World, 7, 2, Kasturba Nagar 3rd Cross Street, Adyar, Chennai 600020', '727945', 'APR', '', true),
  ('Futureworld @ Kurukshetra', 'Shop # G-22 & G-25, GF, Kessel mall, Sec 17, Urban estate- Kurukshetra, Haryana- 136118Mr. Anand- +91 8700415304', '3480701', 'Mono AAR', '', true),
  ('iAspire - Vinayak Mall - Varanasi', 'C 30/36, SHOP NO.2, GF, VINAYAK PLAZA, MALDHIYA COMPLEX, VARANASI - 221010', '1565576', 'Mono AAR', '', true),
  ('iAvenue @ VIP_Road', 'iAvenue VIP Road, 48, Ground Floor, Four Point, Opp. C.B.Patel Health Club, B/S Maniba Party Plot, VIP Road, Vesu, SURAT - 395007', '1697008', 'Mono AAR', '', true),
  ('iCentral @ Forum Mall', 'UGF-20 , FORUM CENTRAL CITY MALL, PLOT 8, OLD NO-5 ,NEW HYDRALI ROAD , MYSORE, 570010', '1710356', 'Mono AAR', '', true),
  ('iCentral @ Gulbarga', 'Plot No. 63, Ground Floor, Super Market, Kalaburagi, Karnataka 585101', '3730068', 'Mono AAR', '', true),
  ('ICONCEPT @ METROPOLIS MALL, HISSAR, HARYANA', 'iConcept GF-6 , METROPOLIS MALL, Delhi Rd, Hisar, Haryana 125001', '1533301', 'Mono AAR', '', true),
  ('ICONCEPT @ SUTHERI ROAD, HOSHIARPUR, PUNJAB', 'iConcept HB 249, Sutheri Road, Hoshiarpur, Punjab- 146001', '3638797', 'Mono AAR', '', true),
  ('iCorner - Shivamogga', '1, 2260, Kuvempu Rd, Mission Compound, Shivamogga, Karnataka 577201', '1657381', 'Mono AAR', '', true),
  ('iCrest @ DD Puram- Bareilly', 'DD puram,selection point chauraha,opp gangour sweets, beside LIC OFFICE, Bareilly, Uttar Pradesh 243001', '3103405', 'Mono AAR', '', true),
  ('iCrest @ Gandhi Nagar', 'Kalidasa Mark, Ganesh Kripa, No 24, Kalidasa Marg, Gandhi Nagar, Bengaluru, Karnataka 560009', '1697001', 'Mono AAR', '', true),
  ('ICREST @ NIT Faridabad', '5 E-22 B.P, BK Chowk, New Industrial, Town, Faridabad, Haryana 121001', '1735046', 'Mono AAR', '', true),
  ('iCrest @ Rudrapur', 'Metropolis City, Kalyanpur, Uttarakhand 263153', '1533290', 'Mono AAR', '', true),
  ('iDestiny - Avani Mall', 'SH #50,51,52, AVANI RIVERSIDE MALL, 32, JAGAT BANERJEE GHAT ROAD, Howrah - 711102', '2370346', 'Mono AAR', '', true),
  ('IDESTINY @ Gangtok', 'NH-10, (OPP-Hotel Hungry Jack) Gangtok, Sikkim-737101', '3781908', 'Mono AAR', '', true),
  ('iDestiny @ Monal Tower- Guwahati', 'Monal Tower, OPP Assam State Secretariat, Near SBI, GS Road, Dispur, Guwahati, Assam 781006Rajorshree- 9874615289', '3385941', 'Mono AAR', '', true),
  ('Imagine , Bhartiya City', 'Imagine Bhartiya Mall bangalore Thanisandra main road bangalore - 560064, Santosh SM - 8008801851', '3579615', 'APR', '', true),
  ('imagine @ Ashok nagar , Udaipur', 'Ground Floor, Shop No- 1, Shree Kanhaiya Tower, 5-ABC, Ashok Nagar Main Road, Naresh Kalal, Mahavir Colony, Udaipur, Rajasthan-313001', '4064149', 'Mono AAR', '', true),
  ('Imagine @ Civil Lines, Jhansi', 'Store address and contact details : Tresor systems Pvt. Ltd. 136/1, Aside pizza hut Shivpuri road, Civil Lines, Jhansi (U.P.) Pin code- 284001. Arco Chatterjee- 9425711569', '3746352', 'Mono AAR', '', true),
  ('IMAGINE @ CULLEN ROAD, Alleppy', 'iMagine - Allepey, No24/366-C, G Square, Cullen Road, Alapuzha, Kerala - 688012', '4057046', 'Mono AAR', '', true),
  ('imagine @ Firozpur', 'GF, 1208/2, Beside Jockey exclusive, malwal road, Near LIC Building Firozpur- 152002', '3973670', 'Mono AAR', '', true),
  ('iMagine @ Hewett Road, Prayagraj', 'Imagine | Hewett Road - 141A/125B, Beside Reliance Digital, Hewett Road, Prayagraj-211003', '4064148', 'Mono AAR', '', true),
  ('iMagine @ Hissar', 'Tresor systems pvt. Ltd., Ground floor, RG tower Plot no.-4, camp chowk, Delhi road- Hissar- 125001', '3970650', 'Mono AAR', '', true),
  ('Imagine @ Iris Broadway', 'G-119, G-126 & 127, GF. IRIS Broadway, Block- A, Sec. 85- Gurgaon - 122004Mr.', '3546076', 'Mono AAR', '', true),
  ('iMagine @ Jalandhar Road, Batala', 'Imagine @ Batala | 24/500, Jalandhar Road, Near IDBI Bank, Shastri Nagar, Batala, Punjab- 143505', '4094042', 'Mono AAR', '', true),
  ('iMagine @ KNS Tower', 'Unit No - 3 & 4, Ground Floor, K.N.S Tower, Shankara Puram, Ward No. 18, Tumkur, Karnataka- 572101', '4036335', 'Mono AAR', '', true),
  ('iMagine @ Kota', 'Imagine store- Jadiya Complex, 151-Vallabh-Bari, Kotri Rd, Gumanpura, Kota - 324007', '4001405', 'Mono AAR', '', true),
  ('iMagine @ Mall road, Amritsar', 'Shop No. 41/A The Mall Road, Opp. Govt. girls school- Amritsar- 143001', '3477115', 'Mono AAR', '', true),
  ('Imagine @ Mall Road, Bhatinda', 'Ground Floor, The, MCB-2033A, Mall Road, Dhobi Bazar, Old City, Bathinda, Punjab 151001', '4034663', 'Mono AAR', '', true),
  ('IMAGINE @ Mantri Square - Bengaluru', 'LG 21 Mantri Square, Sampige Rd, Malleswaram, Bengaluru, Karnataka 560003 Phone Number - 080 4699 9888', '435047', 'Mono AAR', '', true),
  ('iMagine @ Nexus Whitefield (The Forum Neighbourhood Mall)', 'No.62, ITPL Main Rd, Whitefield, Prestige Ozone, Bengaluru, Karnataka 560066', '4057048', 'Mono AAR', '', true),
  ('imagine @ Pratap road- Moga', '183, Pratap Road Moga Punjab - 142001', '3608643', 'Mono AAR', '', true),
  ('iMagine @ Rani Bazar', 'Imagine Store- Shop No- 15,16,17, Silver Square, opposite Income Tax Office, Rani Bazar, Bikaner, Rajasthan 334001', '3970649', 'Mono AAR', '', true),
  ('iMagine @ Residency Road, Jammu', 'Krishna kumari & sons, GF, Virmarg, Opp. Hotel Premier Regency, Residency Road, Jammu 180001 (J&K)', '4034662', 'Mono AAR', '', true),
  ('iMagine @ Ridhi Sidhi', 'Shop No- 22, Ridhi Sidhi Outlets, Ridhi Sidhi Enclave, Hanumangarh Road, Sri GangaNagar 335001 (Raj.)', '4001404', 'Mono AAR', '', true),
  ('iMagine @ Salt Lake, Sec-5, Kolkata', 'Sugam Business Park, Ground Floor, EP & GP block, sector - V, Bidhannagar, Kolkata 700091, West Bengal', '3952297', 'Mono AAR', '', true),
  ('iMagine @ Sangwan chowk- Sirsa', 'Sri Gian Arcade, Circular Road, Sangwan Chowk, Dabwali Road, Sirsa 122055', '3672236', 'Mono AAR', '', true),
  ('iMagine @ Station Road, Sikar', 'Imagine 22, G1-G2, Ground Floor, City Center Mall, Station Road, Sikar, Rajasthan 332001', '4034664', 'Mono AAR', '', true),
  ('iMagine @ Udupi', '8QW6+M9M, The Mirage Shop, No 4, Ground Floor, Udupi-Manipal Hwy, Kunjibettu, Udupi, Karnataka 576102', '1710849', 'Mono AAR', '', true),
  ('iMagine @ Vidhya Nagar, Jaipur', 'Imagine @ Vidhya Nagar, Rajasthan Ground Floor, Shop No- 45-46-47, Plot No A-5, Central Spine, Cross Road Mall, Vidyadhar Nagar, Jaipur-302039', '4094043', 'Mono AAR', '', true),
  ('iMagine @ World_Trade_Park', '211A, Second Floor, South Block, WORLD TRADE PARK, MALVIYA NAGAR, JAIPUR 302017', '820439', 'APR', '', true),
  ('Imagine @Thrissur', 'Ground Floor, Nethaji Rd, Vivekananda Garden, West Fort, Vonginisserly, Aranattukara, Thrissur, Kerala 680004', '3844809', 'Mono AAR', '', true),
  ('iMagine HSR Layout', 'NO.436, B.J ARCADE, 27TH MAIN 1ST SECTOR, HSR LAYOUT, BENGALURU - 560100 BENGALURU 560100', '1997364', 'APR', '', true),
  ('iMagine_iDeation - Kollam', 'Abhijith / 984669844, Olayil, High School Jun, Kollam, Kerala 691009', '1635602', 'Mono AAR', '', true),
  ('Impulse @ Badnera Road', 'Shri Krishna Radha Apartment, Badnera road, Opposite Dasara Maidan, Amravati, Maharashtra 444601', '3471943', 'Mono AAR', '', true),
  ('IMPULSE @ CENTRAL AVENUE', 'Impulse Nagpur @ Central Avenue, Azamshah Square 51 Azamshah Square Road Opp Hotel Al-ZAM ZAM, Maharashtra 440002', '1346259', 'Mono AAR', '', true),
  ('INEXT @ ASTRON CHOWK', 'Divyang Infocare - iBiz, 25, New Jaganath Main Road, Opp. Dr. Koshiya Hospital, Nr. Astron Circle, Rajkot - 360001', '1341397', 'Mono AAR', '', true),
  ('iNext @ Bittan Market', 'Shop No. G7 & G8- Ajay tower, bitten market- Bhopal- 462016 Contact No- 98261 67979', '3334451', 'Mono AAR', '', true),
  ('INEXT @ G T ROAD, Ghaziabad', '176- 3A, Model town, GT Road, Ghaziabad, UP', '1588150', 'Mono AAR', '', true),
  ('iNspire - Akola', 'Shop No 1 & 2 Shakambari Square, Durga Chowk, Tapadiya Nagar Road, Akola ,444001 Site Survey completed by: I&S Communique Pvt. Ltd. Site', '3966945', 'Mono AAR', '', true),
  ('iNspire @ Chandrapur', 'Shop No 1,2 & 3 Swastik Complex, Near District Library, Kasturba Road, Hospital ward, Chandrapur, 442402', '4014182', 'Mono AAR', '', true),
  ('Inspire @ Jalgaon', 'Shop # 14 Nayantara arcade, Pimprala road, Pratap nagar, Jalgaon- 425001', '3966944', 'Mono AAR', '', true),
  ('iNspire @ Makroniya Sagar', 'Inspire N.S Avenue, Ram Lala Ward no. 07, Jabalpur Road, Makroniya, Sagar- 470004 Madhya Pradesh', '4341261', 'Mono AAR', '', true),
  ('iNSPiRE @ Nagpur - Maharashtra', 'NGRT Systems Pvt. Ltd., Plot No. 72, Opposite Shankar Nagar Garden, West High Court Road, Shankar Nagar, Nagpur-10', '2067885', 'Mono AAR', '', true),
  ('iNspire @ New Market', 'Address: Shop No C-018, Ground Floor, Block-C, Building No. 03, Shrishti CBD,GAMMON Mall, South T T Nagar, Distirct: Bhopal Madhya Pradesh. pin-462003', '4332656', 'Mono AAR', '', true),
  ('Inspire @ Vidya nagar', 'Address: Shop No : 121 & 129 Sector-B Vidya Nagar Opp. Barkatullah University Hoshangabad Road Bhopal - 462026', '3598599', 'Mono AAR', '', true),
  ('iNvent @ Faridabad', 'UNIT NO. 43, OMAXE WORLD STREET, FARIDABAD 121006, Haryana 121006 Mr. Vinay- 9717246253', '3419538', 'Mono AAR', '', true),
  ('INVENT @ GANDHI BAZAR', 'No.99, Dr Dvg Road, Basavanagudi, Opposite To PAI', '1589432', 'Mono AAR', '', true),
  ('INVENT @ IHC', '"iNvent ( P3S Ventures) Shop No. 340, 341, IHC, Plot No.16, Ahinsa Khand - 1, Indrapuram, Ghazibad (U.P.)"', '1639359', 'APR', '', true),
  ('iPlanet - Vellore', 'Old No 18B, New No 71 Anna Salai, Thiyagarajapuram Rd, Vellore, TamilNadu 632001', '3966947', 'Mono AAR', '', true),
  ('IPLANET @ 100 FEET ROAD COIMBATORE', 'sanguman 140, Dr Rajendra Prasad Rd, Gandhipuram, Coimbatore, Tamil Nadu 641012', '1341386', 'Mono AAR', '', true),
  ('iPlanet @ Avadi', 'iPlanet - Avadi - Ground Floor, No.1/PC - 1 TNHB, Avadi, Chennai - 600054 | Prasath - +91 99524 86391', '4151243', 'Mono AAR', '', true),
  ('iPlanet @ Avinashi_Road', '427, Near Pushpa Theatre Bus Stand, Avinashi-Tiruppur Road', '1341385', 'Mono AAR', '', true),
  ('iPlanet @ Bhanshankari', 'No-24,G.R. Pristine,80ft Road,4th Block Opp,Kathriguppe BigBazaar, 3rd phase,Banashankari,Bangalore-560085.', '1300789', 'APR', '', true),
  ('iPlanet @ ByPass', 'Ponmeni, By Passroad, Madurai.', '1110206', 'Mono AAR', '', true),
  ('iPlanet @ Kajas Road, Palakkad', 'Mr. Prasath - +91 99524 86391iPlanet - Palakkad - Door No 23/596/3, Kajas Building, Stadium Bypass Road, Palakkad - 678001 Opposite KFC', '4041814', 'Mono AAR', '', true),
  ('iPlanet @ Kammanahalli', '218, SunShine complex, HRBR layout 3rd Block, Kammanahalli, 4th B Main Rd, Kalyan Nagar, Bengaluru, Karnataka 560043', '3035986', 'Mono AAR', '', true),
  ('iPlanet @ Kothagudem', 'iPlanet -Kothagudem,No. 6-12-27 & 28, M G Road, Kothagudem, Telangana - 507101', '4227980', 'Mono AAR', '', true),
  ('iPlanet @ Kottayam- Kerala', 'HGRF+MRX, Lal Bahadur Shastri Rd, beside Khadi, Kottayam, Kerala 686001', '3637782', 'Mono AAR', '', true),
  ('IPLANET @ KP ROAD NAGARCOIL', 'iPlanet, Mathias Nager, 342/1, Kottar-Parvathipuram Rd, Nagercoil, Tamil Nadu', '4041811', 'Mono AAR', '', true),
  ('iPlanet @ Madurai', '80 Feet Rd, Vaigai Colony, Sathamangalam, Anna Nagar, Madurai', '3994349', 'Mono AAR', '', true),
  ('iPlanet @ Mancherial', 'iPlanet - Mancherial, No.22-69, Hyderabad - Godavarikhani, Hyderabad - Mancherial Hwy, Srisri Nagar, Mancherial, Telangana - 504 302| Prasath - +91 99524 86391', '4227978', 'Mono AAR', '', true),
  ('iPlanet @ Miryalguda', 'iPlanet - Miryalaguda, H No.18-1638, Opp GV Mall Sagar Road, Hanumanpeta, Miryalaguda, Nalgonda District, Telangana - 508 207 | Prasath - +91 99524 86391', '4227979', 'Mono AAR', '', true),
  ('Iplanet @ Mugappair', '3/PC-5A, Kambar, Bharathi Salai, Mogappair West, Mogappair, Chennai, Tamil Nadu - 600037', '3458714', 'Mono AAR', '', true),
  ('iPlanet @ Nalgonda', 'iPlanet - GF- 6-2-562, Hotel Siddhartha complex, Hyderabad road, Nalgonda- 508001', '4357051', 'Mono AAR', '', true),
  ('iPlanet @ New Bus Stand Road Salem', '4/2, NEW BUS STAND ROAD', '1531166', 'Mono AAR', '', true),
  ('iPlanet @ Ongole', 'Ravi Complex Revenue Ward, No 37/1/347, Trunk Rd, beside The AXIS Bank, Gadiyaram Vari Veedhi, Bandla Metla, Ongole, Andhra Pradesh 523001, 75488 18769', '4206435', 'Mono AAR', '', true),
  ('iPlanet @ Sahakarnagar', 'iPlanet - No.510, F-Block, Sahakarnagar, Bangalore', '4138055', 'Mono AAR', '', true),
  ('iPlanet @ Selaiyur', '763, Velachery Main Rd, Rajeshwari Nagar, Tambaram,600073.', '1635604', 'Mono AAR', '', true),
  ('iPlanet @ Sharada College Road,', 'iPlanet - No.160, Saradha College Main Road, Fairlands, Salem, Tamil Nadu - 636 016.', '4227977', 'Mono AAR', '', true),
  ('iPlanet @ Simakkal', 'Bus stop, 182-D, N Veli St, near Titan signal Madurai Bazzar, next to Simakkal, Madurai Main, Madurai, Tamil Nadu 625001', '1341387', 'Mono AAR', '', true),
  ('iPlanet @ Thoothukudi', 'D, Ground Floor, No 21, West Great Cotton Road, opposite Thangamayil Jewellery, Shanmugapuram, Thoothukudi, Tamil Nadu 628002, 75488 18769', '4227976', 'Mono AAR', '', true),
  ('iPlanet @ Trichy Road, Coimbatore', 'iPlanet - Trichy Road - No 1045/1051,Puliyakulam, Ramanathapuram, Trichy Road, Coimbatore', '4041810', 'Mono AAR', '', true),
  ('iPlanet @ Trivandrum', 'Salem-Kanyakumari Highway, Puthenchanthai, Pulimoodu,Thiruvananthapuram, Kerala, 695001', '4007522', 'Mono AAR', '', true),
  ('iPlanet @ Villianur Road, Reddiyarpalayam, Pondicherry', '73850007 I iTech @ Ranchi, House no.993 Near Rock Garden, Kanke Road, Ranchi, Jharkhand, India, 834008', '4206346', 'Mono AAR', '', true),
  ('iPlanet @ Vytila - Kochi', 'iPlanet Vyttila, 54/416-A, Sahodaran Aiyaappan (SA) Road, Elamkulam Village, Kochi, Kerala. 682020, 73977 24507', '3579614', 'Mono AAR', '', true),
  ('iPlanet_Pondy_Bazaar', 'Shop No 53, Thiyagaraya Road, Pondy Bazaar, Chennai, Tamil Nadu 600017 I 086959 66966.', '3219448', 'APR', '', true),
  ('iStation @ Kompally', 'Beside Balaji Hospital, NCL enclave, Opp JJ Garden, Kompally', '1697010', 'Mono AAR', '', true),
  ('iStation @ Nellore', 'Plot no 218, Adjacent to NTR Park, Mini By Pass Road, Nellore - 524003, Andhra Pradesh. PH: No 91213 49456, nellore@istation.co.in', '3604316', 'Mono AAR', '', true),
  ('iStation Madinaguda', '108, NH65, Mythri Nagar, Widia Colony, Miyapur, Hyderabad', '1656917', 'Mono AAR', '', true),
  ('iTech - Kankurgachi', 'P124, CIT ROAD, SCHEME VIM, OPP TANISHQ, KANKURGACHI, KOLKATA - 700054', '1710842', 'Mono AAR', '', true),
  ('iTech @ Benetton, Itanagar', 'I iTech @ BENETTON, Tayeng Building, Sector-E, Opposite-BB Plaza, Ground Floor, Near Sport Station, Itanagar - 791111', '4013982', 'Mono AAR', '', true),
  ('iTech @ Dack Bunglow Road, Patna', 'iTech @ Ground Floor, Raj Complex, New Dark Bunglow Road, Opp.: Jamal Road, Patna - 800001', '1710843', 'Mono AAR', '', true),
  ('iTech @ Kanke Road, Ranchi', '73850007 I iTech @ Ranchi, House no.993 Near Rock Garden, Kanke Road, Ranchi, Jharkhand, India, 834008', '4006988', 'Mono AAR', '', true),
  ('iTech @ New Alipore', '33, Bankim Mukherjee Road, New Alipore, Kolkata - 700053 Landmark - Next to Kotak Mahindra Bank Alipore Branch', '3720508', 'Mono AAR', '', true),
  ('iTech @ Rourkela - Odisha', 'SHOP NO. 09, FORUM GALLERIA MALL, ROURKELA, ORRISA, 769004. Udit Dokania - 7797777077', '3593480', 'Mono AAR', '', true),
  ('iTech @ SECTOR 6, Cuttack', 'Plot No B, 1372, CDA Sector VI, Cuttack, Odisha 753015 Mr Nirmal- +91 70089 58500', '3565782', 'Mono AAR', '', true),
  ('ITECH @ SILPUKHRI, GUWAHATI', 'iTech @ Guwahati- GROUND FLOOR, GAURAV TOWER , GNB ROAD, KRISHNA NAGAR, CHANDMARI, GUWAHATI - 781003', '4006989', 'Mono AAR', '', true),
  ('iTech @ Tezpur', 'iTech @ Tezpur, Civil Hospital Road, near Tanisha, Mahabhairab, Tezpur, Assam 784001', '4006990', 'Mono AAR', '', true),
  ('iTech @ Tollygunj', '22,NSC Bose road, tollygunj, kolkata -700040, Mr Gaurav : 6290232396', '3766657', 'Mono AAR', '', true),
  ('iTech_Muzaffarpur', 'I Ground 0, Apsara Business Centre, Zila School Road, Heath Chowk, Muzaffarpur, Bihar 842002', '4081607', 'Mono AAR', '', true),
  ('iTree @ Banashankari', '#137/138, 2nd Main Road , Water Tank Road,BSK 3rd Stage, 3rd Phase, 4th Block, Bengaluru, Karnataka 560085', '1565561', 'Multi AAR', '', true),
  ('iTronics @ Manninagar', 'SHIV DEEP, Opp. Monginis, Maninagar Cross Roads, Nr Dena Bank, Nr MANIKERNESHWAR MAHADEV, Maninagar', '1661448', 'Mono AAR', '', true),
  ('iVenus @ Pimpri Chinchwad', 'Shop no 1/2/3 Vasant Center, Mahavir Chouk, Pune Mumbai highway Opp Bharat Petroleum petrol Pump, Near Chinchwad station, Chinchwad, Pune 411018', '3471560', 'APR', '', true),
  ('iVenus @ SHRADDHA MALL', 'Shop no-G1,Shraddha Mall,Nr.BYK College, College Road, Nashik-422005 NASHIK 422005', '825652', 'APR', '', true),
  ('L LOUNGE @ CITY CENTRE MALL 2', 'Salt Lake, City Centre-1, Salt Lake, Sec-1, E- Block, Shop No.- E106, Near KFC, Kolkata - 700064', '1635603', 'Mono AAR', '', true),
  ('Maple X @ Kemps Corner, Mumbai', 'Maple X Store | Ground Floor, Part 2, Central store, 13, N S Patkar Marg, Babulnath, Kemps Corner, Tardeo, Mumbai, Maharashtra 400007', '4151858', 'Mono AAR', '', true),
  ('Maple X Balmatta', 'Saldhana Providence, Balmatta Road, Mangaluru, Karnataka 575001', '1551107', 'Mono AAR', '', true),
  ('Pai International - Jayanagar', '# 25, 100 Feet Rd, opposite Rani Sarala Devi School, 2nd Block, Jaya Nagar East, Jayanagar, Bengaluru, Karnataka 560011', '2150126', 'Multi AAR', '', true),
  ('Pai International - Marathali', '88, Outer Ring Road Munnekolla, Marathahalli, Bengaluru, Karnataka 560037', '1603819', 'Multi AAR', '', true),
  ('Pai international - RT Nagar', 'No.493, CBI Road Corner, near HMT Ground, Gangenahalli, RT Nagar, Bengaluru, Karnataka 560032', '2150127', 'Multi AAR', '', true),
  ('Pluton @ Bhatinda', 'SCO 70, ROSE GARDEN COMPEX, OPP. KAPSONS NEAR MITTAL MALL', '1676390', 'Mono AAR', '', true),
  ('Radiant @ City Centre Mall- Pathankot', '1, Ground Floor, City Centre Mall, Dalhousie Road, Pathankot, Punjab 14500', '1635608', 'Mono AAR', '', true),
  ('Spice communication', 'Spice communication, shop no -81, sector 14 Hudda market,next to Om sweet, Gurgaon, Haryana 122002', '1721272', 'Multi AAR', '', true),
  ('Spice communication II Sec 14', 'Spice communication, shop no -116, sector 14 Hudda market,next to Apollo pharmacy , Gurgaon, Haryana 122002', '1721270', 'Multi AAR', '', true),
  ('Tech Next @ Geeta Colony - New Delhi', '7/184, Near 7 Block Gurdwara, Geeta Colony, New Delhi-110031', '3677890', 'Mono AAR', '', true),
  ('Tribe @ Diwas Madhya Pradesh', 'Ground Floor, Tairani Colony, Agroha Nagar, Hate Singh Goyal Colony, Dewas, Madhya Pradesh 455001', '4033645', 'Mono AAR', '', true),
  ('Tribe by Croma @ City Centre Mall', '88, Outer Ring Road Munnekolla, Marathahalli, Bengaluru, Karnataka 560037', '4243772', 'APR', '', true),
  ('Tribe by Croma @ Erode', 'Shop No. 139/1 , New Survey number 89/1 & 89/2 , Old survey number 1331, Perundurai Rd, Maruthi Nagar, Erode, Tamil Nadu 638011, Partner Contact : 6366569648', '4049085', 'Mono AAR', '', true),
  ('Tribe by Croma @ Palanpur', 'Unit no 13, Ground floor, S9 Imperial, Opp Bihari Bag, near S9 commercial complex, Parpada Road Corner, Abu Road Highway, Palanpur - 385001', '4049086', 'Mono AAR', '', true),
  ('Underground - Jalandhar', '375 L Model Town near bata showroom, Jalandhar- 144001', '1528172', 'Multi AAR', '', true),
  ('Unicorn @ Agra', '17A, Taj road, Sadar Bazar, Agra- U.P. 282001', '3947316', 'Mono AAR', '', true),
  ('Unicorn @ Ahmedabad OneMall', 'Ahmedabad One Mall, Vatrapur.', '3203628', 'APR', '', true),
  ('Unicorn @ Airia mall- Gurgaon', 'Unicorn @ Airia mall, GF-22, Sohna road, sec 68, Gurgaon, Haryana- 122121', '3733985', 'Mono AAR', '', true),
  ('UNIcorn @ Ashram_Road', '32, GF, Ratna Business Square, Ground Floor, Old Natraj Cinema, Ashram Road AHMEDABAD 380009', '1616817', 'APR', '', true),
  ('UNICORN @ AYODHYA, RIKABGANJ, AYODHYA', 'Unicorn @ Rikabganj, Plot No - 139 Ground Floor, Civil Lines, Rikabganj, Ayodhya-224001', '4033662', 'Mono AAR', '', true),
  ('Unicorn @ Belapur, Mumbai', 'I Shop No 2, Greenscape Shakti, Plot No 12, Sector 15, CBD Belapur, Navi Mumbai, Maharashtra 400614', '4147785', 'Mono AAR', '', true),
  ('Unicorn @ Goa, Margao', 'Shop 20/21, Ground Floor, Block C, Kayji Palladium, Powerhouse Chowk, Gogol Housing Board, Margao, Goa 403601 I', '4145424', 'Mono AAR', '', true),
  ('Unicorn @ Himalaya mall', '104, Ground Floor, Himalaya Mall, Drive In Rd, Ahmedabad, Gujarat 380059, Mr. Sanjeev- 7573012385, 9374525511', '389086', 'APR', '', true),
  ('Unicorn @ ichalkaranji', 'Mr. Prashant Gaikwad- 73850007 I CSNO 7169, Shop no. 6, Sindhu Bhavan main Road, Hatkanagle I chalkaranagi-416115', '3981506', 'Mono AAR', '', true),
  ('Unicorn @ Lulu mall, Shaheed Path', 'H-011, Ground Floor ,Amar Shaheed Path , Golf City , Sec. B Ansal api ,Lucknow , U.P -226030', '3561342', 'APR', '', true),
  ('Unicorn @ Najafgarh', 'Address: Plot no. 576, KH No-18/14, 17/2, 17/3 &amp; 24/1, Shivaji Marg, opp. Reliance digital store, Tura Mandi, Najafgarh, Delhi 110043', '4227983', 'Mono AAR', '', true),
  ('Unicorn @ Narela, New Delhi', 'Unicorn @ Narela, Plot No - 576, KH No - 18/14, 17/2, 17/3 & 24/1, Shivaji Marg Tura Mandi, Near Hanuman Mandir, New Delhi - 110043', '4203387', 'Mono AAR', '', true),
  ('Unicorn @ Paschim Vihar', 'Ground FlB1/17B, Block, B1, Vir Chakra Captain Kumud Kumar Marg, B 1 Block, Paschim Vihar, New Delhi, Delhi 110063', '3759017', 'Mono AAR', '', true),
  ('Unicorn @ Patiala', 'Unicorn Patiala, GF & FF Mittal Building, Near Columbia Hospital, Bhupindra Rd, Patiala, Punjab 147001', '1345252', 'Mono AAR', '', true),
  ('UNICORN @ PRAHLAD NAGAR', '1, Ground floor, Indraprastha Corporate, Opp. Venus Atlantis, Prahlad Nagar, AHMEDABAD 380015', '818674', 'APR', '', true),
  ('Unicorn @ Spectrum Mall, Noida', 'Shop No. 46B, 46C, 47A & 47D, GF, Tower-C, Spectrum metro plot No. C & D Sec 75, Noida, UP- 201301.', '3966940', 'Mono AAR', '', true),
  ('Unicorn Pacific Mall Flagship', '037, Pacific Mall, Najaf Road, Tagore Garden, New Delhi, Delhi 110018', '3033485', 'APR', '', true),
  ('UNICORN@ RAEBARELI', 'Unicorn @ Raebareli, 690/24, Kutchery Rd, opposite Manyavar, Nirala Nagar, Raebareli, Uttar Pradesh 229001', '4261142', 'Mono AAR', '', true),
  ('Unicron @ Kalyan', 'Shop No 17/117, Aum supreme, next to D-Mart, Bail Bazar, Kalyan West, Kalyan, Maharashtra 421301, 7045866060', '1600026', 'Mono AAR', '', true)
on conflict (sfo_id) where sfo_id is not null and sfo_id <> '' do nothing;

-- ============================================================
-- STEP 3 — Materials (12 distinct values found)
-- ============================================================

insert into public.installation_report_materials (name) values
  ('3M IJ 48C + 3M 8050 Matt Lam'),
  ('3M IJ 8150 clear + Avery SC 900-152-S Blockout'),
  ('Backlit Fabric - Senfa Pearl'),
  ('Backlit Fabric - Senfa Pearl + Bleed'),
  ('Backlit Fabric - Senfa Pearl + Eyelets'),
  ('Endutex Banner - Back Lit'),
  ('Endutex Banner - Back Lit + Eyelets'),
  ('Endutex Banner - Frontlit - BWX500'),
  ('One Way Vision'),
  ('Soyang 601 UT Backlit Fabric'),
  ('Soyang 601 UT Backlit Fabric + Bleed'),
  ('Soyang 601 UT Backlit Fabric + Eyelets')
on conflict (name) do nothing;

-- ============================================================
-- STEP 4 — Installation Teams (2 distinct values found, normalized)
-- ============================================================

insert into public.installation_report_teams (name) values
  ('I & S'),
  ('MMDI')
on conflict (name) do nothing;

-- ============================================================
-- Verification queries
-- ============================================================

-- select count(*) from public.installation_report_stores;  -- should be >= 154
-- select * from public.installation_report_stores order by store_name limit 20;
-- select * from public.installation_report_materials order by name;
-- select * from public.installation_report_teams order by name;
