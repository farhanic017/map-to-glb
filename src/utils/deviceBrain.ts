export type DeviceBrainTier = "low" | "balanced" | "high";

export type DeviceBrainProfile = {
  tier: DeviceBrainTier;
  cores: number;
  memoryGb: number;
  saveData: boolean;
  maxBuildings: number;
  maxRoads: number;
  terrainSegments: number;
  pixelRatio: [number, number];
  powerPreference: WebGLPowerPreference;
  cacheTtlMs: number;
  requestTimeoutMs: number;
};

let cachedProfile: DeviceBrainProfile | null = null;

function getConnectionInfo() {
  return (navigator as any).connection || {};
}

export function getDeviceBrainProfile(): DeviceBrainProfile {
  if (cachedProfile) return cachedProfile;

  const cores = navigator.hardwareConcurrency || 4;
  const memoryGb = (navigator as any).deviceMemory || 4;
  const connection = getConnectionInfo();
  const saveData = Boolean(connection.saveData);
  const slowConnection = ["slow-2g", "2g", "3g"].includes(
    connection.effectiveType || ""
  );
  const low = saveData || slowConnection || cores <= 2 || memoryGb <= 2;
  const high = !low && cores >= 8 && memoryGb >= 8;
  const tier: DeviceBrainTier = low ? "low" : high ? "high" : "balanced";

  cachedProfile = {
    tier,
    cores,
    memoryGb,
    saveData,
    maxBuildings: tier === "low" ? 450 : tier === "balanced" ? 1200 : 2600,
    maxRoads: tier === "low" ? 250 : tier === "balanced" ? 700 : 1500,
    terrainSegments: tier === "low" ? 28 : tier === "balanced" ? 48 : 72,
    pixelRatio: tier === "low" ? [1, 1.25] : tier === "balanced" ? [1, 1.6] : [1, 2],
    powerPreference: tier === "low" ? "low-power" : "high-performance",
    cacheTtlMs: tier === "low" ? 1000 * 60 * 60 * 24 * 7 : 1000 * 60 * 60 * 24 * 3,
    requestTimeoutMs: tier === "low" ? 9000 : 12000,
  };

  return cachedProfile;
}

export function limitForDevice<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items;
  return items.slice(0, maxItems);
}
