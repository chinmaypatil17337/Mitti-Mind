import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, AlertTriangle, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useReportsList } from "@/hooks/useReports";
import { ReportDetail } from "@/components/features/ReportDetail";
import { getDisplayableImageUrl } from "@/lib/imageUrl";

const SEVERITY_COLOR: Record<string, string> = {
  none: "bg-[hsl(var(--agro-success))]",
  mild: "bg-[hsl(var(--agro-warning))]",
  moderate: "bg-[hsl(var(--agro-warning))]",
  severe: "bg-[hsl(var(--agro-danger))]",
};

const ReportThumbnail = ({ url, alt }: { url: string; alt: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDisplayableImageUrl(url).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (!src) return <Skeleton className="h-32 w-full" />;
  return <img src={src} alt={alt} className="h-32 w-full object-cover" />;
};

const Reports = () => {
  const { t } = useTranslation();
  const { reports, loading, error } = useReportsList();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!selectedId && (
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{t("pages.reports.title")}</h1>
            <p className="text-muted-foreground">{t("reportsPage.subtitle")}</p>
          </div>
        )}

        {selectedId ? (
          <ReportDetail analysisId={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-56" />
                ))}
              </div>
            )}

            {!loading && error && (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <AlertTriangle className="h-10 w-10 text-destructive" />
                  <p className="text-muted-foreground">{error}</p>
                </CardContent>
              </Card>
            )}

            {!loading && !error && reports.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-medium">{t("reportsPage.noReportsYet")}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{t("reportsPage.noReportsHint")}</p>
                </CardContent>
              </Card>
            )}

            {!loading && !error && reports.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {reports.map((report, index) => {
                  const isHealthy = report.problemCategory === "healthy";
                  return (
                    <motion.div
                      key={report.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <Card
                        className="cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
                        onClick={() => setSelectedId(report.id)}
                      >
                        <ReportThumbnail url={report.imageUrl} alt={report.cropName} />
                        <CardContent className="p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <h4 className="font-medium">{report.cropName}</h4>
                            <Badge className={`${SEVERITY_COLOR[report.severity ?? "none"]} text-white`}>
                              {isHealthy ? t("imageAnalysis.healthy") : report.severity ?? "—"}
                            </Badge>
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            {isHealthy ? t("imageAnalysis.healthy") : report.diseaseType ?? "—"}
                          </p>
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1 text-primary">
                              {t("reportsPage.viewReport")} <ChevronRight className="h-3 w-3" />
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Reports;
