-- Drop unnecessary columns from parents table.
-- Login is email + 6-digit PIN only; no password or phone.

alter table parents
  drop column if exists password_hash;

alter table parents
  drop column if exists phone;
