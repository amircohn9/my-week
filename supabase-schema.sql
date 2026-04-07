-- Weekly Dashboard — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  daily_focus text DEFAULT '',
  weekly_focus jsonb DEFAULT '[]'::jsonb,
  weekly_intentions jsonb DEFAULT '[]'::jsonb,
  categories jsonb DEFAULT '["Career","Self","Home Duties","Family"]'::jsonb,
  start_date date,
  yesterday_notes text DEFAULT '',
  did_you_know jsonb DEFAULT '[]'::jsonb,
  goal_weight numeric,
  start_weight numeric,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  text text NOT NULL,
  done boolean DEFAULT false,
  category text NOT NULL CHECK (category IN ('Career','Self','Home Duties','Family')),
  list text NOT NULL CHECK (list IN ('now','backlog')),
  deadline date,
  link text,
  this_week boolean DEFAULT false,
  today boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  subtasks jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  text text NOT NULL,
  category text NOT NULL CHECK (category IN ('Career','Self','Home Duties','Family')),
  recurring text NOT NULL CHECK (recurring IN ('weekly','daily','ongoing')),
  next_session date,
  hidden boolean DEFAULT false,
  sessions jsonb DEFAULT '[]'::jsonb,
  default_hours numeric,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  activities jsonb DEFAULT '[]'::jsonb,
  mood text DEFAULT '',
  obstacles text DEFAULT '',
  wins text DEFAULT '',
  summary text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE completed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  category text NOT NULL,
  text text NOT NULL,
  hours numeric,
  date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE diet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  note text DEFAULT '',
  calories text DEFAULT '',
  protein text DEFAULT '',
  carbs text DEFAULT '',
  fat text DEFAULT '',
  sodium text DEFAULT '',
  fiber text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  lbs numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  time text,
  summary text NOT NULL,
  color text,
  type text DEFAULT 'event',
  calendar text DEFAULT 'main',
  source text DEFAULT 'google-calendar' CHECK (source IN ('manual','google-calendar')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE family_hub_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  text text NOT NULL,
  section text NOT NULL CHECK (section IN ('thisWeek','backlog','decisions','purchases','trips','susie')),
  date date,
  added_by text DEFAULT 'Amir',
  assignee text DEFAULT '',
  done boolean DEFAULT false,
  done_date date,
  deadline date,
  comment text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE family_upcoming_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  summary text NOT NULL,
  time text,
  type text DEFAULT 'event',
  calendar text DEFAULT 'main',
  hidden boolean DEFAULT false,
  highlighted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE prompts (
  id text PRIMARY KEY,
  category text NOT NULL,
  urgency text NOT NULL CHECK (urgency IN ('act','routine','think')),
  title text NOT NULL,
  description text NOT NULL,
  month integer NOT NULL,
  end_month integer,
  tags jsonb DEFAULT '[]'::jsonb,
  age_min integer,
  age_max integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE prompt_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  prompt_id text REFERENCES prompts(id) NOT NULL,
  year integer NOT NULL,
  completed_date date NOT NULL,
  UNIQUE(prompt_id, year)
);

CREATE TABLE job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  company text NOT NULL,
  role text DEFAULT '',
  date_applied date DEFAULT CURRENT_DATE,
  method text DEFAULT 'direct' CHECK (method IN ('linkedin','direct')),
  unemployment boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_tasks_category_list ON tasks(category, list);
CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_checkins_date ON checkins(date);
CREATE INDEX idx_completed_items_date ON completed_items(date);
CREATE INDEX idx_diet_entries_date ON diet_entries(date);
CREATE INDEX idx_weight_logs_date ON weight_logs(date);
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_family_hub_section ON family_hub_items(section);
CREATE INDEX idx_family_upcoming_date ON family_upcoming_events(date);


-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_hub_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_upcoming_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- User-owned tables: full access for the owner
CREATE POLICY "app_settings_all" ON app_settings USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_all" ON tasks USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "habits_all" ON habits USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "checkins_all" ON checkins USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "completed_items_all" ON completed_items USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "diet_entries_all" ON diet_entries USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "weight_logs_all" ON weight_logs USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "calendar_events_all" ON calendar_events USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "family_hub_items_all" ON family_hub_items USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "family_upcoming_events_all" ON family_upcoming_events USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prompt_completions_all" ON prompt_completions USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "job_applications_all" ON job_applications USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Prompts: read-only for all authenticated users
CREATE POLICY "prompts_read" ON prompts FOR SELECT TO authenticated USING (true);


-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON habits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON checkins FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON family_hub_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
