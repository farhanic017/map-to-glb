import { create } from "zustand";
import { ProviderConfig } from "@/providers/types";

export type ComputeMode = "local" | "remote";

type RuntimeStore = {
  computeMode: ComputeMode;
  remoteEndpoint: string;
  remoteApiKey: string;
  agentMode: boolean;
  selectedProvider: string | null;
  providerConfigs: Record<string, ProviderConfig>;

  setComputeMode: (computeMode: ComputeMode) => void;
  setRemoteEndpoint: (remoteEndpoint: string) => void;
  setRemoteApiKey: (remoteApiKey: string) => void;
  setAgentMode: (agentMode: boolean) => void;
  setSelectedProvider: (providerId: string | null) => void;
  setProviderConfig: (providerId: string, config: ProviderConfig) => void;
};

const storageKeys = {
  computeMode: "map3d.runtime.computeMode",
  remoteEndpoint: "map3d.runtime.remoteEndpoint",
  remoteApiKey: "map3d.runtime.remoteApiKey",
  agentMode: "map3d.runtime.agentMode",
  selectedProvider: "map3d.runtime.selectedProvider",
  providerConfigs: "map3d.runtime.providerConfigs",
};

const defaultRemoteEndpoint = import.meta.env.VITE_REMOTE_GPU_ENDPOINT || "";

function getStoredValue(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function setStoredValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Runtime storage is optional. The app still works for locked-down browsers.
  }
}

export const useRuntimeStore = create<RuntimeStore>((set) => ({
  computeMode:
    getStoredValue(storageKeys.computeMode, "local") === "remote"
      ? "remote"
      : "local",
  remoteEndpoint: getStoredValue(
    storageKeys.remoteEndpoint,
    defaultRemoteEndpoint
  ),
  remoteApiKey: getStoredValue(storageKeys.remoteApiKey),
  agentMode: getStoredValue(storageKeys.agentMode) === "true",
  selectedProvider: getStoredValue(storageKeys.selectedProvider) || null,
  providerConfigs: JSON.parse(getStoredValue(storageKeys.providerConfigs, "{}")),

  setComputeMode: (computeMode) => {
    setStoredValue(storageKeys.computeMode, computeMode);
    set(() => ({ computeMode }));
  },
  setRemoteEndpoint: (remoteEndpoint) => {
    setStoredValue(storageKeys.remoteEndpoint, remoteEndpoint);
    set(() => ({ remoteEndpoint }));
  },
  setRemoteApiKey: (remoteApiKey) => {
    setStoredValue(storageKeys.remoteApiKey, remoteApiKey);
    set(() => ({ remoteApiKey }));
  },
  setAgentMode: (agentMode) => {
    setStoredValue(storageKeys.agentMode, String(agentMode));
    set(() => ({ agentMode }));
  },
  setSelectedProvider: (selectedProvider) => {
    setStoredValue(storageKeys.selectedProvider, selectedProvider || "");
    set(() => ({ selectedProvider }));
  },
  setProviderConfig: (providerId, config) => {
    const providerConfigs = { ...useRuntimeStore.getState().providerConfigs, [providerId]: config };
    setStoredValue(storageKeys.providerConfigs, JSON.stringify(providerConfigs));
    set(() => ({ providerConfigs }));
  },
}));
