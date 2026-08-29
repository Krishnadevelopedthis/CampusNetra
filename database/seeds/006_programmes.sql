-- ============================================================
-- Campus Netra — Seed 006: academic programmes
--
-- A starting list for an Indian degree college; administrators add their own.
-- ============================================================

BEGIN;

INSERT INTO academic_programmes (organization_id, name, code, level, duration_years)
SELECT o.id, p.name, p.code, p.level, p.years
FROM organizations o
CROSS JOIN (VALUES
    ('B.Sc. Information Technology',           'BSCIT',   'Undergraduate', 3.0),
    ('B.Sc. Computer Science',                 'BSCCS',   'Undergraduate', 3.0),
    ('B.Sc. Artificial Intelligence & Data Science', 'AIDS', 'Undergraduate', 3.0),
    ('B.Sc. Data Science',                     'BSCDS',   'Undergraduate', 3.0),
    ('Bachelor of Computer Applications',      'BCA',     'Undergraduate', 3.0),
    ('B.E. Computer Engineering',              'BECOMP',  'Undergraduate', 4.0),
    ('B.E. Information Technology',            'BEIT',    'Undergraduate', 4.0),
    ('B.E. Electronics & Telecommunication',   'BEEXTC',  'Undergraduate', 4.0),
    ('B.E. Mechanical Engineering',            'BEMECH',  'Undergraduate', 4.0),
    ('B.E. Civil Engineering',                 'BECIVIL', 'Undergraduate', 4.0),
    ('Bachelor of Commerce',                   'BCOM',    'Undergraduate', 3.0),
    ('Bachelor of Management Studies',         'BMS',     'Undergraduate', 3.0),
    ('B.Com. Accounting & Finance',            'BAF',     'Undergraduate', 3.0),
    ('Bachelor of Arts',                       'BA',      'Undergraduate', 3.0),
    ('M.Sc. Information Technology',           'MSCIT',   'Postgraduate',  2.0),
    ('M.Sc. Computer Science',                 'MSCCS',   'Postgraduate',  2.0),
    ('Master of Computer Applications',        'MCA',     'Postgraduate',  2.0),
    ('Master of Business Administration',      'MBA',     'Postgraduate',  2.0)
) AS p(name, code, level, years)
ON CONFLICT (organization_id, code) DO NOTHING;

-- Spread the seeded students across courses. Putting them all on one would
-- make every course filter and every per-course count look broken in a demo.
WITH ranked AS (
    SELECT u.id, row_number() OVER (ORDER BY u.created_at, u.email) AS n
    FROM users u
    WHERE u.role = 'student'
),
choices AS (
    SELECT p.id, row_number() OVER (ORDER BY p.code) AS n, count(*) OVER () AS total
    FROM academic_programmes p
    WHERE p.code IN ('BSCIT', 'AIDS', 'BSCCS', 'BCA', 'BECOMP')
)
UPDATE users u
SET programme_id = c.id,
    academic_year = 1 + (r.n % 3)
FROM ranked r
JOIN choices c ON c.n = 1 + (r.n % c.total)
WHERE u.id = r.id;

-- Teachers are attached to a course too; they teach on one.
UPDATE users u SET programme_id = p.id
FROM academic_programmes p
WHERE p.code = 'BSCIT' AND u.role = 'teacher' AND u.programme_id IS NULL;

COMMIT;
