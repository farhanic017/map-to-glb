export type ImageResult = {
  url: string;
  thumbnail: string;
  source: string;
  width: number;
  height: number;
};

export type SearchApiProvider = {
  id: string;
  name: string;
  description: string;
  apiKeyRequired: boolean;
  baseUrl: string;
  freeQuota: number;
  search: (query: string, apiKey: string) => Promise<ImageResult[]>;
};

export type StoredApiConfig = {
  providerId: string;
  apiKey: string;
  priority: number;
  enabled: boolean;
  usageCount: number;
  lastUsed: number;
};

const STORAGE_KEY = "mapglb.searchApis";

function getStoredConfigs(): StoredApiConfig[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveStoredConfigs(configs: StoredApiConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

async function searchGoogle(query: string, apiKey: string): Promise<ImageResult[]> {
  const cx = "017576662512468239146:omuauf_jyus";
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&num=5`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Google search failed");
  const data = await response.json();
  return (data.items || []).map((item: any) => ({
    url: item.link,
    thumbnail: item.image.thumbnailLink,
    source: item.displayLink,
    width: item.image.width,
    height: item.image.height,
  }));
}

async function searchBing(query: string, apiKey: string): Promise<ImageResult[]> {
  const url = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&count=5`;
  const response = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  });
  if (!response.ok) throw new Error("Bing search failed");
  const data = await response.json();
  return (data.value || []).map((item: any) => ({
    url: item.contentUrl,
    thumbnail: item.thumbnailUrl,
    source: item.hostPageDisplayUrl,
    width: item.width,
    height: item.height,
  }));
}

async function searchUnsplash(query: string, apiKey: string): Promise<ImageResult[]> {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5`;
  const response = await fetch(url, {
    headers: { Authorization: `Client-ID ${apiKey}` },
  });
  if (!response.ok) throw new Error("Unsplash search failed");
  const data = await response.json();
  return (data.results || []).map((item: any) => ({
    url: item.urls.regular,
    thumbnail: item.urls.thumb,
    source: item.user.name,
    width: item.width,
    height: item.height,
  }));
}

async function searchPexels(query: string, apiKey: string): Promise<ImageResult[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`;
  const response = await fetch(url, {
    headers: { Authorization: apiKey },
  });
  if (!response.ok) throw new Error("Pexels search failed");
  const data = await response.json();
  return (data.photos || []).map((item: any) => ({
    url: item.src.large,
    thumbnail: item.src.small,
    source: item.photographer,
    width: item.width,
    height: item.height,
  }));
}

async function searchPixabay(query: string, apiKey: string): Promise<ImageResult[]> {
  const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=5`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Pixabay search failed");
  const data = await response.json();
  return (data.hits || []).map((item: any) => ({
    url: item.largeImageURL,
    thumbnail: item.webformatURL,
    source: item.user,
    width: item.imageWidth,
    height: item.imageHeight,
  }));
}

export const searchProviders: SearchApiProvider[] = [
  {
    id: "google",
    name: "Google Custom Search",
    description: "Best quality, 100 free queries/day",
    apiKeyRequired: true,
    baseUrl: "https://www.googleapis.com",
    freeQuota: 100,
    search: searchGoogle,
  },
  {
    id: "bing",
    name: "Bing Image Search",
    description: "Good quality, 1000 free queries/month",
    apiKeyRequired: true,
    baseUrl: "https://api.bing.microsoft.com",
    freeQuota: 1000,
    search: searchBing,
  },
  {
    id: "unsplash",
    name: "Unsplash",
    description: "Free, artistic photos",
    apiKeyRequired: true,
    baseUrl: "https://api.unsplash.com",
    freeQuota: 50,
    search: searchUnsplash,
  },
  {
    id: "pexels",
    name: "Pexels",
    description: "Free stock photos",
    apiKeyRequired: true,
    baseUrl: "https://api.pexels.com",
    freeQuota: 200,
    search: searchPexels,
  },
  {
    id: "pixabay",
    name: "Pixabay",
    description: "Free images",
    apiKeyRequired: true,
    baseUrl: "https://pixabay.com",
    freeQuota: 5000,
    search: searchPixabay,
  },
];

export function getConfiguredApis(): StoredApiConfig[] {
  return getStoredConfigs().sort((a, b) => a.priority - b.priority);
}

export function addApiConfig(config: Omit<StoredApiConfig, "usageCount" | "lastUsed">) {
  const configs = getStoredConfigs();
  const existing = configs.findIndex((c) => c.providerId === config.providerId);
  if (existing >= 0) {
    configs[existing] = { ...configs[existing], ...config };
  } else {
    configs.push({ ...config, usageCount: 0, lastUsed: 0 });
  }
  saveStoredConfigs(configs);
}

export function removeApiConfig(providerId: string) {
  const configs = getStoredConfigs().filter((c) => c.providerId !== providerId);
  saveStoredConfigs(configs);
}

export function updateApiConfigPriority(providerId: string, priority: number) {
  const configs = getStoredConfigs();
  const config = configs.find((c) => c.providerId === providerId);
  if (config) {
    config.priority = priority;
    saveStoredConfigs(configs);
  }
}

export async function searchWithFallback(query: string): Promise<ImageResult[]> {
  const configs = getConfiguredApis().filter((c) => c.enabled && c.apiKey);

  for (const config of configs) {
    const provider = searchProviders.find((p) => p.id === config.providerId);
    if (!provider) continue;

    try {
      const results = await provider.search(query, config.apiKey);
      config.usageCount++;
      config.lastUsed = Date.now();
      saveStoredConfigs(getStoredConfigs());
      return results;
    } catch (e) {
      console.warn(`API ${provider.name} failed:`, e);
      continue;
    }
  }

  return [];
}

export function getActiveApis(): SearchApiProvider[] {
  return searchProviders.filter((p) => {
    const config = getStoredConfigs().find((c) => c.providerId === p.id);
    return config?.enabled && config?.apiKey;
  });
}
