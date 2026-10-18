import { createContext, useContext, useEffect, useState, ReactNode } from "react";

/**
 * Shared "what do we currently know" state for this session — the latest
 * weather reading and the latest plant-analysis result. Both the dashboard
 * cards (WeatherCard, PlantStatusCard) and the chatbot (AgriChatbot) read
 * from here, so the chatbot can answer "what should I do?" using the most
 * recent detection without the user repeating themselves.
 *
 * Kept in memory + localStorage (not a backend call) since it's just a
 * convenience cache of data each card already fetches on its own.
 */
export interface WeatherSnapshot {
  locationName: string;
  temperature: number;
  humidity: number;
  rainfallMm: number;
  condition: string;
  windKph: number;
}

export interface PlantStatusSnapshot {
  cropName: string;
  problemCategory: "disease" | "deficiency" | "pest" | "healthy" | "unknown";
  problemLabel: string;
  severity: "none" | "mild" | "moderate" | "severe";
  recommendedAction: string;
  analysisId?: string;
  /** The farmer's continuous per-crop plant record this result belongs to (see `plants` table). */
  plantId?: string | null;
  detectedAt: string;
}

interface AgroContextValue {
  weather: WeatherSnapshot | null;
  setWeather: (w: WeatherSnapshot | null) => void;
  plantStatus: PlantStatusSnapshot | null;
  setPlantStatus: (p: PlantStatusSnapshot | null) => void;
}

const AgroContext = createContext<AgroContextValue | undefined>(undefined);

const WEATHER_KEY = "agrolens_last_weather";
const PLANT_KEY = "agrolens_last_plant_status";

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const AgroProvider = ({ children }: { children: ReactNode }) => {
  const [weather, setWeatherState] = useState<WeatherSnapshot | null>(() => readCache(WEATHER_KEY));
  const [plantStatus, setPlantStatusState] = useState<PlantStatusSnapshot | null>(() =>
    readCache(PLANT_KEY)
  );

  const setWeather = (w: WeatherSnapshot | null) => {
    setWeatherState(w);
    try {
      if (w) localStorage.setItem(WEATHER_KEY, JSON.stringify(w));
      else localStorage.removeItem(WEATHER_KEY);
    } catch {
      /* ignore storage errors (e.g. private browsing) */
    }
  };

  const setPlantStatus = (p: PlantStatusSnapshot | null) => {
    setPlantStatusState(p);
    try {
      if (p) localStorage.setItem(PLANT_KEY, JSON.stringify(p));
      else localStorage.removeItem(PLANT_KEY);
    } catch {
      /* ignore storage errors */
    }
  };

  return (
    <AgroContext.Provider value={{ weather, setWeather, plantStatus, setPlantStatus }}>
      {children}
    </AgroContext.Provider>
  );
};

export const useAgroContext = () => {
  const ctx = useContext(AgroContext);
  if (!ctx) throw new Error("useAgroContext must be used inside <AgroProvider>");
  return ctx;
};
