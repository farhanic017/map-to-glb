import { searchWithFallback, ImageResult } from "./searchApis";

type BuildingImageData = {
  buildingId: number;
  imageUrl: string;
  thumbnail: string;
  fetchedAt: number;
};

const DB_NAME = "mapglb-building-images";
const DB_VERSION = 1;
const STORE_NAME = "images";

let dbInstance: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "buildingId" });
      }
    };
  });
}

async function getCachedImage(buildingId: number): Promise<BuildingImageData | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(buildingId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function cacheImage(data: BuildingImageData): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(data);
  } catch {
    // Cache write failed, continue without caching
  }
}

function buildSearchQuery(name: string, tags: Record<string, string>): string {
  const buildingType = tags.building || tags["building:type"] || "";
  const parts = [name, "building"];

  if (buildingType) parts.push(buildingType);
  if (tags["building:material"]) parts.push(tags["building:material"]);
  if (tags["architect"]) parts.push(tags["architect"]);

  return parts.filter(Boolean).join(" ") + " exterior photo";
}

export async function fetchBuildingImage(
  buildingId: number,
  name: string,
  tags: Record<string, string>
): Promise<string | null> {
  if (!name || name.length < 3) return null;

  const cached = await getCachedImage(buildingId);
  if (cached && Date.now() - cached.fetchedAt < 7 * 24 * 60 * 60 * 1000) {
    return cached.imageUrl;
  }

  try {
    const query = buildSearchQuery(name, tags);
    const results = await searchWithFallback(query);

    if (results.length > 0) {
      const best = results[0];
      const imageData: BuildingImageData = {
        buildingId,
        imageUrl: best.url,
        thumbnail: best.thumbnail,
        fetchedAt: Date.now(),
      };
      await cacheImage(imageData);
      return best.url;
    }
  } catch (e) {
    console.warn("Failed to fetch building image:", e);
  }

  return null;
}

export async function fetchBuildingImages(
  buildings: Array<{ id: number; name: string; tags: Record<string, string> }>
): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const toFetch = buildings.filter((b) => b.name && b.name.length >= 3);

  const limited = toFetch.slice(0, 20);

  const fetches = limited.map(async (building) => {
    const url = await fetchBuildingImage(building.id, building.name, building.tags);
    if (url) results.set(building.id, url);
  });

  await Promise.allSettled(fetches);
  return results;
}

export async function loadImageAsTexture(imageUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
