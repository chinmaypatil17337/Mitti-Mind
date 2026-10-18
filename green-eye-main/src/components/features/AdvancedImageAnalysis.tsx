import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useFields } from "@/hooks/useSupabaseData";
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Sprout,
  Droplets,
  Thermometer,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface AnalysisResult {
  id: string;
  image_url: string;
  health_score: number | null;
  vegetation_index: number | null;
  disease_detected: boolean | null;
  disease_type: string | null;
  confidence_score: number | null;
  recommendations: string | null;
  analysis_status: string;
}

export const AdvancedImageAnalysis = () => {
  const { t } = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedField, setSelectedField] = useState("");
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);

  const { fields } = useFields();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
    },
    multiple: true,
    maxFiles: 10,
  });

  const removeFile = (index: number) => {
    setSelectedFiles((files) =>
      files.filter((_, i) => i !== index)
    );
  };

  const uploadImage = async (file: File) => {
    const extension = file.name.split(".").pop() || "jpg";

    const fileName = `${crypto.randomUUID()}.${extension}`;
    const filePath = `analysis-images/${fileName}`;

    const { error } = await supabase.storage
      .from("analysis-images")
      .upload(filePath, file);

    if (error) {
      throw error;
    }

    const {
      data: { publicUrl },
    } = supabase.storage
      .from("analysis-images")
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const waitForResult = async (analysisId: string) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const { data, error } = await supabase
        .from("image_analysis")
        .select("*")
        .eq("id", analysisId)
        .single();

      if (error) {
        throw error;
      }

      if (data.analysis_status === "completed") {
        return data as AnalysisResult;
      }

      if (data.analysis_status === "failed") {
        throw new Error("Image analysis failed.");
      }

      setProgress(Math.min(95, 50 + attempt * 2));

      await new Promise((resolve) =>
        setTimeout(resolve, 3000)
      );
    }

    throw new Error("Analysis timed out. Please try again.");
  };

  const startAnalysis = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select at least one image.");
      return;
    }

    if (!selectedField) {
      toast.error("Please select a field.");
      return;
    }

    setUploading(true);
    setAnalyzing(false);
    setProgress(5);
    setAnalysisResults([]);

    try {
      const results: AnalysisResult[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        setProgress(
          Math.round((i / selectedFiles.length) * 40)
        );

        // Upload image
        const imageUrl = await uploadImage(file);

        setUploading(false);
        setAnalyzing(true);

        // Get logged-in user's session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error(
            "You must be logged in to analyze an image."
          );
        }

        // Call our new Edge Function
        const { data, error } =
          await supabase.functions.invoke("analyze-image", {
            body: {
              imageUrl,
              fieldId: selectedField,
            },
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

        if (error) {
          throw error;
        }

        if (!data?.analysisId) {
          throw new Error(
            "The analysis function did not return an analysis ID."
          );
        }

        // Wait for background AI analysis
        const result = await waitForResult(
          data.analysisId
        );

        results.push(result);

        setAnalysisResults([...results]);
      }

      setProgress(100);
      setUploading(false);
      setAnalyzing(false);

      toast.success(
        "Image analysis completed successfully!"
      );
    } catch (error: any) {
      console.error("Analysis error:", error);

      toast.error(
        error?.message || "Failed to analyze image."
      );

      setUploading(false);
      setAnalyzing(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-6">

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-6 w-6" />
            {t("advancedAnalysis.title")}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">

          {/* Field Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("predictiveAnalytics.selectField")}
            </label>

            <select
              value={selectedField}
              onChange={(e) =>
                setSelectedField(e.target.value)
              }
              className="w-full p-2 border rounded-md"
            >
              <option value="">
                {t("predictiveAnalytics.chooseField")}
              </option>

              {fields?.map((field) => (
                <option
                  key={field.id}
                  value={field.id}
                >
                  {field.name} - {field.crop_type}
                </option>
              ))}
            </select>
          </div>

          {/* Image Upload */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} />

            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />

            {isDragActive ? (
              <p className="text-primary">
                {t("advancedAnalysis.dropHere")}
              </p>
            ) : (
              <>
                <p className="font-medium">
                  {t("advancedAnalysis.dragDrop")}
                </p>

                <p className="text-sm text-muted-foreground mt-1">
                  {t("advancedAnalysis.orClickToSelect")}
                </p>

                <p className="text-xs text-muted-foreground mt-2">
                  JPEG, PNG, WebP
                </p>
              </>
            )}
          </div>

          {/* Selected Images */}
          {selectedFiles.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">
                {t("advancedAnalysis.selectedImages")} ({selectedFiles.length})
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="relative"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Crop ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-6 h-6"
                    >
                      ×
                    </button>

                    <p className="text-xs truncate mt-1">
                      {file.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {(uploading || analyzing) && (
            <div className="space-y-2">

              <div className="flex justify-between">
                <span className="text-sm font-medium">
                  {uploading
                    ? t("advancedAnalysis.uploadingImage")
                    : t("advancedAnalysis.aiAnalyzing")}
                </span>

                <span className="text-sm">
                  {Math.round(progress)}%
                </span>
              </div>

              <Progress value={progress} />
            </div>
          )}

          {/* Analyze Button */}
          <Button
            onClick={startAnalysis}
            disabled={
              uploading ||
              analyzing ||
              selectedFiles.length === 0 ||
              !selectedField
            }
            className="w-full"
          >
            {uploading || analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploading
                  ? t("advancedAnalysis.uploading")
                  : t("imageAnalysis.analyzing")}
              </>
            ) : (
              <>
                <Camera className="mr-2 h-4 w-4" />
                {t("advancedAnalysis.analyzeCropImage")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {analysisResults.length > 0 && (
        <div className="space-y-6">

          <h2 className="text-xl font-semibold">
            {t("advancedAnalysis.aiAnalysisResults")}
          </h2>

          {analysisResults.map((result) => (
            <Card key={result.id}>

              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sprout className="h-5 w-5" />

                  {t("advancedAnalysis.cropHealth")}

                  <Badge
                    variant={
                      (result.health_score || 0) >= 70
                        ? "default"
                        : "destructive"
                    }
                  >
                    {result.health_score ?? 0}/100
                  </Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-6">

                {/* Image */}
                <img
                  src={result.image_url}
                  alt="Analyzed crop"
                  className="w-full max-h-96 object-cover rounded-lg"
                />

                {/* Health */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">
                      {t("advancedAnalysis.healthScore")}
                    </span>

                    <span>
                      {result.health_score ?? 0}%
                    </span>
                  </div>

                  <Progress
                    value={result.health_score ?? 0}
                  />
                </div>

                {/* Vegetation */}
                <div className="p-4 rounded-lg border">
                  <p className="text-sm text-muted-foreground">
                    {t("advancedAnalysis.vegetationIndex")}
                  </p>

                  <p className="text-2xl font-bold">
                    {result.vegetation_index !== null
                      ? result.vegetation_index.toFixed(2)
                      : "N/A"}
                  </p>
                </div>

                {/* Disease */}
                <div className="p-4 rounded-lg border">

                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5" />

                    <h3 className="font-semibold">
                      {t("advancedAnalysis.diseaseDetection")}
                    </h3>
                  </div>

                  {result.disease_detected ? (
                    <div className="space-y-2">

                      <Badge variant="destructive">
                        {t("advancedAnalysis.diseaseDetected")}
                      </Badge>

                      <p>
                        <strong>{t("advancedAnalysis.type")}:</strong>{" "}
                        {result.disease_type ||
                          t("advancedAnalysis.unknownDisease")}
                      </p>

                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />

                      <span>
                        {t("advancedAnalysis.noDiseaseDetected")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confidence */}
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("advancedAnalysis.aiConfidence")}
                  </p>

                  <p className="font-semibold">
                    {result.confidence_score !== null
                      ? `${Math.round(
                          result.confidence_score * 100
                        )}%`
                      : "N/A"}
                  </p>
                </div>

                {/* Recommendations */}
                <div className="p-4 rounded-lg border">

                  <h3 className="font-semibold mb-2">
                    {t("imageAnalysis.treatment")}
                  </h3>

                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {result.recommendations ||
                      t("advancedAnalysis.noRecommendations")}
                  </p>

                </div>

              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};