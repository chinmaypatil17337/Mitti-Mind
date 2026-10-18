"""Prompt Management Module.

Provides a structured system prompt using XML and Chain-of-Thought (CoT)
formatting for reliable, high-quality agricultural advisory responses.
"""

from typing import Dict, Optional


# --------------------------------------------------------------------------- #
#  SYSTEM PROMPT – XML + Chain-of-Thought                                     #
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT_XML = """<role>
    You are <name>Krishi Sahayak</name> — an expert agricultural assistant for Indian farmers.
    Your purpose is to provide accurate, practical, and region-specific farming advice.
</role>

<personality>
    CRITICAL RULE — FORMATTING:
    - You MUST output ONLY plain text. Absolutely NO markdown formatting.
    - DO NOT use ** (double asterisks) for bold. NEVER.
    - DO NOT use * (single asterisk) for emphasis. NEVER.
    - DO NOT use _ (underscores) for italic. NEVER.
    - DO NOT use # (hash) for headings. NEVER.
    - DO NOT use ` (backticks) for code. NEVER.
    - DO NOT use ``` (triple backticks) for code blocks. NEVER.
    - If you need emphasis, write: "Important: ..." or "Note: ..." in plain text.
    - If you need a list, use dashes like "- First item". No numbers with periods that look like headings.
    - Violation of this rule makes your entire response invalid. Double-check your output before finishing.
</personality>

<output_validation>
    BEFORE finishing your response, scan it for any of these forbidden characters:
    *, #, `, _
    If any are found, remove them and rewrite the sentence in plain text.
    Your response must contain ZERO markdown characters.
</output_validation>

<thinking>
    Before answering any query, silently reason through these steps:

    <step name="understand">
        1. Identify the core question or problem the farmer is facing.
        2. Recognize the crop, season, region, and language if mentioned.
        3. Determine if this is a: (a) general knowledge question, (b) pest/disease issue,
           (c) soil/water/nutrient problem, (d) weather/seasonal query, (e) market/price query.
    </step>

    <step name="reason">
        1. Recall the most relevant agricultural best practices for this scenario.
        2. Consider region-specific factors (India's agro-climatic zones).
        3. Prioritize sustainable, low-cost solutions suitable for smallholding farmers.
        4. If the query lacks critical details (crop name, region), ask for them politely.
    </step>

    <step name="verify">
        1. Check that your advice is safe — never recommend unproven chemicals or dosages.
        2. When recommending pesticides or fertilizers, specify proper dosage and safety precautions.
        3. When unsure, recommend consulting the local Krishi Vigyan Kendra (KVK) or agricultural officer.
    </step>

    <step name="respond">
        1. Structure the answer clearly — one topic at a time.
        2. Use short paragraphs or bullet points (using dashes - only).
        3. End with an offer to help further or a related follow-up suggestion.
    </step>
</thinking>

<knowledge_boundaries>
    - You are trained on agricultural data up to early 2025.
    - For real-time weather, market prices, or government scheme updates, advise the farmer
      to check official sources like the India Meteorological Department, eNAM portal,
      or their local agriculture department.
    - If asked about topics outside agriculture (finance, health, legal), politely redirect
      by saying: "I specialize in agricultural assistance. For this query, please consult
      the appropriate expert."
</knowledge_boundaries>

<core_domain>
    Your expertise covers these agriculture topics:

    1. Crop Cultivation: sowing methods, seed treatment, nursery management, transplanting,
       irrigation schedules, harvesting and post-harvest handling.
    2. Soil Management: soil testing, pH correction, organic matter, vermicompost,
       green manure, cover cropping.
    3. Water Management: drip irrigation, sprinkler systems, rainwater harvesting,
       critical growth stage watering.
    4. Nutrient Management: NPK fertilizers, micronutrient deficiencies (Zn, Fe, B, Mn),
       organic fertilizers, compost tea, foliar sprays.
    5. Pest & Disease Control: Integrated Pest Management (IPM), biological control,
       neem-based solutions, resistant varieties, fungicide/bactericide recommendations.
    6. Weed Management: manual, mechanical, chemical (herbicides), and cultural methods.
    7. Seasons & Climate: Kharif (June-September), Rabi (October-March), Zaid (March-June);
       climate-resilient practices, weather forecasting.
    8. Agricultural Machinery: tractors, harvesters, seed drills, sprayers — selection,
       operation, and maintenance.
    9. Market & Economics: MSP, market linkages, organic certification, FPOs/FCs,
       value addition, supply chain basics.
    10. Government Schemes: PM-KISAN, PMFBY, KCC, Soil Health Card, e-NAM,
        agri-infrastructure fund — brief eligibility and process.
</core_domain>

<response_format>
    - Jump directly into the answer — do NOT start every reply with "Namaste" or "Hello".
    - Provide the answer in simple, well-structured plain text.
    - Use dashes for lists (e.g., "- First point").
    - Be thorough — give complete, actionable advice. Include specific dosages, timelines, and steps when relevant.
    - Use numbered steps for processes and instructions so farmers can follow easily.
    - Only use a greeting if the user is greeting you for the first time.
    - Do NOT end with "How can I help you?" or similar filler — end with the actual answer.
</response_format>

<language_guideline>
    - Respond in the same language the farmer uses.
    - If the farmer uses Hinglish (Hindi + English), respond in Hinglish.
    - Keep English simple — avoid jargon without explanation.
</language_guideline>

<fallback_protocol>
    If you do not know the answer confidently:
    - Say: "I want to give you the most accurate information. Please verify this with your
      local agriculture officer or Krishi Vigyan Kendra."
    - Provide general guidance if available, and clearly mark what you are uncertain about.
</fallback_protocol>

<response_length>
    Aim for 200-400 words for detailed questions. Only keep short answers for simple factual queries.
    Farmers need complete, actionable information — do not cut corners.
</response_length>

<image_analysis>
    When a farmer shares a photo, examine it carefully and provide:
    1. What you see — identify the crop, plant part, soil, or pest visible in the image.
    2. Diagnosis — name the specific problem (e.g., "leaf blight", "aphid infestation", "nitrogen deficiency").
    3. Cause — explain what likely caused the issue (weather, pests, nutrient imbalance, etc).
    4. Solution — give 2-3 specific, actionable remedies with product names, dosages, and application methods.
    5. Prevention — suggest steps to avoid this problem in the future.
    Be specific and confident. Farmers need clear answers from images.
</image_analysis>

<structured_context_usage>
    Some requests include an extra system message right after this one, built by the AgroLens
    app from the farmer's actual data (their granted location, the existing Weather feature,
    and the existing Image Analysis / disease-prediction history). Treat it as ground truth
    about THIS farmer, THIS session, not as something you inferred.

    Rules for using it:
    1. A block only appears if that data actually exists. If "Latest disease prediction" is
       absent, say plainly that you don't have a recent prediction for this plant and suggest
       uploading a leaf photo, never invent a disease, confidence, or date.
       Likewise: no plant history block means say you don't have previous records for this
       plant yet. No location/weather block means you can still help, just say
       location-specific recommendations (watering timing, spraying conditions) aren't
       available right now.
    2. When the farmer asks a short follow-up like "what should I do?", "will it spread?",
       "how often should I check?" with no subject stated, resolve "it"/"this" using the
       structured context first (the latest prediction / current plant), and the conversation
       history second. Do not ask the farmer to repeat the crop or disease name if it is
       already in the context block.
    3. CRITICAL: never assume every detected problem needs fertilizer. Read the problem type
       the context gives you (disease, deficiency, pest, water stress, or healthy) and match
       the advice to it: fungal/bacterial/viral disease needs disease management (fungicide or
       bactericide, sanitation, resistant varieties); nutrient deficiency needs nutrient or
       fertilizer guidance naming the specific nutrient; pest needs pest management (IPM,
       targeted insecticide); water stress needs irrigation guidance; healthy needs preventive
       care only. If the farmer explicitly asks "can I use fertilizer?" for a disease or pest
       case, explain that fertilizer is not the appropriate fix for that specific problem
       rather than agreeing by default.
    4. Privacy: you may be given an area or region name (e.g. "Thane, Maharashtra") but never
       raw latitude/longitude. Refer to it naturally ("your farm in Thane...") and never recite
       coordinates even if you happen to see them, unless the farmer explicitly asks for exact
       coordinates.
    5. Yield questions: only use yield, area, planting-date, or variety figures actually
       present in the context or the conversation. If key figures are missing, name exactly
       what's missing (e.g. sown area, variety, planting date, last season's yield) instead of
       estimating a number. Never invent a yield figure.
    6. The context block is about the CURRENT farmer only. Never reference or imply another
       farmer's data.
</structured_context_usage>"""


class PromptManager:
    """Manages system prompts and message formatting for the LLM.

    Provides prompt templates, few-shot examples, and structured
    message construction following the Single Responsibility Principle.
    """

    def __init__(self) -> None:
        """Initialize PromptManager with the curated system prompt."""
        self.system_prompt: str = SYSTEM_PROMPT_XML

    def get_system_prompt(self) -> str:
        """Return the system prompt for the LLM."""
        return self.system_prompt

    @staticmethod
    def build_context_block(
        language: Optional[str] = None,
        extra_context: Optional[Dict] = None,
    ) -> Optional[str]:
        """Build a short, dynamic system message carrying the selected UI
        language and the farmer-specific context AgroLens already knows:
        location (area/region only, never raw coordinates), weather, the
        current/most-relevant plant, its latest disease prediction, recent
        plant history, and recent treatments.

        This is sent as its own system message (not baked into the static
        system prompt) so the large, cacheable system prompt stays byte-for-
        byte identical across requests — only this small block changes. The
        frontend decides WHICH of these pieces to fetch and include for a
        given question (see useChatContext.ts's selectContext()), so this
        function only needs to render whatever keys are actually present.

        Args:
            language: Display name of the selected app language (e.g. "Hindi").
            extra_context: Optional dict, any subset of:
                "farmer_location": {"area", "region"}
                "weather": {"location", "temperature_c", "humidity_percent",
                    "rainfall_mm", "condition", "wind_kph"}
                "current_plant": {"plant_id", "crop", "health_status"}
                "latest_prediction": {"crop", "disease", "problem_category",
                    "confidence", "severity", "detected_at", "recommended_action"}
                "plant_history": [{"date", "status"}, ...] (most recent first)
                "previous_treatments": [{"date", "treatment", "status"}, ...]
                as sent by AgriChatbot.tsx / useChatContext.ts.

        Returns:
            A system-message string, or None if there's nothing to add.
        """
        lines: list = []

        if language and language.lower() != "english":
            lines.append(
                f"IMPORTANT: The farmer has selected {language} as their app language. "
                f"You MUST respond in {language} — translate your entire answer into "
                f"{language}, even if the farmer's message is written in English or "
                f"another language. Only switch language if the farmer explicitly asks you to."
            )
        elif language:
            lines.append(f"The farmer's selected app language is {language}.")

        if extra_context:
            location = extra_context.get("farmer_location")
            if location:
                area = location.get("area")
                region = location.get("region")
                place = f"{area}, {region}" if area and region else (area or region)
                if place:
                    lines.append(f"The farmer's farm is located in {place}.")

            weather = extra_context.get("weather")
            if weather:
                lines.append(
                    "Current weather at the farmer's location (from the app's Weather "
                    f"card) — Location: {weather.get('location', 'unknown')}, "
                    f"Temperature: {weather.get('temperature_c', '?')}°C, "
                    f"Humidity: {weather.get('humidity_percent', '?')}%, "
                    f"Rainfall: {weather.get('rainfall_mm', '?')} mm, "
                    f"Condition: {weather.get('condition', 'unknown')}, "
                    f"Wind: {weather.get('wind_kph', '?')} km/h. "
                    "Use this to give weather-aware advice (irrigation timing, spraying "
                    "conditions, frost/heat risk) when relevant — don't mention it if "
                    "the farmer's question is unrelated to weather."
                )

            plant = extra_context.get("current_plant")
            if plant:
                lines.append(
                    "The plant currently in focus — "
                    f"Crop: {plant.get('crop', 'unknown')}, "
                    f"Plant ID: {plant.get('plant_id', 'unknown')}, "
                    f"Current health status: {plant.get('health_status', 'unknown')}."
                )

            prediction = extra_context.get("latest_prediction")
            if prediction:
                lines.append(
                    "The app's Image Analysis feature most recently detected — "
                    f"Crop: {prediction.get('crop', 'unknown')}, "
                    f"Problem type: {prediction.get('problem_category', 'unknown')} "
                    "(one of: disease, deficiency, pest, water stress, healthy), "
                    f"Specific problem: {prediction.get('disease', 'unknown')}, "
                    f"Confidence: {prediction.get('confidence', 'unknown')}, "
                    f"Severity: {prediction.get('severity', 'unknown')}, "
                    f"Detected on: {prediction.get('detected_at', 'unknown')}, "
                    f"System's recommended action: {prediction.get('recommended_action', 'none recorded')}. "
                    "If the farmer asks a follow-up like \"what should I do?\" or refers to "
                    "\"my plant\" / \"this problem\" / \"it\" without repeating the details, "
                    "assume they mean this detected result and answer accordingly — matching "
                    "the advice to the problem TYPE above, not assuming fertilizer by default."
                )

            history = extra_context.get("plant_history")
            if history:
                entries = "; ".join(
                    f"{h.get('date', '?')}: {h.get('status', 'unknown')}" for h in history
                )
                lines.append(f"Recent history for this plant (most recent first): {entries}.")

            treatments = extra_context.get("previous_treatments")
            if treatments:
                entries = "; ".join(
                    f"{t.get('date', '?')}: {t.get('treatment', 'unknown')} ({t.get('status', 'unknown')})"
                    for t in treatments
                )
                lines.append(f"Recent treatments applied to this plant (most recent first): {entries}.")

            farm_plants = extra_context.get("farm_plants")
            if farm_plants:
                entries = "; ".join(
                    f"{p.get('crop', 'unknown')} ({p.get('status', 'unknown')}"
                    + (f", planted {p.get('planted_at')}" if p.get("planted_at") else "")
                    + ")"
                    for p in farm_plants
                )
                lines.append(
                    f"All crops currently tracked on this farmer's farm: {entries}. "
                    "Use this for farm-wide questions (\"what diseases have appeared at my farm?\") "
                    "or yield questions — but only cite the planting date / area / variety figures "
                    "actually present here; never invent ones that aren't."
                )

        if not lines:
            return None
        return "\n\n".join(lines)

    def build_messages(
        self,
        user_query: str,
        conversation_history: Optional[list] = None,
        language: Optional[str] = None,
        extra_context: Optional[Dict] = None,
    ) -> list[Dict[str, str]]:
        """Build a message list for the LLM chat completion.

        Args:
            user_query: The current user message.
            conversation_history: Optional list of previous messages
                                  (role/content dicts) from memory.
            language: Display name of the selected app language (e.g. "Hindi").
            extra_context: Optional dict with "weather" / "recent_plant_analysis".

        Returns:
            List of message dicts formatted for LangChain/LM.
        """
        messages: list = [{"role": "system", "content": self.system_prompt}]

        context_block = self.build_context_block(language, extra_context)
        if context_block:
            messages.append({"role": "system", "content": context_block})

        # Add conversation history if available
        if conversation_history:
            messages.extend(conversation_history)

        # Add the current user query
        messages.append({"role": "user", "content": user_query})

        return messages

    @staticmethod
    def extract_farmer_context(query: str) -> Dict[str, Optional[str]]:
        """Extract key farming context from a query if present.

        Uses simple keyword detection to identify crop, region, and season.

        Args:
            query: The farmer's input text.

        Returns:
            Dict with keys: crop, region, season, issue_type.
        """
        context: Dict[str, Optional[str]] = {
            'crop': None,
            'region': None,
            'season': None,
            'issue_type': None
        }

        # Simple keyword-based extraction (can be enhanced with NER)
        crop_keywords = ['wheat', 'rice', 'paddy', 'maize', 'corn', 'cotton',
                         'sugarcane', 'pulses', 'gram', 'mustard', 'groundnut',
                         'vegetables', 'fruits', 'mango', 'banana', 'tomato',
                         'potato', 'onion', 'chilli', 'turmeric', 'ginger']
        for crop in crop_keywords:
            if crop in query.lower():
                context['crop'] = crop
                break

        season_keywords = {'kharif': 'Kharif', 'rabi': 'Rabi', 'zaid': 'Zaid',
                           'monsoon': 'Kharif', 'winter': 'Rabi', 'summer': 'Zaid'}
        for keyword, season in season_keywords.items():
            if keyword in query.lower():
                context['season'] = season
                break

        return context
