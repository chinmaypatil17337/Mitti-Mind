import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "./useGeolocation";
import { useAgroContext, type WeatherSnapshot } from "@/contexts/AgroContext";
import { useAuth } from "@/contexts/AuthContext";

export interface DayPart {
  label: "morning" | "afternoon" | "evening" | "night";
  temperature: number;
}

export interface WeatherData {
  location: { name: string; region: string | null };
  current: {
    temperature: number;
    humidity: number;
    rainfallMm: number;
    condition: string;
    windKph: number;
  };
  todayForecast: DayPart[];
}

interface UseWeatherResult {
  status: "idle" | "prompting" | "loading" | "ready" | "denied" | "unavailable" | "error";
  data: WeatherData | null;
  error: string | null;
  requestLocation: () => void;
}

/**
 * Gets the device location (via useGeolocation) then calls the weather-data
 * Supabase Edge Function with those coordinates. The result is also written
 * to AgroContext so the chatbot can reference current conditions.
 */
export function useWeather(): UseWeatherResult {
  const { status: geoStatus, coords, requestLocation } = useGeolocation();
  const { setWeather } = useAgroContext();
  const { user } = useAuth();
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!coords) return;

    let cancelled = false;
    setFetching(true);
    setError(null);

    supabase.functions
      .invoke("weather-data", { body: { lat: coords.lat, lng: coords.lng } })
      .then(({ data: result, error: fnError }) => {
        if (cancelled) return;
        if (fnError || !result) {
          throw new Error(fnError?.message || "Weather request failed");
        }
        const weather = result as WeatherData;
        setData(weather);

        const snapshot: WeatherSnapshot = {
          locationName: weather.location.region
            ? `${weather.location.name}, ${weather.location.region}`
            : weather.location.name,
          temperature: weather.current.temperature,
          humidity: weather.current.humidity,
          rainfallMm: weather.current.rainfallMm,
          condition: weather.current.condition,
          windKph: weather.current.windKph,
        };
        setWeather(snapshot);

        // Persist this as the farmer's last-known location (one row per
        // user, upserted), so the chatbot can say "your farm in <area>"
        // even before any plant has been analyzed. Fire-and-forget: this
        // must never block the weather card from rendering.
        if (user && coords) {
          supabase
            .from("farmer_locations")
            .upsert(
              {
                user_id: user.id,
                latitude: coords.lat,
                longitude: coords.lng,
                location_name: weather.location.name,
                region: weather.location.region,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            )
            .then(({ error: upsertError }) => {
              if (upsertError) console.error("Could not save farm location:", upsertError);
            });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Could not load weather");
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng]);

  let status: UseWeatherResult["status"] = "idle";
  if (geoStatus === "prompting") status = "prompting";
  else if (geoStatus === "denied") status = "denied";
  else if (geoStatus === "unavailable") status = "unavailable";
  else if (fetching) status = "loading";
  else if (error) status = "error";
  else if (data) status = "ready";

  return { status, data, error, requestLocation };
}
