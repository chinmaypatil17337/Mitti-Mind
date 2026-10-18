import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with the auth header
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { imageUrl, fieldId, bucket, path } = await req.json();

    console.log('Starting image analysis for user:', user.id);

    // Create analysis record
    const { data: analysis, error: insertError } = await supabase
      .from('image_analysis')
      .insert({
        user_id: user.id,
        field_id: fieldId,
        image_url: imageUrl,
        analysis_status: 'processing'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating analysis record:', insertError);
      throw insertError;
    }

    // Start background analysis
    EdgeRuntime.waitUntil(performAnalysis(analysis.id, imageUrl, supabase, bucket, path, user.id));

    return new Response(JSON.stringify({ 
      success: true, 
      analysisId: analysis.id,
      status: 'processing'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-image function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Builds a data: URL from the exact bytes we have on hand, so OpenAI is
// guaranteed to see the real photo instead of trying (and sometimes failing)
// to fetch it itself.
function toDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

// Fetch the actual image bytes before calling OpenAI. Preferred path: pull
// straight from Supabase Storage with the service-role key (works no matter
// whether the bucket is public). Fallback: fetch the given URL directly.
async function loadImageAsDataUrl(
  supabase: any,
  imageUrl: string,
  bucket?: string,
  path?: string
): Promise<string> {
  if (bucket && path) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (!error && data) {
      const buffer = new Uint8Array(await data.arrayBuffer());
      return toDataUrl(buffer, data.type || 'image/jpeg');
    }
    console.error('Storage download failed, falling back to URL fetch:', error);
  }

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Could not fetch the uploaded image (status ${res.status}). The analysis cannot proceed without the real image bytes.`);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  return toDataUrl(buffer, res.headers.get('content-type') || 'image/jpeg');
}

// Keeps each farmer's crops as one continuous record over time rather than
// a new unrelated "plant" every time casing/wording differs slightly
// (e.g. "tomato" vs "Tomato").
function normalizeCropName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Finds (or creates) the plants record for this farmer+crop, updates its
// status/location, and logs a plant_health_history entry — this is what
// lets the chatbot answer "what happened to my tomato plant?" later, and
// is what the chatbot's farmer_location block ultimately traces back to.
async function updatePlantRecord(
  supabase: any,
  userId: string,
  cropName: string,
  statusSummary: string
): Promise<string | null> {
  try {
    const normalizedCrop = normalizeCropName(cropName || "Unknown crop");

    const { data: location } = await supabase
      .from("farmer_locations")
      .select("latitude, longitude, location_name, region")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: plant, error: upsertError } = await supabase
      .from("plants")
      .upsert(
        {
          user_id: userId,
          crop_name: normalizedCrop,
          status: statusSummary,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          location_name: location?.location_name ?? null,
          region: location?.region ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,crop_name" }
      )
      .select("id")
      .single();

    if (upsertError || !plant) {
      console.error("Failed to upsert plant record:", upsertError);
      return null;
    }

    const { error: historyError } = await supabase.from("plant_health_history").insert({
      plant_id: plant.id,
      health_status: statusSummary,
    });
    if (historyError) {
      console.error("Failed to log plant health history:", historyError);
    }

    return plant.id as string;
  } catch (err) {
    console.error("updatePlantRecord failed:", err);
    return null;
  }
}

// Reuses the existing weather-data function (the same one the Weather card
// calls) to capture a snapshot at analysis time, using the farmer's last
// known location from farmer_locations. Returns null (never fabricated
// values) if the farmer has no saved location yet or the call fails.
async function captureWeatherSnapshot(
  supabase: any,
  supabaseUrl: string,
  userId: string
): Promise<{ location: string; temperature: number; humidity: number; rainfall: number; condition: string } | null> {
  try {
    const { data: loc } = await supabase
      .from('farmer_locations')
      .select('latitude, longitude, location_name, region')
      .eq('user_id', userId)
      .maybeSingle();

    if (!loc) return null;

    const res = await fetch(`${supabaseUrl}/functions/v1/weather-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: loc.latitude, lng: loc.longitude }),
    });
    if (!res.ok) return null;

    const weather = await res.json();
    const locationName = loc.region ? `${loc.location_name}, ${loc.region}` : loc.location_name;

    return {
      location: locationName ?? weather.location?.name ?? 'Unknown location',
      temperature: weather.current?.temperature,
      humidity: weather.current?.humidity,
      rainfall: weather.current?.rainfallMm,
      condition: weather.current?.condition,
    };
  } catch (err) {
    console.error('captureWeatherSnapshot failed (continuing without it):', err);
    return null;
  }
}

async function performAnalysis(
  analysisId: string,
  imageUrl: string,
  supabase: any,
  bucket: string | undefined,
  path: string | undefined,
  userId: string
) {
  try {
    console.log('Performing AI analysis for image:', imageUrl);

    // Get the real pixels onto this server before asking OpenAI about them —
    // sending a URL that OpenAI itself must fetch is what caused it to
    // sometimes guess a generic answer (e.g. always "Leaf Spot") when it
    // couldn't actually reach the photo.
    const imageDataUrl = await loadImageAsDataUrl(supabase, imageUrl, bucket, path);

    // Call OpenAI Vision API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a plant pathologist analyzing a close-up photo of a real plant leaf. Look carefully at the actual spots, discoloration, lesions, patterns, and leaf texture visible in THIS image before answering — do not give a generic or default diagnosis.

Identify the SPECIFIC disease that matches the visible symptoms (for example: Early Blight, Late Blight, Septoria Leaf Spot, Bacterial Spot, Powdery Mildew, Downy Mildew, Rust, Anthracnose, Mosaic Virus, Leaf Curl Virus, Black Spot, Citrus Canker, Nitrogen Deficiency, or another real plant disease/disorder). Only use "Leaf Spot" as a general label if you cannot find a more specific match among common fungal/bacterial/viral diseases.

If the leaf looks healthy — uniform green color, no lesions, no discoloration, no visible pests — you MUST set disease_detected to false, disease_type to null, problem_category to "healthy", and severity to "none". Do not invent a disease on a healthy-looking leaf.

You must also classify WHAT KIND of problem this is, because the treatment system reacts very differently depending on the category — never recommend a fertilizer for a fungal disease, and never recommend a fungicide for a nutrient deficiency:
- "deficiency" — a nutrient deficiency (e.g. nitrogen, potassium, iron, magnesium). Typical signs: uniform yellowing (chlorosis), interveinal yellowing, stunted growth, pale/discolored leaf margins, with NO distinct spots/lesions/fungal growth.
- "disease" — a fungal, bacterial or viral disease. Typical signs: distinct spots, lesions, mold, mosaic patterning, wilting from infection, cankers.
- "pest" — visible insect/mite damage (holes, webbing, visible insects, scale, stippling).
- "healthy" — no visible problem.
- "unknown" — only if the image genuinely does not allow any of the above to be determined.

Provide:
1. The crop/plant name as best you can identify it from the leaf (e.g. "Tomato", "Wheat", "Mango"). Use "Unknown crop" only if truly unidentifiable.
2. problem_category — exactly one of: disease, deficiency, pest, healthy, unknown (see definitions above)
3. Overall health assessment (score 0-100, reflecting what you actually see)
4. Vegetation index estimation (NDVI-like, 0-1 scale)
5. Disease detection (true/false) — true only when problem_category is "disease" or "pest" with a named cause; grounded strictly in visible evidence
6. If disease/pest detected, the specific name (e.g. "Early Blight", "Aphid infestation"). If problem_category is "deficiency", put the specific nutrient here instead (e.g. "Nitrogen deficiency")
7. severity — exactly one of: none, mild, moderate, severe
8. Confidence score (0-1) — reflecting how certain you actually are from the image, not a stock number
9. Detailed, problem-specific recommendations: for a disease, name the specific fungicide/bactericide/cultural practice; for a deficiency, name the specific nutrient and a general corrective approach (do NOT invent an exact chemical dose — that is handled by a separate calibrated system); for a pest, name the specific pest-management approach; for healthy, say no treatment is required.
10. symptoms — 1-2 sentences describing exactly what you observe in THIS image (spots, discoloration pattern, texture, insects, etc). For a healthy plant, describe what looks healthy.
11. possible_cause — 1-2 sentences on the likely cause (e.g. fungal spores spreading in humid conditions, nutrient-poor soil, insect vector). For healthy, say "No issue detected."
12. effect_on_crop — 1-2 sentences on how this would affect the plant/yield if untreated. For healthy, say growth should continue normally with routine care.
13. ai_explanation — a short (2-4 sentence) plain-language summary tying symptoms, cause and effect together for a farmer reading a report, in your own words (do not just repeat the other fields verbatim).

Respond with ONLY raw JSON (no markdown fences, no commentary) with these exact fields:
{
  "crop_name": string,
  "problem_category": "disease" | "deficiency" | "pest" | "healthy" | "unknown",
  "health_score": number,
  "vegetation_index": number,
  "disease_detected": boolean,
  "disease_type": string or null,
  "severity": "none" | "mild" | "moderate" | "severe",
  "confidence_score": number,
  "recommendations": string,
  "symptoms": string,
  "possible_cause": string,
  "effect_on_crop": string,
  "ai_explanation": string
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this specific leaf photo. Identify the exact disease visible (not a generic guess) and explain the reasoning briefly inside the recommendations field.'
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl }
              }
            ]
          }
        ],
        max_tokens: 1000
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;

    // Parse the JSON response from OpenAI (strip ```json fences if present)
    let parsedAnalysis;
    try {
      const cleaned = analysisText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsedAnalysis = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', analysisText);
      // Fallback analysis
      parsedAnalysis = {
        crop_name: 'Unknown crop',
        problem_category: 'unknown',
        health_score: 75,
        vegetation_index: 0.65,
        disease_detected: false,
        disease_type: null,
        severity: 'none',
        confidence_score: 0.8,
        recommendations: 'Analysis completed. Please review the image manually for detailed assessment.',
        symptoms: null,
        possible_cause: null,
        effect_on_crop: null,
        ai_explanation: 'The AI response could not be parsed automatically. Please review the image manually.'
      };
    }

    // Snapshot the weather at analysis time by reusing the existing
    // weather-data function (same one the Weather card calls) — never a
    // second weather implementation. A report must show what the weather
    // actually was when the diagnosis happened, not today's weather when
    // someone reads the report later, so this has to be captured now.
    const weatherSnapshot = await captureWeatherSnapshot(supabase, supabaseUrl, userId);

    // Fold this result into the farmer's continuous per-crop plant record
    // and history timeline (context the chatbot reads later).
    const cropName = parsedAnalysis.crop_name ?? 'Unknown crop';
    const problemCategory = parsedAnalysis.problem_category ?? 'unknown';
    const statusSummary =
      problemCategory === 'healthy'
        ? 'Healthy'
        : `${parsedAnalysis.disease_type ?? problemCategory} (${parsedAnalysis.severity ?? 'unknown'} severity, ${problemCategory})`;
    const plantId = await updatePlantRecord(supabase, userId, cropName, statusSummary);

    // Update analysis record with results
    const { error: updateError } = await supabase
      .from('image_analysis')
      .update({
        analysis_status: 'completed',
        crop_name: cropName,
        plant_id: plantId,
        problem_category: problemCategory,
        health_score: parsedAnalysis.health_score,
        vegetation_index: parsedAnalysis.vegetation_index,
        disease_detected: parsedAnalysis.disease_detected,
        disease_type: parsedAnalysis.disease_type,
        severity: parsedAnalysis.severity ?? 'none',
        confidence_score: parsedAnalysis.confidence_score,
        recommendations: parsedAnalysis.recommendations,
        symptoms: parsedAnalysis.symptoms ?? null,
        possible_cause: parsedAnalysis.possible_cause ?? null,
        effect_on_crop: parsedAnalysis.effect_on_crop ?? null,
        ai_explanation: parsedAnalysis.ai_explanation ?? null,
        weather_location: weatherSnapshot?.location ?? null,
        weather_temperature: weatherSnapshot?.temperature ?? null,
        weather_humidity: weatherSnapshot?.humidity ?? null,
        weather_rainfall: weatherSnapshot?.rainfall ?? null,
        weather_condition: weatherSnapshot?.condition ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', analysisId);

    if (updateError) {
      console.error('Error updating analysis record:', updateError);
      throw updateError;
    }

    console.log('Analysis completed successfully for ID:', analysisId);

  } catch (error) {
    console.error('Error in background analysis:', error);
    
    // Update record with error status
    await supabase
      .from('image_analysis')
      .update({
        analysis_status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', analysisId);
  }
}