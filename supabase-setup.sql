-- ============================================
-- ExpenseFlow — Supabase Schema Setup
-- Run this in the SQL Editor
-- ============================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  local_id TEXT, -- original client-generated ID for sync
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT DEFAULT '',
  type TEXT DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  recurring TEXT DEFAULT 'none' CHECK (recurring IN ('none', 'daily', 'weekly', 'monthly')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  monthly_limit NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category)
);

-- 4. Templates table
CREATE TABLE IF NOT EXISTS templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT DEFAULT 'expense',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. User settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  currency TEXT DEFAULT '$',
  theme TEXT DEFAULT 'auto',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Enable Row Level Security on all tables
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies — users can only access their own data
-- Expenses
CREATE POLICY "Users can view own expenses" ON expenses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own expenses" ON expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own expenses" ON expenses
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own expenses" ON expenses
  FOR DELETE USING (auth.uid() = user_id);

-- Budgets
CREATE POLICY "Users can view own budgets" ON budgets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budgets" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own budgets" ON budgets
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own budgets" ON budgets
  FOR DELETE USING (auth.uid() = user_id);

-- Templates
CREATE POLICY "Users can view own templates" ON templates
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON templates
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON templates
  FOR DELETE USING (auth.uid() = user_id);

-- User Settings
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- 8. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 9. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
