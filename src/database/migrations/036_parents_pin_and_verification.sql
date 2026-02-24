-- Parent login: email + 6-digit PIN. Verification code is 6 digits (10 min expiry).
-- Add 6-digit PIN column; make password_hash nullable for transition.

alter table parents
  add column if not exists pin_hash text;

comment on column parents.pin_hash is 'Bcrypt hash of 6-digit PIN; required for parent login';

alter table parents
  alter column password_hash drop not null;
