import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { SensorDashboard } from "@/components/features/SensorDashboard";
import { useTranslation } from "react-i18next";

const SensorData = () => {
  const { t } = useTranslation();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t("pages.sensorData.title")}</h1>
          <p className="text-muted-foreground">
            {t("pages.sensorData.subtitle")}
          </p>
        </div>
        
        <SensorDashboard />
      </div>
    </DashboardLayout>
  );
};

export default SensorData;