import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ImageUpload } from "@/components/features/ImageUpload";
import { AgriChatbot } from "@/components/features/AgriChatbot";
import { useTranslation } from "react-i18next";

const ImageAnalysis = () => {
  const { t } = useTranslation();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t("pages.imageAnalysis.title")}</h1>
          <p className="text-muted-foreground">
            {t("pages.imageAnalysis.subtitle")}
          </p>
        </div>
        
        <ImageUpload />

        <AgriChatbot />
      </div>
    </DashboardLayout>
  );
};

export default ImageAnalysis;