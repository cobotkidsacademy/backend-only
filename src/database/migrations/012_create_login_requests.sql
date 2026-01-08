-- =============================================
-- Migration 012: Create Login Requests Table
-- =============================================

-- =============================================
-- Create Login Requests Table
-- =============================================
CREATE TABLE IF NOT EXISTS login_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    student_username VARCHAR(255),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_login_requests_student_id ON login_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_login_requests_tutor_id ON login_requests(tutor_id);
CREATE INDEX IF NOT EXISTS idx_login_requests_status ON login_requests(status);
CREATE INDEX IF NOT EXISTS idx_login_requests_tutor_status ON login_requests(tutor_id, status);
CREATE INDEX IF NOT EXISTS idx_login_requests_expires_at ON login_requests(expires_at);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE login_requests ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all login requests"
    ON login_requests FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE TRIGGER update_login_requests_updated_at 
    BEFORE UPDATE ON login_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Function to auto-expire old pending requests
-- =============================================
CREATE OR REPLACE FUNCTION expire_old_login_requests()
RETURNS void AS $$
BEGIN
    UPDATE login_requests
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;





