/**
 * Map to GLB - 3D Building Mapping Service
 * Copyright (C) 2026 Farhan Dhrubo
 * Licensed under GNU General Public License v3.0
 * https://github.com/farhanic017/map-to-glb
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useAreaStore } from "@/state/areaStore";
import { Html, Sky, Environment, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useActionStore } from "@/state/exportStore";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import instanceFleet from "@/api/axios";
import {
  BuildingMaterialPreset,
  useSceneStore,
} from "@/state/sceneStore";
import { getDeviceBrainProfile, limitForDevice } from "@/utils/deviceBrain";

const scale = 51000;

const deviceBrain = getDeviceBrainProfile();

type RenderMaterialPreset = Exclude<BuildingMaterialPreset, "realistic">;

const materialPresets: Record<
  RenderMaterialPreset,
  {
    color: string;
    roughness: number;
    metalness: number;
    emissive?: string;
    emissiveIntensity?: number;
    textureBase: string;
    textureLine: string;
    textureAccent?: string;
  }
> = {
  concrete: {
    color: "#9da0a3",
    roughness: 0.88,
    metalness: 0.03,
    textureBase: "#a8abad",
    textureLine: "#7f8387",
  },
  brick: {
    color: "#9b5a45",
    roughness: 0.78,
    metalness: 0.02,
    textureBase: "#a9634b",
    textureLine: "#673a31",
  },
  glass: {
    color: "#7aa8bd",
    roughness: 0.18,
    metalness: 0.18,
    textureBase: "#8fb9c8",
    textureLine: "#d8eef5",
  },
  sand: {
    color: "#c2a778",
    roughness: 0.82,
    metalness: 0.01,
    textureBase: "#cdb78c",
    textureLine: "#8e7652",
  },
  cinematicMod: {
    color: "#545b61",
    roughness: 0.34,
    metalness: 0.18,
    emissive: "#241407",
    emissiveIntensity: 0.08,
    textureBase: "#444b50",
    textureLine: "#f1b45e",
    textureAccent: "#151b21",
  },
  neonCoast: {
    color: "#5e8194",
    roughness: 0.26,
    metalness: 0.16,
    emissive: "#12323a",
    emissiveIntensity: 0.12,
    textureBase: "#335264",
    textureLine: "#25d6c8",
    textureAccent: "#f26ab8",
  },
  nextGenGlass: {
    color: "#7facb7",
    roughness: 0.08,
    metalness: 0.38,
    emissive: "#123744",
    emissiveIntensity: 0.14,
    textureBase: "#426b78",
    textureLine: "#d9fbff",
    textureAccent: "#58d9ff",
  },
};

type FacadeTextureSet = {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  emissiveMap?: THREE.CanvasTexture;
};

const facadeTextureCache = new Map<string, FacadeTextureSet>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashNoise(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function polygonArea(points: THREE.Vector2[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function isRenderableFootprint(points: THREE.Vector2[]) {
  if (points.length < 4) return false;
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return false;
  }

  const bounds = new THREE.Box2().setFromPoints(points);
  const size = new THREE.Vector2();
  bounds.getSize(size);

  const minSide = Math.min(size.x, size.y);
  const maxSide = Math.max(size.x, size.y);
  const area = polygonArea(points);

  if (area < 4) return false;
  if (minSide < 0.45) return false;
  if (maxSide / Math.max(minSide, 0.001) > 28 && area < 180) return false;

  return true;
}

function cleanShapePoints(points: THREE.Vector2[]) {
  const cleaned: THREE.Vector2[] = [];

  points.forEach((point) => {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || previous.distanceToSquared(point) > 0.0004) {
      cleaned.push(point);
    }
  });

  if (cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first.distanceToSquared(last) <= 0.0004) {
      cleaned.pop();
    }
  }

  return cleaned;
}

function closeShapePoints(points: THREE.Vector2[]) {
  const closed = cleanShapePoints(points);
  if (closed.length > 0 && !closed[0].equals(closed[closed.length - 1])) {
    closed.push(closed[0].clone());
  }
  return closed;
}

function parseHeightMeters(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return NaN;
  const normalized = String(value)
    .trim()
    .replace(",", ".")
    .replace(/m$/i, "");
  return Number.parseFloat(normalized);
}

function createTextureFromCanvas(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace
) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = colorSpace;
  texture.anisotropy = deviceBrain.tier === "low" ? 2 : 6;
  texture.needsUpdate = true;
  return texture;
}

function createBlankCanvas(size: number, fillStyle: string) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = fillStyle;
  context.fillRect(0, 0, size, size);
  return { canvas, context };
}

function addFineSurfaceNoise(
  context: CanvasRenderingContext2D,
  size: number,
  opacity: number
) {
  for (let index = 0; index < 900; index += 1) {
    const noise = hashNoise(index + size);
    const x = Math.floor(hashNoise(index * 3.1) * size);
    const y = Math.floor(hashNoise(index * 5.7) * size);
    const shade = Math.floor(70 + noise * 85);
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${opacity})`;
    context.fillRect(x, y, 1 + Math.floor(noise * 2), 1);
  }
}

function drawWindowGrid({
  context,
  materialPreset,
  size,
  base,
}: {
  context: CanvasRenderingContext2D;
  materialPreset: RenderMaterialPreset;
  size: number;
  base: {
    line: string;
    accent?: string;
  };
}) {
  const isGlass =
    materialPreset === "glass" || materialPreset === "nextGenGlass";
  const isCinematic =
    materialPreset === "cinematicMod" ||
    materialPreset === "neonCoast" ||
    materialPreset === "nextGenGlass";
  const floorHeight = isCinematic ? 34 : materialPreset === "brick" ? 22 : 30;
  const bayWidth =
    materialPreset === "brick"
      ? 24
      : materialPreset === "neonCoast"
      ? 20
      : isGlass
      ? 26
      : 30;

  context.save();
  context.globalAlpha = isGlass ? 0.75 : 0.55;
  context.strokeStyle = base.line;
  context.lineWidth = isGlass ? 2 : 1;

  for (let y = floorHeight; y < size; y += floorHeight) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y);
    context.stroke();
  }

  for (let x = bayWidth; x < size; x += bayWidth) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, size);
    context.stroke();
  }
  context.restore();

  if (materialPreset === "brick") {
    context.save();
    context.globalAlpha = 0.35;
    context.strokeStyle = base.line;
    for (let y = 0; y < size; y += floorHeight * 2) {
      for (let x = bayWidth / 2; x < size; x += bayWidth) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + floorHeight);
        context.stroke();
      }
    }
    context.restore();
  }

  for (let y = 10; y < size - 18; y += floorHeight) {
    for (let x = 8; x < size - bayWidth; x += bayWidth) {
      const lit = hashNoise(x * 11 + y * 17) > 0.45;
      const windowColor =
        materialPreset === "cinematicMod"
          ? lit
            ? "rgba(255, 190, 94, 0.82)"
            : "rgba(17, 24, 32, 0.72)"
          : materialPreset === "neonCoast"
          ? lit
            ? "rgba(57, 235, 218, 0.78)"
            : "rgba(16, 40, 50, 0.74)"
          : materialPreset === "nextGenGlass"
          ? lit
            ? "rgba(213, 252, 255, 0.88)"
            : "rgba(23, 63, 75, 0.68)"
          : isGlass
          ? lit
            ? "rgba(213, 241, 248, 0.7)"
            : "rgba(45, 82, 98, 0.46)"
          : "rgba(42, 46, 51, 0.26)";

      context.fillStyle = windowColor;
      context.fillRect(x, y, Math.max(5, bayWidth - 10), floorHeight * 0.46);
    }
  }

  if (isCinematic) {
    context.save();
    context.globalAlpha = materialPreset === "cinematicMod" ? 0.55 : 0.7;
    context.strokeStyle = base.accent || base.line;
    context.lineWidth = materialPreset === "cinematicMod" ? 3 : 2;

    for (let y = 12; y < size; y += 68) {
      context.beginPath();
      context.moveTo(10, y);
      context.lineTo(size - 10, y + 10);
      context.stroke();
    }

    if (materialPreset !== "cinematicMod") {
      context.fillStyle = base.accent || base.line;
      for (let x = 16; x < size; x += 44) {
        context.fillRect(x, 18, 4, size - 36);
      }
    }
    context.restore();
  }
}

function getFacadeArchetype(tags: Record<string, string>) {
  const buildingType = String(tags.building || "").toLowerCase();
  const amenity = String(tags.amenity || "").toLowerCase();
  const shop = String(tags.shop || "").toLowerCase();

  if (
    buildingType.includes("apartments") ||
    buildingType.includes("residential") ||
    buildingType.includes("house") ||
    buildingType.includes("dormitory")
  ) {
    return "residential";
  }

  if (
    buildingType.includes("commercial") ||
    buildingType.includes("retail") ||
    buildingType.includes("office") ||
    Boolean(shop)
  ) {
    return "commercial";
  }

  if (
    buildingType.includes("industrial") ||
    buildingType.includes("warehouse") ||
    buildingType.includes("service")
  ) {
    return "industrial";
  }

  if (
    buildingType.includes("school") ||
    buildingType.includes("university") ||
    buildingType.includes("hospital") ||
    buildingType.includes("civic") ||
    buildingType.includes("museum") ||
    Boolean(amenity)
  ) {
    return "institutional";
  }

  return "mixed";
}

function drawRealFacadeDetails({
  context,
  materialPreset,
  size,
  tags,
  height,
  variantSeed,
  palette,
}: {
  context: CanvasRenderingContext2D;
  materialPreset: RenderMaterialPreset;
  size: number;
  tags: Record<string, string>;
  height: number;
  variantSeed: number;
  palette: ReturnType<typeof resolveFacadePalette>;
}) {
  const archetype = getFacadeArchetype(tags);
  const isGlass =
    materialPreset === "glass" ||
    materialPreset === "nextGenGlass" ||
    materialPreset === "neonCoast";
  const floorCount = Math.max(1, Math.round(clamp(height / 3.1, 1, 28)));
  const floorStep = clamp(size / Math.min(floorCount, 15), 18, 52);
  const bayStep =
    archetype === "industrial"
      ? 58
      : archetype === "commercial" || isGlass
      ? 42
      : 34;
  const windowW =
    archetype === "industrial"
      ? 24
      : archetype === "commercial" || isGlass
      ? 26
      : 18;
  const windowH =
    archetype === "industrial"
      ? 10
      : archetype === "commercial" || isGlass
      ? 22
      : 17;
  const frameColor = isGlass ? adjustHexColor(palette.base, 58) : "#ece7da";
  const shadowColor = isGlass ? "#143441" : adjustHexColor(palette.dark, -18);

  context.save();
  context.globalAlpha = 0.8;
  context.strokeStyle = adjustHexColor(palette.dark, -8);
  context.lineWidth = 2;

  for (let y = floorStep; y < size; y += floorStep) {
    context.globalAlpha = 0.28;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y + hashNoise(variantSeed + y) * 2);
    context.stroke();
  }

  context.globalAlpha = 1;
  for (let y = 8; y < size - floorStep * 0.5; y += floorStep) {
    for (let x = 10; x < size - windowW - 8; x += bayStep) {
      const noiseSeed = variantSeed + x * 13 + y * 17;
      if (hashNoise(noiseSeed) < (archetype === "industrial" ? 0.32 : 0.14)) {
        continue;
      }

      const wx = x + hashNoise(noiseSeed * 1.7) * 3;
      const wy = y + 4 + hashNoise(noiseSeed * 2.1) * 3;
      const lit = hashNoise(noiseSeed * 2.9) > 0.72;
      const glassColor = lit
        ? isGlass
          ? "rgba(190, 236, 242, 0.92)"
          : "rgba(238, 224, 166, 0.82)"
        : isGlass
        ? "rgba(25, 72, 86, 0.72)"
        : "rgba(37, 48, 55, 0.64)";

      context.fillStyle = shadowColor;
      context.fillRect(wx - 1, wy + 1, windowW + 2, windowH + 2);
      context.fillStyle = frameColor;
      context.fillRect(wx - 1, wy - 1, windowW + 2, windowH + 2);
      context.fillStyle = glassColor;
      context.fillRect(wx + 1, wy + 1, windowW - 2, windowH - 2);

      if (!isGlass && archetype === "residential" && hashNoise(noiseSeed * 3.7) > 0.45) {
        context.fillStyle = "rgba(28, 31, 32, 0.5)";
        context.fillRect(wx - 3, wy + windowH + 2, windowW + 6, 2);
        context.strokeStyle = "rgba(18, 21, 22, 0.42)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(wx - 2, wy + windowH + 3);
        context.lineTo(wx + windowW + 2, wy + windowH + 3);
        context.stroke();
      }

      if (isGlass) {
        context.strokeStyle = "rgba(224, 255, 255, 0.32)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(wx + 3, wy + 2);
        context.lineTo(wx + windowW - 2, wy + windowH - 4);
        context.stroke();
      }
    }
  }

  if (archetype === "commercial") {
    context.globalAlpha = 0.92;
    context.fillStyle = "rgba(20, 27, 31, 0.78)";
    context.fillRect(8, size - 42, size - 16, 24);
    context.fillStyle = "rgba(209, 226, 228, 0.88)";
    for (let x = 14; x < size - 18; x += 36) {
      context.fillRect(x, size - 39, 24, 18);
    }
  }

  context.globalAlpha = 0.18;
  context.fillStyle = adjustHexColor(palette.dark, -18);
  for (let index = 0; index < 34; index += 1) {
    const x = hashNoise(variantSeed + index * 101) * size;
    const y = hashNoise(variantSeed + index * 131) * size;
    const streakH = 16 + hashNoise(variantSeed + index * 151) * 72;
    context.fillRect(x, y, 1 + hashNoise(index * 11) * 3, streakH);
  }

  context.restore();
}

function hashStringSeed(value: unknown) {
  const text = String(value ?? "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}

function adjustHexColor(hex: string, amount: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;

  const next = [0, 2, 4]
    .map((offset) =>
      clamp(
        Number.parseInt(normalized.slice(offset, offset + 2), 16) + amount,
        0,
        255
      )
    )
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("");

  return `#${next}`;
}

function pickBySeed<T>(items: T[], seed: number) {
  return items[Math.abs(seed) % items.length];
}

function resolveFacadePalette(
  materialPreset: RenderMaterialPreset,
  tags: Record<string, string>,
  variantSeed: number
) {
  const buildingType = String(tags.building || "").toLowerCase();
  const facadeMaterial = String(
    tags["building:material"] || tags.material || ""
  ).toLowerCase();
  const taggedColor = normalizeTagColor(
    tags["building:colour"] ||
      tags["building:color"] ||
      tags.colour ||
      tags.color
  );
  const palettes: Record<RenderMaterialPreset, string[]> = {
    concrete: ["#b7b4ac", "#a9aca5", "#c4c0b6", "#9fa6a9", "#c2b7aa"],
    brick: ["#8f4f3e", "#a46049", "#7e493d", "#b36b51", "#8a5849"],
    glass: ["#6f9dad", "#5f8999", "#88aebb", "#4f7585", "#7ba4b0"],
    sand: ["#c5ae7b", "#d0bd91", "#bfa474", "#d7c398", "#b79b6b"],
    cinematicMod: ["#555c5f", "#4d5457", "#626566", "#4b565d", "#66594f"],
    neonCoast: ["#426f7b", "#3d6470", "#4b7c86", "#3f5f69", "#547b82"],
    nextGenGlass: ["#5f91a0", "#6aa2ad", "#4e7f8f", "#86b6be", "#517485"],
  };
  let base =
    taggedColor ||
    pickBySeed(palettes[materialPreset], variantSeed + buildingType.length);

  if (!taggedColor) {
    if (facadeMaterial.includes("brick")) {
      base = pickBySeed(palettes.brick, variantSeed);
    } else if (facadeMaterial.includes("glass")) {
      base = pickBySeed(palettes.glass, variantSeed);
    } else if (
      facadeMaterial.includes("plaster") ||
      facadeMaterial.includes("concrete") ||
      buildingType.includes("school") ||
      buildingType.includes("hospital")
    ) {
      base = pickBySeed(palettes.concrete, variantSeed + 3);
    }
  }

  const line =
    materialPreset === "glass" || materialPreset === "nextGenGlass"
      ? adjustHexColor(base, 48)
      : adjustHexColor(base, -42);
  const accent =
    materialPreset === "brick"
      ? adjustHexColor(base, -58)
      : materialPreset === "glass" || materialPreset === "nextGenGlass"
      ? adjustHexColor(base, 74)
      : adjustHexColor(base, 28);

  return {
    base,
    mid: adjustHexColor(base, variantSeed % 2 === 0 ? 14 : -10),
    dark: adjustHexColor(base, -64),
    line,
    accent,
  };
}

function createFacadeTextures(
  materialPreset: RenderMaterialPreset,
  height: number,
  tags: Record<string, string> = {},
  variantSeed = 0
) {
  const heightBucket = Math.round(clamp(height, 4, 160) / 8) * 8;
  const palette = resolveFacadePalette(materialPreset, tags, variantSeed);
  const facadeMaterial = String(
    tags["building:material"] || tags.material || ""
  ).toLowerCase();
  const cacheKey = `${materialPreset}:${heightBucket}:${facadeMaterial}:${
    palette.base
  }:${variantSeed % 19}:${deviceBrain.tier}`;
  const cachedTextures = facadeTextureCache.get(cacheKey);
  if (cachedTextures) return cachedTextures;

  const preset = materialPresets[materialPreset];
  const size = deviceBrain.tier === "low" ? 256 : 512;
  const albedo = createBlankCanvas(size, palette.base);
  const roughness = createBlankCanvas(size, "#a5a5a5");
  const bump = createBlankCanvas(size, "#7f7f7f");
  const emissive = createBlankCanvas(size, "#000000");

  if (!albedo || !roughness || !bump || !emissive) return null;

  // Base gradient with color variation
  const gradient = albedo.context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, adjustHexColor(palette.base, 22));
  gradient.addColorStop(0.5, palette.mid);
  gradient.addColorStop(1, adjustHexColor(palette.base, -22));
  albedo.context.globalAlpha =
    materialPreset === "cinematicMod" ||
    materialPreset === "neonCoast" ||
    materialPreset === "nextGenGlass"
      ? 0.28
      : 0.16;
  albedo.context.fillStyle = gradient;
  albedo.context.fillRect(0, 0, size, size);
  albedo.context.globalAlpha = 1;

  // Surface noise for realism
  addFineSurfaceNoise(albedo.context, size, 0.085);

  // Panel lines with slight variation
  albedo.context.save();
  albedo.context.globalAlpha = 0.26;
  albedo.context.strokeStyle = palette.line;
  albedo.context.lineWidth = materialPreset === "brick" ? 1 : 2;
  const panelWidth =
    materialPreset === "brick" ? 34 : materialPreset.includes("glass") ? 46 : 58;
  const panelHeight = materialPreset === "brick" ? 18 : 44;

  for (let y = panelHeight; y < size; y += panelHeight) {
    albedo.context.beginPath();
    albedo.context.moveTo(0, y + hashNoise(y + variantSeed) * 4);
    albedo.context.lineTo(size, y + hashNoise(y * 2 + variantSeed) * 4);
    albedo.context.stroke();
  }

  for (let x = panelWidth; x < size; x += panelWidth) {
    albedo.context.beginPath();
    albedo.context.moveTo(x + hashNoise(x + variantSeed) * 3, 0);
    albedo.context.lineTo(x + hashNoise(x * 3 + variantSeed) * 3, size);
    albedo.context.stroke();
  }

  // Weathering stains
  albedo.context.globalAlpha = 0.12;
  albedo.context.fillStyle = palette.dark;
  for (let index = 0; index < 28; index += 1) {
    const x = hashNoise(variantSeed + index * 13) * size;
    const y = hashNoise(variantSeed + index * 23) * size;
    albedo.context.fillRect(x, y, 4 + hashNoise(index) * 14, 40 + hashNoise(index * 7) * 90);
  }
  albedo.context.restore();

  // Window grid
  drawWindowGrid({
    context: albedo.context,
    materialPreset,
    size,
    base: {
      line: palette.line || preset.textureLine,
      accent: palette.accent || preset.textureAccent,
    },
  });

  // Real facade details
  drawRealFacadeDetails({
    context: albedo.context,
    materialPreset,
    size,
    tags,
    height,
    variantSeed,
    palette,
  });

  // Roughness map
  roughness.context.fillStyle =
    materialPreset === "nextGenGlass" || materialPreset === "glass"
      ? "#5f5f5f"
      : materialPreset === "cinematicMod" || materialPreset === "neonCoast"
      ? "#787878"
      : "#b8b8b8";
  roughness.context.fillRect(0, 0, size, size);
  addFineSurfaceNoise(roughness.context, size, 0.08);

  // Bump/normal map
  bump.context.fillStyle = "#808080";
  bump.context.fillRect(0, 0, size, size);
  bump.context.strokeStyle =
    materialPreset === "brick" ? "#4f4f4f" : "#a8a8a8";
  bump.context.lineWidth = materialPreset === "brick" ? 2 : 1;
  for (let y = 0; y < size; y += materialPreset === "brick" ? 22 : 32) {
    bump.context.beginPath();
    bump.context.moveTo(0, y);
    bump.context.lineTo(size, y);
    bump.context.stroke();
  }
  for (let x = 0; x < size; x += 28) {
    bump.context.beginPath();
    bump.context.moveTo(x, 0);
    bump.context.lineTo(x, size);
    bump.context.stroke();
  }

  // Emissive windows for glass/cinematic presets
  if (
    materialPreset === "cinematicMod" ||
    materialPreset === "neonCoast" ||
    materialPreset === "nextGenGlass" ||
    materialPreset === "glass"
  ) {
    const glow =
      materialPreset === "cinematicMod"
        ? "rgba(255, 169, 80, 0.78)"
        : materialPreset === "neonCoast"
        ? "rgba(53, 233, 219, 0.72)"
        : "rgba(207, 249, 255, 0.66)";

    emissive.context.fillStyle = glow;
    for (let y = 16; y < size; y += 68) {
      for (let x = 12; x < size - 20; x += 42) {
        if (hashNoise(x * 19 + y * 23) > 0.52) {
          emissive.context.fillRect(x, y, 18, 10);
        }
      }
    }
  }

  const repeatY = clamp(height / 12, 1.5, 16);
  const repeatX =
    materialPreset === "brick" || materialPreset === "concrete" ? 2.5 : 1.5;
  const textureSet: FacadeTextureSet = {
    map: createTextureFromCanvas(albedo.canvas, repeatX, repeatY),
    roughnessMap: createTextureFromCanvas(
      roughness.canvas,
      repeatX,
      repeatY,
      THREE.NoColorSpace
    ),
    bumpMap: createTextureFromCanvas(
      bump.canvas,
      repeatX,
      repeatY,
      THREE.NoColorSpace
    ),
  };

  if (
    materialPreset === "cinematicMod" ||
    materialPreset === "neonCoast" ||
    materialPreset === "nextGenGlass" ||
    materialPreset === "glass"
  ) {
    textureSet.emissiveMap = createTextureFromCanvas(
      emissive.canvas,
      repeatX,
      repeatY
    );
  }

  facadeTextureCache.set(cacheKey, textureSet);
  return textureSet;
}

function normalizeTagColor(value?: string) {
  if (!value) return "";

  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;

  const namedColors: Record<string, string> = {
    black: "#2d2d2d",
    blue: "#4f7188",
    brown: "#7b5b3e",
    gray: "#777777",
    grey: "#777777",
    green: "#536c4d",
    orange: "#9f6b31",
    red: "#8b3b32",
    silver: "#a5a7a7",
    white: "#d9d7cf",
  };

  return namedColors[trimmed] || "";
}

function resolveRealisticMaterialPreset(
  materialPreset: BuildingMaterialPreset,
  tags: Record<string, string>,
  height: number
): RenderMaterialPreset {
  if (materialPreset !== "realistic") return materialPreset;

  const buildingType = String(tags.building || "").toLowerCase();
  const facadeMaterial = String(
    tags["building:material"] || tags.material || ""
  ).toLowerCase();

  if (
    facadeMaterial.includes("glass") ||
    buildingType.includes("commercial") ||
    buildingType.includes("office") ||
    buildingType.includes("retail") ||
    height > 55
  ) {
    return height > 70 ? "nextGenGlass" : "glass";
  }

  if (
    facadeMaterial.includes("brick") ||
    buildingType.includes("residential") ||
    buildingType.includes("apartments") ||
    buildingType.includes("house")
  ) {
    return "brick";
  }

  if (
    facadeMaterial.includes("sandstone") ||
    facadeMaterial.includes("stone") ||
    buildingType.includes("mosque") ||
    buildingType.includes("civic") ||
    buildingType.includes("museum")
  ) {
    return "sand";
  }

  if (
    buildingType.includes("industrial") ||
    buildingType.includes("warehouse") ||
    buildingType.includes("service")
  ) {
    return "concrete";
  }

  return height > 30 ? "cinematicMod" : "concrete";
}

function createRoofTextures({
  materialPreset,
  tags,
  height,
  variantSeed,
}: {
  materialPreset: RenderMaterialPreset;
  tags: Record<string, string>;
  height: number;
  variantSeed: number;
}) {
  const roofMaterial = String(tags["roof:material"] || "").toLowerCase();
  const roofPalette = [
    "#8f938c",
    "#a9a79f",
    "#756f66",
    "#9b604a",
    "#b8aa77",
    "#596a70",
    "#c1b9aa",
  ];
  const roofColor =
    normalizeTagColor(tags["roof:colour"] || tags["roof:color"]) ||
    (roofMaterial.includes("metal")
      ? "#7f8588"
      : roofMaterial.includes("tile")
      ? "#8b5139"
      : roofMaterial.includes("grass")
      ? "#4f6f4d"
      : roofMaterial.includes("concrete")
      ? "#8b8e8b"
      : materialPreset === "glass" || materialPreset === "nextGenGlass"
      ? "#445f68"
      : pickBySeed(roofPalette, variantSeed));
  const cacheKey = `roof:${materialPreset}:${roofMaterial}:${roofColor}:${Math.round(
    clamp(height, 4, 160) / 10
  )}:${variantSeed % 13}:${deviceBrain.tier}`;
  const cachedTextures = facadeTextureCache.get(cacheKey);
  if (cachedTextures) return cachedTextures;

  const size = deviceBrain.tier === "low" ? 256 : 512;
  const albedo = createBlankCanvas(size, roofColor);
  const roughness = createBlankCanvas(size, "#8c8c8c");
  const bump = createBlankCanvas(size, "#808080");

  if (!albedo || !roughness || !bump) return null;

  addFineSurfaceNoise(albedo.context, size, 0.12);
  addFineSurfaceNoise(roughness.context, size, 0.1);

  const panelStep = roofMaterial.includes("metal")
    ? 24
    : roofMaterial.includes("tile")
    ? 18
    : 42;
  albedo.context.save();
  albedo.context.globalAlpha = 0.34;
  albedo.context.strokeStyle =
    roofMaterial.includes("tile") || materialPreset === "brick"
      ? "#3d2620"
      : "#2f3639";
  albedo.context.lineWidth = roofMaterial.includes("metal") ? 2 : 1;
  for (let x = panelStep; x < size; x += panelStep) {
    albedo.context.beginPath();
    albedo.context.moveTo(x + hashNoise(x + variantSeed) * 2, 0);
    albedo.context.lineTo(x + hashNoise(x * 3 + variantSeed) * 2, size);
    albedo.context.stroke();
  }
  for (let y = panelStep * 1.25; y < size; y += panelStep * 1.25) {
    albedo.context.beginPath();
    albedo.context.moveTo(0, y + hashNoise(y + variantSeed) * 2);
    albedo.context.lineTo(size, y + hashNoise(y * 3 + variantSeed) * 2);
    albedo.context.stroke();
  }
  albedo.context.restore();

  bump.context.save();
  bump.context.strokeStyle = "#a0a0a0";
  bump.context.lineWidth = 2;
  for (let x = panelStep; x < size; x += panelStep) {
    bump.context.beginPath();
    bump.context.moveTo(x, 0);
    bump.context.lineTo(x, size);
    bump.context.stroke();
  }
  bump.context.restore();

  if (height > 12) {
    albedo.context.save();
    albedo.context.globalAlpha = 0.55;
    albedo.context.fillStyle = "#3a3d3f";
    albedo.context.strokeStyle = "#b7bdc0";
    for (let index = 0; index < 5; index += 1) {
      const x = 32 + hashNoise(index * 13) * (size - 88);
      const y = 32 + hashNoise(index * 29) * (size - 88);
      albedo.context.fillRect(x, y, 28, 18);
      albedo.context.strokeRect(x, y, 28, 18);
    }
    albedo.context.restore();
  }

  albedo.context.save();
  albedo.context.globalAlpha = 0.16;
  albedo.context.fillStyle = adjustHexColor(roofColor, -56);
  for (let index = 0; index < 18; index += 1) {
    const x = hashNoise(variantSeed + index * 41) * size;
    const y = hashNoise(variantSeed + index * 53) * size;
    albedo.context.fillRect(x, y, 10 + hashNoise(index) * 38, 2 + hashNoise(index * 3) * 12);
  }
  albedo.context.restore();

  const textureSet: FacadeTextureSet = {
    map: createTextureFromCanvas(albedo.canvas, 2.2, 2.2),
    roughnessMap: createTextureFromCanvas(
      roughness.canvas,
      2.2,
      2.2,
      THREE.NoColorSpace
    ),
    bumpMap: createTextureFromCanvas(
      bump.canvas,
      2.2,
      2.2,
      THREE.NoColorSpace
    ),
  };

  facadeTextureCache.set(cacheKey, textureSet);
  return textureSet;
}

const asphaltTextureCache = new Map<string, FacadeTextureSet>();

function createAsphaltTextures() {
  const cacheKey = `asphalt:${deviceBrain.tier}`;
  const cachedTextures = asphaltTextureCache.get(cacheKey);
  if (cachedTextures) return cachedTextures;

  const size = deviceBrain.tier === "low" ? 256 : 512;
  const albedo = createBlankCanvas(size, "#4a4a4a");
  const roughness = createBlankCanvas(size, "#707070");
  const bump = createBlankCanvas(size, "#808080");

  if (!albedo || !roughness || !bump) return null;

  // Layer 1: Base asphalt with grain
  addFineSurfaceNoise(albedo.context, size, 0.25);

  // Layer 2: Aggregate stones (visible gravel)
  albedo.context.save();
  for (let i = 0; i < 400; i++) {
    const x = hashNoise(i * 7.3) * size;
    const y = hashNoise(i * 11.7) * size;
    const r = 0.8 + hashNoise(i * 3.1) * 2;
    const shade = 55 + hashNoise(i * 5) * 50;
    albedo.context.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 5})`;
    albedo.context.beginPath();
    albedo.context.arc(x, y, r, 0, Math.PI * 2);
    albedo.context.fill();
  }
  albedo.context.restore();

  // Layer 3: Tar patches (dark repair marks)
  albedo.context.save();
  albedo.context.globalAlpha = 0.2;
  albedo.context.fillStyle = "#2a2a2a";
  for (let i = 0; i < 12; i++) {
    const px = hashNoise(i * 17) * size;
    const py = hashNoise(i * 23) * size;
    const pw = 15 + hashNoise(i * 5) * 30;
    const ph = 2 + hashNoise(i * 7) * 4;
    albedo.context.fillRect(px, py, pw, ph);
  }
  albedo.context.restore();

  // Layer 4: Oil stains
  albedo.context.save();
  for (let i = 0; i < 8; i++) {
    const sx = hashNoise(i * 31) * size;
    const sy = hashNoise(i * 37) * size;
    const sr = 10 + hashNoise(i * 41) * 20;
    const gradient = albedo.context.createRadialGradient(sx, sy, 0, sx, sy, sr);
    gradient.addColorStop(0, "rgba(30, 30, 30, 0.25)");
    gradient.addColorStop(1, "rgba(30, 30, 30, 0)");
    albedo.context.fillStyle = gradient;
    albedo.context.beginPath();
    albedo.context.arc(sx, sy, sr, 0, Math.PI * 2);
    albedo.context.fill();
  }
  albedo.context.restore();

  // Layer 5: Surface scratches
  albedo.context.save();
  albedo.context.globalAlpha = 0.12;
  albedo.context.strokeStyle = "#5a5a5a";
  albedo.context.lineWidth = 0.8;
  for (let i = 0; i < 80; i++) {
    const sx = hashNoise(i * 11) * size;
    const sy = hashNoise(i * 17) * size;
    const ex = sx + (hashNoise(i * 23) - 0.5) * 50;
    const ey = sy + (hashNoise(i * 29) - 0.5) * 50;
    albedo.context.beginPath();
    albedo.context.moveTo(sx, sy);
    albedo.context.lineTo(ex, ey);
    albedo.context.stroke();
  }
  albedo.context.restore();

  // Roughness map (varied surface)
  roughness.context.save();
  for (let i = 0; i < 150; i++) {
    const rx = hashNoise(i * 13) * size;
    const ry = hashNoise(i * 17) * size;
    const rr = 2 + hashNoise(i * 19) * 6;
    const rVal = 90 + hashNoise(i * 23) * 80;
    roughness.context.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
    roughness.context.beginPath();
    roughness.context.arc(rx, ry, rr, 0, Math.PI * 2);
    roughness.context.fill();
  }
  roughness.context.restore();

  // Normal/bump map (surface relief)
  bump.context.save();
  for (let i = 0; i < 120; i++) {
    const bx = hashNoise(i * 31) * size;
    const by = hashNoise(i * 37) * size;
    const br = 1.5 + hashNoise(i * 41) * 5;
    const bVal = 90 + hashNoise(i * 47) * 70;
    bump.context.fillStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
    bump.context.beginPath();
    bump.context.arc(bx, by, br, 0, Math.PI * 2);
    bump.context.fill();
  }
  bump.context.restore();

  const textureSet: FacadeTextureSet = {
    map: createTextureFromCanvas(albedo.canvas, 6, 18),
    roughnessMap: createTextureFromCanvas(roughness.canvas, 6, 18, THREE.NoColorSpace),
    bumpMap: createTextureFromCanvas(bump.canvas, 6, 18, THREE.NoColorSpace),
  };

  asphaltTextureCache.set(cacheKey, textureSet);
  return textureSet;
}

const paverTextureCache = new Map<string, FacadeTextureSet>();

function createPaverTextures() {
  const cacheKey = `pavers:${deviceBrain.tier}`;
  const cachedTextures = paverTextureCache.get(cacheKey);
  if (cachedTextures) return cachedTextures;

  const size = deviceBrain.tier === "low" ? 256 : 512;
  const albedo = createBlankCanvas(size, "#b8b8b8");
  const roughness = createBlankCanvas(size, "#909090");
  const bump = createBlankCanvas(size, "#808080");

  if (!albedo || !roughness || !bump) return null;

  // Layer 1: Base concrete color
  addFineSurfaceNoise(albedo.context, size, 0.1);

  // Layer 2: Expansion joints (grid pattern)
  const cellW = 36;
  const cellH = 24;
  albedo.context.save();
  albedo.context.strokeStyle = "#707070";
  albedo.context.lineWidth = 3;
  for (let y = 0; y < size + cellH; y += cellH) {
    albedo.context.beginPath();
    albedo.context.moveTo(0, y);
    albedo.context.lineTo(size, y);
    albedo.context.stroke();
  }
  for (let x = -cellW; x < size + cellW; x += cellW) {
    for (let y = 0; y < size + cellH; y += cellH) {
      const offset = Math.floor(y / cellH) % 2 === 0 ? 0 : cellW / 2;
      albedo.context.beginPath();
      albedo.context.moveTo(x + offset, y);
      albedo.context.lineTo(x + offset, y + cellH);
      albedo.context.stroke();
    }
  }
  albedo.context.restore();

  // Layer 3: Surface texture variation
  albedo.context.save();
  albedo.context.globalAlpha = 0.15;
  for (let i = 0; i < 80; i++) {
    const sx = hashNoise(i * 13) * size;
    const sy = hashNoise(i * 17) * size;
    const sr = 2 + hashNoise(i * 19) * 5;
    const shade = 160 + hashNoise(i * 23) * 30;
    albedo.context.fillStyle = `rgb(${shade}, ${shade + 5}, ${shade + 10})`;
    albedo.context.beginPath();
    albedo.context.arc(sx, sy, sr, 0, Math.PI * 2);
    albedo.context.fill();
  }
  albedo.context.restore();

  // Roughness map
  roughness.context.save();
  roughness.context.globalAlpha = 0.25;
  for (let i = 0; i < 60; i++) {
    const rx = hashNoise(i * 11) * size;
    const ry = hashNoise(i * 17) * size;
    const rr = 2 + hashNoise(i * 19) * 5;
    const rVal = 120 + hashNoise(i * 23) * 40;
    roughness.context.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
    roughness.context.beginPath();
    roughness.context.arc(rx, ry, rr, 0, Math.PI * 2);
    roughness.context.fill();
  }
  roughness.context.restore();

  // Bump map (joint depth)
  bump.context.save();
  bump.context.strokeStyle = "#606060";
  bump.context.lineWidth = 4;
  for (let y = 0; y < size; y += cellH) {
    bump.context.beginPath();
    bump.context.moveTo(0, y);
    bump.context.lineTo(size, y);
    bump.context.stroke();
  }
  for (let x = 0; x < size; x += cellW) {
    bump.context.beginPath();
    bump.context.moveTo(x, 0);
    bump.context.lineTo(x, size);
    bump.context.stroke();
  }
  bump.context.restore();

  const textureSet = {
    map: createTextureFromCanvas(albedo.canvas, 10, 10),
    roughnessMap: createTextureFromCanvas(roughness.canvas, 10, 10, THREE.NoColorSpace),
    bumpMap: createTextureFromCanvas(bump.canvas, 10, 10, THREE.NoColorSpace),
  };

  paverTextureCache.set(cacheKey, textureSet);
  return textureSet;
}

function getRoadWidth(tags: Record<string, string>) {
  const highway = String(tags.highway || "").toLowerCase();

  if (highway.includes("motorway") || highway.includes("trunk")) return 18;
  if (highway.includes("primary")) return 14;
  if (highway.includes("secondary")) return 12;
  if (highway.includes("tertiary")) return 10;
  if (highway.includes("residential")) return 8;
  if (highway.includes("service")) return 6;
  if (highway.includes("footway") || highway.includes("path")) return 3.5;
  return 8;
}

function getRoadLineColor(tags: Record<string, string>) {
  const highway = String(tags.highway || "").toLowerCase();
  if (
    highway.includes("footway") ||
    highway.includes("path") ||
    highway.includes("pedestrian")
  ) {
    return "#ffffff";
  }
  if (
    highway.includes("motorway") ||
    highway.includes("trunk")
  ) {
    return "#ffeb3b";
  }
  if (highway.includes("primary")) {
    return "#fff176";
  }
  return "#ffffff";
}

function isPavementRoad(tags: Record<string, string>) {
  const highway = String(tags.highway || "").toLowerCase();
  return (
    highway.includes("footway") ||
    highway.includes("path") ||
    highway.includes("pedestrian") ||
    highway.includes("steps") ||
    tags.footway === "sidewalk" ||
    tags.area === "yes"
  );
}

function getRoadMaterialStyle(tags: Record<string, string>) {
  const highway = String(tags.highway || "").toLowerCase();
  if (isPavementRoad(tags)) {
    return {
      base: "#c8c8c8",
      fallback: "#c0c0c0",
      border: "#888888",
      roughness: 0.72,
      metalness: 0.0,
      bumpScale: 0.12,
      texture: createPaverTextures(),
    };
  }

  if (highway.includes("track")) {
    return {
      base: "#a89888",
      fallback: "#a89888",
      border: "#786858",
      roughness: 0.94,
      metalness: 0.0,
      bumpScale: 0.1,
      texture: null,
    };
  }

  const isPrimary = highway.includes("motorway") || highway.includes("trunk") || highway.includes("primary");
  return {
    base: isPrimary ? "#e0e0e0" : "#d0d0d0",
    fallback: isPrimary ? "#d8d8d8" : "#c5c5c5",
    border: isPrimary ? "#a0a0a0" : "#888888",
    roughness: isPrimary ? 0.82 : 0.9,
    metalness: 0.0,
    bumpScale: 0.08,
    texture: createAsphaltTextures(),
  };
}

function isBuildingTags(tags: Record<string, string>) {
  return Boolean(tags.building || tags["building:part"]);
}

function getLinearFeatureKind(tags: Record<string, string>) {
  if (tags.highway) return "road";
  if (tags.waterway) return "waterway";
  if (tags.railway) return "railway";
  return "";
}

function getLinearFeatureWidth(tags: Record<string, string>) {
  if (tags.highway) return getRoadWidth(tags);

  const waterway = String(tags.waterway || "").toLowerCase();
  if (waterway.includes("river")) return 7;
  if (waterway.includes("canal")) return 5;
  if (waterway.includes("stream") || waterway.includes("ditch")) return 2;

  const railway = String(tags.railway || "").toLowerCase();
  if (railway.includes("rail") || railway.includes("light_rail")) return 2.4;
  return 2;
}

function getSurfaceFeatureKind(tags: Record<string, string>) {
  const natural = String(tags.natural || "").toLowerCase();
  const water = String(tags.water || "").toLowerCase();
  const landuse = String(tags.landuse || "").toLowerCase();
  const leisure = String(tags.leisure || "").toLowerCase();
  const amenity = String(tags.amenity || "").toLowerCase();

  if (
    natural === "water" ||
    Boolean(water) ||
    landuse === "reservoir" ||
    landuse === "basin"
  ) {
    return "water";
  }

  if (
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "nature_reserve" ||
    leisure === "golf_course" ||
    landuse === "grass" ||
    landuse === "meadow" ||
    landuse === "recreation_ground" ||
    landuse === "village_green" ||
    natural === "grassland"
  ) {
    return "green";
  }

  if (
    landuse === "forest" ||
    natural === "wood" ||
    natural === "scrub" ||
    natural === "wetland"
  ) {
    return "wood";
  }

  if (amenity === "parking") return "parking";
  if (leisure === "playground" || leisure === "pitch") return "recreation";
  if (landuse === "farmland") return "farmland";
  if (natural === "beach") return "sand";
  return "";
}

function getPointFeatureKind(tags: Record<string, string>) {
  if (tags.natural === "tree") return "tree";
  if (tags.highway === "street_lamp") return "lamp";
  if (tags.highway === "traffic_signals") return "trafficLight";
  if (tags.traffic_sign || tags.highway === "stop" || tags.highway === "give_way") {
    return "sign";
  }
  if (tags.highway === "bus_stop" || tags.amenity === "shelter") return "shelter";
  if (tags.amenity === "bench") return "bench";
  if (tags.amenity === "waste_basket" || tags.amenity === "recycling") {
    return "trash";
  }
  if (tags.barrier === "bollard" || tags.barrier === "gate") return "bollard";
  if (tags.man_made === "street_cabinet") return "cabinet";
  if (tags.man_made === "flagpole") return "pole";
  if (tags.man_made === "surveillance") return "camera";
  if (tags.information === "guidepost") return "sign";
  return "";
}

function isRenderableSurfacePolygon(points: THREE.Vector2[]) {
  if (points.length < 3) return false;
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return false;
  }

  return polygonArea(points) >= 1.5;
}

function isPointInsidePolygon(point: THREE.Vector2, polygon: THREE.Vector2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || 0.000001) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function createRoadStripGeometry(points: THREE.Vector3[], width: number) {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const prev = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[Math.min(points.length - 1, index + 1)];
    const direction = new THREE.Vector3()
      .subVectors(next, prev)
      .setY(0)
      .normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(
      width / 2
    );
    const left = new THREE.Vector3().addVectors(current, normal);
    const right = new THREE.Vector3().subVectors(current, normal);

    vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);

    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function RoadSurface({
  points,
  tags,
}: {
  points: THREE.Vector3[];
  tags: Record<string, string>;
}) {
  const width = getRoadWidth(tags);
  const roadStyle = useMemo(() => getRoadMaterialStyle(tags), [tags]);
  const borderGeometry = useMemo(
    () => createRoadStripGeometry(points, width + 0.85),
    [points, width]
  );
  const geometry = useMemo(
    () => createRoadStripGeometry(points, width),
    [points, width]
  );

  useEffect(() => {
    return () => {
      borderGeometry.dispose();
      geometry.dispose();
    };
  }, [borderGeometry, geometry]);

  if (points.length < 2) return null;

  return (
    <group>
      <mesh
        geometry={borderGeometry}
        position={[0, 0.15, 0]}
        receiveShadow
        renderOrder={1}
        userData={{ exportToGLB: true, featureType: "curb" }}
      >
        <meshStandardMaterial
          color={roadStyle.border}
          roughness={0.75}
          metalness={0.0}
          bumpScale={0.05}
        />
      </mesh>
      <mesh geometry={geometry} position={[0, 0.16, 0]} receiveShadow renderOrder={2} userData={{ exportToGLB: true, featureType: "road" }}>
        <meshStandardMaterial
          color={roadStyle.fallback}
          roughness={roadStyle.roughness}
          metalness={roadStyle.metalness}
          map={roadStyle.texture?.map}
          roughnessMap={roadStyle.texture?.roughnessMap}
          bumpMap={roadStyle.texture?.bumpMap}
          bumpScale={roadStyle.bumpScale}
          envMapIntensity={0.2}
        />
      </mesh>
      <Line
        points={points.map((point) => point.clone().setY(0.22))}
        color={getRoadLineColor(tags)}
        lineWidth={isPavementRoad(tags) ? 0.8 : 2.5}
        dashed={String(tags.highway || "").includes("service") || isPavementRoad(tags)}
        dashSize={2}
        gapSize={2}
        userData={{ exportToGLB: true, featureType: "centerline" }}
      />
    </group>
  );
}

function LinearMapFeature({
  points,
  tags,
}: {
  points: THREE.Vector3[];
  tags: Record<string, string>;
}) {
  const kind = getLinearFeatureKind(tags);
  const width = getLinearFeatureWidth(tags);
  const borderGeometry = useMemo(
    () => createRoadStripGeometry(points, width + 0.5),
    [points, width]
  );
  const geometry = useMemo(
    () => createRoadStripGeometry(points, width),
    [points, width]
  );

  useEffect(() => {
    return () => {
      borderGeometry.dispose();
      geometry.dispose();
    };
  }, [borderGeometry, geometry]);

  if (points.length < 2) return null;
  if (kind === "road") return <RoadSurface points={points} tags={tags} />;

  const lineColor = kind === "waterway" ? "#aaddff" : "#dddddd";

  return (
    <group>
      <mesh
        geometry={borderGeometry}
        position={[0, 0.15, 0]}
        receiveShadow
        renderOrder={1}
        userData={{ exportToGLB: true, featureType: "curb" }}
      >
        <meshStandardMaterial
          color={kind === "waterway" ? "#1a5577" : "#555555"}
          roughness={0.8}
          metalness={0.0}
        />
      </mesh>
      <mesh geometry={geometry} position={[0, 0.16, 0]} receiveShadow renderOrder={2} userData={{ exportToGLB: true, featureType: "road" }}>
        <meshStandardMaterial
          color={kind === "waterway" ? "#4488aa" : "#888888"}
          roughness={kind === "waterway" ? 0.3 : 0.85}
          metalness={kind === "waterway" ? 0.1 : 0.0}
          transparent={kind === "waterway"}
          opacity={kind === "waterway" ? 0.9 : 1.0}
        />
      </mesh>
      <Line
        points={points.map((point) => point.clone().setY(0.20))}
        color={lineColor}
        lineWidth={kind === "waterway" ? 2 : 1.5}
        userData={{ exportToGLB: true, featureType: "centerline" }}
      />
    </group>
  );
}

const surfaceTextureCache = new Map<string, FacadeTextureSet>();

function createSurfaceTextures(kind: string) {
  if (surfaceTextureCache.has(kind)) return surfaceTextureCache.get(kind) || null;

  const size = deviceBrain.tier === "low" ? 256 : 512;
  const palette =
    kind === "water"
      ? { base: "#3f93c5", detail: "#9bd8f2", dark: "#256f98" }
      : kind === "parking"
      ? { base: "#8b929b", detail: "#c6ccd3", dark: "#606872" }
      : kind === "sand"
      ? { base: "#d4bd83", detail: "#f2dc9b", dark: "#a68d59" }
      : kind === "farmland"
      ? { base: "#9f9856", detail: "#c2bb72", dark: "#6f6b3f" }
      : kind === "wood"
      ? { base: "#315f3a", detail: "#5f8f56", dark: "#203f29" }
      : { base: "#5c8f50", detail: "#86b86f", dark: "#3f6838" };
  const albedo = createBlankCanvas(size, palette.base);
  const roughness = createBlankCanvas(size, "#d8d8d8");
  const bump = createBlankCanvas(size, "#808080");

  if (!albedo || !roughness || !bump) return null;

  addFineSurfaceNoise(albedo.context, size, kind === "water" ? 0.05 : 0.12);
  addFineSurfaceNoise(roughness.context, size, 0.09);
  addFineSurfaceNoise(bump.context, size, kind === "water" ? 0.06 : 0.14);

  albedo.context.save();
  albedo.context.globalAlpha = kind === "water" ? 0.32 : 0.24;
  albedo.context.strokeStyle = palette.detail;
  albedo.context.lineWidth = kind === "water" ? 2 : 1;

  for (let index = 0; index < (kind === "water" ? 34 : 80); index += 1) {
    const y = hashNoise(index * 11) * size;
    const x = hashNoise(index * 17) * size;
    albedo.context.beginPath();
    if (kind === "water") {
      albedo.context.moveTo(0, y);
      albedo.context.bezierCurveTo(
        size * 0.25,
        y + hashNoise(index * 3) * 18 - 9,
        size * 0.75,
        y + hashNoise(index * 5) * 18 - 9,
        size,
        y + hashNoise(index * 7) * 18 - 9
      );
    } else {
      const radius = 4 + hashNoise(index * 19) * 18;
      albedo.context.ellipse(x, y, radius * 1.5, radius, 0, 0, Math.PI * 2);
    }
    albedo.context.stroke();
  }

  albedo.context.globalAlpha = 0.16;
  albedo.context.fillStyle = palette.dark;
  for (let index = 0; index < 50; index += 1) {
    const x = hashNoise(index * 23) * size;
    const y = hashNoise(index * 31) * size;
    const radius = 2 + hashNoise(index * 37) * 10;
    albedo.context.beginPath();
    albedo.context.ellipse(x, y, radius, radius * 0.7, 0, 0, Math.PI * 2);
    albedo.context.fill();
  }
  albedo.context.restore();

  const textureSet = {
    map: createTextureFromCanvas(albedo.canvas, 8, 8),
    roughnessMap: createTextureFromCanvas(
      roughness.canvas,
      8,
      8,
      THREE.NoColorSpace
    ),
    bumpMap: createTextureFromCanvas(
      bump.canvas,
      8,
      8,
      THREE.NoColorSpace
    ),
  };

  surfaceTextureCache.set(kind, textureSet);
  return textureSet;
}

function createGrassBladeGeometry(shape: THREE.Shape, seed: number, kind: string) {
  const polygon = shape.getPoints(80);
  const bounds = new THREE.Box2().setFromPoints(polygon);
  const size = new THREE.Vector2();
  bounds.getSize(size);
  const area = Math.max(1, size.x * size.y);
  const bladeCount =
    kind === "wood"
      ? Math.min(500, Math.max(60, Math.floor(area / 80)))
      : Math.min(400, Math.max(50, Math.floor(area / 100)));
  const vertices: number[] = [];

  for (let index = 0; index < bladeCount; index += 1) {
    const x = bounds.min.x + hashNoise(seed + index * 17) * size.x;
    const y = bounds.min.y + hashNoise(seed + index * 29) * size.y;
    const point = new THREE.Vector2(x, y);
    if (!isPointInsidePolygon(point, polygon)) continue;

    const height = 0.5 + hashNoise(seed + index * 41) * 1.0;
    const sway = (hashNoise(seed + index * 53) - 0.5) * 0.5;
    vertices.push(x, 0.1, -y, x + sway, 0.1 + height, -y + sway * 0.5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  return geometry;
}

function GrassDetail({
  shape,
  kind,
}: {
  shape: THREE.Shape;
  kind: string;
}) {
  const seed = useMemo(() => hashStringSeed(`${kind}:${shape.getPoints(8)[0]?.x || 0}`), [kind, shape]);
  const geometry = useMemo(
    () => createGrassBladeGeometry(shape, seed, kind),
    [kind, seed, shape]
  );

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  if (!["green", "wood", "farmland", "recreation"].includes(kind)) return null;

  return (
    <group userData={{ exportToGLB: true, featureType: "surface" }}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial
          color="#1a5c12"
          transparent
          opacity={0.9}
        />
      </lineSegments>
    </group>
  );
}

function MapSurfaceFeature({
  shape,
  tags,
}: {
  shape: THREE.Shape;
  tags: Record<string, string>;
}) {
  const kind = getSurfaceFeatureKind(tags);
  const outlinePoints = useMemo(
    () =>
      shape
        .getPoints(96)
        .map((point) => new THREE.Vector3(point.x, 0.09, -point.y)),
    [shape]
  );
  const surfaceTextures = useMemo(
    () => (kind ? createSurfaceTextures(kind) : null),
    [kind]
  );
  const material =
    kind === "water"
      ? { color: "#4488bb", edge: "#2266aa", roughness: 0.2, metalness: 0.0 }
      : kind === "wood"
      ? { color: "#2d6a1e", edge: "#1a4a12", roughness: 0.85, metalness: 0.0 }
      : kind === "parking"
      ? { color: "#999999", edge: "#777777", roughness: 0.75, metalness: 0.0 }
      : kind === "recreation"
      ? { color: "#44aa22", edge: "#228811", roughness: 0.8, metalness: 0.0 }
      : kind === "farmland"
      ? { color: "#88aa44", edge: "#668833", roughness: 0.85, metalness: 0.0 }
      : kind === "sand"
      ? { color: "#ddcc88", edge: "#bbaa66", roughness: 0.85, metalness: 0.0 }
      : { color: "#33aa22", edge: "#228811", roughness: 0.85, metalness: 0.0 };

  if (!kind) return null;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, kind === "water" ? 0.12 : 0.15, 0]}
        receiveShadow
        renderOrder={0}
        userData={{ exportToGLB: true, featureType: "surface" }}
      >
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color={material.color}
          roughness={material.roughness}
          metalness={material.metalness}
          map={surfaceTextures?.map}
          roughnessMap={surfaceTextures?.roughnessMap}
          bumpMap={surfaceTextures?.bumpMap}
          bumpScale={kind === "water" ? 0.025 : 0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
      {outlinePoints.length > 2 && (
        <Line
          points={[...outlinePoints, outlinePoints[0]]}
          color={material.edge}
          lineWidth={kind === "water" ? 1.5 : 1}
          transparent
          opacity={0.85}
          userData={{ exportToGLB: true, featureType: "surface" }}
        />
      )}
      <GrassDetail shape={shape} kind={kind} />
    </group>
  );
}

function StreetFurnitureFeature({
  position,
  tags,
}: {
  position: THREE.Vector3;
  tags: Record<string, string>;
}) {
  const kind = getPointFeatureKind(tags);
  const rotationY = hashNoise(position.x * 0.1 + position.z * 0.13) * Math.PI * 2;

  if (!kind) return null;

  if (kind === "tree") {
    const treeHeight = 2.0 + hashNoise(position.x * 0.3) * 1.5;
    const canopySize = 0.8 + hashNoise(position.y * 0.3) * 0.5;
    const trunkColor = hashNoise(position.x) > 0.5 ? "#5a4030" : "#6b5040";
    const leafColor = hashNoise(position.y) > 0.5 ? "#2d7a1e" : "#1a6a12";
    const leafColor2 = hashNoise(position.x + position.z) > 0.5 ? "#3d8a2e" : "#2d7a1e";

    return (
      <group position={position} rotation={[0, rotationY, 0]} userData={{ exportToGLB: true, featureType: "point" }}>
        <mesh position={[0, treeHeight * 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.15, treeHeight * 0.7, 8]} />
          <meshStandardMaterial color={trunkColor} roughness={0.88} />
        </mesh>
        <mesh position={[0, treeHeight * 0.7, 0]} castShadow>
          <sphereGeometry args={[canopySize, 10, 8]} />
          <meshStandardMaterial color={leafColor} roughness={0.82} />
        </mesh>
        <mesh position={[canopySize * 0.35, treeHeight * 0.6, canopySize * 0.25]} castShadow>
          <sphereGeometry args={[canopySize * 0.75, 8, 6]} />
          <meshStandardMaterial color={leafColor2} roughness={0.85} />
        </mesh>
        <mesh position={[-canopySize * 0.25, treeHeight * 0.65, -canopySize * 0.2]} castShadow>
          <sphereGeometry args={[canopySize * 0.65, 8, 6]} />
          <meshStandardMaterial color={leafColor} roughness={0.88} />
        </mesh>
      </group>
    );
  }

  if (kind === "lamp") {
    return (
      <group position={position} userData={{ exportToGLB: true, featureType: "point" }}>
        <mesh position={[0, 1.85, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 3.7, 8]} />
          <meshStandardMaterial color="#33383d" roughness={0.42} metalness={0.45} />
        </mesh>
        <mesh position={[0.18, 3.78, 0]} castShadow>
          <boxGeometry args={[0.42, 0.1, 0.16]} />
          <meshStandardMaterial color="#2f3438" roughness={0.38} metalness={0.35} />
        </mesh>
        <mesh position={[0.38, 3.72, 0]}>
          <sphereGeometry args={[0.08, 10, 8]} />
          <meshStandardMaterial color="#ffe9a4" emissive="#f6c85f" emissiveIntensity={0.35} />
        </mesh>
      </group>
    );
  }

  if (kind === "trafficLight") {
    return (
      <group position={position} rotation={[0, rotationY, 0]} userData={{ exportToGLB: true, featureType: "point" }}>
        <mesh position={[0, 1.25, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.04, 2.5, 8]} />
          <meshStandardMaterial color="#2e3338" roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh position={[0.16, 2.45, 0]} castShadow>
          <boxGeometry args={[0.18, 0.52, 0.13]} />
          <meshStandardMaterial color="#202326" roughness={0.5} />
        </mesh>
        {["#e33a2f", "#efc64a", "#35b75a"].map((color, index) => (
          <mesh key={color} position={[0.255, 2.6 - index * 0.16, 0]}>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === "sign" || kind === "shelter") {
    return (
      <group position={position} rotation={[0, rotationY, 0]} userData={{ exportToGLB: true, featureType: "point" }}>
        <mesh position={[0, 1.05, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.035, 2.1, 8]} />
          <meshStandardMaterial color="#6d7378" roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh position={[0, 2.05, 0.035]} castShadow>
          <boxGeometry args={[kind === "shelter" ? 0.55 : 0.42, 0.28, 0.045]} />
          <meshStandardMaterial
            color={kind === "shelter" ? "#2f7ebd" : "#e7edf2"}
            roughness={0.42}
            metalness={0.08}
          />
        </mesh>
        <mesh position={[0, 2.05, 0.062]}>
          <boxGeometry args={[kind === "shelter" ? 0.42 : 0.32, 0.08, 0.012]} />
          <meshStandardMaterial color={kind === "shelter" ? "#f7f7f7" : "#d33b32"} roughness={0.5} />
        </mesh>
      </group>
    );
  }

  if (kind === "bench") {
    return (
      <group position={position} rotation={[0, rotationY, 0]} userData={{ exportToGLB: true, featureType: "point" }}>
        <mesh position={[0, 0.34, 0]} castShadow>
          <boxGeometry args={[0.9, 0.12, 0.28]} />
          <meshStandardMaterial color="#7a5237" roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.58, -0.12]} castShadow>
          <boxGeometry args={[0.9, 0.42, 0.08]} />
          <meshStandardMaterial color="#6b442e" roughness={0.82} />
        </mesh>
        {[-0.32, 0.32].map((x) => (
          <mesh key={x} position={[x, 0.18, 0.05]} castShadow>
            <boxGeometry args={[0.06, 0.34, 0.08]} />
            <meshStandardMaterial color="#2f3335" roughness={0.55} metalness={0.2} />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === "trash") {
    return (
      <group position={position} userData={{ exportToGLB: true, featureType: "point" }}>
        <mesh position={[0, 0.32, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.14, 0.64, 12]} />
          <meshStandardMaterial color="#315f4d" roughness={0.72} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.67, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.06, 12]} />
          <meshStandardMaterial color="#202926" roughness={0.62} metalness={0.12} />
        </mesh>
      </group>
    );
  }

  if (kind === "cabinet") {
    return (
      <mesh position={[position.x, position.y + 0.45, position.z]} castShadow userData={{ exportToGLB: true, featureType: "point" }}>
        <boxGeometry args={[0.5, 0.9, 0.32]} />
        <meshStandardMaterial color="#677277" roughness={0.7} metalness={0.12} />
      </mesh>
    );
  }

  return (
    <mesh position={[position.x, position.y + 0.42, position.z]} castShadow userData={{ exportToGLB: true, featureType: "point" }}>
      <cylinderGeometry args={[0.07, 0.08, kind === "pole" ? 1.9 : 0.85, 8]} />
      <meshStandardMaterial color="#545b61" roughness={0.55} metalness={0.28} />
    </mesh>
  );
}

let terrainTextureSet: FacadeTextureSet | null = null;

function createTerrainTextures() {
  if (terrainTextureSet) return terrainTextureSet;

  const size = deviceBrain.tier === "low" ? 256 : 512;
  const albedo = createBlankCanvas(size, "#68765f");
  const roughness = createBlankCanvas(size, "#d2d2d2");
  const bump = createBlankCanvas(size, "#808080");

  if (!albedo || !roughness || !bump) return null;

  const gradient = albedo.context.createRadialGradient(
    size * 0.46,
    size * 0.42,
    size * 0.1,
    size * 0.5,
    size * 0.5,
    size * 0.72
  );
  gradient.addColorStop(0, "#7b8568");
  gradient.addColorStop(0.52, "#586955");
  gradient.addColorStop(1, "#4f5f4e");
  albedo.context.fillStyle = gradient;
  albedo.context.fillRect(0, 0, size, size);
  addFineSurfaceNoise(albedo.context, size, 0.09);
  addFineSurfaceNoise(roughness.context, size, 0.11);
  addFineSurfaceNoise(bump.context, size, 0.13);

  albedo.context.save();
  albedo.context.globalAlpha = 0.18;
  albedo.context.fillStyle = "#3f4c3d";
  for (let index = 0; index < 80; index += 1) {
    const x = hashNoise(index * 9) * size;
    const y = hashNoise(index * 17) * size;
    const radius = 3 + hashNoise(index * 23) * 12;
    albedo.context.beginPath();
    albedo.context.ellipse(x, y, radius * 1.8, radius, 0, 0, Math.PI * 2);
    albedo.context.fill();
  }
  albedo.context.restore();

  terrainTextureSet = {
    map: createTextureFromCanvas(albedo.canvas, 12, 12),
    roughnessMap: createTextureFromCanvas(
      roughness.canvas,
      12,
      12,
      THREE.NoColorSpace
    ),
    bumpMap: createTextureFromCanvas(
      bump.canvas,
      12,
      12,
      THREE.NoColorSpace
    ),
  };

  return terrainTextureSet;
}

function Building({
  id,
  shape,
  extrudeSettings,
  tags,
  materialPreset,
  textureEnabled,
}: {
  id: string | number;
  shape: THREE.Shape;
  extrudeSettings: any;
  tags: any;
  materialPreset: BuildingMaterialPreset;
  textureEnabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
  const [showTranslations, setShowTranslations] = useState(false);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const variantSeed = useMemo(
    () => hashStringSeed(`${id}:${tags?.building || ""}:${tags?.name || ""}`),
    [id, tags]
  );
  const effectiveMaterialPreset = useMemo(
    () =>
      resolveRealisticMaterialPreset(
        materialPreset,
        tags || {},
        extrudeSettings.depth
      ),
    [extrudeSettings.depth, materialPreset, tags]
  );
  const material = materialPresets[effectiveMaterialPreset];
  const facadeTextures = useMemo(
    () =>
      textureEnabled
        ? createFacadeTextures(
            effectiveMaterialPreset,
            extrudeSettings.depth,
            tags || {},
            variantSeed
          )
        : null,
    [effectiveMaterialPreset, extrudeSettings.depth, tags, textureEnabled, variantSeed]
  );
  const roofTextures = useMemo(
    () =>
      textureEnabled
        ? createRoofTextures({
            materialPreset: effectiveMaterialPreset,
            tags: tags || {},
            height: extrudeSettings.depth,
            variantSeed,
          })
        : null,
    [effectiveMaterialPreset, extrudeSettings.depth, tags, textureEnabled, variantSeed]
  );
  const edgeGeometry = useMemo(() => {
    const extrudedGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const edges = new THREE.EdgesGeometry(extrudedGeometry, 24);
    extrudedGeometry.dispose();
    return edges;
  }, [extrudeSettings, shape]);

  useEffect(() => {
    return () => edgeGeometry.dispose();
  }, [edgeGeometry]);

  return (
    <group>
      <mesh
        onPointerOver={(e) => {
          setHovered(true);
          e.stopPropagation();
        }}
        onPointerOut={(e) => {
          setHovered(false);
          e.stopPropagation();
        }}
        onPointerMove={(e) => {
          setHoverPos(e.point.clone());
          e.stopPropagation();
        }}
        onClick={(e) => {
          setClicked(!clicked);
          e.stopPropagation();
        }}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
        userData={{ exportToGLB: true, featureType: "building" }}
      >
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial
          attach="material-0"
          color={roofTextures ? "#ffffff" : material.color}
          roughness={0.68}
          metalness={
            String(tags?.["roof:material"] || "").includes("metal") ? 0.24 : 0.04
          }
          map={roofTextures?.map}
          roughnessMap={roofTextures?.roughnessMap}
          bumpMap={roofTextures?.bumpMap}
          bumpScale={0.11}
        />
        <meshStandardMaterial
          attach="material-1"
          color={facadeTextures ? "#ffffff" : material.color}
          roughness={material.roughness}
          metalness={material.metalness}
          map={facadeTextures?.map}
          roughnessMap={facadeTextures?.roughnessMap}
          bumpMap={facadeTextures?.bumpMap}
          bumpScale={effectiveMaterialPreset === "brick" ? 0.2 : 0.11}
          emissive={material.emissive || "#000000"}
          emissiveIntensity={material.emissiveIntensity || 0}
          emissiveMap={facadeTextures?.emissiveMap}
        />
      </mesh>
      {(hovered || clicked) && hoverPos && (
          <Html position={[hoverPos.x, hoverPos.y + extrudeSettings.depth + 0.5, hoverPos.z]} center>
          <div
            role="dialog"
            aria-label={tags.name || "Building Information"}
            style={{
              color: "#000000",
              backgroundColor: "#ffffff96",
              backdropFilter: "blur(8px)",
              border: "none",
              padding: "14px",
              borderRadius: "10px",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: "13px",
              width: "200px",
              boxShadow: "0 2px 14px rgba(0, 0, 0, 0.16)",
              transition: "all 0.2s ease-in-out",
            }}
          >
            <div
              style={{
                fontWeight: "600",
                fontSize: "15px",
                borderBottom: tags.name ? "1px solid rgba(0, 0, 0, 0.08)" : "none",
                paddingBottom: tags.name ? "6px" : "0",
                marginBottom: tags.name ? "8px" : "4px",
              }}
            >
              {tags.name || "Building Information"}
            </div>
            {["building", "amenity", "denomination"].map(
              (key) =>
                tags[key] &&
                (key !== "building" || tags[key] !== "yes") && (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      margin: "4px 0",
                    }}
                  >
                    <span style={{ fontWeight: "500", color: "#5f6368" }}>
                      {key === "building"
                        ? "Type"
                        : key === "amenity"
                        ? "Facility"
                        : key === "denomination"
                        ? "Denomination"
                        : key.replace(/_/g, " ")}
                      :
                    </span>
                    <span style={{ textTransform: "capitalize" }}>{tags[key]}</span>
                  </div>
                )
            )}
            {extrudeSettings.depth > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  margin: "4px 0",
                }}
              >
                <span style={{ fontWeight: "500", color: "#5f6368" }}>Height:</span>
                <span>{Math.round(extrudeSettings.depth)} m</span>
              </div>
            )}
            {extrudeSettings.depth > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  margin: "4px 0",
                }}
              >
                <span style={{ fontWeight: "500", color: "#5f6368" }}>Floors:</span>
                <span>{Math.round(extrudeSettings.depth / 2.2)}</span>
              </div>
            )}
            {[
              "addr:street",
              "addr:housenumber",
              "addr:district",
              "addr:city",
              "addr:postcode",
            ].some((key) => tags[key]) && (
              <div
                style={{
                  margin: "10px 0 8px",
                  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                  paddingTop: "8px",
                }}
              >
                <div style={{ fontWeight: "500", marginBottom: "4px", color: "#5f6368" }}>
                  Address
                </div>
                <div style={{ marginLeft: "4px", fontSize: "12px", color: "#5f6368" }}>
                  {[
                    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
                    tags["addr:district"],
                    tags["addr:city"],
                    tags["addr:postcode"],
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
            )}
            {Object.entries(tags).filter(([key]) => key.startsWith("name:")).length > 0 && (
              <div
                style={{
                  margin: "10px 0 4px",
                  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                  paddingTop: "8px",
                  textAlign: "right",
                }}
              >
                <div
                  style={{
                    fontWeight: "500",
                    marginBottom: "4px",
                    color: "#5f6368",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => setShowTranslations(!showTranslations)}
                >
                  Name Translations
                  <span>{showTranslations ? "▲" : "▼"}</span>
                </div>
                {showTranslations && (
                  <div>
                    {Object.entries(tags)
                      .filter(([key]) => key.startsWith("name:"))
                      .map(([key, value]) => (
                        <div
                          key={key}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            margin: "4px 0",
                          }}
                        >
                          <span style={{ fontWeight: "500", color: "#5f6368" }}>
                            {key.replace("name:", "").toUpperCase()}:
                          </span>
                          <span style={{ textTransform: "capitalize" }}>{String(value)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Html>
        )}
      <lineSegments
        geometry={edgeGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ exportToGLB: true }}
      >
        <lineBasicMaterial
          color={hovered || clicked ? "#0f5fbf" : "#5f666b"}
          transparent
          opacity={hovered || clicked ? 0.58 : 0.32}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

function MapContextFeatures({
  features,
  refLat,
  refLng,
}: {
  features: any[];
  refLat: number;
  refLng: number;
}) {
  const projectedFeatures = useMemo(() => {
    function project(lat: number, lng: number) {
      const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
      const y = (lat - refLat) * scale;
      return new THREE.Vector2(x, y);
    }

    const linear: Array<{
      id: string | number;
      tags: Record<string, string>;
      points: THREE.Vector3[];
    }> = [];
    const points: Array<{
      id: string | number;
      tags: Record<string, string>;
      position: THREE.Vector3;
    }> = [];
    const surfaces: Array<{
      id: string | number;
      tags: Record<string, string>;
      shape: THREE.Shape;
    }> = [];

    const contextFeatures = features.filter((feature: any) => {
      const tags = feature.tags || {};
      return !isBuildingTags(tags) && feature.geometry?.length;
    });
    const furnitureLimit =
      deviceBrain.tier === "low" ? 140 : deviceBrain.tier === "balanced" ? 360 : 720;
    const linearFeatures = contextFeatures.filter((feature: any) =>
      getLinearFeatureKind(feature.tags || {})
    );
    const pointFeatures = contextFeatures.filter((feature: any) =>
      getPointFeatureKind(feature.tags || {})
    );
    const surfaceFeatures = contextFeatures.filter(
      (feature: any) =>
        !getLinearFeatureKind(feature.tags || {}) &&
        !getPointFeatureKind(feature.tags || {}) &&
        getSurfaceFeatureKind(feature.tags || {})
    );
    const prioritizedFeatures = [
      ...limitForDevice(linearFeatures, deviceBrain.maxRoads),
      ...limitForDevice(pointFeatures, furnitureLimit),
      ...limitForDevice(surfaceFeatures, Math.max(80, Math.floor(deviceBrain.maxRoads / 2))),
    ];

    limitForDevice(prioritizedFeatures, deviceBrain.maxRoads).forEach((feature: any, index) => {
      const tags = feature.tags || {};

      if (getLinearFeatureKind(tags)) {
        const points = feature.geometry
          .map((pt: any) => {
            const point = project(Number(pt.lat), Number(pt.lng));
            return Number.isFinite(point.x) && Number.isFinite(point.y)
              ? new THREE.Vector3(point.x, 0.35, -point.y)
              : null;
          })
          .filter(Boolean) as THREE.Vector3[];

        if (points.length >= 2) {
          linear.push({ id: feature.id || `linear-${index}`, tags, points });
        }
        return;
      }

      if (getPointFeatureKind(tags)) {
        const point = feature.geometry[0];
        if (!point) return;
        const projected = project(Number(point.lat), Number(point.lng));
        if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return;

        points.push({
          id: feature.id || `point-${index}`,
          tags,
          position: new THREE.Vector3(projected.x, 0.4, -projected.y),
        });
        return;
      }

      if (!getSurfaceFeatureKind(tags)) return;

      const shapePoints = closeShapePoints(
        feature.geometry
          .map((pt: any) => project(Number(pt.lat), Number(pt.lng)))
          .filter(
            (point: THREE.Vector2) =>
              Number.isFinite(point.x) && Number.isFinite(point.y)
          )
      );
      if (shapePoints.length < 3) return;
      if (!isRenderableSurfacePolygon(shapePoints)) return;

      surfaces.push({
        id: feature.id || `surface-${index}`,
        tags,
        shape: new THREE.Shape(shapePoints),
      });
    });

    return { linear, points, surfaces };
  }, [features, refLat, refLng]);

  return (
    <>
      {projectedFeatures.surfaces.map((feature) => (
        <MapSurfaceFeature
          key={`surface-${feature.id}`}
          shape={feature.shape}
          tags={feature.tags}
        />
      ))}
      {projectedFeatures.linear.map((feature) => (
        <LinearMapFeature
          key={`linear-${feature.id}`}
          points={feature.points}
          tags={feature.tags}
        />
      ))}
      {projectedFeatures.points.map((feature) => (
        <StreetFurnitureFeature
          key={`point-${feature.id}`}
          position={feature.position}
          tags={feature.tags}
        />
      ))}
    </>
  );
}

function Heightmap({
  enabled,
  size,
  strength,
  segments,
}: {
  enabled: boolean;
  size: number;
  strength: number;
  segments: number;
}) {
  const geometry = useMemo(() => {
    const effectiveSegments = enabled ? segments : 1;
    const effectiveStrength = enabled ? strength : 0;
    const terrainGeometry = new THREE.PlaneGeometry(
      size,
      size,
      effectiveSegments,
      effectiveSegments
    );
    const positions = terrainGeometry.attributes.position;

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const ridge =
        Math.sin(x * 0.018) * Math.cos(y * 0.015) +
        Math.sin((x + y) * 0.006) * 0.65 +
        Math.cos(Math.hypot(x, y) * 0.012) * 0.35;

      positions.setZ(i, ridge * effectiveStrength);
    }

    terrainGeometry.computeVertexNormals();
    return terrainGeometry;
  }, [enabled, segments, size, strength]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  const terrainTextures = createTerrainTextures();

  return (
    <mesh
      geometry={geometry}
      position={[0, -0.1, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      userData={{ exportToGLB: true }}
    >
      <meshStandardMaterial
        color="#3d6b30"
        roughness={0.88}
        metalness={0.0}
        map={terrainTextures?.map}
        roughnessMap={terrainTextures?.roughnessMap}
        bumpMap={terrainTextures?.bumpMap}
        bumpScale={0.18}
        envMapIntensity={0.3}
      />
    </mesh>
  );
}

export function Export() {
  const { scene } = useThree();
  const action = useActionStore((state) => state.action);
  const fleetSpaceId = useActionStore((state) => state.fleetSpaceId);
  const exportType = useActionStore((state) => state.exportType);
  const exportFilter = useActionStore((state) => state.exportFilter);
  const setAction = useActionStore((state) => state.setAction);
  const setExportStatus = useActionStore((state) => state.setExportStatus);
  const setExportError = useActionStore((state) => state.setExportError);

  const uploadFleet = useCallback(async (blob) => {
    const formData = new FormData();
    formData.append("object", blob, "box3d.glb");
    formData.append("title", "New Object");
    formData.append("description", "");
    formData.append("spaceId", fleetSpaceId);
    await instanceFleet.post("space/file/mesh", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }, [fleetSpaceId]);

  const getFilterTypes = (filter: string): string[] => {
    switch (filter) {
      case "buildings": return ["building"];
      case "routes": return ["road", "curb", "centerline"];
      case "surfaces": return ["surface"];
      case "points": return ["point"];
      default: return ["building", "road", "curb", "centerline", "surface", "point"];
    }
  };

  const exportGLB = useCallback(() => {
    setExportStatus("exporting");
    setExportError(null);

    try {
      const exportRoot = new THREE.Group();
      const allowedTypes = getFilterTypes(exportFilter);
      let exportCount = 0;

      scene.traverse((child) => {
        if (child.userData?.exportToGLB === true) {
          const featureType = child.userData.featureType || "unknown";
          if (exportFilter === "all" || allowedTypes.includes(featureType)) {
            try {
              const clone = child.clone(true);
              exportRoot.add(clone);
              exportCount++;
            } catch (e) {
              console.warn("Failed to clone object for export:", e);
            }
          }
        }
      });

      if (exportCount === 0) {
        setExportStatus("error");
        setExportError("No objects found to export. Try a different filter.");
        return;
      }

      const exporter = new GLTFExporter();
      const options = { binary: true, embedImages: true };

      exporter.parse(
        exportRoot,
        (result) => {
          if (result instanceof ArrayBuffer) {
            const blob = new Blob([result], { type: "model/gltf-binary" });
            const fileName = exportFilter === "all" ? "scene.glb" : `scene-${exportFilter}.glb`;

            if (exportType === "glb") {
              const link = document.createElement("a");
              link.style.display = "none";
              document.body.appendChild(link);
              link.href = URL.createObjectURL(blob);
              link.download = fileName;
              link.click();
              document.body.removeChild(link);
              setExportStatus("success");
            }

            if (exportType === "fleet") {
              uploadFleet(blob).then(() => setExportStatus("success")).catch(() => {
                setExportStatus("error");
                setExportError("Failed to upload to Fleet server.");
              });
            }
          } else {
            setExportStatus("error");
            setExportError("Export produced unexpected result.");
          }
        },
        (error) => {
          setExportStatus("error");
          setExportError(error?.message || "Export failed. Try a different filter.");
        },
        options
      );
    } catch (e) {
      setExportStatus("error");
      setExportError(e instanceof Error ? e.message : "Export failed.");
    }
  }, [exportType, exportFilter, scene, uploadFleet, setExportStatus, setExportError]);

  useEffect(() => {
    if (action === true) {
      setAction(false);
      exportGLB();
    }
  }, [action, exportGLB, setAction]);
  return null;
}

export function Space() {
  const areas = useAreaStore((state) => state.areas);
  const center = useAreaStore((state) => state.center);
  const materialPreset = useSceneStore((state) => state.materialPreset);
  const textureEnabled = useSceneStore((state) => state.textureEnabled);
  const heightScale = useSceneStore((state) => state.heightScale);
  const defaultHeight = useSceneStore((state) => state.defaultHeight);
  const levelHeight = useSceneStore((state) => state.levelHeight);
  const heightmapEnabled = useSceneStore((state) => state.heightmapEnabled);
  const heightmapStrength = useSceneStore((state) => state.heightmapStrength);
  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;

  const buildingsData = useMemo(() => {
    function project(lat: number, lng: number) {
      const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
      const y = (lat - refLat) * scale;
      return new THREE.Vector2(x, y);
    }

    const result: Array<{
      id: string | number;
      shape: THREE.Shape;
      extrudeSettings: any;
      tags: any;
    }> = [];
    limitForDevice(areas, deviceBrain.maxBuildings).forEach((bld: any) => {
      if (!bld.geometry || bld.geometry.length < 3) return;
      const tags = bld.tags || {};
      if (!isBuildingTags(tags)) return;
      const shapePoints = closeShapePoints(
        bld.geometry
          .map((pt: any) => project(Number(pt.lat), Number(pt.lng)))
          .filter(
            (point: THREE.Vector2) =>
              Number.isFinite(point.x) && Number.isFinite(point.y)
          )
      );
      if (shapePoints.length < 3) return;
      if (!isRenderableFootprint(shapePoints)) return;

      const shape = new THREE.Shape(shapePoints);
      let heightValue = parseHeightMeters(tags.height);
      const heightLevels = parseHeightMeters(tags["building:levels"]);
      const hasExplicitHeight = !Number.isNaN(heightValue);
      if (!hasExplicitHeight) {
        heightValue = !Number.isNaN(heightLevels)
          ? heightLevels * levelHeight
          : defaultHeight;
      }
      heightValue = clamp(heightValue, 1.5, hasExplicitHeight ? 240 : 55);

      const extrudeSettings = {
        steps: 1,
        depth: Math.max(0.5, heightValue * heightScale),
        bevelEnabled: true,
        bevelSize: Math.min(0.12, Math.max(0.035, heightValue * 0.006)),
        bevelThickness: Math.min(0.12, Math.max(0.035, heightValue * 0.006)),
        bevelSegments: 1,
      };
      result.push({ id: bld.id || `building-${result.length}`, shape, extrudeSettings, tags });
    });
    return result;
  }, [areas, defaultHeight, heightScale, levelHeight, refLat, refLng]);

  const effectiveTextureEnabled = textureEnabled;
  const terrainSize = Math.min(
    1500,
    Math.max(
      90,
      Math.abs(center[0].lat - center[1].lat) * scale * 1.35,
      Math.abs(center[0].lng - center[1].lng) *
        scale *
        Math.cos((refLat * Math.PI) / 180) *
        1.35
    )
  );

  return (
    <Canvas
      shadows
      camera={{ fov: 50, near: 0.1, far: 10000, position: [80, 60, 80] }}
      dpr={[1, 2]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: 4,
        toneMappingExposure: 1.4,
        outputColorSpace: "srgb",
      }}
      performance={{ min: 0.5 }}
    >
      <color attach="background" args={["#87CEEB"]} />
      <fog attach="fog" args={["#c9dde8", 200, 800]} />

      {/* Ambient light - soft fill */}
      <ambientLight intensity={0.35} color="#e8f0f8" />

      {/* Main sun - warm golden hour light */}
      <directionalLight
        position={[80, 120, 40]}
        intensity={2.2}
        color="#fff8e7"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={0.5}
        shadow-camera-far={500}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
      />

      {/* Cool fill light from opposite direction */}
      <directionalLight
        position={[-40, 80, -30]}
        intensity={0.5}
        color="#c8e0f0"
      />

      {/* Warm rim light */}
      <directionalLight
        position={[0, 50, -60]}
        intensity={0.3}
        color="#ffd4a8"
      />

      {/* Ground bounce - green tint from grass */}
      <hemisphereLight
        args={["#b8d4e8", "#4a6a3a", 0.45]}
      />

      <Heightmap
        enabled={heightmapEnabled}
        size={terrainSize}
        strength={heightmapStrength}
        segments={deviceBrain.terrainSegments}
      />
      <MapContextFeatures features={areas} refLat={refLat} refLng={refLng} />
      {buildingsData.map((item, index) => (
        <Building
          key={item.id || index}
          id={item.id || index}
          shape={item.shape}
          extrudeSettings={item.extrudeSettings}
          tags={item.tags}
          materialPreset={materialPreset}
          textureEnabled={effectiveTextureEnabled}
        />
      ))}

      <Export />
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={5}
        maxDistance={500}
        maxPolarAngle={Math.PI / 2.1}
      />
      <Sky
        distance={450000}
        sunPosition={[80, 40, 80]}
        inclination={0.55}
        azimuth={0.25}
        rayleigh={0.6}
        turbidity={10}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      <Environment preset="city" background={false} environmentIntensity={0.6} />
    </Canvas>
  );
}
