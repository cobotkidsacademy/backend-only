-- Parent profile: phone and profile photo for parent dashboard settings.
alter table parents
  add column if not exists phone text;

alter table parents
  add column if not exists profile_image_url text;
