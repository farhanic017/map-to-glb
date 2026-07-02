import { Building } from "@/components/map/Processing";
import { DeviceBrainProfile } from "@/utils/deviceBrain";
import { GPUProvider, ProviderConfig, BoundsPayload } from "./types";

function normalizeBuildings(response: Record<string, unknown>): Building[] {
  const buildings = response.buildings;
  if (Array.isArray(buildings)) {
    return buildings as Building[];
  }

  const elements = response.elements;
  if (Array.isArray(elements)) {
    return (elements as Array<Record<string, unknown>>).map((element) => ({
      id: element.id as number,
      tags: (element.tags as Record<string, string>) || {},
      geometry: Array.isArray(element.geometry)
        ? (element.geometry as Array<Record<string, number>>).map((pt) => ({
            lat: pt.lat,
            lng: pt.lng ?? pt.lon ?? 0,
          }))
        : undefined,
    }));
  }

  return [];
}

export const customProvider: GPUProvider = {
  id: "custom",
  name: "Custom Endpoint",
  description: "Use any server that implements the /api/map3d/process contract.",
  type: "serverless",
  requiresApiKey: false,
  requiresEndpoint: true,
  estimatedCost: "medium",
  gpuTypes: ["Any"],
  maxBuildings: 5000,

  getEndpoint: (config: ProviderConfig): string => {
    return config.endpoint || "";
  },

  getHeaders: (config: ProviderConfig): Record<string, string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    return headers;
  },

  buildRequestBody: (
    bounds: BoundsPayload,
    deviceProfile: DeviceBrainProfile
  ): Record<string, unknown> => {
    return {
      task: "map3d.buildings.process",
      version: 1,
      bounds,
      output: "buildings",
      deviceProfile,
    };
  },

  parseResponse: (response: Record<string, unknown>): Building[] => {
    return normalizeBuildings(response);
  },
};
