import { Building } from "@/components/map/Processing";
import { DeviceBrainProfile } from "@/utils/deviceBrain";

export type BoundsPayload = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type ProviderType = "notebook" | "serverless" | "dedicated";

export type ProviderCost = "free" | "low" | "medium" | "high";

export interface ProviderConfig {
  endpoint: string;
  apiKey: string;
  customSettings?: Record<string, string>;
}

export interface GPUProvider {
  id: string;
  name: string;
  description: string;
  type: ProviderType;
  requiresApiKey: boolean;
  requiresEndpoint: boolean;
  defaultEndpoint?: string;
  setupUrl?: string;
  notebookUrl?: string;
  estimatedCost: ProviderCost;
  gpuTypes: string[];
  maxBuildings: number;

  getEndpoint(config: ProviderConfig): string;
  getHeaders(config: ProviderConfig): Record<string, string>;
  buildRequestBody(
    bounds: BoundsPayload,
    deviceProfile: DeviceBrainProfile
  ): Record<string, unknown>;
  parseResponse(response: Record<string, unknown>): Building[];
}
