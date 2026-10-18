import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import { lookupTreatment, type TreatmentReferenceRow } from "@/lib/treatmentLookup";
import { computeRiskBreakdown, type RiskBreakdown, type ProblemCategory, type Severity } from "@/lib/riskEngine";

type ImageAnalysisRow = Database["public"]["Tables"]["image_analysis"]["Row"];
type HealthHistoryRow = Database["public"]["Tables"]["plant_health_history"]["Row"];
type TreatmentAppRow = Database["public"]["Tables"]["treatment_applications"]["Row"];

export interface ReportSummary {
  id: string;
  cropName: string;
  createdAt: string;
  imageUrl: string;
  diseaseType: string | null;
  problemCategory: string | null;
  severity: string | null;
  confidenceScore: number | null;
}

/** The report list — every completed analysis for this farmer, newest first. */
export function useReportsList() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("image_analysis")
      .select("id, crop_name, created_at, image_url, disease_type, problem_category, severity, confidence_score")
      .eq("user_id", user.id)
      .eq("analysis_status", "completed")
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setReports(
        (data ?? []).map((r) => ({
          id: r.id,
          cropName: r.crop_name ?? "Unknown crop",
          createdAt: r.created_at ?? new Date().toISOString(),
          imageUrl: r.image_url,
          diseaseType: r.disease_type,
          problemCategory: r.problem_category,
          severity: r.severity,
          confidenceScore: r.confidence_score,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { reports, loading, error, refresh };
}

export interface ReportDetailData {
  analysis: ImageAnalysisRow;
  plantHistory: HealthHistoryRow[];
  previousTreatments: TreatmentAppRow[];
  verifiedTreatment: TreatmentReferenceRow | null;
  risk: RiskBreakdown;
}

/** The full detail for one report: everything a report page/PDF needs. */
export function useReportDetail(analysisId: string | null) {
  const { user } = useAuth();
  const [data, setData] = useState<ReportDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!analysisId || !user) {
      setData(null);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: analysis, error: analysisError } = await supabase
          .from("image_analysis")
          .select("*")
          .eq("id", analysisId)
          .eq("user_id", user.id)
          .single();

        if (analysisError || !analysis) throw new Error(analysisError?.message ?? "Report not found");
        if (cancelled) return;

        const [{ data: history }, { data: treatments }, verifiedTreatment] = await Promise.all([
          analysis.plant_id
            ? supabase
                .from("plant_health_history")
                .select("*")
                .eq("plant_id", analysis.plant_id)
                .order("recorded_at", { ascending: false })
                .limit(10)
            : Promise.resolve({ data: [] as HealthHistoryRow[] }),
          analysis.plant_id
            ? supabase
                .from("treatment_applications")
                .select("*")
                .eq("plant_id", analysis.plant_id)
                .order("applied_at", { ascending: false })
                .limit(10)
            : Promise.resolve({ data: [] as TreatmentAppRow[] }),
          lookupTreatment(analysis.problem_category, analysis.disease_type),
        ]);

        if (cancelled) return;

        const risk = computeRiskBreakdown({
          problemCategory: (analysis.problem_category as ProblemCategory) ?? "unknown",
          severity: (analysis.severity as Severity) ?? "none",
          healthScore: analysis.health_score,
          weather:
            analysis.weather_temperature !== null
              ? {
                  temperature: analysis.weather_temperature,
                  humidity: analysis.weather_humidity,
                  rainfall: analysis.weather_rainfall,
                }
              : null,
        });

        setData({
          analysis,
          plantHistory: history ?? [],
          previousTreatments: treatments ?? [],
          verifiedTreatment,
          risk,
        });
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [analysisId, user]);

  return { data, loading, error };
}
