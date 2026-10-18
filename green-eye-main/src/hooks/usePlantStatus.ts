import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgroContext, type PlantStatusSnapshot } from "@/contexts/AgroContext";
import type { Database } from "@/integrations/supabase/types";

type ImageAnalysisRow = Database["public"]["Tables"]["image_analysis"]["Row"];
type TreatmentRow = Database["public"]["Tables"]["treatment_applications"]["Row"];

interface PlantStatusResult {
  latestAnalysis: ImageAnalysisRow | null;
  latestTreatment: TreatmentRow | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Loads this user's most recent completed image analysis and most recent
 * treatment application, for the dashboard's "Plant Status" card. Also
 * mirrors the analysis into AgroContext so the chatbot can reference it.
 */
export function usePlantStatus(): PlantStatusResult {
  const { user } = useAuth();
  const { setPlantStatus } = useAgroContext();
  const [latestAnalysis, setLatestAnalysis] = useState<ImageAnalysisRow | null>(null);
  const [latestTreatment, setLatestTreatment] = useState<TreatmentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [{ data: analysisRows }, { data: treatmentRows }] = await Promise.all([
        supabase
          .from("image_analysis")
          .select("*")
          .eq("user_id", user.id)
          .eq("analysis_status", "completed")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("treatment_applications")
          .select("*")
          .eq("user_id", user.id)
          .order("applied_at", { ascending: false })
          .limit(1),
      ]);

      if (cancelled) return;

      const analysis = analysisRows?.[0] ?? null;
      setLatestAnalysis(analysis);
      setLatestTreatment(treatmentRows?.[0] ?? null);
      setLoading(false);

      if (analysis) {
        const category = (analysis.problem_category ?? "unknown") as PlantStatusSnapshot["problemCategory"];
        const snapshot: PlantStatusSnapshot = {
          cropName: analysis.crop_name ?? "Unknown crop",
          problemCategory: category,
          problemLabel:
            category === "healthy"
              ? "Healthy"
              : analysis.disease_type ?? "Unspecified issue",
          severity: (analysis.severity ?? "none") as PlantStatusSnapshot["severity"],
          recommendedAction: analysis.recommendations ?? "",
          analysisId: analysis.id,
          plantId: analysis.plant_id,
          detectedAt: analysis.created_at ?? new Date().toISOString(),
        };
        setPlantStatus(snapshot);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tick]);

  return { latestAnalysis, latestTreatment, loading, refresh };
}
