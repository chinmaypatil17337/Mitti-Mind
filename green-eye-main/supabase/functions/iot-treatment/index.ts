import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Treatment-decision layer.
//
// This is the one rule the whole feature exists to enforce: the LLM is
// allowed to DETECT a problem, but it is never allowed to INVENT a dose. The
// mapping from "what was detected" to "what the pump actually does" lives
// here, as plain, auditable, backend-controlled constants — not inside an AI
// prompt. Edit these numbers to match your real prototype's calibration.
// ---------------------------------------------------------------------------
interface TreatmentRule {
  nutrient: string | null;
  pump: string;        // which physical pump/relay channel on the ESP32
  durationSeconds: number;
}

const TREATMENT_RULES: Record<string, TreatmentRule> = {
  NITROGEN_DEFICIENCY: { nutrient: 'nitrogen', pump: 'pump_1', durationSeconds: 3 },
  POTASSIUM_DEFICIENCY: { nutrient: 'potassium', pump: 'pump_2', durationSeconds: 3 },
  IRON_DEFICIENCY: { nutrient: 'iron', pump: 'pump_3', durationSeconds: 2 },
  GENERIC_DEFICIENCY: { nutrient: 'balanced-nutrient-mix', pump: 'pump_1', durationSeconds: 3 },
  FUNGAL_DISEASE: { nutrient: null, pump: 'pump_4', durationSeconds: 2 }, // e.g. fungicide/water solution
  GENERIC_DISEASE: { nutrient: null, pump: 'pump_4', durationSeconds: 2 },
  PEST: { nutrient: null, pump: 'pump_5', durationSeconds: 2 },
};

// Keyword -> rule key. This is intentionally simple (string matching on the
// disease_type the vision model returned) rather than another LLM call, so
// the actual dosing decision stays fully deterministic and inspectable.
function selectRuleKey(problemCategory: string, diseaseType: string | null): string | null {
  const text = (diseaseType ?? '').toLowerCase();

  if (problemCategory === 'deficiency') {
    if (text.includes('nitrogen')) return 'NITROGEN_DEFICIENCY';
    if (text.includes('potassium')) return 'POTASSIUM_DEFICIENCY';
    if (text.includes('iron')) return 'IRON_DEFICIENCY';
    return 'GENERIC_DEFICIENCY';
  }
  if (problemCategory === 'disease') {
    if (/fung|blight|mildew|rust|rot|spot|mold/.test(text)) return 'FUNGAL_DISEASE';
    return 'GENERIC_DISEASE';
  }
  if (problemCategory === 'pest') {
    return 'PEST';
  }
  // "healthy" or "unknown" -> no rule, no treatment.
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const { analysisId } = await req.json();
    if (!analysisId) {
      return new Response(JSON.stringify({ error: 'analysisId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: analysis, error: fetchError } = await supabase
      .from('image_analysis')
      .select('id, user_id, crop_name, problem_category, disease_type, severity')
      .eq('id', analysisId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !analysis) {
      return new Response(JSON.stringify({ error: 'Analysis not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const problemCategory = analysis.problem_category ?? 'unknown';

    // Rule #1 from the spec: a healthy plant gets no treatment, full stop.
    if (problemCategory === 'healthy') {
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'Plant is healthy — no treatment needed.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ruleKey = selectRuleKey(problemCategory, analysis.disease_type);
    if (!ruleKey) {
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'Could not map this result to a configured treatment rule.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const rule = TREATMENT_RULES[ruleKey];

    // Send the command to the ESP32. ESP32_BASE_URL is a Supabase secret,
    // e.g. "http://192.168.1.50" (the ESP32's local IP running the sketch in
    // esp32/pump_controller.ino). If it isn't configured yet — which is the
    // expected state until the physical prototype is wired up — we log a
    // "simulated" application instead of failing, so the full software
    // pipeline (detect -> decide -> log -> show on dashboard) is still
    // demonstrable without hardware.
    const esp32BaseUrl = Deno.env.get('ESP32_BASE_URL');
    let status: 'simulated' | 'sent' | 'failed' = 'simulated';
    let esp32Response: unknown = null;

    if (esp32BaseUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${esp32BaseUrl}/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pump: rule.pump, duration: rule.durationSeconds }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        try {
          esp32Response = await res.json();
        } catch {
          esp32Response = { raw: await res.text().catch(() => '') };
        }
        status = res.ok ? 'sent' : 'failed';
      } catch (err) {
        console.error('ESP32 request failed:', err);
        status = 'failed';
        esp32Response = { error: (err as Error).message };
      }
    }

    const { data: logged, error: logError } = await supabase
      .from('treatment_applications')
      .insert({
        user_id: userId,
        image_analysis_id: analysisId,
        problem_category: problemCategory,
        rule_key: ruleKey,
        nutrient: rule.nutrient,
        pump: rule.pump,
        duration_seconds: rule.durationSeconds,
        status,
        esp32_response: esp32Response,
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to log treatment application:', logError);
    }

    return new Response(
      JSON.stringify({
        status,
        ruleKey,
        nutrient: rule.nutrient,
        pump: rule.pump,
        durationSeconds: rule.durationSeconds,
        esp32Configured: Boolean(esp32BaseUrl),
        applicationId: logged?.id ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in iot-treatment function:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
