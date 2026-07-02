import { Building } from "@/components/map/Processing";
import { DeviceBrainProfile } from "./deviceBrain";

export type BoundsPayload = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type RemoteProcessingResponse = {
  buildings?: Building[];
  elements?: Array<{
    id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon?: number; lng?: number }>;
  }>;
  jobId?: string;
  statusUrl?: string;
  status?: "queued" | "running" | "complete" | "failed";
  error?: string;
};

const REMOTE_PROCESS_TIMEOUT_MS = 1000 * 60 * 4;
const REMOTE_POLL_INTERVAL_MS = 2500;

function buildProcessUrl(endpoint: string) {
  const trimmedEndpoint = endpoint.trim().replace(/\/+$/, "");
  if (!trimmedEndpoint) throw new Error("Remote GPU endpoint is empty.");
  if (trimmedEndpoint.endsWith("/process")) return trimmedEndpoint;
  return `${trimmedEndpoint}/api/map3d/process`;
}

function resolveStatusUrl(processUrl: string, statusUrl: string) {
  return new URL(statusUrl, processUrl).toString();
}

function normalizeBuildings(response: RemoteProcessingResponse): Building[] {
  if (Array.isArray(response.buildings)) return response.buildings;

  if (Array.isArray(response.elements)) {
    return response.elements.map((element) => ({
      id: element.id,
      tags: element.tags || {},
      geometry: element.geometry?.map((point) => ({
        lat: point.lat,
        lng: point.lng ?? point.lon ?? 0,
      })),
    }));
  }

  return [];
}

async function postJson<T>({
  url,
  apiKey,
  body,
}: {
  url: string;
  apiKey?: string;
  body: unknown;
}): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Remote GPU server returned ${response.status}.`);
  }

  return response.json();
}

async function getJson<T>({
  url,
  apiKey,
}: {
  url: string;
  apiKey?: string;
}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Remote GPU job returned ${response.status}.`);
  }

  return response.json();
}

export async function requestRemoteBuildings({
  endpoint,
  apiKey,
  bounds,
  deviceProfile,
}: {
  endpoint: string;
  apiKey?: string;
  bounds: BoundsPayload;
  deviceProfile: DeviceBrainProfile;
}): Promise<Building[]> {
  const processUrl = buildProcessUrl(endpoint);
  const startedAt = Date.now();
  const initialResponse = await postJson<RemoteProcessingResponse>({
    url: processUrl,
    apiKey,
    body: {
      task: "map3d.buildings.process",
      version: 1,
      bounds,
      output: "buildings",
      deviceProfile,
    },
  });

  let buildings = normalizeBuildings(initialResponse);
  if (buildings.length > 0) return buildings;

  const statusUrl = initialResponse.statusUrl;
  if (!statusUrl) {
    throw new Error(initialResponse.error || "Remote GPU server returned no buildings.");
  }

  const resolvedStatusUrl = resolveStatusUrl(processUrl, statusUrl);

  while (Date.now() - startedAt < REMOTE_PROCESS_TIMEOUT_MS) {
    await new Promise((resolve) =>
      globalThis.setTimeout(resolve, REMOTE_POLL_INTERVAL_MS)
    );

    const statusResponse = await getJson<RemoteProcessingResponse>({
      url: resolvedStatusUrl,
      apiKey,
    });

    if (statusResponse.status === "failed") {
      throw new Error(statusResponse.error || "Remote GPU job failed.");
    }

    buildings = normalizeBuildings(statusResponse);
    if (buildings.length > 0 || statusResponse.status === "complete") {
      return buildings;
    }
  }

  throw new Error("Remote GPU job timed out.");
}
