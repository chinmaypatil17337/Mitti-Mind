import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TreatmentReferenceRow = Database["public"]["Tables"]["treatment_reference"]["Row"];

/**
 * Finds the verified treatment_reference row matching a detected problem,
 * using the same category + keyword-matching approach as the iot-treatment
 * Edge Function's TREATMENT_RULES (kept in sync by design — both exist to
 * answer "which predefined rule applies here", just in two runtimes).
 *
 * Returns null when nothing matches — callers MUST show "Dosage not
 * available" in that case rather than falling back to the AI's free-text
 * `recommendations`, per the safety rule: dosage only ever comes from this
 * verified table, never from the LLM.
 */
export async function lookupTreatment(
  problemCategory: string | null,
  diseaseType: string | null
): Promise<TreatmentReferenceRow | null> {
  if (problemCategory !== "disease" && problemCategory !== "deficiency" && problemCategory !== "pest") {
    return null; // healthy / unknown -> no treatment to look up
  }

  const { data: candidates } = await supabase
    .from("treatment_reference")
    .select("*")
    .eq("problem_category", problemCategory);

  if (!candidates?.length) return null;

  const text = (diseaseType ?? "").toLowerCase();

  // Prefer the most specific match (a non-empty keyword actually found in
  // the disease name); fall back to the category's generic/blank-keyword row.
  const specific = candidates.find((c) => c.match_keyword && text.includes(c.match_keyword.toLowerCase()));
  if (specific) return specific;

  const generic = candidates.find((c) => !c.match_keyword);
  return generic ?? null;
}
