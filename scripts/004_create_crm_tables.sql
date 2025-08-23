-- Create comprehensive CRM tables for AIRIES AI CRM COMPANION

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  company VARCHAR(200),
  position VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact batches for campaign management
CREATE TABLE IF NOT EXISTS contact_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table for batch-contact relationships
CREATE TABLE IF NOT EXISTS batch_contacts (
  batch_id UUID REFERENCES contact_batches(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (batch_id, contact_id)
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  contact_count INTEGER DEFAULT 0,
  calls_made INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table for campaign-batch relationships
CREATE TABLE IF NOT EXISTS campaign_batches (
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES contact_batches(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, batch_id)
);

-- Call history table
CREATE TABLE IF NOT EXISTS call_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('completed', 'failed', 'busy', 'no_answer', 'voicemail')),
  duration INTEGER, -- in seconds
  cost DECIMAL(10,4),
  notes TEXT,
  ai_summary TEXT,
  sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  call_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User login logs table
CREATE TABLE IF NOT EXISTS user_login_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'blocked')),
  ip_address INET,
  user_agent TEXT,
  location VARCHAR(200),
  device VARCHAR(100),
  session_duration INTEGER, -- in minutes
  login_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Knowledge base articles table
CREATE TABLE IF NOT EXISTS knowledge_base_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  tags TEXT[],
  status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  views INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contact_batches_user_id ON contact_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_call_history_user_id ON call_history(user_id);
CREATE INDEX IF NOT EXISTS idx_call_history_campaign_id ON call_history(campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_history_contact_id ON call_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_call_history_date ON call_history(call_date);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_user_id ON user_login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_login_logs_time ON user_login_logs(login_time);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id ON knowledge_base_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base_articles(category);

-- Enable Row Level Security
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_articles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can only access their own contacts" ON contacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access their own contact batches" ON contact_batches FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access their own batch contacts" ON batch_contacts FOR ALL USING (
  EXISTS (SELECT 1 FROM contact_batches WHERE id = batch_id AND user_id = auth.uid())
);
CREATE POLICY "Users can only access their own campaigns" ON campaigns FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access their own campaign batches" ON campaign_batches FOR ALL USING (
  EXISTS (SELECT 1 FROM campaigns WHERE id = campaign_id AND user_id = auth.uid())
);
CREATE POLICY "Users can only access their own call history" ON call_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access their own login logs" ON user_login_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can only access their own knowledge base articles" ON knowledge_base_articles FOR ALL USING (auth.uid() = user_id);
