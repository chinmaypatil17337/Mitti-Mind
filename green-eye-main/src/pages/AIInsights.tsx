import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AIInsights as AIInsightsComponent } from "@/components/dashboard/AIInsights";
import { useTranslation } from "react-i18next";

const AIInsights = () => {
  const { t } = useTranslation();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t("pages.aiInsights.title")}</h1>
          <p className="text-muted-foreground">
            {t("pages.aiInsights.subtitle")}
          </p>
        </div>
        
        <AIInsightsComponent />
      </div>
    </DashboardLayout>
  );
};

export default AIInsights;