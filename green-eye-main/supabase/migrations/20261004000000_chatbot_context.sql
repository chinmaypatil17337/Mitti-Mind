-- Context-aware chatbot: gives the chatbot a durable record of each
-- farmer's plants, their health history, and the farmer's location —
-- instead of only ever knowing the single most recent image_analysis row.
--
-- Reuses what already exists rather than duplicating it:
--   - image_analysis already IS the disease-prediction record (crop_name,
--     problem_category, severity, disease_type, confidence_score,
--     created_at from the earlier AI+IoT migration) — we only add a
--     plant_id link, we do not create a separate disease_predictions table.
--   - treatment_applications already IS the treatment-history record — we
--     only add a plant_id link for easier per-plant queries.

-- 1. One row per distinct (farmer, crop) the farmer has analyzed. Since the
--    app doesn't yet have a manual "add a plant" UI, a plant record is
--    auto-created/matched by crop name the first time that crop is
--    analyzed (see analyze-image/index.ts), and reused for every later
--    analysis of the same crop — giving each crop a continuous history
--    without requiring the farmer to name/manage plants by hand.
CREATE TABLE IF NOT EXISTS public.plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  crop_name text NOT NULL,
  planted_at date,
  latitude double precision,
  longitude double precision,
  location_name text,
  region text,
  status text, -- short human summary, e.g. "Healthy", "Attention Required"
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, crop_name)
);

ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own plants"
  ON public.plants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own plants"
  ON public.plants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plants"
  ON public.plants FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. A lightweight timeline entry per plant, written every time an image
--    analysis completes for it (see analyze-image/index.ts). This is what
--    lets the chatbot answer "what happened to my tomato plant last week?"
CREATE TABLE IF NOT EXISTS public.plant_health_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  health_status text NOT NULL, -- e.g. "Anthracnose detected (87% confidence)" or "Healthy"
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plant_health_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history of their own plants"
  ON public.plant_health_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.plants
    WHERE plants.id = plant_health_history.plant_id
      AND plants.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert history for their own plants"
  ON public.plant_health_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.plants
    WHERE plants.id = plant_health_history.plant_id
      AND plants.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_plant_health_history_plant_recorded
  ON public.plant_health_history (plant_id, recorded_at DESC);

-- 3. The farmer's last-known browser-granted location (one row per user,
--    upserted whenever the Weather feature successfully gets a position —
--    see useWeather.ts). This is what lets the chatbot say "your farm in
--    Thane..." in a brand-new conversation, before any plant exists yet.
CREATE TABLE IF NOT EXISTS public.farmer_locations (
  user_id uuid PRIMARY KEY,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  location_name text,
  region text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.farmer_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own location"
  ON public.farmer_locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own location"
  ON public.farmer_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own location"
  ON public.farmer_locations FOR UPDATE
  USING (auth.uid() = user_id);

-- 4. Link existing records to plants (nullable — old rows predate this,
--    and image_analysis stays fully usable without a plant_id too).
ALTER TABLE public.image_analysis
  ADD COLUMN IF NOT EXISTS plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL;

ALTER TABLE public.treatment_applications
  ADD COLUMN IF NOT EXISTS plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_image_analysis_plant_id ON public.image_analysis (plant_id);
CREATE INDEX IF NOT EXISTS idx_treatment_applications_plant_id ON public.treatment_applications (plant_id);
