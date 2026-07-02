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

export const kaggleProvider: GPUProvider = {
  id: "kaggle",
  name: "Kaggle Notebooks",
  description: "Free GPU notebooks from Kaggle. Requires running a notebook server with ngrok.",
  type: "notebook",
  requiresApiKey: false,
  requiresEndpoint: true,
  setupUrl: "https://www.kaggle.com/code",
  notebookUrl: "https://www.kaggle.com/code/farhanic017/mapglb-gpu-server",
  estimatedCost: "free",
  gpuTypes: ["P100", "T4 x2"],
  maxBuildings: 3000,

  getEndpoint: (config: ProviderConfig): string => {
    return config.endpoint || "";
  },

  getHeaders: (_config: ProviderConfig): Record<string, string> => {
    return {
      "Content-Type": "application/json",
    };
  },

  buildRequestBody: (
    bounds: BoundsPayload,
    deviceProfile: DeviceBrainProfile
  ): Record<string, unknown> => {
    return {
      task: "mapglb.buildings.process",
      version: 1,
      bounds,
      output: "buildings",
      deviceProfile: {
        ...deviceProfile,
        tier: "kaggle-gpu",
      },
    };
  },

  parseResponse: (response: Record<string, unknown>): Building[] => {
    return normalizeBuildings(response);
  },
};
