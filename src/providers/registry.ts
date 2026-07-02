import { GPUProvider } from "./types";
import { colabProvider } from "./colab";
import { kaggleProvider } from "./kaggle";
import { runpodProvider } from "./runpod";
import { modalProvider } from "./modal";
import { vastaiProvider } from "./vastai";
import { paperspaceProvider } from "./paperspace";
import { lightningProvider } from "./lightning";
import { customProvider } from "./custom";

const providers: GPUProvider[] = [
  colabProvider,
  kaggleProvider,
  runpodProvider,
  modalProvider,
  vastaiProvider,
  paperspaceProvider,
  lightningProvider,
  customProvider,
];

export function getProviders(): GPUProvider[] {
  return providers;
}

export function getProvider(id: string): GPUProvider | undefined {
  return providers.find((p) => p.id === id);
}

export function getProvidersByType(type: GPUProvider["type"]): GPUProvider[] {
  return providers.filter((p) => p.type === type);
}

export function getFreeProviders(): GPUProvider[] {
  return providers.filter((p) => p.estimatedCost === "free");
}

export function getProviderIds(): string[] {
  return providers.map((p) => p.id);
}
