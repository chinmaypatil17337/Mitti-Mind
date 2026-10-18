import { jsPDF } from "jspdf";
import type { ReportDetailData } from "@/hooks/useReports";
import { getDisplayableImageUrl } from "@/lib/imageUrl";

const MARGIN = 15;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

async function imageToDataUrl(url: string): Promise<{ dataUrl: string; format: "JPEG" | "PNG" } | null> {
  try {
    const signedUrl = await getDisplayableImageUrl(url);
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const format: "JPEG" | "PNG" = blob.type.includes("png") ? "PNG" : "JPEG";
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format };
  } catch {
    return null; // report still generates, just without the image
  }
}

/**
 * Builds the downloadable/printable PDF entirely client-side with jsPDF —
 * no new backend service. Every figure on the page comes straight from the
 * already-fetched ReportDetailData (image_analysis + plant_health_history +
 * treatment_applications + the verified treatment_reference lookup); this
 * function only lays it out, it never invents or looks up anything new,
 * and the dosage line is only ever printed if `verifiedTreatment` exists.
 */
export async function generateReportPdf(detail: ReportDetailData): Promise<jsPDF> {
  const { analysis, plantHistory, previousTreatments, verifiedTreatment, risk } = detail;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > 285) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    doc.setFillColor(22, 101, 52); // agro-green-ish
    doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, MARGIN + 2, y + 5.5);
    doc.setTextColor(0, 0, 0);
    y += 12;
  };

  const field = (label: string, value: string) => {
    const text = `${label}: ${value || "-"}`;
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
    ensureSpace(lines.length * 5 + 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 2;
  };

  const paragraph = (text: string) => {
    const lines = doc.splitTextToSize(text || "-", CONTENT_WIDTH);
    ensureSpace(lines.length * 5 + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 3;
  };

  // --- Header -------------------------------------------------------
  doc.setFillColor(22, 101, 52);
  doc.rect(0, 0, PAGE_WIDTH, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("MittiMind", MARGIN, 13);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("AI Crop Health Report", MARGIN, 19);
  doc.setTextColor(0, 0, 0);
  y = 30;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Report generated: ${new Date().toLocaleString()}`, MARGIN, y);
  doc.text(`Report ID: ${analysis.id}`, PAGE_WIDTH - MARGIN, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 8;

  // --- 1. Overview ----------------------------------------------------
  sectionTitle("1. Report Overview");
  field("Crop", analysis.crop_name ?? "Unknown crop");
  field("Analysis Date/Time", new Date(analysis.created_at ?? "").toLocaleString());
  field(
    "Detected Problem",
    analysis.problem_category === "healthy" ? "None — plant is healthy" : analysis.disease_type ?? "Unknown"
  );
  field(
    "AI Confidence",
    analysis.confidence_score !== null
      ? `${Math.round((analysis.confidence_score <= 1 ? analysis.confidence_score * 100 : analysis.confidence_score))}%`
      : "N/A"
  );
  field("Severity", analysis.severity ?? "N/A");
  field("Overall Crop Risk Level", risk.overallCategory);

  const imageResult = await imageToDataUrl(analysis.image_url);
  if (imageResult) {
    ensureSpace(45);
    try {
      doc.addImage(imageResult.dataUrl, imageResult.format, MARGIN, y, 50, 40);
      y += 44;
    } catch {
      /* skip image if jsPDF can't decode it */
    }
  }

  // --- 2. AI Analysis & Explanation -----------------------------------
  sectionTitle("2. AI Analysis & Explanation");
  field("Detected Problem", analysis.disease_type ?? (analysis.problem_category === "healthy" ? "None" : "Unknown"));
  paragraph(`Symptoms/Observations: ${analysis.symptoms ?? "Not recorded"}`);
  paragraph(`Possible Cause: ${analysis.possible_cause ?? "Not recorded"}`);
  paragraph(`Effect on Crop: ${analysis.effect_on_crop ?? "Not recorded"}`);
  paragraph(`AI Explanation: ${analysis.ai_explanation ?? analysis.recommendations ?? "Not recorded"}`);

  // --- 3. Treatment recommendation ------------------------------------
  sectionTitle("3. Treatment Recommendation");
  if (verifiedTreatment) {
    field("Treatment", verifiedTreatment.treatment_name);
    field("Purpose", verifiedTreatment.purpose);
    field("Verified Dosage", verifiedTreatment.dosage);
    field("Application Method", verifiedTreatment.application_method);
    field("Frequency", verifiedTreatment.frequency);
    paragraph(`Precautions: ${verifiedTreatment.precautions}`);
  } else {
    paragraph("Dosage not available — no verified treatment rule matched this result.");
    if (analysis.recommendations) {
      paragraph(`General AI guidance (not a verified dosage): ${analysis.recommendations}`);
    }
  }

  // --- 4. Weather & Environment ----------------------------------------
  sectionTitle("4. Weather & Environment (at analysis time)");
  if (analysis.weather_temperature !== null) {
    field("Location", analysis.weather_location ?? "N/A");
    field("Temperature", `${analysis.weather_temperature}°C`);
    field("Humidity", `${analysis.weather_humidity}%`);
    field("Rainfall", `${analysis.weather_rainfall} mm`);
    field("Condition", analysis.weather_condition ?? "N/A");
    field(
      "Weather Risk",
      risk.weatherRisk !== null ? `${risk.weatherRisk}/100` : "N/A"
    );
  } else {
    paragraph("No weather data was available at the time of this analysis.");
  }

  // --- 5. Crop health history --------------------------------------
  sectionTitle("5. Crop Health History");
  if (plantHistory.length > 0) {
    plantHistory.forEach((h) => {
      field(new Date(h.recorded_at).toLocaleDateString(), h.health_status);
    });
  } else {
    paragraph("No previous records exist for this plant yet.");
  }

  // --- Previous treatments ------------------------------------------
  if (previousTreatments.length > 0) {
    ensureSpace(6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Previous Treatments Applied:", MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    previousTreatments.forEach((t) => {
      field(new Date(t.applied_at).toLocaleDateString(), `${t.nutrient ?? t.rule_key} — ${t.status}`);
    });
  }

  // --- 6. Risk analysis ------------------------------------------------
  sectionTitle("6. Risk Analysis");
  field("Disease/Pest Risk", `${risk.diseaseRisk}/100`);
  field("Crop Health Risk", risk.healthRisk !== null ? `${risk.healthRisk}/100` : "N/A");
  field("Weather Risk", risk.weatherRisk !== null ? `${risk.weatherRisk}/100` : "N/A");
  field("Overall Risk Score", `${risk.overallScore}/100`);
  field("Risk Category", risk.overallCategory);

  // --- Footer on every page -------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `MittiMind — AI-generated report. Verify treatment with a local agricultural expert before application. Page ${i} of ${pageCount}`,
      MARGIN,
      293
    );
  }

  return doc;
}
