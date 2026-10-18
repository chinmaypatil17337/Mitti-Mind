import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudSun, Droplets, CloudRain, Wind, MapPin, AlertTriangle } from "lucide-react";
import { useWeather, type DayPart } from "@/hooks/useWeather";

const DAY_PART_ICON: Record<DayPart["label"], string> = {
  morning: "🌅",
  afternoon: "☀️",
  evening: "🌇",
  night: "🌙",
};

export const WeatherCard = () => {
  const { t } = useTranslation();
  const { status, data, error, requestLocation } = useWeather();

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudSun className="h-5 w-5 text-primary" />
          {t("weather.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(status === "idle" || status === "prompting") && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CloudSun className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">{t("weather.permissionPrompt")}</p>
            <Button onClick={requestLocation} disabled={status === "prompting"}>
              {status === "prompting" ? t("common.loading") : t("weather.enableLocation")}
            </Button>
          </div>
        )}

        {status === "denied" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="h-10 w-10 text-[hsl(var(--agro-warning))]" />
            <p className="max-w-xs text-sm text-muted-foreground">{t("weather.permissionDenied")}</p>
            <Button variant="outline" onClick={requestLocation}>
              {t("weather.enableLocation")}
            </Button>
          </div>
        )}

        {status === "unavailable" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">{t("weather.unavailable")}</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <p className="max-w-xs text-sm text-muted-foreground">{error || t("weather.fetchFailed")}</p>
            <Button variant="outline" onClick={requestLocation}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {status === "loading" && (
          <div className="space-y-4 py-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-24" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </div>
        )}

        {status === "ready" && data && (
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {data.location.region ? `${data.location.name}, ${data.location.region}` : data.location.name}
            </div>

            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-bold">{data.current.temperature}°C</p>
                <p className="text-sm text-muted-foreground">{data.current.condition}</p>
              </div>
              <CloudSun className="h-12 w-12 text-primary" />
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                <Droplets className="h-4 w-4 text-[hsl(var(--agro-sky))]" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("weather.humidity")}</p>
                  <p className="font-medium">{data.current.humidity}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                <CloudRain className="h-4 w-4 text-[hsl(var(--agro-sky))]" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("weather.rainfall")}</p>
                  <p className="font-medium">{data.current.rainfallMm} mm</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                <Wind className="h-4 w-4 text-[hsl(var(--agro-sky))]" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("weather.wind")}</p>
                  <p className="font-medium">{data.current.windKph} km/h</p>
                </div>
              </div>
            </div>

            {data.todayForecast.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("weather.todaysForecast")}</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {data.todayForecast.map((part) => (
                    <div key={part.label} className="rounded-lg bg-muted/50 p-2">
                      <p className="text-lg leading-none">{DAY_PART_ICON[part.label]}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t(`weather.${part.label}`)}</p>
                      <p className="text-sm font-medium">{part.temperature}°C</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
