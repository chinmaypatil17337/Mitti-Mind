-- Feature 3 (AI + IoT automatic treatment prototype).
--
-- 1. Extend image_analysis with the extra classification the treatment
--    decision layer needs: which crop, and — critically — WHICH KIND of
--    problem it is (disease / nutrient deficiency / pest / healthy). The
--    treatment layer must never guess a fertilizer dose from free text; it
--    looks up a predefined rule keyed on problem_category + disease_type.
ALTER TABLE public.image_analysis
  ADD COLUMN IF NOT EXISTS crop_name text,
  ADD COLUMN IF NOT EXISTS problem_category text CHECK (
    problem_category IN ('disease', 'deficiency', 'pest', 'healthy', 'unknown')
  ),
  ADD COLUMN IF NOT EXISTS severity text CHECK (
    severity IN ('none', 'mild', 'moderate', 'severe')
  );

-- 2. Every time the backend actually (or in simulation) sends a command to
--    the ESP32, we log it here. This both drives the "Last Application"
--    field on the dashboard and gives the chatbot/grader a clear audit
--    trail of what the prototype actually did.
CREATE TABLE IF NOT EXISTS public.treatment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  image_analysis_id uuid REFERENCES public.image_analysis(id) ON DELETE SET NULL,
  problem_category text NOT NULL,
  rule_key text NOT NULL,          -- e.g. "NITROGEN_DEFICIENCY" — which predefined rule fired
  nutrient text,                   -- e.g. "nitrogen", null for pest/disease treatments
  pump text NOT NULL,              -- e.g. "pump_1"
  duration_seconds integer NOT NULL,
  status text NOT NULL CHECK (status IN ('simulated', 'sent', 'failed', 'skipped')),
  esp32_response jsonb,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treatment_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own treatment applications"
  ON public.treatment_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own treatment applications"
  ON public.treatment_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_treatment_applications_user_applied_at
  ON public.treatment_applications (user_id, applied_at DESC);
