/**
 * Deterministic, rule-based risk scoring for the Reports feature.
 *
 * Deliberately NOT an LLM call: risk scores need to be explainable and
 * reproducible for a farmer reading a report, so every number here comes
 * from a fixed lookup table or simple arithmetic — never a model guess.
 * This mirrors the same "predefined rules, not invented numbers" principle
 * used for treatment dosages (see treatment_reference / treatmentLookup.ts).
 */

export type ProblemCategory = "disease" | "deficiency" | "pest" | "healthy" | "unknown";
export type Severity = "none" | "mild" | "moderate" | "severe";
export type RiskCategory = "Low" | "Moderate" | "High" | "Critical";

// Base 0-100 risk score per (problem type, severity) combination.
const DISEASE_RISK_TABLE: Record<ProblemCategory, Record<Severity, number>> = {
  healthy: { none: 0, mild: 5, moderate: 10, severe: 15 },
  unknown: { none: 25, mild: 30, moderate: 35, severe: 40 },
  deficiency: { none: 10, mild: 25, moderate: 45, severe: 65 },
  pest: { none: 10, mild: 30, moderate: 55, severe: 80 },
  disease: { none: 10, mild: 35, moderate: 60, severe: 85 },
};

export function diseaseRiskScore(category: ProblemCategory, severity: Severity): number {
  return DISEASE_RISK_TABLE[category]?.[severity] ?? 30;
}

/** Inverts the AI's 0-100 health_score into a 0-100 risk score. */
export function healthRiskScore(healthScore: number | null): number | null {
  if (healthScore === null || healthScore === undefined) return null;
  return Math.max(0, Math.min(100, 100 - healthScore));
}

export interface WeatherSnapshotInput {
  temperature: number | null;
  humidity: number | null;
  rainfall: number | null;
}

/**
 * Simple, explainable heuristic: high humidity + recent rain raises fungal
 * disease risk; temperature extremes raise general plant-stress risk.
 * Returns null when no weather snapshot exists (never fabricate one).
 */
export function weatherRiskScore(weather: WeatherSnapshotInput | null): number | null {
  if (!weather || weather.temperature === null || weather.humidity === null) return null;
  let score = 10;
  if (weather.humidity >= 80) score += 30;
  else if (weather.humidity >= 65) score += 15;
  if ((weather.rainfall ?? 0) > 5) score += 20;
  if (weather.temperature !== null && (weather.temperature < 10 || weather.temperature > 38)) score += 20;
  return Math.max(0, Math.min(100, score));
}

export function riskCategoryFor(score: number): RiskCategory {
  if (score < 25) return "Low";
  if (score < 50) return "Moderate";
  if (score < 75) return "High";
  return "Critical";
}

export interface RiskBreakdown {
  diseaseRisk: number;
  healthRisk: number | null;
  weatherRisk: number | null;
  overallScore: number;
  overallCategory: RiskCategory;
}

/**
 * Combines the three sub-scores into one overall figure. Weather is only
 * folded in when we actually have a snapshot; weights are renormalized so
 * missing data doesn't silently drag the score toward zero.
 */
export function computeRiskBreakdown(input: {
  problemCategory: ProblemCategory;
  severity: Severity;
  healthScore: number | null;
  weather: WeatherSnapshotInput | null;
}): RiskBreakdown {
  const diseaseRisk = diseaseRiskScore(input.problemCategory, input.severity);
  const healthRisk = healthRiskScore(input.healthScore);
  const weatherRisk = weatherRiskScore(input.weather);

  const parts: Array<{ value: number; weight: number }> = [{ value: diseaseRisk, weight: 0.5 }];
  if (healthRisk !== null) parts.push({ value: healthRisk, weight: 0.3 });
  if (weatherRisk !== null) parts.push({ value: weatherRisk, weight: 0.2 });

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const overallScore = Math.round(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight);

  return {
    diseaseRisk,
    healthRisk,
    weatherRisk,
    overallScore,
    overallCategory: riskCategoryFor(overallScore),
  };
}
