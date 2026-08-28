-- ============================================================
-- Campus Netra — Seed 002: demo accounts (development only)
-- Password for every account below: Campus@2026
-- bcrypt hash is precomputed so the seed needs no application code.
-- ============================================================

BEGIN;

INSERT INTO users (id, organization_id, email, password_hash, full_name, role, status,
                   department_id, employee_id, enrollment_no, designation, specialization,
                   email_verified_at)
VALUES
 -- Administration
 ('cccc0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
  'admin@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Priya Raman','admin','active',NULL,'EMP-0001',NULL,'Director of Facilities',NULL, now()),

 ('cccc0000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
  'facility@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Arun Nair','facility_manager','active',NULL,'EMP-0014',NULL,'Facility Manager',NULL, now()),

 -- Technicians, one per trade — these drive the simulation's capacity model
 ('cccc0000-0000-0000-0000-000000000011','11111111-1111-1111-1111-111111111111',
  'rahul.elec@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Rahul Verma','technician','active','22222222-0000-0000-0000-000000000001','TECH-101',NULL,
  'Senior Electrician', ARRAY['electrical','hvac'], now()),

 ('cccc0000-0000-0000-0000-000000000012','11111111-1111-1111-1111-111111111111',
  'sana.elec@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Sana Qureshi','technician','active','22222222-0000-0000-0000-000000000001','TECH-102',NULL,
  'Electrician', ARRAY['electrical'], now()),

 ('cccc0000-0000-0000-0000-000000000013','11111111-1111-1111-1111-111111111111',
  'mohan.plumb@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Mohan Das','technician','active','22222222-0000-0000-0000-000000000002','TECH-201',NULL,
  'Plumber', ARRAY['plumbing'], now()),

 ('cccc0000-0000-0000-0000-000000000014','11111111-1111-1111-1111-111111111111',
  'kavya.it@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Kavya Iyer','technician','active','22222222-0000-0000-0000-000000000003','TECH-301',NULL,
  'Network Engineer', ARRAY['network','it'], now()),

 ('cccc0000-0000-0000-0000-000000000015','11111111-1111-1111-1111-111111111111',
  'deepak.av@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Deepak Shah','technician','active','22222222-0000-0000-0000-000000000004','TECH-401',NULL,
  'AV Technician', ARRAY['av','projector'], now()),

 ('cccc0000-0000-0000-0000-000000000016','11111111-1111-1111-1111-111111111111',
  'imran.civil@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Imran Sheikh','technician','active','22222222-0000-0000-0000-000000000005','TECH-501',NULL,
  'Carpenter', ARRAY['furniture','civil'], now()),

 -- Teaching staff
 ('cccc0000-0000-0000-0000-000000000021','11111111-1111-1111-1111-111111111111',
  'meera.teacher@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Meera Krishnan','teacher','active',NULL,'EMP-2041',NULL,'Assistant Professor',NULL, now()),

 -- Students
 ('cccc0000-0000-0000-0000-000000000031','11111111-1111-1111-1111-111111111111',
  'student@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Aditya Menon','student','active',NULL,NULL,'21BCE1234',NULL,NULL, now()),

 ('cccc0000-0000-0000-0000-000000000032','11111111-1111-1111-1111-111111111111',
  'riya@campus.edu','$2b$12$RuyOSQ5NU9A9SlytVt7dN.H42jekkxEtcwfVyeZknPWNceBT5EfnG',
  'Riya Sharma','student','active',NULL,NULL,'21BCE5678',NULL,NULL, now())
ON CONFLICT (email) DO NOTHING;

COMMIT;
