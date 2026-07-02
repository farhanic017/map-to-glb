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

export const colabProvider: GPUProvider = {
  id: "colab",
  name: "Google Colab",
  description: "Free GPU notebooks from Google. Requires running a notebook server with ngrok.",
  type: "notebook",
  requiresApiKey: false,
  requiresEndpoint: true,
  setupUrl: "https://colab.research.google.com/",
  notebookUrl: "https://colab.research.google.com/github/farhanic017/map-to-glb/blob/main/notebooks/mapglb_colab_server.ipynb",
  estimatedCost: "free",
  gpuTypes: ["T4", "T4 x2", "A100", "A100 40GB", "A100 80GB"],
  maxBuildings: 5000,

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
        tier: "colab-gpu",
      },
    };
  },

  parseResponse: (response: Record<string, unknown>): Building[] => {
    return normalizeBuildings(response);
  },
};
