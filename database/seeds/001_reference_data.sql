-- ============================================================
-- Campus Netra — Seed 001: demo tenant, spatial hierarchy, users
-- Idempotent: safe to re-run.
-- Mirrors the entities shown in the product design (Bldg A, Floor 2,
-- Class 202, projector P-101, AC-202-A).
-- ============================================================

BEGIN;

-- ---------- Organization ----------
INSERT INTO organizations (id, name, slug, email_domain, contact_email, is_verified, timezone)
VALUES ('11111111-1111-1111-1111-111111111111',
        'Main Campus Institute of Technology', 'main-campus', 'campus.edu',
        'admin@campus.edu', TRUE, 'Asia/Kolkata')
ON CONFLICT (id) DO NOTHING;

-- ---------- Departments ----------
INSERT INTO departments (id, organization_id, name, code, description, email) VALUES
 ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Electrical & Maintenance','ELEC','Power, lighting, fans, wiring','electrical@campus.edu'),
 ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Plumbing & Sanitation','PLUMB','Water supply, drainage, washrooms','plumbing@campus.edu'),
 ('22222222-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','IT Support','IT','Networking, computers, servers','it@campus.edu'),
 ('22222222-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','AV & Media','AV','Projectors, displays, audio systems','av@campus.edu'),
 ('22222222-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Civil & Facility','CIVIL','Furniture, doors, structural, housekeeping','facility@campus.edu'),
 ('22222222-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Security','SEC','Campus security and lost property desk','security@campus.edu')
ON CONFLICT (organization_id, code) DO NOTHING;

-- ---------- Campus > Buildings > Floors > Rooms ----------
INSERT INTO campuses (id, organization_id, name, code, address, latitude, longitude)
VALUES ('33333333-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
        'Main Campus','MAIN','Knowledge Park, Sector 12', 12.9716000, 77.5946000)
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO buildings (id, campus_id, name, code, floors_count, map_x, map_y) VALUES
 ('44444444-0000-0000-0000-00000000000A','33333333-0000-0000-0000-000000000001','Bldg A (Engineering)','A',4,0.22000,0.30000),
 ('44444444-0000-0000-0000-00000000000B','33333333-0000-0000-0000-000000000001','Bldg B (Administration)','B',3,0.55000,0.28000),
 ('44444444-0000-0000-0000-00000000000C','33333333-0000-0000-0000-000000000001','Central Library','LIB',3,0.40000,0.62000),
 ('44444444-0000-0000-0000-00000000000D','33333333-0000-0000-0000-000000000001','Hostel Block D','D',5,0.78000,0.70000)
ON CONFLICT (campus_id, code) DO NOTHING;

INSERT INTO floors (id, building_id, name, level) VALUES
 ('55555555-0000-0000-0000-0000000000A1','44444444-0000-0000-0000-00000000000A','Floor 1',1),
 ('55555555-0000-0000-0000-0000000000A2','44444444-0000-0000-0000-00000000000A','Floor 2',2),
 ('55555555-0000-0000-0000-0000000000A3','44444444-0000-0000-0000-00000000000A','Floor 3',3),
 ('55555555-0000-0000-0000-0000000000B1','44444444-0000-0000-0000-00000000000B','Floor 1',1),
 ('55555555-0000-0000-0000-0000000000C1','44444444-0000-0000-0000-00000000000C','Floor 1',1),
 ('55555555-0000-0000-0000-0000000000C2','44444444-0000-0000-0000-00000000000C','Floor 2',2)
ON CONFLICT (building_id, level) DO NOTHING;

-- Room boundaries are normalised 0..1 polygons drawn over the floor plan.
INSERT INTO rooms (id, floor_id, name, code, zone_id, kind, capacity, area_sqft, boundary) VALUES
 ('66666666-0000-0000-0000-000000000101','55555555-0000-0000-0000-0000000000A1','Class 101','A-101','ZN-BLDA-F1-101','classroom',60,900.00,
   '[[0.04,0.08],[0.32,0.08],[0.32,0.46],[0.04,0.46]]'),
 ('66666666-0000-0000-0000-000000000102','55555555-0000-0000-0000-0000000000A1','Class 102','A-102','ZN-BLDA-F1-102','classroom',60,900.00,
   '[[0.36,0.08],[0.64,0.08],[0.64,0.46],[0.36,0.46]]'),
 ('66666666-0000-0000-0000-000000000103','55555555-0000-0000-0000-0000000000A1','Class 103','A-103','ZN-BLDA-F1-103','classroom',60,900.00,
   '[[0.68,0.08],[0.96,0.08],[0.96,0.46],[0.68,0.46]]'),
 ('66666666-0000-0000-0000-000000000104','55555555-0000-0000-0000-0000000000A1','Washroom (F1)','A-W1','ZN-BLDA-F1-W1','washroom',NULL,220.00,
   '[[0.04,0.56],[0.24,0.56],[0.24,0.92],[0.04,0.92]]'),
 ('66666666-0000-0000-0000-000000000201','55555555-0000-0000-0000-0000000000A2','Lab 201','A-201','ZN-BLDA-F2-201','laboratory',40,1200.00,
   '[[0.04,0.08],[0.40,0.08],[0.40,0.52],[0.04,0.52]]'),
 ('66666666-0000-0000-0000-000000000202','55555555-0000-0000-0000-0000000000A2','Class 202','A-202','ZN-BLDA-F2-202','lecture_hall',40,850.00,
   '[[0.04,0.58],[0.40,0.58],[0.40,0.94],[0.04,0.94]]'),
 ('66666666-0000-0000-0000-000000000203','55555555-0000-0000-0000-0000000000A2','Staff Room','A-203','ZN-BLDA-F2-203','office',15,600.00,
   '[[0.56,0.08],[0.96,0.08],[0.96,0.52],[0.56,0.52]]'),
 ('66666666-0000-0000-0000-0000000002C2','55555555-0000-0000-0000-0000000000C2','Study Area (North Wing)','L-2NW','Z-L2-NW-04','library',120,2400.00,
   '[[0.08,0.10],[0.92,0.10],[0.92,0.86],[0.08,0.86]]')
ON CONFLICT (floor_id, code) DO NOTHING;

-- ---------- Asset categories (drive the "Select Asset" tiles) ----------
INSERT INTO asset_categories (id, organization_id, name, code, icon, default_department_id, default_priority) VALUES
 ('77777777-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Projector','PRJ','projector','22222222-0000-0000-0000-000000000004','medium'),
 ('77777777-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','AC Unit','AC','snowflake','22222222-0000-0000-0000-000000000001','medium'),
 ('77777777-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Lighting','LGT','lightbulb','22222222-0000-0000-0000-000000000001','medium'),
 ('77777777-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Furniture','FRN','armchair','22222222-0000-0000-0000-000000000005','low'),
 ('77777777-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Network','NET','wifi','22222222-0000-0000-0000-000000000003','high'),
 ('77777777-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Plumbing Fixture','PLB','wrench','22222222-0000-0000-0000-000000000002','high'),
 ('77777777-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','Ceiling Fan','FAN','fan','22222222-0000-0000-0000-000000000001','medium'),
 ('77777777-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','Computer','PC','monitor','22222222-0000-0000-0000-000000000003','medium')
ON CONFLICT (organization_id, code) DO NOTHING;

-- ---------- Assets (positions are normalised within their room) ----------
INSERT INTO assets (id, room_id, category_id, tag, name, manufacturer, model, state, pos_x, pos_y, purchase_date, warranty_expiry, cost, service_interval_days, expected_life_months) VALUES
 ('88888888-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000101','77777777-0000-0000-0000-000000000001','P-101','Projector — Class 101','Epson','EB-X51','fault',0.50000,0.30000,'2022-06-15','2025-06-15',52000.00,180,60),
 ('88888888-0000-0000-0000-000000000002','66666666-0000-0000-0000-000000000101','77777777-0000-0000-0000-000000000007','FAN-101-A','Ceiling Fan A — Class 101','Havells','Standard',  'healthy',0.25000,0.60000,'2021-03-10','2024-03-10',3200.00,365,120),
 ('88888888-0000-0000-0000-000000000003','66666666-0000-0000-0000-000000000202','77777777-0000-0000-0000-000000000002','AC-202-A','AC Unit A — Class 202','Voltas','SAC-1.5T','healthy',0.30000,0.25000,'2023-01-20','2026-01-20',42000.00,90,120),
 ('88888888-0000-0000-0000-000000000004','66666666-0000-0000-0000-000000000202','77777777-0000-0000-0000-000000000001','PRJ-202-1','Projector — Class 202','BenQ','MW550','healthy',0.55000,0.45000,'2023-08-01','2026-08-01',48000.00,180,60),
 ('88888888-0000-0000-0000-000000000005','66666666-0000-0000-0000-000000000201','77777777-0000-0000-0000-000000000008','PC-201-01','Lab Workstation 01','Dell','OptiPlex 7010','warning',0.20000,0.20000,'2020-07-11','2023-07-11',55000.00,180,72),
 ('88888888-0000-0000-0000-000000000006','66666666-0000-0000-0000-000000000201','77777777-0000-0000-0000-000000000005','NET-201-AP','Lab Access Point','Ubiquiti','U6-Pro','healthy',0.70000,0.15000,'2023-02-05','2026-02-05',18000.00,365,84),
 ('88888888-0000-0000-0000-000000000007','66666666-0000-0000-0000-000000000104','77777777-0000-0000-0000-000000000006','PLB-W1-T1','Washroom Tap 1','Jaquar','Continental','under_maintenance',0.30000,0.40000,'2021-11-02','2024-11-02',2400.00,180,120),
 ('88888888-0000-0000-0000-000000000008','66666666-0000-0000-0000-000000000103','77777777-0000-0000-0000-000000000003','LGT-103-1','Tube Light Row 1','Philips','LED 20W','inspection_required',0.50000,0.20000,'2022-09-19','2025-09-19',1800.00,365,60),
 ('88888888-0000-0000-0000-000000000009','66666666-0000-0000-0000-0000000002C2','77777777-0000-0000-0000-000000000005','NET-L2-AP','Library AP North','Ubiquiti','U6-LR','healthy',0.50000,0.30000,'2022-12-01','2025-12-01',22000.00,365,84),
 ('88888888-0000-0000-0000-00000000000A','66666666-0000-0000-0000-000000000102','77777777-0000-0000-0000-000000000007','FAN-102-A','Ceiling Fan A — Class 102','Havells','Standard','healthy',0.25000,0.60000,'2021-03-10','2024-03-10',3200.00,365,120)
ON CONFLICT (tag) DO NOTHING;

-- ---------- Issue categories (keywords feed the heuristic classifier) ----------
INSERT INTO issue_categories (id, organization_id, name, code, icon, department_id, default_priority, keywords, sla_response_mins, sla_resolve_mins) VALUES
 ('99999999-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Electrical','ELEC','zap','22222222-0000-0000-0000-000000000001','high',
   ARRAY['fan','light','bulb','switch','socket','power','electrical','wiring','tube','short circuit','spark','no power','fuse','mcb'],60,720),
 ('99999999-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Plumbing','PLUMB','droplet','22222222-0000-0000-0000-000000000002','high',
   ARRAY['water','leak','leakage','tap','pipe','drain','flush','toilet','washroom','overflow','sink','blocked','seepage'],60,720),
 ('99999999-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Network / IT','IT','wifi','22222222-0000-0000-0000-000000000003','high',
   ARRAY['wifi','internet','network','lan','computer','pc','system','server','slow','not connecting','router','ethernet'],120,480),
 ('99999999-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Audio Visual','AV','projector','22222222-0000-0000-0000-000000000004','medium',
   ARRAY['projector','screen','display','hdmi','speaker','mic','microphone','audio','sound','no display','blurry'],120,720),
 ('99999999-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Furniture','FRN','armchair','22222222-0000-0000-0000-000000000005','low',
   ARRAY['desk','chair','bench','table','cupboard','board','furniture','broken leg','wobbly'],240,2880),
 ('99999999-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Air Conditioning','HVAC','snowflake','22222222-0000-0000-0000-000000000001','medium',
   ARRAY['ac','air conditioner','cooling','not cooling','hvac','ventilation','stuffy','temperature'],120,720),
 ('99999999-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','Civil / Structural','CIVIL','hammer','22222222-0000-0000-0000-000000000005','medium',
   ARRAY['door','window','wall','ceiling','floor','tile','crack','paint','lock','handle','glass'],240,2880),
 ('99999999-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','Housekeeping','HK','sparkles','22222222-0000-0000-0000-000000000005','low',
   ARRAY['dirty','clean','garbage','waste','dustbin','smell','unhygienic','sweeping'],240,1440)
ON CONFLICT (organization_id, code) DO NOTHING;

-- ---------- Lost & Found categories ----------
INSERT INTO lf_categories (id, organization_id, name, code, icon, retention_days) VALUES
 ('aaaa0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Bags & Luggage','BAGS','backpack',90),
 ('aaaa0000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Electronics','ELEC','smartphone',180),
 ('aaaa0000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','ID Cards & Documents','DOCS','id-card',365),
 ('aaaa0000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Books & Stationery','BOOK','book',60),
 ('aaaa0000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Wallets & Purses','WALLET','wallet',180),
 ('aaaa0000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Keys','KEYS','key',180),
 ('aaaa0000-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','Clothing','CLOTH','shirt',60),
 ('aaaa0000-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','Other','OTHER','package',90)
ON CONFLICT (organization_id, code) DO NOTHING;

-- ---------- SLA policies ----------
INSERT INTO sla_policies (organization_id, name, priority, response_mins, resolve_mins, escalate_after_mins, escalate_to_role) VALUES
 ('11111111-1111-1111-1111-111111111111','Critical response','critical',15,240,120,'facility_manager'),
 ('11111111-1111-1111-1111-111111111111','High priority','high',60,720,480,'facility_manager'),
 ('11111111-1111-1111-1111-111111111111','Standard','medium',240,1440,1080,'facility_manager'),
 ('11111111-1111-1111-1111-111111111111','Low priority','low',480,4320,NULL,NULL)
ON CONFLICT DO NOTHING;

-- ---------- Inspection template ----------
INSERT INTO inspection_templates (id, organization_id, name, description, category_id, frequency_days)
VALUES ('bbbb0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
        'Quarterly Classroom Check','Routine safety and functionality sweep of a teaching room',
        NULL, 90)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inspection_template_items (template_id, position, prompt, requires_photo, is_critical) VALUES
 ('bbbb0000-0000-0000-0000-000000000001',1,'All ceiling fans operate at every speed setting',FALSE,FALSE),
 ('bbbb0000-0000-0000-0000-000000000001',2,'All light fittings illuminate without flicker',FALSE,FALSE),
 ('bbbb0000-0000-0000-0000-000000000001',3,'No exposed wiring or damaged sockets',TRUE,TRUE),
 ('bbbb0000-0000-0000-0000-000000000001',4,'Projector powers on and displays a test image',TRUE,FALSE),
 ('bbbb0000-0000-0000-0000-000000000001',5,'Furniture is intact and free of sharp edges',FALSE,FALSE),
 ('bbbb0000-0000-0000-0000-000000000001',6,'Emergency exit is unobstructed and signage is lit',TRUE,TRUE)
ON CONFLICT (template_id, position) DO NOTHING;

-- ---------- Permissions ----------
INSERT INTO permissions (code, module, description) VALUES
 ('issue.create','issues','Report a new issue'),
 ('issue.view_all','issues','View every issue in the organization'),
 ('issue.assign','issues','Route an issue to a department or technician'),
 ('issue.resolve','issues','Mark an issue resolved'),
 ('issue.verify','issues','Verify and close a resolved issue'),
 ('workorder.create','work_orders','Create a work order'),
 ('workorder.assign','work_orders','Assign a work order to a technician'),
 ('workorder.update','work_orders','Update work order progress'),
 ('inspection.schedule','inspections','Schedule an inspection'),
 ('inspection.submit','inspections','Submit a completed checklist'),
 ('lf.report','lost_found','Report a lost or found item'),
 ('lf.verify_claim','lost_found','Verify ownership and release an item'),
 ('twin.view','digital_twin','View the digital twin'),
 ('twin.configure','digital_twin','Edit spatial data and asset placement'),
 ('simulation.run','digital_twin','Run scenario simulations'),
 ('analytics.view','analytics','View analytics dashboards'),
 ('user.manage','admin','Create, edit and deactivate users'),
 ('role.manage','admin','Change roles and permissions'),
 ('settings.manage','admin','Change organization settings'),
 ('audit.view','admin','View audit and security logs')
ON CONFLICT (code) DO NOTHING;

COMMIT;
