import { supabase } from "@/integrations/supabase/client";

/**
 * The `images` storage bucket is private (see the chatbot-feature migration
 * that created it), but image_analysis.image_url was built with
 * getPublicUrl() at upload time — a URL that only resolves for a public
 * bucket. For anything that displays a stored image later (this Reports
 * page, PDF export), we need a signed URL instead.
 *
 * Parses the bucket + object path back out of that stored URL and asks
 * Storage for a short-lived signed URL. Falls back to the original URL
 * if it isn't a Supabase storage URL we recognize (e.g. a different,
 * genuinely public bucket), so nothing breaks for other callers.
 */
export async function getDisplayableImageUrl(rawUrl: string): Promise<string> {
  const match = rawUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return rawUrl;

  const [, bucket, path] = match;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(decodeURIComponent(path), 3600);
  if (error || !data?.signedUrl) return rawUrl;
  return data.signedUrl;
}
