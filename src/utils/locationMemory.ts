export type SavedMapLocation = {
  lat: number;
  lng: number;
  label?: string;
  savedAt: number;
};

const LAST_LOCATION_KEY = "map3d.lastLocation";
const FALLBACK_LOCATION: SavedMapLocation = {
  lat: 40.8,
  lng: -73.95,
  label: "New York",
  savedAt: 0,
};

export function getSavedMapLocation(): SavedMapLocation {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) || "null");
    if (
      typeof saved?.lat === "number" &&
      typeof saved?.lng === "number" &&
      Number.isFinite(saved.lat) &&
      Number.isFinite(saved.lng)
    ) {
      return saved;
    }
  } catch {
    localStorage.removeItem(LAST_LOCATION_KEY);
  }

  return FALLBACK_LOCATION;
}

export function saveMapLocation(location: {
  lat: number;
  lng: number;
  label?: string;
}) {
  try {
    localStorage.setItem(
      LAST_LOCATION_KEY,
      JSON.stringify({
        lat: location.lat,
        lng: location.lng,
        label: location.label,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Storage can be unavailable in private windows. The app still works without it.
  }
}
