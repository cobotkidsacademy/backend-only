    -- =============================================
    -- Class Schedules Table (day & time for each class)
    -- =============================================
    CREATE TABLE IF NOT EXISTS class_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        -- A class can only have one schedule per day
        UNIQUE(class_id, day_of_week),
        
        -- Ensure end time is after start time
        CONSTRAINT valid_time_range CHECK (end_time > start_time)
    );

    -- =============================================
    -- Tutor Class Assignments Table
    -- =============================================
    CREATE TABLE IF NOT EXISTS tutor_class_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
        class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('lead', 'assistant')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        -- A tutor can only be assigned once to a class
        UNIQUE(tutor_id, class_id),
        
        -- Only one tutor per role per class (1 lead + 1 assistant max)
        UNIQUE(class_id, role)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_class_schedules_class_id ON class_schedules(class_id);
    CREATE INDEX IF NOT EXISTS idx_class_schedules_day ON class_schedules(day_of_week);
    CREATE INDEX IF NOT EXISTS idx_tutor_assignments_tutor_id ON tutor_class_assignments(tutor_id);
    CREATE INDEX IF NOT EXISTS idx_tutor_assignments_class_id ON tutor_class_assignments(class_id);
    CREATE INDEX IF NOT EXISTS idx_tutor_assignments_role ON tutor_class_assignments(role);

    -- Enable Row Level Security
    ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tutor_class_assignments ENABLE ROW LEVEL SECURITY;

    -- Create policies for service role access
    CREATE POLICY "Service role can access all class_schedules"
        ON class_schedules FOR ALL
        USING (auth.role() = 'service_role');

    CREATE POLICY "Service role can access all tutor_class_assignments"
        ON tutor_class_assignments FOR ALL
        USING (auth.role() = 'service_role');

    -- Triggers for updated_at
    CREATE TRIGGER update_class_schedules_updated_at 
        BEFORE UPDATE ON class_schedules
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_tutor_class_assignments_updated_at 
        BEFORE UPDATE ON tutor_class_assignments
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- =============================================
    -- Helper function to check if class has room for tutor
    -- =============================================
    CREATE OR REPLACE FUNCTION check_class_tutor_limit()
    RETURNS TRIGGER AS $$
    DECLARE
        tutor_count INTEGER;
    BEGIN
        -- Count active tutors assigned to this class (excluding current row if updating)
        SELECT COUNT(*) INTO tutor_count
        FROM tutor_class_assignments
        WHERE class_id = NEW.class_id 
        AND status = 'active'
        AND (TG_OP = 'INSERT' OR id != NEW.id);
        
        -- If this is an insert, check if we already have 2 tutors
        IF TG_OP = 'INSERT' AND tutor_count >= 2 THEN
            RAISE EXCEPTION 'Class already has maximum number of tutors (2)';
        END IF;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Create trigger for tutor limit check
    CREATE TRIGGER check_tutor_limit_before_insert
        BEFORE INSERT ON tutor_class_assignments
        FOR EACH ROW EXECUTE FUNCTION check_class_tutor_limit();


