import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AlertsCenter } from "@/components/features/AlertsCenter";
import { useTranslation } from "react-i18next";

const Alerts = () => {
  const { t } = useTranslation();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t("pages.alerts.title")}</h1>
          <p className="text-muted-foreground">
            {t("pages.alerts.subtitle")}
          </p>
        </div>
        
        <AlertsCenter />
      </div>
    </DashboardLayout>
  );
};

export default Alerts;