import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Download,
  Printer,
  Loader2,
  AlertTriangle,
  CloudSun,
  History,
  ShieldAlert,
  Leaf,
  Pill,
} from "lucide-react";
import { useReportDetail } from "@/hooks/useReports";
import { getDisplayableImageUrl } from "@/lib/imageUrl";
import { generateReportPdf } from "@/lib/generateReportPdf";
import { toast } from "sonner";

interface ReportDetailProps {
  analysisId: string;
  onBack: () => void;
}

const RISK_COLOR: Record<string, string> = {
  Low: "bg-[hsl(var(--agro-success))]",
  Moderate: "bg-[hsl(var(--agro-warning))]",
  High: "bg-orange-500",
  Critical: "bg-[hsl(var(--agro-danger))]",
};

const SEVERITY_COLOR: Record<string, string> = {
  none: "bg-[hsl(var(--agro-success))]",
  mild: "bg-[hsl(var(--agro-warning))]",
  moderate: "bg-[hsl(var(--agro-warning))]",
  severe: "bg-[hsl(var(--agro-danger))]",
};

export const ReportDetail = ({ analysisId, onBack }: ReportDetailProps) => {
  const { t } = useTranslation();
  const { data, loading, error } = useReportDetail(analysisId);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    getDisplayableImageUrl(data.analysis.image_url).then((url) => {
      if (!cancelled) setImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const downloadPdf = async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const doc = await generateReportPdf(data);
      doc.save(`MittiMind-Report-${data.analysis.crop_name ?? "crop"}-${data.analysis.id.slice(0, 8)}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Could not generate the PDF report");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const printReport = () => window.print();

  if (loading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <p className="text-muted-foreground">{error || t("reportsPage.notFound")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { analysis, plantHistory, previousTreatments, verifiedTreatment, risk } = data;
  const isHealthy = analysis.problem_category === "healthy";

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={printReport} className="gap-2">
            <Printer className="h-4 w-4" /> {t("reportsPage.printReport")}
          </Button>
          <Button size="sm" onClick={downloadPdf} disabled={generatingPdf} className="gap-2">
            {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("reportsPage.downloadPdf")}
          </Button>
        </div>
      </div>

      {/* 1. Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-primary" />
            {t("reportsPage.overview")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[200px_1fr]">
          {imageUrl && (
            <img src={imageUrl} alt={analysis.crop_name ?? "Crop"} className="h-48 w-full rounded-lg object-cover md:h-full" />
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("plantStatus.crop")}</p>
              <p className="font-medium">{analysis.crop_name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("reportsPage.analysisDate")}</p>
              <p className="font-medium">{new Date(analysis.created_at ?? "").toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("imageAnalysis.detectedDisease")}</p>
              <p className="font-medium">{isHealthy ? t("imageAnalysis.healthy") : analysis.disease_type ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("imageAnalysis.confidence")}</p>
              <Badge variant="outline">
                {analysis.confidence_score !== null
                  ? `${Math.round(analysis.confidence_score <= 1 ? analysis.confidence_score * 100 : analysis.confidence_score)}%`
                  : "N/A"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("plantStatus.severity")}</p>
              <Badge className={`${SEVERITY_COLOR[analysis.severity ?? "none"]} text-white`}>{analysis.severity ?? "—"}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("reportsPage.overallRisk")}</p>
              <Badge className={`${RISK_COLOR[risk.overallCategory]} text-white`}>{risk.overallCategory}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. AI explanation */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reportsPage.aiExplanation")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("reportsPage.symptoms")}</p>
            <p>{analysis.symptoms || t("reportsPage.notRecorded")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("reportsPage.possibleCause")}</p>
            <p>{analysis.possible_cause || t("reportsPage.notRecorded")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("reportsPage.effectOnCrop")}</p>
            <p>{analysis.effect_on_crop || t("reportsPage.notRecorded")}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="mb-1 text-xs text-muted-foreground">{t("reportsPage.aiExplanation")}</p>
            <p>{analysis.ai_explanation || analysis.recommendations || t("reportsPage.notRecorded")}</p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Treatment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            {t("reportsPage.treatmentRecommendation")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {verifiedTreatment ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("reportsPage.treatmentName")}</p>
                  <p className="font-medium">{verifiedTreatment.treatment_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("reportsPage.purpose")}</p>
                  <p>{verifiedTreatment.purpose}</p>
                </div>
                <div className="col-span-2 rounded-lg bg-[hsl(var(--agro-success))]/10 p-2">
                  <p className="text-xs text-muted-foreground">{t("reportsPage.verifiedDosage")}</p>
                  <p className="font-semibold">{verifiedTreatment.dosage}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("reportsPage.applicationMethod")}</p>
                  <p>{verifiedTreatment.application_method}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("reportsPage.frequency")}</p>
                  <p>{verifiedTreatment.frequency}</p>
                </div>
              </div>
              <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
                <p className="text-xs font-medium">{t("reportsPage.precautions")}</p>
                <p>{verifiedTreatment.precautions}</p>
              </div>
            </>
          ) : isHealthy ? (
            <p className="text-muted-foreground">{t("plantStatus.noTreatmentNeeded")}</p>
          ) : (
            <p className="text-muted-foreground">{t("reportsPage.dosageNotAvailable")}</p>
          )}
        </CardContent>
      </Card>

      {/* 4. Weather */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-primary" />
            {t("weather.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {analysis.weather_temperature !== null ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">{t("weather.location")}</p>
                <p className="font-medium">{analysis.weather_location}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("weather.temperature")}</p>
                <p className="font-medium">{analysis.weather_temperature}°C</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("weather.humidity")}</p>
                <p className="font-medium">{analysis.weather_humidity}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("weather.rainfall")}</p>
                <p className="font-medium">{analysis.weather_rainfall} mm</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("weather.condition")}</p>
                <p className="font-medium">{analysis.weather_condition}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("reportsPage.noWeatherData")}</p>
          )}
        </CardContent>
      </Card>

      {/* 5. History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            {t("reportsPage.cropHealthHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plantHistory.length === 0 && previousTreatments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reportsPage.noHistory")}</p>
          ) : (
            <div className="space-y-2 text-sm">
              {plantHistory.map((h) => (
                <div key={h.id} className="flex justify-between border-b py-1.5 last:border-0">
                  <span className="text-muted-foreground">{new Date(h.recorded_at).toLocaleDateString()}</span>
                  <span>{h.health_status}</span>
                </div>
              ))}
              {previousTreatments.map((treatment) => (
                <div key={treatment.id} className="flex justify-between border-b py-1.5 last:border-0">
                  <span className="text-muted-foreground">{new Date(treatment.applied_at).toLocaleDateString()}</span>
                  <span>
                    {t("reportsPage.treatmentApplied")}: {treatment.nutrient ?? treatment.rule_key} ({treatment.status})
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. Risk */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            {t("reportsPage.riskAnalysis")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("reportsPage.diseaseRisk")}</p>
            <p className="font-medium">{risk.diseaseRisk}/100</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("reportsPage.cropHealthRisk")}</p>
            <p className="font-medium">{risk.healthRisk !== null ? `${risk.healthRisk}/100` : "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("reportsPage.weatherRisk")}</p>
            <p className="font-medium">{risk.weatherRisk !== null ? `${risk.weatherRisk}/100` : "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("reportsPage.overallRisk")}</p>
            <Badge className={`${RISK_COLOR[risk.overallCategory]} text-white`}>
              {risk.overallScore}/100 — {risk.overallCategory}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
