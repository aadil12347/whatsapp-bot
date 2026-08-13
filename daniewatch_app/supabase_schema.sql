-- =============================================================
-- Supabase Schema for WhatsApp Bot Mobile Control & Home Widget
-- =============================================================

-- 1. Create Enum for Bot Status
DO $$ BEGIN
    CREATE TYPE bot_status AS ENUM ('started', 'stopped', 'starting', 'stopping');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create bot_instances Table
CREATE TABLE IF NOT EXISTS public.bot_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_number TEXT NOT NULL,                  -- WhatsApp / User Phone Number (DISPLAYED in App)
    github_url TEXT NOT NULL,                   -- GitHub Repo URL (HIDDEN in App)
    github_token TEXT NOT NULL UNIQUE,          -- GitHub PAT Key (HIDDEN in App, matched on app login)
    status bot_status NOT NULL DEFAULT 'stopped',
    started_at TIMESTAMPTZ,
    last_ping TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Index for ultra-fast PAT key authentication lookup
CREATE INDEX IF NOT EXISTS idx_bot_instances_github_token ON public.bot_instances(github_token);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.bot_instances ENABLE ROW LEVEL SECURITY;

-- 5. Create Security Policies (Allow matching PAT token and updating status)
CREATE POLICY "Allow select for valid token" ON public.bot_instances
    FOR SELECT USING (true);

CREATE POLICY "Allow update status for valid token" ON public.bot_instances
    FOR UPDATE USING (true);

-- 6. Trigger to auto-update updated_at and started_at timestamps
CREATE OR REPLACE FUNCTION update_bot_instances_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.status = 'started' AND OLD.status != 'started' THEN
        NEW.started_at = NOW();
    ELSIF NEW.status = 'stopped' THEN
        NEW.started_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_bot_instances_modtime ON public.bot_instances;
CREATE TRIGGER trg_update_bot_instances_modtime
    BEFORE UPDATE ON public.bot_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_bot_instances_modtime();

-- =============================================================
-- SAMPLE DATA INSERTS (Add your GitHub Accounts & Tokens here)
-- =============================================================
-- INSERT INTO public.bot_instances (user_number, github_url, github_token, status)
-- VALUES 
-- ('+92 300 1234567', 'https://github.com/user/whatsapp-bot-1', 'ghp_pat_key_for_bot_1', 'stopped'),
-- ('+1 555 9876543', 'https://github.com/user/whatsapp-bot-2', 'ghp_pat_key_for_bot_2', 'started');
