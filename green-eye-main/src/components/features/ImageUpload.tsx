import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Camera,
  Upload,
  X,
  Eye,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { CameraCapture } from "./CameraCapture";
import { useTranslation } from "react-i18next";

interface UploadedImage {
  id: string;
  name: string;
  size: number;
  url: string;
  timestamp: Date;
  source: "upload" | "camera";
  status: "analyzing" | "done" | "error";
  errorMessage?: string;

  analysis?: {
    ndvi: number;
    health: "healthy" | "warning" | "critical";
    anomalies: number;

    // AI disease information
    disease?: string;
    confidence?: number;
    treatment?: string;
  };
}

const IMAGE_BUCKET = "images";

export const ImageUpload = () => {
  const { t } = useTranslation();
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);

  /*
   * Process one or more image files (from the dropzone OR a fresh camera shot):
   * 1. Show the photo on screen immediately, marked "Analyzing..."
   * 2. Upload image -> Supabase Storage
   * 3. Get public URL
   * 4. Call analyze-image Edge Function
   * 5. Fill in the AI disease result on that same card
   */
  // The analyze-image Edge Function starts the AI work in the background and
  // returns an analysisId. Poll Supabase until that record is completed.
  const waitForAnalysisResult = async (analysisId: string) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const { data, error } = await supabase
        .from("image_analysis")
        .select("*")
        .eq("id", analysisId)
        .single();

      if (error) {
        throw new Error(`Could not read analysis result: ${error.message}`);
      }

      if (data.analysis_status === "completed") {
        return data;
      }

      if (data.analysis_status === "failed") {
        throw new Error(
          "AI analysis failed. Check Supabase Edge Function logs to see whether the OpenAI API key/credits are the problem."
        );
      }

      setUploadProgress(Math.min(95, 70 + attempt));
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error("AI analysis timed out. Please try again.");
  };

  const processFiles = useCallback(
    async (files: File[], source: "upload" | "camera") => {
      if (!files.length) return;

      setUploading(true);
      setUploadProgress(10);

      // Show every photo on screen right away, before the AI result is ready.
      const pending = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        image: {
          id: "",
          name: file.name,
          size: file.size,
          url: URL.createObjectURL(file),
          timestamp: new Date(),
          source,
          status: "analyzing" as const,
        },
      }));
      pending.forEach((p) => (p.image.id = p.id));

      setUploadedImages((prev) => [...pending.map((p) => p.image), ...prev]);

      for (let i = 0; i < pending.length; i++) {
        const { id, file } = pending[i];

        try {
          setUploadProgress(20);

          // 1. Generate unique file name
          const fileExtension = file.name.split(".").pop();
          const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

          // 2. Upload image to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from(IMAGE_BUCKET)
            .upload(fileName, file, { cacheControl: "3600", upsert: false });

          if (uploadError) {
            throw new Error(`Image upload failed: ${uploadError.message}`);
          }

          setUploadProgress(50);

          // 3. Get public URL
          const { data: publicUrlData } = supabase.storage
            .from(IMAGE_BUCKET)
            .getPublicUrl(fileName);

          const imageUrl = publicUrlData.publicUrl;
          if (!imageUrl) throw new Error("Could not generate image URL");

          setUploadProgress(65);

          // 4. Call Supabase Edge Function to predict the disease.
          // Send the storage bucket + path too, so the function can download
          // the exact file itself (via the service-role key) instead of
          // relying on OpenAI being able to fetch a public URL — that's what
          // was causing it to fall back to a generic guess like "Leaf Spot".
          const { data: startData, error: analysisError } = await supabase.functions.invoke(
            "analyze-image",
            // field_id is nullable in the database. This upload screen does not
            // select a field, so do not send the invalid string "default-field".
            { body: { imageUrl, fieldId: null, bucket: IMAGE_BUCKET, path: fileName } }
          );

          if (analysisError) {
            throw new Error(`Could not start AI analysis: ${analysisError.message}`);
          }

          if (!startData?.analysisId) {
            throw new Error("The AI analysis function did not return an analysis ID.");
          }

          // IMPORTANT: analyze-image runs OpenAI in the background and initially
          // returns { analysisId, status: "processing" }. Wait for the DB row to
          // become completed before reading disease/confidence values.
          const analysisData = await waitForAnalysisResult(startData.analysisId);

          setUploadProgress(98);

          const disease = analysisData.disease_type ||
            (analysisData.disease_detected ? "Disease detected" : "No disease detected");

          const confidence =
            typeof analysisData.confidence_score === "number"
              ? analysisData.confidence_score
              : undefined;

          const health =
            typeof analysisData.health_score === "number"
              ? analysisData.health_score < 40
                ? "critical"
                : analysisData.health_score < 70
                  ? "warning"
                  : "healthy"
              : "warning";

          const ndvi =
            typeof analysisData.vegetation_index === "number"
              ? analysisData.vegetation_index
              : 0;
          const anomalies = analysisData.disease_detected ? 1 : 0;
          const treatment = analysisData.recommendations ?? "";

          // 5. Fill in the prediction on the card that's already visible
          setUploadedImages((prev) =>
            prev.map((img) =>
              img.id === id
                ? {
                    ...img,
                    status: "done",
                    analysis: { ndvi, health, anomalies, disease, confidence, treatment },
                  }
                : img
            )
          );
        } catch (error) {
          console.error("Image processing error:", error);
          setUploadedImages((prev) =>
            prev.map((img) =>
              img.id === id
                ? {
                    ...img,
                    status: "error",
                    errorMessage:
                      error instanceof Error ? error.message : "Failed to analyze image. Please try again.",
                  }
                : img
            )
          );
        }
      }

      setUploadProgress(100);
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
    },
    []
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => processFiles(acceptedFiles, "upload"),
    [processFiles]
  );

  const onCapture = useCallback(
    (file: File) => processFiles([file], "camera"),
    [processFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpeg", ".jpg"],
      "image/png": [".png"],
      "image/tiff": [".tiff", ".tif"],
    },
    multiple: true,
    disabled: uploading,
  });

  const removeImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case "healthy":
        return "bg-[hsl(var(--agro-success))]";
      case "warning":
        return "bg-[hsl(var(--agro-warning))]";
      case "critical":
        return "bg-[hsl(var(--agro-danger))]";
      default:
        return "bg-muted";
    }
  };

  const formatConfidence = (confidence?: number) => {
    if (confidence === undefined) return "N/A";
    const percentage = confidence <= 1 ? confidence * 100 : confidence;
    return `${percentage.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* ================================================== */}
      {/* UPLOAD / CAMERA SECTION */}
      {/* ================================================== */}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            {t("imageAnalysis.title")}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300 ${
              isDragActive
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-muted-foreground/25 hover:border-primary hover:bg-muted/50"
            } ${uploading ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <input {...getInputProps()} />

            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: isDragActive ? 1.1 : 1 }}
              transition={{ duration: 0.2 }}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            </motion.div>

            <p className="text-lg font-medium mb-2">
              {isDragActive ? "Drop images here..." : t("imageAnalysis.uploadTitle")}
            </p>

            <p className="text-muted-foreground mb-4">
              {t("imageAnalysis.uploadSubtitle")}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" disabled={uploading}>
                {uploading ? t("imageAnalysis.analyzing") : t("imageAnalysis.selectFiles")}
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  setCameraOpen(true);
                }}
              >
                <Camera className="mr-2 h-4 w-4" />
                {t("imageAnalysis.useCamera")}
              </Button>
            </div>
          </div>

          {/* ================================================== */}
          {/* PROGRESS */}
          {/* ================================================== */}

          <AnimatePresence>
            {uploading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Analyzing image with AI...</span>
                  <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <CameraCapture open={cameraOpen} onOpenChange={setCameraOpen} onCapture={onCapture} />

      {/* ================================================== */}
      {/* RESULTS */}
      {/* ================================================== */}

      <AnimatePresence>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {uploadedImages.map((image, index) => (
            <motion.div
              key={image.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              layout
            >
              <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                {/* ======================================== */}
                {/* IMAGE */}
                {/* ======================================== */}

                <div className="relative">
                  <img src={image.url} alt={image.name} className="w-full h-48 object-cover" />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
                    onClick={() => removeImage(image.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>

                  <div className="absolute bottom-2 left-2 flex items-center gap-2">
                    {image.source === "camera" && (
                      <Badge variant="secondary" className="gap-1">
                        <Camera className="h-3 w-3" /> Camera
                      </Badge>
                    )}

                    {image.status === "analyzing" && (
                      <Badge className="gap-1 bg-muted text-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> {t("imageAnalysis.analyzing")}
                      </Badge>
                    )}

                    {image.status === "done" && image.analysis && (
                      <Badge className={`${getHealthColor(image.analysis.health)} text-white`}>
                        {t(`imageAnalysis.${image.analysis.health}`).toUpperCase()}
                      </Badge>
                    )}

                    {image.status === "error" && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> {t("imageAnalysis.failed")}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* ======================================== */}
                {/* CONTENT */}
                {/* ======================================== */}

                <CardContent className="p-4">
                  <h4 className="font-medium truncate mb-2">{image.name}</h4>

                  <div className="text-sm text-muted-foreground space-y-1 mb-3">
                    <p>Size: {(image.size / 1024 / 1024).toFixed(2)} MB</p>
                    <p>
                      {image.source === "camera" ? "Captured" : "Uploaded"}:{" "}
                      {image.timestamp.toLocaleTimeString()}
                    </p>
                  </div>

                  {/* ====================================== */}
                  {/* STATUS: ANALYZING */}
                  {/* ====================================== */}

                  {image.status === "analyzing" && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("imageAnalysis.analyzing")}
                    </div>
                  )}

                  {/* ====================================== */}
                  {/* STATUS: ERROR */}
                  {/* ====================================== */}

                  {image.status === "error" && (
                    <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      {image.errorMessage || "Something went wrong analyzing this photo."}
                    </div>
                  )}

                  {/* ====================================== */}
                  {/* AI ANALYSIS */}
                  {/* ====================================== */}

                  {image.status === "done" && image.analysis && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="space-y-3 mb-4"
                    >
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground mb-1">{t("imageAnalysis.detectedDisease")}</p>
                        <p className="font-semibold text-base">
                          {image.analysis.disease || "No disease detected"}
                        </p>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm">{t("imageAnalysis.confidence")}:</span>
                        <Badge variant="outline">{formatConfidence(image.analysis.confidence)}</Badge>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm">{t("imageAnalysis.ndvi")}:</span>
                        <span className="font-medium">{image.analysis.ndvi.toFixed(3)}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm">{t("imageAnalysis.anomalies")}:</span>
                        <Badge variant="outline">{image.analysis.anomalies}</Badge>
                      </div>

                      {image.analysis.treatment && (
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground mb-1">{t("imageAnalysis.treatment")}</p>
                          <p className="text-sm">{image.analysis.treatment}</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ====================================== */}
                  {/* BUTTONS */}
                  {/* ====================================== */}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(image.url, "_blank")}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {t("common.view")}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const link = document.createElement("a");
                        link.href = image.url;
                        link.download = image.name;
                        link.click();
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {t("common.export")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
};
