import { create } from "zustand";

export type BuildingMaterialPreset =
  | "realistic"
  | "concrete"
  | "brick"
  | "glass"
  | "sand"
  | "cinematicMod"
  | "neonCoast"
  | "nextGenGlass";

type SceneStore = {
  materialPreset: BuildingMaterialPreset;
  textureEnabled: boolean;
  heightScale: number;
  defaultHeight: number;
  levelHeight: number;
  heightmapEnabled: boolean;
  heightmapStrength: number;

  setMaterialPreset: (materialPreset: BuildingMaterialPreset) => void;
  setTextureEnabled: (textureEnabled: boolean) => void;
  setHeightScale: (heightScale: number) => void;
  setDefaultHeight: (defaultHeight: number) => void;
  setLevelHeight: (levelHeight: number) => void;
  setHeightmapEnabled: (heightmapEnabled: boolean) => void;
  setHeightmapStrength: (heightmapStrength: number) => void;
};

export const useSceneStore = create<SceneStore>((set) => ({
  materialPreset: "realistic",
  textureEnabled: true,
  heightScale: 1,
  defaultHeight: 10,
  levelHeight: 2.2,
  heightmapEnabled: false,
  heightmapStrength: 3,

  setMaterialPreset: (materialPreset) => set(() => ({ materialPreset })),
  setTextureEnabled: (textureEnabled) => set(() => ({ textureEnabled })),
  setHeightScale: (heightScale) => set(() => ({ heightScale })),
  setDefaultHeight: (defaultHeight) => set(() => ({ defaultHeight })),
  setLevelHeight: (levelHeight) => set(() => ({ levelHeight })),
  setHeightmapEnabled: (heightmapEnabled) => set(() => ({ heightmapEnabled })),
  setHeightmapStrength: (heightmapStrength) =>
    set(() => ({ heightmapStrength })),
}));
