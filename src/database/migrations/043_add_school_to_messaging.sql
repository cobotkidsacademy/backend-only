-- Add 'school' as a participant type in messaging (school can message admin and assigned tutors)

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_participant_a_type_check;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_participant_b_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_participant_a_type_check
  CHECK (participant_a_type IN ('admin', 'tutor', 'student', 'school'));
ALTER TABLE conversations ADD CONSTRAINT conversations_participant_b_type_check
  CHECK (participant_b_type IN ('admin', 'tutor', 'student', 'school'));

-- Update conv_ordering: ensure canonical order (admin < school < student < tutor)
-- Use lower() for id comparison to match JS toLowerCase() ordering regardless of UUID casing
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conv_ordering;
ALTER TABLE conversations ADD CONSTRAINT conv_ordering CHECK (
  (participant_a_type < participant_b_type) OR
  (participant_a_type = participant_b_type AND lower(participant_a_id::text) < lower(participant_b_id::text))
);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('admin', 'tutor', 'student', 'school'));
