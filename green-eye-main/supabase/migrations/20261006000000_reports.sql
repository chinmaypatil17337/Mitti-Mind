-- Reports feature. Reuses image_analysis, plants, plant_health_history,
-- treatment_applications and farmer_locations rather than creating parallel
-- tables for the same data. Only two additions are genuinely new:
--
-- 1. A handful of extra columns on image_analysis: a structured breakdown
--    of the AI's explanation (symptoms / cause / effect), and a WEATHER
--    SNAPSHOT captured at analysis time (reusing the existing weather-data
--    function — see analyze-image/index.ts — not a second weather system).
--    Live weather drifts; a report must show what the weather actually was
--    when the diagnosis happened, so this has to be stored, not re-fetched.
--
-- 2. treatment_reference: the predefined, backend-controlled dosage table
--    the safety rule requires ("the LLM must never invent a dosage"). This
--    mirrors the rule-matching approach already used by the iot-treatment
--    function's TREATMENT_RULES, but in a real database table (as the
--    brief asks) with farmer-readable fields a report can print. If a
--    detected problem has no matching row here, the UI/PDF must show
--    "Dosage not available" rather than inventing one.

ALTER TABLE public.image_analysis
  ADD COLUMN IF NOT EXISTS symptoms text,
  ADD COLUMN IF NOT EXISTS possible_cause text,
  ADD COLUMN IF NOT EXISTS effect_on_crop text,
  ADD COLUMN IF NOT EXISTS ai_explanation text,
  ADD COLUMN IF NOT EXISTS weather_location text,
  ADD COLUMN IF NOT EXISTS weather_temperature numeric,
  ADD COLUMN IF NOT EXISTS weather_humidity numeric,
  ADD COLUMN IF NOT EXISTS weather_rainfall numeric,
  ADD COLUMN IF NOT EXISTS weather_condition text;

CREATE TABLE IF NOT EXISTS public.treatment_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  problem_category text NOT NULL CHECK (problem_category IN ('disease', 'deficiency', 'pest')),
  match_keyword text NOT NULL, -- substring matched (case-insensitive) against disease_type
  treatment_name text NOT NULL,
  purpose text NOT NULL,
  dosage text NOT NULL,              -- farmer-readable, verified quantity — never LLM-generated
  application_method text NOT NULL,
  frequency text NOT NULL,
  precautions text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reference data: readable by any signed-in farmer (it's not personal
-- data), writable only via migrations/admin — never through the app.
ALTER TABLE public.treatment_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read treatment reference data"
  ON public.treatment_reference FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.treatment_reference
  (rule_key, problem_category, match_keyword, treatment_name, purpose, dosage, application_method, frequency, precautions)
VALUES
  ('NITROGEN_DEFICIENCY', 'deficiency', 'nitrogen',
    'Urea (46% N)', 'Corrects nitrogen deficiency and restores leaf greening',
    '2.5 g per litre of water (foliar) or 20 g per plant (soil, small pot-scale)',
    'Dilute in water and spray on leaves, or apply dry around the base and water in',
    'Once every 10-14 days until new growth greens up, then stop',
    'Do not apply in peak afternoon heat; avoid contact with flowers; wash hands after handling'),
  ('POTASSIUM_DEFICIENCY', 'deficiency', 'potassium',
    'Sulphate of Potash (SOP, 50% K2O)', 'Corrects potassium deficiency, improves fruit/stem strength',
    '2 g per litre of water (foliar) or 15 g per plant (soil, small pot-scale)',
    'Dilute in water and spray, or apply dry around the root zone and water in',
    'Once every 14 days for 2-3 applications',
    'Keep away from eyes; store in a dry place; do not exceed stated dose'),
  ('IRON_DEFICIENCY', 'deficiency', 'iron',
    'Chelated Iron (Fe-EDTA)', 'Corrects iron deficiency (interveinal yellowing)',
    '1 g per litre of water (foliar spray)',
    'Spray directly on affected leaves in early morning or evening',
    'Once every 7-10 days for up to 3 applications',
    'Avoid spraying under direct sun; do not mix with alkaline fertilizers'),
  ('GENERIC_DEFICIENCY', 'deficiency', '',
    'Balanced NPK Fertilizer (19:19:19)', 'General nutrient correction when the specific deficient nutrient is unclear',
    '2 g per litre of water (foliar) or as per product label for soil application',
    'Dilute in water and spray, or apply as per label instructions',
    'Once every 14 days, reassess after 2 applications',
    'A soil/leaf nutrient test is recommended to confirm the exact deficiency before repeated use'),
  ('FUNGAL_DISEASE', 'disease', 'blight',
    'Mancozeb 75% WP', 'Broad-spectrum fungicide for blights and leaf spot diseases',
    '2.5 g per litre of water',
    'Spray thoroughly covering both sides of leaves',
    'Once every 7 days, up to 3 sprays, stop once symptoms subside',
    'Do not harvest within 7 days of last spray; wear gloves and a mask while spraying; do not spray before rain'),
  ('POWDERY_MILDEW', 'disease', 'mildew',
    'Sulphur 80% WP', 'Controls powdery and downy mildew',
    '2 g per litre of water',
    'Spray evenly over affected foliage',
    'Once every 7-10 days until symptoms clear',
    'Do not apply when temperature exceeds 32°C; do not mix with oil-based sprays'),
  ('RUST_DISEASE', 'disease', 'rust',
    'Propiconazole 25% EC', 'Systemic fungicide effective against rust diseases',
    '1 ml per litre of water',
    'Spray on both leaf surfaces at first sign of rust pustules',
    'Once every 10-14 days, maximum 3 sprays per season',
    'Use protective gloves and eyewear; keep away from water bodies and livestock'),
  ('GENERIC_DISEASE', 'disease', '',
    'Copper Oxychloride 50% WP', 'General-purpose fungicide/bactericide for unidentified fungal or bacterial infections',
    '3 g per litre of water',
    'Spray thoroughly on affected and surrounding healthy foliage',
    'Once every 7-10 days, up to 3 applications',
    'Avoid spraying on flowering plants during pollination hours; do not exceed 3 consecutive applications without expert advice'),
  ('PEST_GENERIC', 'pest', '',
    'Neem Oil (Azadirachtin 1500 ppm)', 'Organic, broad-spectrum control for common insect pests',
    '5 ml per litre of water',
    'Spray on and under leaves, focusing on pest-affected areas',
    'Once every 5-7 days until infestation clears',
    'Spray in early morning or evening, not in direct sunlight; safe for most beneficial insects when dry')
ON CONFLICT (rule_key) DO NOTHING;
