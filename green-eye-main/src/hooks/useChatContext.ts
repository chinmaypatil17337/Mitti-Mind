import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgroContext } from "@/contexts/AgroContext";

/**
 * Builds the structured context object sent to the chatbot with every
 * message (see prompt_manager.py's build_context_block for how the backend
 * renders it). Rebuilt fresh on every single message — nothing here is
 * reused from a previous turn — so the chatbot always answers from the
 * farmer's current data, not a stale snapshot.
 *
 * Two tiers, per the "don't send the whole database every time" rule:
 *  - CHEAP, ALWAYS INCLUDED: farmer_location + weather (from AgroContext,
 *    already fresh from the Weather card) and the resolved plant's
 *    current_plant + latest_prediction (one small live query below).
 *  - SELECTIVE, FETCHED ON DEMAND: plant_history, previous_treatments, and
 *    the full farm plant list — only queried when the farmer's wording
 *    suggests they're relevant (simple keyword heuristic, not another LLM
 *    call, so it stays fast and free).
 *
 * CROP RESOLUTION: if the farmer names one of their own crops ("my
 * tomato"), that crop's own latest data is used — even if it isn't the
 * single most-recently-analyzed plant overall. Otherwise we fall back to
 * whichever plant was most recently analyzed, for bare follow-ups like
 * "what should I do about this?".
 */

const HISTORY_KEYWORDS = [
  "history", "happened", "before", "previous", "last week", "last time",
  "earlier", "past", "when did", "has this", "has it", "recur",
];
const TREATMENT_KEYWORDS = [
  "treatment", "applied", "sprayed", "fertiliz", "pump", "dose", "dosage", "used before",
];
const FARM_WIDE_KEYWORDS = [
  "my farm", "all my plants", "other plants", "my crops", "entire farm", "whole farm", "every plant",
];
const YIELD_KEYWORDS = ["yield", "harvest amount", "production", "quintal", "tonnes", "tons per"];

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

interface PlantRow {
  id: string;
  crop_name: string;
  status: string | null;
  planted_at: string | null;
}

export function useChatContext() {
  const { user } = useAuth();
  const { weather } = useAgroContext();

  const buildContext = useCallback(
    async (userMessage: string): Promise<Record<string, unknown>> => {
      const context: Record<string, unknown> = {};

      // --- Location + weather: cheap, already fresh in AgroContext --------
      if (weather) {
        const [area, ...rest] = weather.locationName.split(",").map((s) => s.trim());
        context.farmer_location = { area, region: rest.join(", ") || undefined };
        context.weather = {
          location: weather.locationName,
          temperature_c: weather.temperature,
          humidity_percent: weather.humidity,
          rainfall_mm: weather.rainfallMm,
          condition: weather.condition,
          wind_kph: weather.windKph,
        };
      }

      if (!user) return context;

      // --- Resolve WHICH plant this message is about ----------------------
      // Fetch the farmer's crop list fresh every time (small table, cheap)
      // so we can both detect a named crop and — if needed below — attach
      // the full farm list, without a second round trip.
      const { data: plants } = await supabase
        .from("plants")
        .select("id, crop_name, status, planted_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      const lowerMessage = userMessage.toLowerCase();
      const namedPlant: PlantRow | undefined = (plants as PlantRow[] | null)?.find((p) =>
        lowerMessage.includes(p.crop_name.toLowerCase())
      );

      let resolvedPlantId: string | undefined = namedPlant?.id;

      // No crop named in this message — fall back to whichever plant was
      // most recently analyzed (fetched live, not from a cached snapshot,
      // so this reflects an analysis that may have just completed).
      if (!resolvedPlantId) {
        const { data: latestAnalysis } = await supabase
          .from("image_analysis")
          .select("plant_id")
          .eq("user_id", user.id)
          .eq("analysis_status", "completed")
          .not("plant_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedPlantId = latestAnalysis?.plant_id ?? undefined;
      }

      if (resolvedPlantId) {
        const { data: analysis } = await supabase
          .from("image_analysis")
          .select("crop_name, problem_category, disease_type, severity, confidence_score, recommendations, created_at")
          .eq("plant_id", resolvedPlantId)
          .eq("analysis_status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (analysis) {
          const isHealthy = analysis.problem_category === "healthy";
          context.current_plant = {
            plant_id: resolvedPlantId,
            crop: analysis.crop_name,
            health_status: isHealthy ? "Healthy" : analysis.disease_type ?? analysis.problem_category,
          };
          context.latest_prediction = {
            crop: analysis.crop_name,
            disease: analysis.disease_type ?? (isHealthy ? "None" : analysis.problem_category),
            problem_category: analysis.problem_category,
            confidence: analysis.confidence_score,
            severity: analysis.severity,
            detected_at: analysis.created_at,
            recommended_action: analysis.recommendations,
          };
        }
      }

      // --- Selective, fetched only when the question calls for it --------
      const wantsHistory = matchesAny(userMessage, HISTORY_KEYWORDS);
      const wantsTreatments = matchesAny(userMessage, TREATMENT_KEYWORDS);
      const wantsFarmWide = matchesAny(userMessage, FARM_WIDE_KEYWORDS);
      const wantsYield = matchesAny(userMessage, YIELD_KEYWORDS);

      if (wantsHistory && resolvedPlantId) {
        const { data } = await supabase
          .from("plant_health_history")
          .select("health_status, recorded_at")
          .eq("plant_id", resolvedPlantId)
          .order("recorded_at", { ascending: false })
          .limit(5);
        if (data?.length) {
          context.plant_history = data.map((h) => ({
            date: new Date(h.recorded_at).toLocaleDateString(),
            status: h.health_status,
          }));
        }
      }

      if (wantsTreatments && resolvedPlantId) {
        const { data } = await supabase
          .from("treatment_applications")
          .select("rule_key, nutrient, status, applied_at")
          .eq("plant_id", resolvedPlantId)
          .order("applied_at", { ascending: false })
          .limit(3);
        if (data?.length) {
          context.previous_treatments = data.map((t) => ({
            date: new Date(t.applied_at).toLocaleDateString(),
            treatment: t.nutrient ?? t.rule_key,
            status: t.status,
          }));
        }
      }

      if ((wantsFarmWide || wantsYield) && plants?.length) {
        context.farm_plants = plants.map((p) => ({
          crop: p.crop_name,
          status: p.status,
          planted_at: p.planted_at,
        }));
      }

      return context;
    },
    [user, weather]
  );

  return { buildContext };
}
