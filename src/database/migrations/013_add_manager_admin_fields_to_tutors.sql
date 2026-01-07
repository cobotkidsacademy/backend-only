-- Add manager/EDL admin credential fields to tutors

ALTER TABLE tutors
ADD COLUMN IF NOT EXISTS manager_admin_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS manager_admin_plain_password VARCHAR(255),
ADD COLUMN IF NOT EXISTS manager_admin_role VARCHAR(50);



