-- =============================================
-- User Presence: Track online status and last seen
-- =============================================
-- Supports admin, tutor, student (user_type + user_id)
-- In-memory presence is also used; this table stores last_seen for persistence

CREATE TABLE IF NOT EXISTS user_presence (
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('admin', 'tutor', 'student')),
    user_id UUID NOT NULL,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_type, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_presence_online ON user_presence(is_online) WHERE is_online = TRUE;
