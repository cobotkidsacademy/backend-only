-- Fix conv_ordering constraint: use lower() for UUID comparison to match backend ordering
-- Resolves "new row for relation conversations violates check constraint conv_ordering"
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conv_ordering;
ALTER TABLE conversations ADD CONSTRAINT conv_ordering CHECK (
  (participant_a_type < participant_b_type) OR
  (participant_a_type = participant_b_type AND lower(participant_a_id::text) < lower(participant_b_id::text))
);
