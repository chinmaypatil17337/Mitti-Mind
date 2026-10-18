import { useCallback, useEffect, useState } from "react";

type GeoStatus = "idle" | "prompting" | "granted" | "denied" | "unavailable";

interface GeolocationState {
  status: GeoStatus;
  coords: { lat: number; lng: number } | null;
  /** Ask the browser for location again (also what the first-time prompt calls). */
  requestLocation: () => void;
}

const PERMISSION_CACHE_KEY = "agrolens_geo_permission"; // "granted" | "denied"

/**
 * Wraps the browser Geolocation API with the permission bookkeeping the
 * weather feature needs: ask once, remember the result, and don't nag the
 * user again on every visit. If the Permissions API is available we check
 * it first so a previously-granted permission doesn't show a loading/prompt
 * flicker at all.
 */
export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("prompting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("granted");
        try {
          localStorage.setItem(PERMISSION_CACHE_KEY, "granted");
        } catch {
          /* ignore */
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          try {
            localStorage.setItem(PERMISSION_CACHE_KEY, "denied");
          } catch {
            /* ignore */
          }
        } else {
          setStatus("unavailable");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);

  useEffect(() => {
    let cachedChoice: string | null = null;
    try {
      cachedChoice = localStorage.getItem(PERMISSION_CACHE_KEY);
    } catch {
      /* ignore */
    }

    // If the user already granted access on a previous visit, fetch the
    // position straight away without showing any "enable location" prompt.
    if (cachedChoice === "granted") {
      requestLocation();
      return;
    }
    // If they previously denied it, don't auto-prompt again — show the
    // "permission denied" state and let them opt back in manually.
    if (cachedChoice === "denied") {
      setStatus("denied");
      return;
    }

    // First time ever: if the Permissions API confirms it's already
    // granted at the browser level (e.g. granted on another AgroLens
    // session before this code existed), skip the prompt step too.
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (result.state === "granted") {
            requestLocation();
          } else {
            setStatus("idle"); // caller shows an "enable location" button
          }
        })
        .catch(() => setStatus("idle"));
    } else {
      setStatus("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, coords, requestLocation };
}
