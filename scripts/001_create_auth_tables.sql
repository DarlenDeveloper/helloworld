-- Create profiles table for user management
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Create calls table for call history
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('completed', 'missed', 'in_progress')),
  duration INTEGER, -- in seconds
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for calls
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Create policies for calls
CREATE POLICY "calls_select_own" ON public.calls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "calls_insert_own" ON public.calls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "calls_update_own" ON public.calls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "calls_delete_own" ON public.calls FOR DELETE USING (auth.uid() = user_id);

-- Create campaigns table
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed')) DEFAULT 'draft',
  target_contacts INTEGER DEFAULT 0,
  completed_calls INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for campaigns
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Create policies for campaigns
CREATE POLICY "campaigns_select_own" ON public.campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "campaigns_insert_own" ON public.campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "campaigns_update_own" ON public.campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "campaigns_delete_own" ON public.campaigns FOR DELETE USING (auth.uid() = user_id);

-- Create contact_batches table
CREATE TABLE IF NOT EXISTS public.contact_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for contact_batches
ALTER TABLE public.contact_batches ENABLE ROW LEVEL SECURITY;

-- Create policies for contact_batches
CREATE POLICY "contact_batches_select_own" ON public.contact_batches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "contact_batches_insert_own" ON public.contact_batches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contact_batches_update_own" ON public.contact_batches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "contact_batches_delete_own" ON public.contact_batches FOR DELETE USING (auth.uid() = user_id);
