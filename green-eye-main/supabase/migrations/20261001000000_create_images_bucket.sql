-- The Image Analysis upload/camera feature (ImageUpload.tsx) uploads to a
-- bucket called "images", but no migration ever created it — it only worked
-- if someone manually added it via the Supabase dashboard. On a fresh
-- project (or after a reset) uploads would fail outright.
--
-- The bucket is created PRIVATE: the analyze-image Edge Function downloads
-- the file itself with the service-role key (which bypasses RLS), so OpenAI
-- always gets the real image bytes regardless of public access. The browser
-- never needs a public URL either — the UI shows the locally-captured/
-- selected file directly. Keeping it private avoids exposing uploaded crop
-- photos to anyone with the URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can view their own images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their own images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'images' AND auth.uid() IS NOT NULL);
