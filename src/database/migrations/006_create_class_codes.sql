-- =============================================
-- Class Codes Table
-- =============================================
CREATE TABLE IF NOT EXISTS class_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
    code VARCHAR(3) NOT NULL, -- 3-digit numeric code
    
    -- Validity period
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Who generated it
    generated_by_tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'used')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure code is unique within validity period for a class
    CONSTRAINT unique_active_code_per_class UNIQUE (class_id, code, status)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_class_codes_class_id ON class_codes(class_id);
CREATE INDEX IF NOT EXISTS idx_class_codes_schedule_id ON class_codes(schedule_id);
CREATE INDEX IF NOT EXISTS idx_class_codes_code ON class_codes(code);
CREATE INDEX IF NOT EXISTS idx_class_codes_valid_from ON class_codes(valid_from);
CREATE INDEX IF NOT EXISTS idx_class_codes_valid_until ON class_codes(valid_until);
CREATE INDEX IF NOT EXISTS idx_class_codes_status ON class_codes(status);

-- Enable Row Level Security
ALTER TABLE class_codes ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all class_codes"
    ON class_codes FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_class_codes_updated_at 
    BEFORE UPDATE ON class_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Function to generate unique 3-digit code
-- =============================================
CREATE OR REPLACE FUNCTION generate_unique_class_code(p_class_id UUID)
RETURNS VARCHAR(3) AS $$
DECLARE
    new_code VARCHAR(3);
    attempts INT := 0;
    max_attempts INT := 100;
BEGIN
    LOOP
        -- Generate random 3-digit code (100-999)
        new_code := LPAD((100 + floor(random() * 900))::TEXT, 3, '0');
        
        -- Check if this code is already active for this class
        IF NOT EXISTS (
            SELECT 1 FROM class_codes 
            WHERE class_id = p_class_id 
            AND code = new_code 
            AND status = 'active'
            AND valid_until > NOW()
        ) THEN
            RETURN new_code;
        END IF;
        
        attempts := attempts + 1;
        IF attempts >= max_attempts THEN
            RAISE EXCEPTION 'Could not generate unique code after % attempts', max_attempts;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function to expire old codes
-- =============================================
CREATE OR REPLACE FUNCTION expire_old_class_codes()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark expired codes
    UPDATE class_codes 
    SET status = 'expired'
    WHERE status = 'active' 
    AND valid_until < NOW();
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to clean up expired codes (runs on insert)
CREATE OR REPLACE TRIGGER cleanup_expired_codes
    AFTER INSERT ON class_codes
    FOR EACH STATEMENT
    EXECUTE FUNCTION expire_old_class_codes();

-- =============================================
-- Function to get current server timestamp (network time)
-- This ensures all time operations use server time, not client time
-- =============================================
CREATE OR REPLACE FUNCTION get_current_timestamp()
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
    RETURN NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function to get current day of week from server
-- Returns lowercase day name without trailing spaces
-- =============================================
CREATE OR REPLACE FUNCTION get_current_day_of_week()
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(TRIM(TO_CHAR(NOW(), 'day')));
END;
$$ LANGUAGE plpgsql;

