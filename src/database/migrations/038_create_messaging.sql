-- =============================================
-- Messaging: Conversations and Messages
-- =============================================
-- Conversations are 1:1 between any two of: admin, tutor, student.
-- We store participant type + id for each side.

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Participant A (canonical: type 'admin' < 'student' < 'tutor', then by id)
    participant_a_type VARCHAR(20) NOT NULL CHECK (participant_a_type IN ('admin', 'tutor', 'student')),
    participant_a_id UUID NOT NULL,
    -- Participant B
    participant_b_type VARCHAR(20) NOT NULL CHECK (participant_b_type IN ('admin', 'tutor', 'student')),
    participant_b_id UUID NOT NULL,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure A < B (type, id) so we can look up conversations without duplicate orderings
    CONSTRAINT conv_ordering CHECK (
        (participant_a_type < participant_b_type) OR
        (participant_a_type = participant_b_type AND participant_a_id < participant_b_id)
    )
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('admin', 'tutor', 'student')),
    sender_id UUID NOT NULL,
    content TEXT NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_a ON conversations(participant_a_type, participant_a_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_b ON conversations(participant_b_type, participant_b_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(conversation_id, created_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can access all conversations"
    ON conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all messages"
    ON messages FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
