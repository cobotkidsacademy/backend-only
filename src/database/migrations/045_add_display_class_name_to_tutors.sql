-- Add display_class_name: the class name students know this tutor by (shown in messaging)
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS display_class_name VARCHAR(100);

COMMENT ON COLUMN tutors.display_class_name IS 'Class name students know this tutor by - displayed in messaging when students view tutor contacts';
