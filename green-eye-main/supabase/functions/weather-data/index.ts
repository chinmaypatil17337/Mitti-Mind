import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Open-Meteo (https://open-meteo.com) needs no API key and has a generous
// free tier, which keeps this project's setup to "clone and run" for a
// college prototype. BigDataCloud's reverse-geocoding endpoint is the same:
// free and keyless. If you'd rather use a keyed provider (e.g.
// OpenWeatherMap), set WEATHER_API_KEY as a Supabase Edge Function secret
// and swap the fetch calls below for that provider's endpoints.
const WEATHER_API_KEY = Deno.env.get('WEATHER_API_KEY'); // optional, unused by the default provider

// WMO weather codes -> short human label (Open-Meteo uses WMO codes).
const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
};

function conditionFor(code: number): string {
  return WEATHER_CODES[code] ?? 'Unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lng } = await req.json();

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(JSON.stringify({ error: 'lat and lng (numbers) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [weatherRes, geoRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m` +
          `&hourly=temperature_2m` +
          `&daily=precipitation_sum,weather_code` +
          `&timezone=auto&forecast_days=2`
      ),
      fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      ),
    ]);

    if (!weatherRes.ok) {
      throw new Error(`Weather provider error: ${weatherRes.status}`);
    }

    const weatherJson = await weatherRes.json();
    const geoJson = geoRes.ok ? await geoRes.json() : null;

    const current = weatherJson.current ?? {};
    const hourly = weatherJson.hourly ?? { time: [], temperature_2m: [] };

    // Pick the hourly temperature closest to 9am / 2pm / 6pm / 10pm today
    // for a simple "today's forecast" breakdown (Open-Meteo doesn't return
    // a ready-made morning/afternoon/evening/night split).
    const todayStr = (weatherJson.current?.time ?? '').slice(0, 10);
    const pickHour = (hour: number): number | null => {
      const target = `${todayStr}T${String(hour).padStart(2, '0')}:00`;
      const idx = (hourly.time as string[]).indexOf(target);
      return idx >= 0 ? Math.round(hourly.temperature_2m[idx]) : null;
    };

    const todayForecast = [
      { label: 'morning', temperature: pickHour(9) },
      { label: 'afternoon', temperature: pickHour(14) },
      { label: 'evening', temperature: pickHour(18) },
      { label: 'night', temperature: pickHour(22) },
    ].filter((d) => d.temperature !== null);

    const locationName =
      geoJson?.city || geoJson?.locality || geoJson?.principalSubdivision || 'Your location';
    const region = geoJson?.principalSubdivision && geoJson.principalSubdivision !== locationName
      ? geoJson.principalSubdivision
      : (geoJson?.countryName ?? null);

    const payload = {
      location: { name: locationName, region },
      current: {
        temperature: Math.round(current.temperature_2m ?? 0),
        humidity: Math.round(current.relative_humidity_2m ?? 0),
        rainfallMm: Math.round((current.precipitation ?? 0) * 10) / 10,
        condition: conditionFor(current.weather_code ?? -1),
        windKph: Math.round((current.wind_speed_10m ?? 0) * 10) / 10,
      },
      todayForecast,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in weather-data function:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
