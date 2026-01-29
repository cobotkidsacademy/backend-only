-- =============================================
-- Migration 022: Create Bugs/Issues Tracking Table
-- =============================================

-- =============================================
-- Bugs Table - For tracking system issues and load test results
-- =============================================
CREATE TABLE IF NOT EXISTS bugs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reporter VARCHAR(255), -- Who reported it (e.g., "Load Test", "Student - Alex", "System")
    priority VARCHAR(20) DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    status VARCHAR(20) DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
    category VARCHAR(50) DEFAULT 'General' CHECK (category IN ('General', 'Performance', 'Authentication', 'UI/UX', 'Database', 'API', 'Load Test')),
    
    -- Load test specific fields
    test_type VARCHAR(50), -- e.g., "Student Login Load Test"
    total_requests INTEGER,
    successful_requests INTEGER,
    failed_requests INTEGER,
    avg_response_time_ms DECIMAL(10, 2),
    p95_response_time_ms DECIMAL(10, 2),
    p99_response_time_ms DECIMAL(10, 2),
    max_response_time_ms DECIMAL(10, 2),
    requests_per_second DECIMAL(10, 2),
    test_duration_seconds DECIMAL(10, 2),
    error_rate_percentage DECIMAL(5, 2),
    test_metadata JSONB, -- Store full test results as JSON
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES admins(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
CREATE INDEX IF NOT EXISTS idx_bugs_priority ON bugs(priority);
CREATE INDEX IF NOT EXISTS idx_bugs_category ON bugs(category);
CREATE INDEX IF NOT EXISTS idx_bugs_created_at ON bugs(created_at);
CREATE INDEX IF NOT EXISTS idx_bugs_test_type ON bugs(test_type);

-- Enable Row Level Security
ALTER TABLE bugs ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all bugs"
    ON bugs FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_bugs_updated_at 
    BEFORE UPDATE ON bugs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();




