-- =============================================
-- Messages System with Encryption, Retention, and GDPR Compliance
-- =============================================

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Sender information
    sender_id UUID NOT NULL,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('admin', 'tutor', 'student', 'parent', 'ai', 'class-code')),
    sender_name VARCHAR(255) NOT NULL,
    
    -- Recipient information
    recipient_id UUID, -- NULL for AI, class-code, or broadcast messages
    recipient_role VARCHAR(20) NOT NULL CHECK (recipient_role IN ('admin', 'tutor', 'student', 'parent', 'ai', 'class-code', 'all')),
    
    -- Message content (encrypted)
    content_encrypted TEXT NOT NULL, -- Encrypted message content
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for integrity verification
    encryption_key_id VARCHAR(255), -- Reference to encryption key version
    
    -- Message metadata
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'file', 'image', 'system')),
    file_url TEXT, -- For voice notes, files, images
    file_name VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(100),
    
    -- Message status
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'deleted', 'edited')),
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID, -- Who deleted it (for audit)
    
    -- Retention and GDPR
    retention_days INTEGER DEFAULT 365, -- Message retention period in days
    expires_at TIMESTAMP WITH TIME ZONE, -- Calculated from created_at + retention_days
    gdpr_deleted BOOLEAN DEFAULT FALSE, -- GDPR deletion flag
    gdpr_deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_ip VARCHAR(45), -- IPv4 or IPv6
    created_by_user_agent TEXT
    
    -- Note: Foreign key validation for sender_id based on sender_role
    -- is handled at the application level, as PostgreSQL CHECK constraints
    -- cannot contain subqueries
);

-- Create indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, sender_role);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, recipient_role);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(
    LEAST(sender_id, recipient_id),
    GREATEST(sender_id, recipient_id),
    sender_role,
    recipient_role
) WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON messages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_gdpr_deleted ON messages(gdpr_deleted) WHERE gdpr_deleted = FALSE;

-- Read Receipts Table
CREATE TABLE IF NOT EXISTS message_read_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reader_id UUID NOT NULL,
    reader_role VARCHAR(20) NOT NULL CHECK (reader_role IN ('admin', 'tutor', 'student', 'parent')),
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    UNIQUE(message_id, reader_id, reader_role)
);

CREATE INDEX IF NOT EXISTS idx_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_reader ON message_read_receipts(reader_id, reader_role);

-- Message Reactions Table
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('admin', 'tutor', 'student', 'parent')),
    reaction_type VARCHAR(20) NOT NULL CHECK (reaction_type IN ('like', 'love', 'laugh', 'wow', 'sad', 'angry', 'thumbs_up', 'thumbs_down')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id, user_role)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON message_reactions(user_id, user_role);

-- Message Edit History (for audit trail)
CREATE TABLE IF NOT EXISTS message_edit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    previous_content_encrypted TEXT NOT NULL,
    previous_content_hash VARCHAR(64) NOT NULL,
    edited_by UUID NOT NULL,
    edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edit_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_edit_history_message ON message_edit_history(message_id);

-- Message Deletion Log (for audit and legal requests)
CREATE TABLE IF NOT EXISTS message_deletion_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    deleted_by UUID NOT NULL,
    deleted_by_role VARCHAR(20) NOT NULL,
    deletion_type VARCHAR(20) NOT NULL CHECK (deletion_type IN ('user', 'gdpr', 'retention', 'legal', 'admin')),
    deletion_reason TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    -- Store encrypted content before deletion for legal/audit purposes
    content_backup_encrypted TEXT,
    content_backup_hash VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_deletion_log_message ON message_deletion_log(message_id);
CREATE INDEX IF NOT EXISTS idx_deletion_log_deleted_by ON message_deletion_log(deleted_by, deleted_by_role);
CREATE INDEX IF NOT EXISTS idx_deletion_log_type ON message_deletion_log(deletion_type);

-- Typing Indicators (can be in-memory, but storing for persistence across server restarts)
CREATE TABLE IF NOT EXISTS typing_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(255) NOT NULL, -- Format: "sender_id-recipient_id" or "sender_role-recipient_role"
    user_id UUID NOT NULL,
    user_role VARCHAR(20) NOT NULL,
    is_typing BOOLEAN DEFAULT TRUE,
    last_typing_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 seconds')
);

CREATE INDEX IF NOT EXISTS idx_typing_conversation ON typing_indicators(conversation_id);
CREATE INDEX IF NOT EXISTS idx_typing_expires ON typing_indicators(expires_at);

-- Encryption Keys Management (for key rotation)
CREATE TABLE IF NOT EXISTS encryption_keys (
    id VARCHAR(255) PRIMARY KEY,
    key_version INTEGER NOT NULL,
    key_encrypted TEXT NOT NULL, -- Master key encrypted with system key
    algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    rotated_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_encryption_keys_active ON encryption_keys(is_active) WHERE is_active = TRUE;

-- Legal Request Audit Log
CREATE TABLE IF NOT EXISTS legal_request_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('data_export', 'data_deletion', 'legal_subpoena', 'compliance_audit')),
    user_id UUID,
    user_role VARCHAR(20),
    requested_by UUID NOT NULL, -- Admin who made the request
    request_details JSONB,
    messages_affected INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_request_user ON legal_request_audit(user_id, user_role);
CREATE INDEX IF NOT EXISTS idx_legal_request_status ON legal_request_audit(status);

-- Function to automatically set expires_at based on retention_days
CREATE OR REPLACE FUNCTION set_message_expiration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at IS NULL AND NEW.retention_days IS NOT NULL THEN
        NEW.expires_at := NEW.created_at + (NEW.retention_days || ' days')::INTERVAL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_message_expiration
    BEFORE INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION set_message_expiration();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_messages_updated_at();

-- Function to clean up expired messages (run via cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_messages()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Soft delete expired messages (set is_deleted = TRUE)
    UPDATE messages
    SET 
        is_deleted = TRUE,
        deleted_at = NOW(),
        deleted_by = NULL, -- System deletion
        status = 'deleted'
    WHERE 
        expires_at IS NOT NULL 
        AND expires_at < NOW()
        AND is_deleted = FALSE
        AND gdpr_deleted = FALSE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log deletions
    INSERT INTO message_deletion_log (message_id, deleted_by, deleted_by_role, deletion_type, deletion_reason)
    SELECT 
        id,
        NULL,
        'system',
        'retention',
        'Message expired based on retention policy'
    FROM messages
    WHERE 
        expires_at IS NOT NULL 
        AND expires_at < NOW()
        AND is_deleted = TRUE
        AND deleted_at = NOW();
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old typing indicators
CREATE OR REPLACE FUNCTION cleanup_typing_indicators()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM typing_indicators
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_edit_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies (basic - will be enhanced in application layer)
CREATE POLICY "Service role can access all messages"
    ON messages FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all read receipts"
    ON message_read_receipts FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all reactions"
    ON message_reactions FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all edit history"
    ON message_edit_history FOR ALL
    USING (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE messages IS 'Encrypted messages with retention and GDPR compliance';
COMMENT ON COLUMN messages.content_encrypted IS 'AES-256-GCM encrypted message content';
COMMENT ON COLUMN messages.content_hash IS 'SHA-256 hash for integrity verification';
COMMENT ON COLUMN messages.retention_days IS 'Number of days to retain message before auto-deletion';
COMMENT ON COLUMN messages.gdpr_deleted IS 'Flag indicating GDPR right-to-delete was exercised';
COMMENT ON TABLE message_read_receipts IS 'Tracks when messages are read by recipients';
COMMENT ON TABLE message_reactions IS 'User reactions to messages (like, love, etc.)';
COMMENT ON TABLE message_edit_history IS 'Audit trail of message edits';
COMMENT ON TABLE message_deletion_log IS 'Log of all message deletions for legal/audit purposes';
COMMENT ON TABLE typing_indicators IS 'Real-time typing indicators for conversations';
COMMENT ON TABLE encryption_keys IS 'Encryption key management for message encryption';
COMMENT ON TABLE legal_request_audit IS 'Audit log for legal requests and GDPR compliance';
