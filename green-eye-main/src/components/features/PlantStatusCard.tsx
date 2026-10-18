import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sprout,
  Camera,
  Droplets,
  Wifi,
  WifiOff,
  CheckCircle2,
  Loader2,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlantStatus } from "@/hooks/usePlantStatus";
import { toast } from "sonner";

type ApplyStep = "idle" | "sending" | "connected" | "activated" | "done" | "skipped" | "error";

const SEVERITY_COLOR: Record<string, string> = {
  none: "bg-[hsl(var(--agro-success))]",
  mild: "bg-[hsl(var(--agro-warning))]",
  moderate: "bg-[hsl(var(--agro-warning))]",
  severe: "bg-[hsl(var(--agro-danger))]",
};

/**
 * The AI + IoT prototype's dashboard surface: shows the most recent plant
 * diagnosis, lets the user trigger analysis (reuses the existing Image
 * Analysis page) and apply the configured treatment (calls the
 * iot-treatment Edge Function, which talks to the ESP32 — or simulates it
 * if ESP32_BASE_URL isn't configured yet).
 */
export const PlantStatusCard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { latestAnalysis, latestTreatment, loading, refresh } = usePlantStatus();
  const [applyStep, setApplyStep] = useState<ApplyStep>("idle");
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const isHealthy = latestAnalysis?.problem_category === "healthy";

  const applyTreatment = async () => {
    if (!latestAnalysis) return;
    setApplyStep("sending");
    setApplyMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("iot-treatment", {
        body: { analysisId: latestAnalysis.id },
      });
      if (error) throw error;

      if (data.status === "skipped") {
        setApplyStep("skipped");
        setApplyMessage(data.reason ?? t("plantStatus.noTreatmentNeeded"));
        return;
      }

      // Brief staged animation so the dashboard visibly reflects the
      // documented pipeline (Sending -> ESP32 connected -> Pump activated ->
      // Completed), even though the Edge Function itself is one request.
      setApplyStep("connected");
      await new Promise((r) => setTimeout(r, 500));
      setApplyStep("activated");
      await new Promise((r) => setTimeout(r, 500));
      setApplyStep("done");
      setApplyMessage(
        data.status === "simulated"
          ? t("plantStatus.simulated")
          : `${data.pump} • ${data.durationSeconds}s`
      );
      refresh();
    } catch (err) {
      console.error("Treatment application failed:", err);
      setApplyStep("error");
      setApplyMessage((err as Error).message);
      toast.error("Could not send the treatment command");
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sprout className="h-5 w-5 text-primary" />
          {t("plantStatus.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!loading && !latestAnalysis && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Sprout className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("plantStatus.noDataYet")}</p>
            <Button onClick={() => navigate("/image-analysis")} className="gap-2">
              <Camera className="h-4 w-4" />
              {t("plantStatus.analyzePlant")}
            </Button>
          </div>
        )}

        {!loading && latestAnalysis && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("plantStatus.crop")}</p>
                <p className="font-medium">{latestAnalysis.crop_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("plantStatus.health")}</p>
                <Badge className={`${SEVERITY_COLOR[latestAnalysis.severity ?? "none"]} text-white`}>
                  {isHealthy ? t("imageAnalysis.healthy") : t("plantStatus.attentionRequired")}
                </Badge>
              </div>
              {!isHealthy && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("plantStatus.problem")}</p>
                    <p className="font-medium">{latestAnalysis.disease_type ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("plantStatus.severity")}</p>
                    <p className="font-medium capitalize">{latestAnalysis.severity ?? "—"}</p>
                  </div>
                </>
              )}
            </div>

            {!isHealthy && latestAnalysis.recommendations && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="mb-1 text-xs text-muted-foreground">{t("plantStatus.recommendedAction")}</p>
                <p>{latestAnalysis.recommendations}</p>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-center gap-2">
                {import.meta.env.VITE_ESP32_CONFIGURED === "true" ? (
                  <Wifi className="h-4 w-4 text-[hsl(var(--agro-success))]" />
                ) : (
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                )}
                <span>
                  {t("plantStatus.esp32")}:{" "}
                  {import.meta.env.VITE_ESP32_CONFIGURED === "true"
                    ? t("plantStatus.connected")
                    : t("plantStatus.notConfigured")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {latestTreatment
                  ? new Date(latestTreatment.applied_at).toLocaleString()
                  : t("plantStatus.none")}
              </div>
            </div>

            {isHealthy ? (
              <p className="text-sm text-muted-foreground">{t("plantStatus.noTreatmentNeeded")}</p>
            ) : (
              <div className="space-y-2">
                <Button
                  onClick={applyTreatment}
                  disabled={applyStep === "sending" || applyStep === "connected" || applyStep === "activated"}
                  className="w-full gap-2"
                >
                  {applyStep === "done" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : applyStep === "sending" || applyStep === "connected" || applyStep === "activated" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Droplets className="h-4 w-4" />
                  )}
                  {applyStep === "sending" && t("plantStatus.sendingCommand")}
                  {applyStep === "connected" && t("plantStatus.esp32Connected")}
                  {applyStep === "activated" && t("plantStatus.pumpActivated")}
                  {applyStep === "done" && t("plantStatus.applicationCompleted")}
                  {(applyStep === "idle" || applyStep === "error" || applyStep === "skipped") &&
                    t("plantStatus.applyTreatment")}
                </Button>
                {applyMessage && (
                  <p className="text-center text-xs text-muted-foreground">{applyMessage}</p>
                )}
              </div>
            )}

            <Button variant="outline" onClick={() => navigate("/image-analysis")} className="w-full gap-2">
              <Camera className="h-4 w-4" />
              {t("plantStatus.analyzePlant")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
