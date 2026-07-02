/**
 * Map to GLB - 3D Building Mapping Service
 * Copyright (C) 2026 Farhan Dhrubo
 * Licensed under GNU General Public License v3.0
 * https://github.com/farhanic017/map-to-glb
 */
import React, { useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L, { LatLng, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { css } from "@emotion/react";

const mobileMq = "@media (max-width: 768px)";

import {
  ChevronDown,
  Circle,
  CircleMinus,
  Cloud,
  Clock,
  Cpu,
  Flag,
  Image,
  KeyRound,
  LocateFixed,
  Lasso,
  Map as MapIcon,
  Minus,
  Mountain,
  MousePointerClick,
  Palette,
  Plus,
  Route,
  Ruler,
  Save,
  Search,
  Square,
  Star,
  Sun,
  Trash,
  Zap,
} from "lucide-react";
import { getDeviceBrainProfile } from "@/utils/deviceBrain";
import {
  getSavedMapLocation,
  saveMapLocation,
  SavedMapLocation,
} from "@/utils/locationMemory";
import { cachedJson, fetchJsonWithTimeout } from "@/utils/requestCache";
import { useRuntimeStore, ComputeMode } from "@/state/runtimeStore";
import { getProviders, getProvider } from "@/providers/registry";
import { GPUProvider } from "@/providers/types";
import { useSceneStore, BuildingMaterialPreset } from "@/state/sceneStore";
import { bangladeshLocations } from "@/data/bangladeshLocations";
import { SearchApiButton } from "./SearchApiButton";

type MapProvider =
  | "modernStreets"
  | "osm"
  | "cartoLight"
  | "cartoDark"
  | "esriSatellite"
  | "openTopo"
  | "google"
  | "maptilerStreets"
  | "maptilerSatellite"
  | "mapboxStreets"
  | "mapboxSatellite";
type ShapeType = "rectangle" | "circle" | "lasso";
type ApiKeyProvider = "google" | "maptiler" | "mapbox";
type BoundsTuple = [{ lat: number; lng: number }, { lat: number; lng: number }];
type MapPoint = { lat: number; lng: number; label?: string };
type SearchSuggestion = MapPoint & {
  category?: string;
  source: "search" | "popular";
};
type RouteSuggestionTarget = "from" | "to";
type StoredApiKeys = Record<ApiKeyProvider, string>;
type LeafletTileProvider = {
  label: string;
  attribution: string;
  url: string;
  maxZoom?: number;
  tileSize?: number;
  zoomOffset?: number;
};
type LeafletTileProviderDefinition = Omit<LeafletTileProvider, "url"> & {
  apiKeyProvider?: ApiKeyProvider;
  url: string | ((apiKey: string) => string);
};

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined;
const deviceBrain = getDeviceBrainProfile();
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const MUSEUM_LAT = 23.7727;
const MUSEUM_LNG = 90.37596;

const globalSearchCompletions: SearchSuggestion[] = bangladeshLocations;
const API_KEY_STORAGE_KEYS: Record<ApiKeyProvider, string> = {
  google: "map3d.apiKey.google",
  maptiler: "map3d.apiKey.maptiler",
  mapbox: "map3d.apiKey.mapbox",
};
const RECENT_SEARCHES_STORAGE_KEY = "map3d.recentSearches";
const MAX_RECENT_SEARCHES = 50;
const SHOWN_RECENT_SEARCHES = 3;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type RecentSearchItem = MapPoint & { visitedAt?: number };
const LAST_MAP_PROVIDER_STORAGE_KEY = "map3d.lastMapProvider";
const FAVORITE_MAP_PROVIDERS_STORAGE_KEY = "map3d.favoriteMapProviders";
const LAST_SHAPE_TYPE_STORAGE_KEY = "map3d.lastShapeType";

function getInitialShapeType(): ShapeType {
  if (typeof window === "undefined") return "rectangle";
  try {
    const saved = localStorage.getItem(LAST_SHAPE_TYPE_STORAGE_KEY);
    if (saved === "rectangle" || saved === "circle" || saved === "lasso") {
      return saved;
    }
  } catch {}
  return "rectangle";
}

function saveShapeType(shapeType: ShapeType) {
  try {
    localStorage.setItem(LAST_SHAPE_TYPE_STORAGE_KEY, shapeType);
  } catch {}
}

const mapProviderOptions: { value: MapProvider; label: string; group: string }[] =
  [
    { value: "osm", label: "OpenStreetMap", group: "Free maps" },
    { value: "modernStreets", label: "CARTO Voyager", group: "Free maps" },
    { value: "cartoLight", label: "CARTO Light", group: "Free maps" },
    { value: "cartoDark", label: "CARTO Dark", group: "Free maps" },
    { value: "esriSatellite", label: "Esri Satellite", group: "Free maps" },
    { value: "openTopo", label: "OpenTopoMap", group: "Free maps" },
    { value: "google", label: "Google Maps", group: "API maps" },
    { value: "maptilerStreets", label: "MapTiler Streets", group: "API maps" },
    {
      value: "maptilerSatellite",
      label: "MapTiler Satellite",
      group: "API maps",
    },
    { value: "mapboxStreets", label: "Mapbox Streets", group: "API maps" },
    {
      value: "mapboxSatellite",
      label: "Mapbox Satellite",
      group: "API maps",
    },
  ];
const mapProviderValues = new Set<MapProvider>(
  mapProviderOptions.map((option) => option.value)
);

const leafletTileProviders: Record<
  Exclude<MapProvider, "google">,
  LeafletTileProviderDefinition
> = {
  modernStreets: {
    label: "Map3D Modern Streets",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    maxZoom: 20,
  },
  osm: {
    label: "OpenStreetMap",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
  },
  cartoLight: {
    label: "CARTO Light",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    maxZoom: 20,
  },
  cartoDark: {
    label: "CARTO Dark",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    maxZoom: 20,
  },
  esriSatellite: {
    label: "Esri Satellite",
    attribution:
      "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
  },
  openTopo: {
    label: "OpenTopoMap",
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org/">OpenTopoMap</a>',
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
  },
  maptilerStreets: {
    label: "MapTiler Streets",
    apiKeyProvider: "maptiler",
    attribution:
      '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    url: (apiKey) =>
      `https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(
        apiKey
      )}`,
    maxZoom: 22,
  },
  maptilerSatellite: {
    label: "MapTiler Satellite",
    apiKeyProvider: "maptiler",
    attribution: '&copy; <a href="https://www.maptiler.com/">MapTiler</a>',
    url: (apiKey) =>
      `https://api.maptiler.com/tiles/satellite-v4/{z}/{x}/{y}.jpg?key=${encodeURIComponent(
        apiKey
      )}`,
    maxZoom: 20,
  },
  mapboxStreets: {
    label: "Mapbox Streets",
    apiKeyProvider: "mapbox",
    attribution:
      '&copy; <a href="https://www.mapbox.com/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    url: (apiKey) =>
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(
        apiKey
      )}`,
    maxZoom: 22,
    tileSize: 512,
    zoomOffset: -1,
  },
  mapboxSatellite: {
    label: "Mapbox Satellite",
    apiKeyProvider: "mapbox",
    attribution:
      '&copy; <a href="https://www.mapbox.com/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    url: (apiKey) =>
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(
        apiKey
      )}`,
    maxZoom: 22,
    tileSize: 512,
    zoomOffset: -1,
  },
};

const IconSize = css({
  width: "14px",
  height: "14px",
});

const controlPanelStyle = css({
  position: "absolute",
  zIndex: 9999,
  right: "1rem",
  top: "0.5rem",
  display: "flex",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: "0.4rem",
  [mobileMq]: {
    right: "0.5rem",
    top: "0.3rem",
    gap: "0.3rem",
  },
});

const buttonBaseStyle = {
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  padding: "0.5rem 1rem",
  borderRadius: "10px",
  cursor: "pointer",
  transition: "all 0.2s ease",
  alignItems: "center",
  gap: "0.5rem",
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
};

const providerPickerStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
});

const providerSelectStyle = css({
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  padding: "0.5rem 0.75rem",
  borderRadius: "10px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
  cursor: "pointer",
  outline: "none",
  transition: "all 0.2s ease",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
});

function MapProviderDropdown({
  value,
  favoriteOptions,
  groupedOptions,
  onChange,
}: {
  value: MapProvider;
  favoriteOptions: typeof mapProviderOptions;
  groupedOptions: Record<string, typeof mapProviderOptions>;
  onChange: (provider: MapProvider) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentLabel = getMapProviderLabel(value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (provider: MapProvider) => {
    onChange(provider);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} css={css({ position: "relative" })}>
      <button
        css={providerDropdownButtonStyle}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span>{currentLabel}</span>
        <ChevronDown
          css={css({
            width: "12px",
            height: "12px",
            transition: "transform 0.2s ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          })}
        />
      </button>

      {isOpen && (
        <div css={providerDropdownListStyle}>
          {favoriteOptions.length > 0 && (
            <div>
              <div css={providerDropdownGroupLabelStyle}>Favorite maps</div>
              {favoriteOptions.map((option) => (
                <button
                  key={`favorite-${option.value}`}
                  css={providerDropdownItemStyle(value === option.value)}
                  onClick={() => handleSelect(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {Object.entries(groupedOptions).map(([group, options]) => (
            <div key={group}>
              <div css={providerDropdownGroupLabelStyle}>{group}</div>
              {options.map((option) => (
                <button
                  key={option.value}
                  css={providerDropdownItemStyle(value === option.value)}
                  onClick={() => handleSelect(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const providerDropdownButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem 0.75rem",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "10px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
  cursor: "pointer",
  outline: "none",
  fontSize: "13px",
  transition: "all 0.2s ease",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
});

const providerDropdownListStyle = css({
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: "0.35rem",
  minWidth: "12rem",
  maxHeight: "20rem",
  overflowY: "auto",
  backgroundColor: "rgba(255, 255, 255, 0.85)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "10px",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
  zIndex: 10000,
  animation: "dropdownFadeIn 0.15s ease",
});

const providerDropdownGroupLabelStyle = css({
  padding: "0.4rem 0.75rem",
  fontSize: "10px",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
});

const providerDropdownItemStyle = (active: boolean) =>
  css({
    display: "block",
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "none",
    borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
    backgroundColor: active ? "rgba(59, 130, 246, 0.1)" : "transparent",
    color: "#1e293b",
    fontSize: "13px",
    textAlign: "left",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    ":hover": {
      backgroundColor: active ? "rgba(59, 130, 246, 0.15)" : "rgba(0, 0, 0, 0.04)",
    },
  });

function favoriteProviderButtonStyle(active: boolean) {
  return css({
    ...buttonBaseStyle,
    width: "2.25rem",
    height: "2.25rem",
    display: "inline-flex",
    justifyContent: "center",
    padding: 0,
    color: active ? "#b45309" : "#64748b",
    backgroundColor: active ? "rgba(254, 243, 199, 0.85)" : "rgba(255, 255, 255, 0.75)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: active ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(255, 255, 255, 0.5)",
    ":hover": {
      backgroundColor: active ? "rgba(253, 230, 138, 0.9)" : "rgba(255, 255, 255, 0.9)",
    },
  });
}

const mapToolsStyle = css({
  position: "absolute",
  zIndex: 1000,
  left: "1rem",
  top: "1rem",
  width: "min(28rem, calc(100% - 2rem))",
  display: "grid",
  gap: "0.5rem",
  padding: "0.75rem",
  borderRadius: "14px",
  backgroundColor: "rgba(255, 255, 255, 0.8)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(0, 0, 0, 0.1)",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
  transition: "background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
  [mobileMq]: {
    left: "0.5rem",
    top: "0.5rem",
    width: "min(22rem, calc(100% - 1rem))",
    padding: "0.5rem",
    gap: "0.35rem",
  },
});

const apiKeyPanelStyle = css({
  position: "absolute",
  zIndex: 1000,
  left: "50%",
  top: "50%",
  width: "min(30rem, calc(100% - 2rem))",
  transform: "translate(-50%, -50%)",
  display: "grid",
  gap: "0.7rem",
  padding: "1rem",
  borderRadius: "8px",
  color: "#0f172a",
  backgroundColor: "#ffffffed",
  backdropFilter: "blur(8px)",
  boxShadow: "0 0.8rem 2.5rem rgba(15, 23, 42, 0.22)",
});

const toolRowStyle = css({
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
  gap: "0.5rem",
});

const routeRowStyle = css({
  display: "grid",
  gridTemplateColumns: "1fr 1fr auto",
  gap: "0.5rem",
});

const inputStyle = css({
  minWidth: 0,
  height: "2.25rem",
  boxSizing: "border-box",
  padding: "0 0.75rem",
  border: "1px solid rgba(255, 255, 255, 0.6)",
  borderRadius: "8px",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  outline: "none",
  fontSize: "13px",
  transition: "all 0.2s ease",
  ":focus": {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderColor: "rgba(59, 130, 246, 0.5)",
    boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.1)",
  },
});

const toolButtonStyle = css({
  ...buttonBaseStyle,
  height: "2.25rem",
  display: "inline-flex",
  justifyContent: "center",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(255, 255, 255, 0.6)",
  padding: "0 0.7rem",
  borderRadius: "8px",
  whiteSpace: "nowrap",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
  ":disabled": {
    cursor: "not-allowed",
    opacity: 0.55,
  },
});

const zoomControlsStyle = css({
  display: "flex",
  gap: "2px",
});

const zoomButtonStyle = css({
  ...buttonBaseStyle,
  width: "1.75rem",
  height: "1.75rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  cursor: "pointer",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    transform: "scale(1.1)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
  },
  ":active": {
    transform: "scale(0.95)",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.1)",
  },
});

const currentLocationButtonStyle = css({
  ...buttonBaseStyle,
  width: "2.25rem",
  height: "2.25rem",
  display: "inline-flex",
  justifyContent: "center",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  padding: 0,
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  cursor: "pointer",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    transform: "scale(1.05)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
  },
  ":active": {
    transform: "scale(0.95)",
  },
  ":disabled": {
    cursor: "not-allowed",
    opacity: 0.55,
  },
});

const statusStyle = css({
  minHeight: "1rem",
  color: "#475569",
  fontSize: "12px",
  lineHeight: 1.25,
});

const suggestionPanelStyle = css({
  display: "grid",
  gap: "0.35rem",
  maxHeight: "13rem",
  overflowY: "auto",
  padding: "0.35rem",
  border: "1px solid #d4d8df",
  borderRadius: "6px",
  backgroundColor: "#ffffff",
});

const suggestionButtonStyle = css({
  border: "none",
  borderRadius: "5px",
  padding: "0.45rem 0.55rem",
  color: "#0f172a",
  backgroundColor: "transparent",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "12px",
  lineHeight: 1.25,
  ":hover": {
    backgroundColor: "#eef2f7",
  },
});

const suggestionMetaStyle = css({
  display: "block",
  marginTop: "0.15rem",
  color: "#64748b",
  fontSize: "11px",
});

const popularPlacesStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
});

const popularPlaceButtonStyle = css({
  border: "1px solid #d4d8df",
  borderRadius: "999px",
  padding: "0.3rem 0.55rem",
  color: "#0f172a",
  backgroundColor: "#ffffff",
  cursor: "pointer",
  fontSize: "12px",
  ":hover": {
    backgroundColor: "#eef2f7",
  },
});

const presetPanelStyle = css({
  position: "absolute",
  zIndex: 9999,
  left: "1rem",
  bottom: "1rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.35rem",
  padding: "0.5rem",
  borderRadius: "12px",
  backgroundColor: "rgba(255, 255, 255, 0.8)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(0, 0, 0, 0.1)",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
  maxHeight: "calc(100vh - 8rem)",
  overflowY: "auto",
  transition: "background-color 0.3s ease, border-color 0.3s ease",
});

const presetPanelRowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.4rem",
});

const presetPanelLabelStyle = css({
  minWidth: "3.25rem",
  fontSize: "11px",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
});

const presetButtonStyle = css({
  border: "1px solid rgba(255, 255, 255, 0.6)",
  borderRadius: "8px",
  padding: "0.4rem 0.65rem",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  whiteSpace: "nowrap",
  transition: "all 0.2s ease",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
});

const recentButtonStyle = css({
  border: "1px solid rgba(255, 255, 255, 0.6)",
  borderRadius: "8px",
  padding: "0.4rem 0.65rem",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  whiteSpace: "nowrap",
  maxWidth: "10.75rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  transition: "all 0.2s ease",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
});

const historyButtonStyle = css({
  border: "1px solid rgba(255, 255, 255, 0.6)",
  borderRadius: "8px",
  padding: "0.4rem 0.65rem",
  color: "#64748b",
  backgroundColor: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  cursor: "pointer",
  fontSize: "11px",
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  transition: "all 0.2s ease",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
});

const recentButtonVerticalStyle = css({
  border: "1px solid rgba(255, 255, 255, 0.6)",
  borderRadius: "8px",
  padding: "0.45rem 0.75rem",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.7)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  whiteSpace: "nowrap",
  maxWidth: "14rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  transition: "all 0.2s ease",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
});

const historyButtonVerticalStyle = css({
  border: "1px solid rgba(255, 255, 255, 0.6)",
  borderRadius: "8px",
  padding: "0.45rem 0.75rem",
  color: "#64748b",
  backgroundColor: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  transition: "all 0.2s ease",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
});

const historyPageStyle = css({
  position: "fixed",
  inset: 0,
  zIndex: 10001,
  backgroundColor: "#ffffff",
  display: "flex",
  flexDirection: "column",
});

const historyPageHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  padding: "1rem 1.5rem",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
});

const historyBackButtonStyle = css({
  border: "none",
  backgroundColor: "transparent",
  color: "#3b82f6",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
  padding: "0.5rem 0",
  ":hover": {
    color: "#2563eb",
  },
});

const historyPageTitleStyle = css({
  fontSize: "18px",
  fontWeight: 600,
  color: "#1e293b",
});

const historyPageCountStyle = css({
  marginLeft: "auto",
  fontSize: "13px",
  color: "#94a3b8",
});

const historyPageToolbarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.75rem 1.5rem",
  borderBottom: "1px solid #f3f4f6",
  backgroundColor: "#fafafa",
});

const historyToolbarButtonStyle = css({
  padding: "0.4rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  backgroundColor: "#ffffff",
  color: "#374151",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
  ":hover": {
    backgroundColor: "#f3f4f6",
  },
});

const historyToolbarSpacerStyle = css({
  flex: 1,
});

const historyDeleteButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.4rem 0.75rem",
  border: "none",
  borderRadius: "6px",
  backgroundColor: "#ef4444",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
  ":hover": {
    backgroundColor: "#dc2626",
  },
});

const historyDeleteAllButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.4rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  backgroundColor: "#ffffff",
  color: "#6b7280",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
  ":hover": {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
    color: "#ef4444",
  },
});

const historyPageListStyle = css({
  flex: 1,
  overflowY: "auto",
  padding: "0.5rem 0",
});

const historyPageItemStyle = (selected: boolean) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    width: "100%",
    padding: "0.875rem 1.5rem",
    borderBottom: "1px solid #f3f4f6",
    backgroundColor: selected ? "#eff6ff" : "transparent",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    ":hover": {
      backgroundColor: selected ? "#dbeafe" : "#f8fafc",
    },
  });

const historyCheckboxStyle = (checked: boolean) =>
  css({
    width: "1.25rem",
    height: "1.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: checked ? "2px solid #3b82f6" : "2px solid #d1d5db",
    borderRadius: "4px",
    backgroundColor: checked ? "#3b82f6" : "transparent",
    color: "#ffffff",
    fontSize: "10px",
    fontWeight: 700,
    flexShrink: 0,
  });

const historyPageItemIndexStyle = css({
  width: "1.5rem",
  height: "1.5rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#f1f5f9",
  borderRadius: "6px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#64748b",
  flexShrink: 0,
});

const historyPageItemContentStyle = css({
  flex: 1,
  minWidth: 0,
});

const historyPageItemLabelStyle = css({
  fontSize: "14px",
  color: "#1e293b",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const historyPageItemDateStyle = css({
  fontSize: "12px",
  color: "#94a3b8",
  marginTop: "2px",
});

const historyDeleteItemButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2.25rem",
  height: "2.25rem",
  border: "none",
  borderRadius: "8px",
  backgroundColor: "transparent",
  color: "#9ca3af",
  cursor: "pointer",
  flexShrink: 0,
  transition: "all 0.15s ease",
  ":hover": {
    backgroundColor: "#fef2f2",
    color: "#ef4444",
  },
});

const historyPageEmptyStyle = css({
  padding: "4rem 2rem",
  textAlign: "center",
  color: "#94a3b8",
  fontSize: "15px",
});

const historyPageFooterStyle = css({
  padding: "1rem 1.5rem",
  borderTop: "1px solid #e5e7eb",
  fontSize: "12px",
  color: "#94a3b8",
  textAlign: "center",
});

const mapStyle = {
  height: "100%",
  width: "100%",
};

let googleMapsPromise: Promise<any> | null = null;

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-map3d-google-maps="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google));
      existingScript.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.map3dGoogleMaps = "true";
    script.onload = () => resolve(window.google);
    script.onerror = () => {
      googleMapsPromise = null;
      reject(new Error("Failed to load the Google Maps JavaScript API."));
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function toBoundsTuple(bounds: any): BoundsTuple {
  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();

  return [
    { lat: northEast.lat(), lng: northEast.lng() },
    { lat: southWest.lat(), lng: southWest.lng() },
  ];
}

function normalizeBoundsTuple(bounds: BoundsTuple): BoundsTuple {
  const north = Math.max(bounds[0].lat, bounds[1].lat);
  const south = Math.min(bounds[0].lat, bounds[1].lat);
  const east = Math.max(bounds[0].lng, bounds[1].lng);
  const west = Math.min(bounds[0].lng, bounds[1].lng);

  return [
    { lat: north, lng: east },
    { lat: south, lng: west },
  ];
}

async function geocodeWithNominatim(query: string): Promise<MapPoint> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) throw new Error("Enter a location first.");

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    trimmedQuery
  )}`;
  const results = await cachedJson<any[]>({
    key: `nominatim:${trimmedQuery.toLowerCase()}`,
    ttlMs: deviceBrain.cacheTtlMs,
    request: () => fetchJsonWithTimeout(url, {}, deviceBrain.requestTimeoutMs),
  });
  const result = results[0];
  if (!result) throw new Error("No location found.");

  return {
    lat: Number(result.lat),
    lng: Number(result.lon),
    label: result.display_name,
  };
}

async function searchNominatimSuggestions(
  query: string,
  bias?: MapPoint
): Promise<SearchSuggestion[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 1) return [];

  const fetchSuggestions = async (suffix: string, cachePart: string) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6${suffix}&q=${encodeURIComponent(
      trimmedQuery
    )}`;

    return cachedJson<any[]>({
      key: `nominatim-suggest:${cachePart}:${trimmedQuery.toLowerCase()}`,
      ttlMs: deviceBrain.cacheTtlMs,
      request: () => fetchJsonWithTimeout(url, {}, deviceBrain.requestTimeoutMs),
    });
  };

  let biasedResults: any[] = [];
  let globalResults: any[] = [];

  try {
    const globalResultsPromise = fetchSuggestions("", "global");
    const biasedResultsPromise = bias
      ? fetchSuggestions(
          `&viewbox=${bias.lng - 3},${bias.lat + 3},${bias.lng + 3},${
            bias.lat - 3
          }`,
          `${bias.lat.toFixed(2)}:${bias.lng.toFixed(2)}`
        )
      : Promise.resolve([]);
    const results = await Promise.all([
      biasedResultsPromise,
      globalResultsPromise,
    ]);
    biasedResults = results[0];
    globalResults = results[1];
  } catch {
    // API failed, continue with static results only
  }

  const staticResults = globalSearchCompletions.filter((completion) =>
    completion.label?.toLowerCase().includes(trimmedQuery.toLowerCase())
  );
  const seen = new Set<string>();

  return [...staticResults, ...biasedResults, ...globalResults]
    .filter((result) => {
      const lat = "lat" in result ? result.lat : result.lat;
      const lng = "lng" in result ? result.lng : result.lon;
      const label = "label" in result ? result.label : result.display_name;
      const key = `${lat}:${lng}:${label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((result: any) => ({
      lat: Number(result.lat),
      lng: Number(result.lng ?? result.lon),
      label: result.label || result.display_name,
      category: result.category || result.type || result.class,
      source: "search",
    }));
}

function getPopularPlaceScore(tags: Record<string, string> = {}) {
  if (tags.tourism === "attraction") return 10;
  if (tags.tourism === "museum") return 9;
  if (tags.leisure === "park") return 8;
  if (tags.amenity === "restaurant") return 7;
  if (tags.amenity === "cafe") return 6;
  if (tags.shop === "mall") return 5;
  return 1;
}

async function fetchPopularPlaces(center: MapPoint): Promise<SearchSuggestion[]> {
  const lat = Number(center.lat.toFixed(4));
  const lng = Number(center.lng.toFixed(4));
  const query = `[out:json][timeout:8];(node(around:3500,${lat},${lng})["name"]["tourism"];node(around:3500,${lat},${lng})["name"]["amenity"];node(around:3500,${lat},${lng})["name"]["leisure"];node(around:3500,${lat},${lng})["name"]["shop"="mall"];way(around:3500,${lat},${lng})["name"]["tourism"];way(around:3500,${lat},${lng})["name"]["amenity"];way(around:3500,${lat},${lng})["name"]["leisure"];way(around:3500,${lat},${lng})["name"]["shop"="mall"];relation(around:3500,${lat},${lng})["name"]["tourism"];relation(around:3500,${lat},${lng})["name"]["amenity"];relation(around:3500,${lat},${lng})["name"]["leisure"];relation(around:3500,${lat},${lng})["name"]["shop"="mall"];);out center 24;`;

  const data = await cachedJson<any>({
    key: `popular-places:${lat}:${lng}`,
    ttlMs: deviceBrain.cacheTtlMs,
    storageKey: "map3d.placesCache",
    maxEntries: 24,
    request: async () => {
      let lastError: unknown = null;

      for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
          return await fetchJsonWithTimeout(
            endpoint,
            {
              method: "POST",
              body: `data=${encodeURIComponent(query)}`,
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            },
            deviceBrain.requestTimeoutMs
          );
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("Popular places failed.");
    },
  });

  return (data.elements || [])
    .map((element: any) => {
      const placeLat = element.lat ?? element.center?.lat;
      const placeLng = element.lon ?? element.center?.lon;
      if (typeof placeLat !== "number" || typeof placeLng !== "number") return null;

      return {
        lat: placeLat,
        lng: placeLng,
        label: element.tags?.name,
        category:
          element.tags?.tourism ||
          element.tags?.amenity ||
          element.tags?.leisure ||
          element.tags?.shop,
        source: "popular" as const,
        score: getPopularPlaceScore(element.tags),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 8)
    .map(({ score: _score, ...place }: any) => place);
}

async function fetchOsrmRoute(from: MapPoint, to: MapPoint) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const data = await cachedJson<any>({
    key: `osrm:${from.lat},${from.lng}:${to.lat},${to.lng}`,
    ttlMs: deviceBrain.cacheTtlMs,
    request: () => fetchJsonWithTimeout(url, {}, deviceBrain.requestTimeoutMs),
  });
  const coordinates = data.routes?.[0]?.geometry?.coordinates;
  if (!coordinates?.length) throw new Error("No route found.");

  return coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
}

function getBrowserLocation(): Promise<MapPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported. Use search instead."));
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error("Location request timed out. Use search instead."));
    }, 10000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Current location",
        });
      },
      (error) => {
        clearTimeout(timeoutId);
        let message = "Could not access current location.";
        if (error.code === 1) {
          message = "Location permission denied. Please allow location access.";
        } else if (error.code === 2) {
          message = "Location unavailable. Try searching instead.";
        } else if (error.code === 3) {
          message = "Location request timed out. Try searching instead.";
        }
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function getRecentSearches(): RecentSearchItem[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    const filtered = parsed
      .filter(
        (item): item is RecentSearchItem =>
          typeof item?.lat === "number" &&
          typeof item?.lng === "number" &&
          Number.isFinite(item.lat) &&
          Number.isFinite(item.lng)
      )
      .filter((item) => {
        if (!item.visitedAt) return true;
        return now - item.visitedAt < THIRTY_DAYS_MS;
      });

    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(filtered));

    return filtered.slice(0, MAX_RECENT_SEARCHES);
  } catch {
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    return [];
  }
}

function getRecentSearchKey(point: MapPoint) {
  return `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}:${point.label || ""}`;
}

function rememberRecentSearch(point: MapPoint): RecentSearchItem[] {
  if (typeof window === "undefined") return [];

  const cleanPoint: RecentSearchItem = {
    lat: point.lat,
    lng: point.lng,
    label:
      point.label ||
      `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
    visitedAt: Date.now(),
  };
  const recentSearches = getRecentSearches();
  const cleanKey = getRecentSearchKey(cleanPoint);
  const nextSearches = [
    cleanPoint,
    ...recentSearches.filter(
      (recentSearch) => getRecentSearchKey(recentSearch) !== cleanKey
    ),
  ].slice(0, MAX_RECENT_SEARCHES);

  try {
    localStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(nextSearches)
    );
  } catch {
    // Recent searches are a convenience feature; map selection still works without storage.
  }

  return nextSearches;
}

function sharedButtonStyle(active: boolean) {
  return css({
    ...buttonBaseStyle,
    color: "#1e293b",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.5)",
    display: "flex",
    ":hover": {
      backgroundColor: "rgba(255, 255, 255, 0.9)",
    },
  });
}

function removeButtonStyle(visible: boolean) {
  return css({
    ...buttonBaseStyle,
    display: visible ? "flex" : "none",
    color: "#ffffff",
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(239, 68, 68, 0.5)",
    ":hover": {
      backgroundColor: "rgba(220, 38, 38, 0.95)",
    },
  });
}

function getInitialApiKeys(): StoredApiKeys {
  const storedKeys = {
    google: GOOGLE_MAPS_API_KEY || "",
    maptiler: "",
    mapbox: "",
  };

  if (typeof window === "undefined") return storedKeys;

  return {
    google:
      localStorage.getItem(API_KEY_STORAGE_KEYS.google) ||
      GOOGLE_MAPS_API_KEY ||
      "",
    maptiler: localStorage.getItem(API_KEY_STORAGE_KEYS.maptiler) || "",
    mapbox: localStorage.getItem(API_KEY_STORAGE_KEYS.mapbox) || "",
  };
}

function isMapProvider(value: unknown): value is MapProvider {
  return typeof value === "string" && mapProviderValues.has(value as MapProvider);
}

function getInitialMapProvider(): MapProvider {
  if (typeof window === "undefined") return "modernStreets";

  try {
    const savedProvider = localStorage.getItem(LAST_MAP_PROVIDER_STORAGE_KEY);
    return isMapProvider(savedProvider) ? savedProvider : "modernStreets";
  } catch {
    return "modernStreets";
  }
}

function saveLastMapProvider(provider: MapProvider) {
  try {
    localStorage.setItem(LAST_MAP_PROVIDER_STORAGE_KEY, provider);
  } catch {
    // Provider memory is optional; the app still loads with the default map.
  }
}

function getFavoriteMapProviders(): MapProvider[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      localStorage.getItem(FAVORITE_MAP_PROVIDERS_STORAGE_KEY) || "[]"
    );
    if (!Array.isArray(parsed)) return [];

    return Array.from(new Set(parsed.filter(isMapProvider)));
  } catch {
    localStorage.removeItem(FAVORITE_MAP_PROVIDERS_STORAGE_KEY);
    return [];
  }
}

function saveFavoriteMapProviders(providers: MapProvider[]) {
  try {
    localStorage.setItem(
      FAVORITE_MAP_PROVIDERS_STORAGE_KEY,
      JSON.stringify(providers)
    );
  } catch {
    // Favorites are optional; provider selection still works without storage.
  }
}

function getMapProviderLabel(provider: MapProvider) {
  return (
    mapProviderOptions.find((option) => option.value === provider)?.label ||
    "Map provider"
  );
}

function getProviderApiKeyProvider(
  provider: MapProvider
): ApiKeyProvider | undefined {
  if (provider === "google") return "google";
  return leafletTileProviders[provider].apiKeyProvider;
}

function buildLeafletTileProvider(
  provider: Exclude<MapProvider, "google">,
  apiKey = ""
): LeafletTileProvider {
  const definition = leafletTileProviders[provider];
  const url =
    typeof definition.url === "function"
      ? definition.url(apiKey)
      : definition.url;

  return {
    label: definition.label,
    attribution: definition.attribution,
    url,
    maxZoom: definition.maxZoom,
    tileSize: definition.tileSize,
    zoomOffset: definition.zoomOffset,
  };
}

function RectangleSelector({
  isDrag = true,
  bounds: _bounds,
  drawBounds,
  onChange,
  onDrawChange,
}: {
  isDrag: boolean;
  bounds: LatLngBounds | null;
  drawBounds: LatLngBounds | null;
  onChange: (bounds: LatLngBounds) => void;
  onDrawChange: (bounds: LatLngBounds) => void;
}) {
  const [firstPoint, setFirstPoint] = useState<LatLng | null>(null);
  const firstPointRef = useRef<LatLng | null>(null);

  const adjustLng = (latlng: LatLng): LatLng => {
    const adjustedLng = ((((latlng.lng + 180) % 360) + 360) % 360) - 180;
    return new L.LatLng(latlng.lat, adjustedLng);
  };

  const map = useMapEvents({
    mousedown(e) {
      if (!isDrag) {
        setFirstPoint(e.latlng);
        firstPointRef.current = e.latlng;
      }
    },
    mousemove(e) {
      if (firstPointRef.current) {
        onDrawChange(new L.LatLngBounds(firstPointRef.current, e.latlng));
        onChange(
          new L.LatLngBounds(adjustLng(firstPointRef.current), adjustLng(e.latlng))
        );
      }
    },
    mouseup(e) {
      if (firstPointRef.current) {
        onDrawChange(new L.LatLngBounds(firstPointRef.current, e.latlng));
        onChange(
          new L.LatLngBounds(adjustLng(firstPointRef.current), adjustLng(e.latlng))
        );
        setFirstPoint(null);
        firstPointRef.current = null;
      }
    },
  });

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (firstPointRef.current) {
        setFirstPoint(null);
        firstPointRef.current = null;
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  useEffect(() => {
    const container = map.getContainer();
    const handleTouchStart = (e: TouchEvent) => {
      if (!isDrag && e.touches.length > 0) {
        const touch = e.touches[0];
        const latlng = map.mouseEventToLatLng(touch as any);
        setFirstPoint(latlng);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (firstPointRef.current && e.touches.length > 0) {
        const touch = e.touches[0];
        const latlng = map.mouseEventToLatLng(touch as any);

        onDrawChange(new L.LatLngBounds(firstPointRef.current, latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPointRef.current), adjustLng(latlng)));
      }
    };

    const handleTouchEnd = () => {
      if (firstPointRef.current) {
        setFirstPoint(null);
        firstPointRef.current = null;
      }
    };

    container.addEventListener("touchstart", handleTouchStart);
    container.addEventListener("touchmove", handleTouchMove);
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [map, isDrag, firstPoint, onChange, onDrawChange]);

  useEffect(() => {
    if (map) {
      if (isDrag) {
        map.dragging.enable();
      } else {
        map.dragging.disable();
      }
    }
  }, [isDrag, map]);

  return drawBounds ? (
    <Rectangle bounds={drawBounds} pathOptions={{ color: "#2563eb", weight: 2, fillOpacity: 0.12 }} />
  ) : null;
}

function CircleSelector({
  isDrag,
  center,
  radius,
  onChange,
  onDrawChange,
}: {
  isDrag: boolean;
  center: LatLng | null;
  radius: number;
  onChange: (bounds: LatLngBounds) => void;
  onDrawChange: (center: LatLng, radius: number) => void;
}) {
  const startRef = useRef<LatLng | null>(null);
  const frameRef = useRef<number>(0);

  const map = useMapEvents({
    mousedown(e) {
      if (!isDrag) {
        startRef.current = e.latlng;
      }
    },
    mousemove(e) {
      if (startRef.current) {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
          const r = startRef.current!.distanceTo(e.latlng);
          onDrawChange(startRef.current!, r);
          onChange(startRef.current!.toBounds(r * 2));
        });
      }
    },
    mouseup() {
      startRef.current = null;
    },
  });

  useEffect(() => {
    const el = map.getContainer();
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (isDrag || !e.touches.length) return;
      active = true;
      startRef.current = map.mouseEventToLatLng(e.touches[0] as any);
    };

    const onMove = (e: TouchEvent) => {
      if (!active || !startRef.current || !e.touches.length) return;
      const ll = map.mouseEventToLatLng(e.touches[0] as any);
      const r = startRef.current.distanceTo(ll);
      onDrawChange(startRef.current, r);
      onChange(startRef.current.toBounds(r * 2));
    };

    const onEnd = () => {
      active = false;
      startRef.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [map, isDrag, onChange, onDrawChange]);

  useEffect(() => {
    if (map) {
      isDrag ? map.dragging.enable() : map.dragging.disable();
    }
  }, [isDrag, map]);

  if (!center || radius <= 0) return null;

  return (
    <CircleMarker
      center={center}
      radius={radius / 8}
      pathOptions={{
        color: "#2563eb",
        fillColor: "#2563eb",
        fillOpacity: 0.15,
        weight: 2,
      }}
    />
  );
}

function LassoSelector({
  isDrag,
  points,
  onChange,
  onDrawChange,
}: {
  isDrag: boolean;
  points: LatLng[];
  onChange: (bounds: LatLngBounds) => void;
  onDrawChange: (points: LatLng[]) => void;
}) {
  const drawingRef = useRef(false);
  const pointsAccRef = useRef<LatLng[]>([]);
  const lastPosRef = useRef<LatLng | null>(null);
  const frameRef = useRef<number>(0);

  const minDist = 0.00003;

  const shouldAdd = (prev: LatLng, curr: LatLng) => {
    const dLat = Math.abs(curr.lat - prev.lat);
    const dLng = Math.abs(curr.lng - prev.lng);
    return dLat > minDist || dLng > minDist;
  };

  const map = useMapEvents({
    mousedown(e) {
      if (!isDrag) {
        drawingRef.current = true;
        pointsAccRef.current = [e.latlng];
        lastPosRef.current = e.latlng;
        onDrawChange([e.latlng]);
      }
    },
    mousemove(e) {
      if (drawingRef.current && lastPosRef.current) {
        if (shouldAdd(lastPosRef.current, e.latlng)) {
          pointsAccRef.current.push(e.latlng);
          lastPosRef.current = e.latlng;
          if (frameRef.current) cancelAnimationFrame(frameRef.current);
          frameRef.current = requestAnimationFrame(() => {
            onDrawChange([...pointsAccRef.current]);
            if (pointsAccRef.current.length >= 3) {
              onChange(L.latLngBounds(pointsAccRef.current));
            }
          });
        }
      }
    },
    mouseup() {
      if (drawingRef.current) {
        drawingRef.current = false;
        lastPosRef.current = null;
        if (pointsAccRef.current.length >= 3) {
          onChange(L.latLngBounds(pointsAccRef.current));
        }
      }
    },
  });

  useEffect(() => {
    const el = map.getContainer();
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (isDrag || !e.touches.length) return;
      active = true;
      const ll = map.mouseEventToLatLng(e.touches[0] as any);
      pointsAccRef.current = [ll];
      lastPosRef.current = ll;
      onDrawChange([ll]);
    };

    const onMove = (e: TouchEvent) => {
      if (!active || !e.touches.length) return;
      const ll = map.mouseEventToLatLng(e.touches[0] as any);
      if (lastPosRef.current && shouldAdd(lastPosRef.current, ll)) {
        pointsAccRef.current.push(ll);
        lastPosRef.current = ll;
        onDrawChange([...pointsAccRef.current]);
      }
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      lastPosRef.current = null;
      if (pointsAccRef.current.length >= 3) {
        onChange(L.latLngBounds(pointsAccRef.current));
      }
    };

    const handleGlobalMouseUp = () => {
      if (drawingRef.current) {
        drawingRef.current = false;
        lastPosRef.current = null;
        if (pointsAccRef.current.length >= 3) {
          onChange(L.latLngBounds(pointsAccRef.current));
        }
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [map, isDrag, onChange, onDrawChange]);

  useEffect(() => {
    if (map) {
      isDrag ? map.dragging.enable() : map.dragging.disable();
    }
  }, [isDrag, map]);

  if (points.length < 3) return null;

  const smoothed = smoothPath(points, 3);

  return (
    <Polyline
      positions={smoothed}
      pathOptions={{
        color: "#8b5cf6",
        fillColor: "#8b5cf6",
        fillOpacity: 0.12,
        weight: 2,
      }}
    />
  );
}

function smoothPath(points: LatLng[], iterations: number): LatLng[] {
  if (points.length < 4) return points;

  let smoothed = [...points];

  for (let iter = 0; iter < iterations; iter++) {
    const newSmoothed: LatLng[] = [smoothed[0]];

    for (let i = 1; i < smoothed.length - 1; i++) {
      const prev = smoothed[i - 1];
      const curr = smoothed[i];
      const next = smoothed[i + 1];

      const lat = curr.lat * 0.5 + (prev.lat + next.lat) * 0.25;
      const lng = curr.lng * 0.5 + (prev.lng + next.lng) * 0.25;

      newSmoothed.push(new L.LatLng(lat, lng));
    }

    newSmoothed.push(smoothed[smoothed.length - 1]);
    smoothed = newSmoothed;
  }

  return smoothed;
}

function LeafletMapSelector({
  isDrag,
  bounds,
  drawBounds,
  shapeType,
  tileProvider,
  initialLocation,
  onLocationSaved,
  onRecentSearchSaved,
  onChangeDone,
  onChangeDraw,
  circleCenter,
  circleRadius,
  lassoPoints,
  onCircleChange,
  onLassoChange,
}: {
  isDrag: boolean;
  bounds: LatLngBounds | null;
  drawBounds: LatLngBounds | null;
  shapeType: ShapeType;
  tileProvider: LeafletTileProvider;
  initialLocation: SavedMapLocation;
  onLocationSaved: (location: SavedMapLocation) => void;
  onRecentSearchSaved: (point: MapPoint) => void;
  onChangeDone: (e: LatLngBounds) => void;
  onChangeDraw: (e: LatLngBounds) => void;
  circleCenter: LatLng | null;
  circleRadius: number;
  lassoPoints: LatLng[];
  onCircleChange: (center: LatLng | null, radius: number) => void;
  onLassoChange: (points: LatLng[]) => void;
}) {
  const tileLayerOptions = {
    ...(tileProvider.maxZoom !== undefined
      ? { maxZoom: tileProvider.maxZoom }
      : {}),
    ...(tileProvider.tileSize !== undefined
      ? { tileSize: tileProvider.tileSize }
      : {}),
    ...(tileProvider.zoomOffset !== undefined
      ? { zoomOffset: tileProvider.zoomOffset }
      : {}),
  };

  return (
    <MapContainer
      key={`${tileProvider.label}:${initialLocation.lat}:${initialLocation.lng}:${initialLocation.savedAt}`}
      center={[initialLocation.lat, initialLocation.lng]}
      zoom={initialLocation.savedAt ? 14 : 13}
      style={mapStyle}
      zoomControl={false}
    >
      <OSMMapTools
        initialLocation={initialLocation}
        onLocationSaved={onLocationSaved}
        onRecentSearchSaved={onRecentSearchSaved}
      />
      <TileLayer
        attribution={tileProvider.attribution}
        url={tileProvider.url}
        {...tileLayerOptions}
      />
      {shapeType === "rectangle" && (
        <RectangleSelector
          bounds={bounds}
          drawBounds={drawBounds}
          isDrag={isDrag}
          onChange={onChangeDone}
          onDrawChange={onChangeDraw}
        />
      )}
      {shapeType === "circle" && (
        <CircleSelector
          isDrag={isDrag}
          center={circleCenter}
          radius={circleRadius}
          onChange={onChangeDone}
          onDrawChange={onCircleChange}
        />
      )}
      {shapeType === "lasso" && (
        <LassoSelector
          isDrag={isDrag}
          points={lassoPoints}
          onChange={onChangeDone}
          onDrawChange={onLassoChange}
        />
      )}
    </MapContainer>
  );
}

function OSMMapTools({
  initialLocation,
  onLocationSaved,
  onRecentSearchSaved,
}: {
  initialLocation: SavedMapLocation;
  onLocationSaved: (location: SavedMapLocation) => void;
  onRecentSearchSaved: (point: MapPoint) => void;
}) {
  const map = useMap();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [status, setStatus] = useState(
    initialLocation.savedAt ? "Loaded your last saved location." : ""
  );
  const [point, setPoint] = useState<MapPoint | null>(
    initialLocation.savedAt
      ? {
          lat: initialLocation.lat,
          lng: initialLocation.lng,
          label: initialLocation.label || "Last saved location",
        }
      : null
  );
  const [routeMarkers, setRouteMarkers] = useState<MapPoint[]>([]);
  const [routePoints, setRoutePoints] = useState<MapPoint[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [routeSuggestions, setRouteSuggestions] = useState<SearchSuggestion[]>([]);
  const [routeSuggestionTarget, setRouteSuggestionTarget] =
    useState<RouteSuggestionTarget>("from");
  const [popularPlaces, setPopularPlaces] = useState<SearchSuggestion[]>([]);
  const [popularCenter, setPopularCenter] = useState<MapPoint>({
    lat: initialLocation.lat,
    lng: initialLocation.lng,
    label: initialLocation.label,
  });
  const [isBusy, setIsBusy] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isRouteSuggesting, setIsRouteSuggesting] = useState(false);

  useEffect(() => {
    if (!panelRef.current) return;
    L.DomEvent.disableClickPropagation(panelRef.current);
    L.DomEvent.disableScrollPropagation(panelRef.current);
  }, []);

  const flyToPoint = (nextPoint: MapPoint, zoom = 15) => {
    map.flyTo([nextPoint.lat, nextPoint.lng], Math.max(map.getZoom(), zoom));
  };

  const selectPoint = (nextPoint: MapPoint, statusText?: string) => {
    setQuery(nextPoint.label || "");
    setPoint(nextPoint);
    setRoutePoints([]);
    setRouteMarkers([]);
    setSuggestions([]);
    setRouteSuggestions([]);
    setPopularCenter(nextPoint);
    flyToPoint(nextPoint);
    onRecentSearchSaved(nextPoint);
    setStatus(statusText || nextPoint.label || "Location selected.");
  };

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 1) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsSuggesting(true);
      searchNominatimSuggestions(trimmedQuery, popularCenter)
        .then((nextSuggestions) => {
          if (!cancelled) setSuggestions(nextSuggestions);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsSuggesting(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [popularCenter, query]);

  useEffect(() => {
    const activeRouteQuery =
      routeSuggestionTarget === "from" ? fromQuery.trim() : toQuery.trim();
    if (activeRouteQuery.length < 1) {
      setRouteSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsRouteSuggesting(true);
      searchNominatimSuggestions(activeRouteQuery, popularCenter)
        .then((nextSuggestions) => {
          if (!cancelled) setRouteSuggestions(nextSuggestions);
        })
        .catch(() => {
          if (!cancelled) setRouteSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsRouteSuggesting(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [fromQuery, popularCenter, routeSuggestionTarget, toQuery]);

  useEffect(() => {
    let cancelled = false;
    fetchPopularPlaces(popularCenter)
      .then((places) => {
        if (!cancelled) setPopularPlaces(places);
      })
      .catch(() => {
        if (!cancelled) setPopularPlaces([]);
      });

    return () => {
      cancelled = true;
    };
  }, [popularCenter]);

  const handleSearch = async () => {
    setIsBusy(true);
    setStatus("Searching location...");
    try {
      const trimmedQuery = query.trim().toLowerCase();
      const dbMatch = globalSearchCompletions.find(
        (loc) => loc.label.toLowerCase().includes(trimmedQuery)
      );

      if (dbMatch) {
        selectPoint(dbMatch, dbMatch.label || "Location found.");
      } else {
        const nextPoint = await geocodeWithNominatim(query);
        selectPoint(nextPoint, nextPoint.label || "Location found.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCurrentLocation = async () => {
    setIsBusy(true);
    setStatus("Finding current location...");
    try {
      const nextPoint = await getBrowserLocation();
      const savedLocation = { ...nextPoint, savedAt: Date.now() };
      saveMapLocation(nextPoint);
      onLocationSaved(savedLocation);
      selectPoint(nextPoint, "Current location selected.");
      flyToPoint(nextPoint, 16);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Location failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleRoute = async () => {
    setIsBusy(true);
    setStatus("Finding route...");
    try {
      const findLocation = async (query: string): Promise<MapPoint> => {
        const trimmedQuery = query.trim().toLowerCase();
        const dbMatch = globalSearchCompletions.find(
          (loc) => loc.label.toLowerCase().includes(trimmedQuery)
        );
        if (dbMatch) return dbMatch;
        return geocodeWithNominatim(query);
      };

      const [from, to] = await Promise.all([
        findLocation(fromQuery),
        findLocation(toQuery),
      ]);
      const nextRoute = await fetchOsrmRoute(from, to);
      setPoint(null);
      setRouteMarkers([from, to]);
      setRoutePoints(nextRoute);
      map.fitBounds(
        L.latLngBounds(nextRoute.map((routePoint) => [routePoint.lat, routePoint.lng])),
        { padding: [40, 40] }
      );
      setStatus("Route loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Route failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const selectRouteSuggestion = (suggestion: SearchSuggestion) => {
    if (routeSuggestionTarget === "from") {
      setFromQuery(suggestion.label || "");
    } else {
      setToQuery(suggestion.label || "");
    }
    setRouteSuggestions([]);
  };

  return (
    <>
      <div ref={panelRef} css={mapToolsStyle}>
        <div css={toolRowStyle}>
          <input
            css={inputStyle}
            value={query}
            placeholder="Search city, country, road, or place"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (suggestions[0]) {
                  selectPoint(suggestions[0]);
                } else {
                  handleSearch();
                }
              }
            }}
          />
          <button
            css={currentLocationButtonStyle}
            disabled={isBusy}
            onClick={handleCurrentLocation}
            title="Current location"
            type="button"
          >
            <LocateFixed css={IconSize} />
          </button>
          <button css={toolButtonStyle} disabled={isBusy} onClick={handleSearch}>
            <Search css={IconSize} />
            Search
          </button>
          <div css={zoomControlsStyle}>
            <button
              css={zoomButtonStyle}
              onClick={() => map.zoomIn()}
              title="Zoom in"
              type="button"
            >
              <Plus css={IconSize} />
            </button>
            <button
              css={zoomButtonStyle}
              onClick={() => map.zoomOut()}
              title="Zoom out"
              type="button"
            >
              <Minus css={IconSize} />
            </button>
          </div>
        </div>
        {(isSuggesting || suggestions.length > 0) && (
          <div css={suggestionPanelStyle}>
            {isSuggesting && suggestions.length === 0 && (
              <div css={statusStyle}>Finding matches...</div>
            )}
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.lat}-${suggestion.lng}-${suggestion.label}`}
                css={suggestionButtonStyle}
                type="button"
                onClick={() => selectPoint(suggestion)}
              >
                {suggestion.label}
                {suggestion.category && (
                  <span css={suggestionMetaStyle}>{suggestion.category}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <div css={routeRowStyle}>
          <input
            css={inputStyle}
            value={fromQuery}
            placeholder="From"
            onFocus={() => setRouteSuggestionTarget("from")}
            onChange={(event) => {
              setRouteSuggestionTarget("from");
              setFromQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && routeSuggestions[0]) {
                selectRouteSuggestion(routeSuggestions[0]);
              }
            }}
          />
          <input
            css={inputStyle}
            value={toQuery}
            placeholder="To"
            onFocus={() => setRouteSuggestionTarget("to")}
            onChange={(event) => {
              setRouteSuggestionTarget("to");
              setToQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (routeSuggestions[0]) {
                  selectRouteSuggestion(routeSuggestions[0]);
                } else {
                  handleRoute();
                }
              }
            }}
          />
          <button css={toolButtonStyle} disabled={isBusy} onClick={handleRoute}>
            <Route css={IconSize} />
            Route
          </button>
        </div>
        {(isRouteSuggesting || routeSuggestions.length > 0) && (
          <div css={suggestionPanelStyle}>
            {isRouteSuggesting && routeSuggestions.length === 0 && (
              <div css={statusStyle}>Finding route matches...</div>
            )}
            {routeSuggestions.map((suggestion) => (
              <button
                key={`route-${routeSuggestionTarget}-${suggestion.lat}-${suggestion.lng}-${suggestion.label}`}
                css={suggestionButtonStyle}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectRouteSuggestion(suggestion)}
              >
                {suggestion.label}
                {suggestion.category && (
                  <span css={suggestionMetaStyle}>{suggestion.category}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {popularPlaces.length > 0 && (
          <div css={popularPlacesStyle} aria-label="Popular nearby places">
            {popularPlaces.map((place) => (
              <button
                key={`${place.lat}-${place.lng}-${place.label}`}
                css={popularPlaceButtonStyle}
                type="button"
                title={place.category || "Nearby place"}
                onClick={() => selectPoint(place)}
              >
                {place.label}
              </button>
            ))}
          </div>
        )}
        <div css={statusStyle}>{status}</div>
      </div>

      {point && (
        <CircleMarker
          center={[point.lat, point.lng]}
          pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.9 }}
          radius={8}
        />
      )}
      {routeMarkers.map((marker, index) => (
        <CircleMarker
          key={`${marker.lat}-${marker.lng}-${index}`}
          center={[marker.lat, marker.lng]}
          pathOptions={{
            color: index === 0 ? "#16a34a" : "#dc2626",
            fillColor: index === 0 ? "#16a34a" : "#dc2626",
            fillOpacity: 0.9,
          }}
          radius={7}
        />
      ))}
      {routePoints.length > 0 && (
        <Polyline
          positions={routePoints.map((routePoint) => [routePoint.lat, routePoint.lng])}
          pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.85 }}
        />
      )}
    </>
  );
}

function GoogleMapSelector({
  apiKey,
  isDrag,
  resetToken,
  initialLocation,
  onDone,
  onLocationSaved,
  onRecentSearchSaved,
  onSelectionChange,
}: {
  apiKey: string;
  isDrag: boolean;
  resetToken: number;
  initialLocation: SavedMapLocation;
  onDone: (bounds: BoundsTuple) => void;
  onLocationSaved: (location: SavedMapLocation) => void;
  onRecentSearchSaved: (point: MapPoint) => void;
  onSelectionChange: (hasSelection: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const rectangleRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const firstPointRef = useRef<any>(null);
  const isDragRef = useRef(isDrag);
  const onDoneRef = useRef(onDone);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [routeSuggestions, setRouteSuggestions] = useState<SearchSuggestion[]>([]);
  const [routeSuggestionTarget, setRouteSuggestionTarget] =
    useState<RouteSuggestionTarget>("from");
  const [popularPlaces, setPopularPlaces] = useState<SearchSuggestion[]>([]);
  const [popularCenter, setPopularCenter] = useState<MapPoint>({
    lat: initialLocation.lat,
    lng: initialLocation.lng,
    label: initialLocation.label,
  });
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isRouteSuggesting, setIsRouteSuggesting] = useState(false);

  useEffect(() => {
    isDragRef.current = isDrag;
    mapRef.current?.setOptions({
      draggable: isDrag,
      gestureHandling: isDrag ? "auto" : "none",
    });
  }, [isDrag]);

  useEffect(() => {
    onDoneRef.current = onDone;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onDone, onSelectionChange]);

  useEffect(() => {
    let cancelled = false;
    let listeners: any[] = [];

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !containerRef.current) return;

        const map = new google.maps.Map(containerRef.current, {
          center: { lat: initialLocation.lat, lng: initialLocation.lng },
          zoom: initialLocation.savedAt ? 14 : 13,
          mapTypeId: "hybrid",
          streetViewControl: true,
          mapTypeControl: true,
          fullscreenControl: false,
          gestureHandling: isDragRef.current ? "auto" : "none",
          draggable: isDragRef.current,
        });

        mapRef.current = map;

        if (initialLocation.savedAt) {
          markerRef.current = new google.maps.Marker({
            map,
            position: { lat: initialLocation.lat, lng: initialLocation.lng },
            title: initialLocation.label || "Last saved location",
          });
          setStatus("Loaded your last saved location.");
        }

        listeners = [
          map.addListener("mousedown", (event: any) => {
            if (isDragRef.current || !event.latLng) return;
            firstPointRef.current = event.latLng;

            if (!rectangleRef.current) {
              rectangleRef.current = new google.maps.Rectangle({
                map,
                strokeColor: "#007bff",
                strokeOpacity: 0.95,
                strokeWeight: 2,
                fillColor: "#007bff",
                fillOpacity: 0.12,
              });
            }

            rectangleRef.current.setBounds(
              new google.maps.LatLngBounds(event.latLng, event.latLng)
            );
          }),
          map.addListener("mousemove", (event: any) => {
            if (!firstPointRef.current || !event.latLng || !rectangleRef.current)
              return;

            const googleBounds = new google.maps.LatLngBounds();
            googleBounds.extend(firstPointRef.current);
            googleBounds.extend(event.latLng);
            rectangleRef.current.setBounds(googleBounds);
            onDoneRef.current(normalizeBoundsTuple(toBoundsTuple(googleBounds)));
            onSelectionChangeRef.current(true);
          }),
          map.addListener("mouseup", (event: any) => {
            if (!firstPointRef.current || !event.latLng || !rectangleRef.current)
              return;

            const googleBounds = new google.maps.LatLngBounds();
            googleBounds.extend(firstPointRef.current);
            googleBounds.extend(event.latLng);
            rectangleRef.current.setBounds(googleBounds);
            onDoneRef.current(normalizeBoundsTuple(toBoundsTuple(googleBounds)));
            onSelectionChangeRef.current(true);
            firstPointRef.current = null;
          }),
        ];
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });

    return () => {
      cancelled = true;
      listeners.forEach((listener) => listener.remove());
      rectangleRef.current?.setMap(null);
      markerRef.current?.setMap(null);
      directionsRendererRef.current?.setMap(null);
      rectangleRef.current = null;
      markerRef.current = null;
      directionsRendererRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey, initialLocation]);

  useEffect(() => {
    rectangleRef.current?.setMap(null);
    rectangleRef.current = null;
    firstPointRef.current = null;
    onSelectionChangeRef.current(false);
  }, [resetToken]);

  const setGoogleMarker = (point: MapPoint) => {
    if (!window.google?.maps || !mapRef.current) return;

    markerRef.current?.setMap(null);
    directionsRendererRef.current?.setMap(null);
    directionsRendererRef.current = null;

    markerRef.current = new window.google.maps.Marker({
      map: mapRef.current,
      position: { lat: point.lat, lng: point.lng },
      title: point.label || "Selected location",
    });
    mapRef.current.panTo({ lat: point.lat, lng: point.lng });
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 13, 15));
  };

  const selectGooglePoint = (point: MapPoint, statusText?: string) => {
    setQuery(point.label || "");
    setSuggestions([]);
    setRouteSuggestions([]);
    setPopularCenter(point);
    setGoogleMarker(point);
    onRecentSearchSaved(point);
    setStatus(statusText || point.label || "Location selected.");
  };

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 1) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsSuggesting(true);
      searchNominatimSuggestions(trimmedQuery, popularCenter)
        .then((nextSuggestions) => {
          if (!cancelled) setSuggestions(nextSuggestions);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsSuggesting(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [popularCenter, query]);

  useEffect(() => {
    const activeRouteQuery =
      routeSuggestionTarget === "from" ? fromQuery.trim() : toQuery.trim();
    if (activeRouteQuery.length < 1) {
      setRouteSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsRouteSuggesting(true);
      searchNominatimSuggestions(activeRouteQuery, popularCenter)
        .then((nextSuggestions) => {
          if (!cancelled) setRouteSuggestions(nextSuggestions);
        })
        .catch(() => {
          if (!cancelled) setRouteSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setIsRouteSuggesting(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [fromQuery, popularCenter, routeSuggestionTarget, toQuery]);

  useEffect(() => {
    let cancelled = false;
    fetchPopularPlaces(popularCenter)
      .then((places) => {
        if (!cancelled) setPopularPlaces(places);
      })
      .catch(() => {
        if (!cancelled) setPopularPlaces([]);
      });

    return () => {
      cancelled = true;
    };
  }, [popularCenter]);

  const geocodeGoogle = (address: string): Promise<MapPoint> => {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) return Promise.reject(new Error("Enter a location first."));
    if (!window.google?.maps) {
      return Promise.reject(new Error("Google Maps is not loaded yet."));
    }

    const geocoder = new window.google.maps.Geocoder();
    return new Promise((resolve, reject) => {
      geocoder.geocode({ address: trimmedAddress }, (results: any[], resultStatus: string) => {
        if (resultStatus !== "OK" || !results?.[0]?.geometry?.location) {
          reject(new Error("No location found."));
          return;
        }

        const location = results[0].geometry.location;
        resolve({
          lat: location.lat(),
          lng: location.lng(),
          label: results[0].formatted_address,
        });
      });
    });
  };

  const handleGoogleSearch = async () => {
    setIsBusy(true);
    setStatus("Searching location...");
    try {
      const point = await geocodeGoogle(query);
      selectGooglePoint(point, point.label || "Location found.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleCurrentLocation = async () => {
    setIsBusy(true);
    setStatus("Finding current location...");
    try {
      const point = await getBrowserLocation();
      const savedLocation = { ...point, savedAt: Date.now() };
      saveMapLocation(point);
      onLocationSaved(savedLocation);
      selectGooglePoint(point, "Current location selected.");
      setStatus("Current location selected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Location failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleRoute = async () => {
    setIsBusy(true);
    setStatus("Finding route...");
    try {
      if (!window.google?.maps || !mapRef.current) {
        throw new Error("Google Maps is not loaded yet.");
      }

      markerRef.current?.setMap(null);
      markerRef.current = null;

      const directionsService = new window.google.maps.DirectionsService();
      const directionsRenderer =
        directionsRendererRef.current ||
        new window.google.maps.DirectionsRenderer({
          suppressMarkers: false,
          preserveViewport: false,
        });

      directionsRenderer.setMap(mapRef.current);
      directionsRendererRef.current = directionsRenderer;

      directionsService.route(
        {
          origin: fromQuery,
          destination: toQuery,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result: any, resultStatus: string) => {
          setIsBusy(false);
          if (resultStatus !== "OK" || !result) {
            setStatus("No route found.");
            return;
          }

          directionsRenderer.setDirections(result);
          setStatus("Route loaded.");
        }
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Route failed.");
      setIsBusy(false);
    }
  };

  const selectRouteSuggestion = (suggestion: SearchSuggestion) => {
    if (routeSuggestionTarget === "from") {
      setFromQuery(suggestion.label || "");
    } else {
      setToQuery(suggestion.label || "");
    }
    setRouteSuggestions([]);
  };

  return (
    <div
      css={css({
        ...mapStyle,
        position: "relative",
        backgroundColor: "#eef1f4",
      })}
    >
      <div css={mapToolsStyle}>
        <div css={toolRowStyle}>
          <input
            css={inputStyle}
            value={query}
            placeholder="Search city, country, road, or place"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (suggestions[0]) {
                  selectGooglePoint(suggestions[0]);
                } else {
                  handleGoogleSearch();
                }
              }
            }}
          />
          <button
            css={currentLocationButtonStyle}
            disabled={isBusy || Boolean(loadError)}
            onClick={handleGoogleCurrentLocation}
            title="Current location"
            type="button"
          >
            <LocateFixed css={IconSize} />
          </button>
          <button
            css={toolButtonStyle}
            disabled={isBusy || Boolean(loadError)}
            onClick={handleGoogleSearch}
          >
            <Search css={IconSize} />
            Search
          </button>
        </div>
        {(isSuggesting || suggestions.length > 0) && (
          <div css={suggestionPanelStyle}>
            {isSuggesting && suggestions.length === 0 && (
              <div css={statusStyle}>Finding matches...</div>
            )}
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.lat}-${suggestion.lng}-${suggestion.label}`}
                css={suggestionButtonStyle}
                type="button"
                onClick={() => selectGooglePoint(suggestion)}
              >
                {suggestion.label}
                {suggestion.category && (
                  <span css={suggestionMetaStyle}>{suggestion.category}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <div css={routeRowStyle}>
          <input
            css={inputStyle}
            value={fromQuery}
            placeholder="From"
            onFocus={() => setRouteSuggestionTarget("from")}
            onChange={(event) => {
              setRouteSuggestionTarget("from");
              setFromQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && routeSuggestions[0]) {
                selectRouteSuggestion(routeSuggestions[0]);
              }
            }}
          />
          <input
            css={inputStyle}
            value={toQuery}
            placeholder="To"
            onFocus={() => setRouteSuggestionTarget("to")}
            onChange={(event) => {
              setRouteSuggestionTarget("to");
              setToQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (routeSuggestions[0]) {
                  selectRouteSuggestion(routeSuggestions[0]);
                } else {
                  handleGoogleRoute();
                }
              }
            }}
          />
          <button
            css={toolButtonStyle}
            disabled={isBusy || Boolean(loadError)}
            onClick={handleGoogleRoute}
          >
            <Route css={IconSize} />
            Route
          </button>
        </div>
        {(isRouteSuggesting || routeSuggestions.length > 0) && (
          <div css={suggestionPanelStyle}>
            {isRouteSuggesting && routeSuggestions.length === 0 && (
              <div css={statusStyle}>Finding route matches...</div>
            )}
            {routeSuggestions.map((suggestion) => (
              <button
                key={`route-${routeSuggestionTarget}-${suggestion.lat}-${suggestion.lng}-${suggestion.label}`}
                css={suggestionButtonStyle}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectRouteSuggestion(suggestion)}
              >
                {suggestion.label}
                {suggestion.category && (
                  <span css={suggestionMetaStyle}>{suggestion.category}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {popularPlaces.length > 0 && (
          <div css={popularPlacesStyle} aria-label="Popular nearby places">
            {popularPlaces.map((place) => (
              <button
                key={`${place.lat}-${place.lng}-${place.label}`}
                css={popularPlaceButtonStyle}
                type="button"
                title={place.category || "Nearby place"}
                onClick={() => selectGooglePoint(place)}
              >
                {place.label}
              </button>
            ))}
          </div>
        )}
        <div css={statusStyle}>{status}</div>
      </div>
      {loadError && (
        <div
          css={css({
            position: "absolute",
            inset: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            color: "#5b5d63",
            backgroundColor: "#ffffffd9",
            textAlign: "center",
          })}
        >
          {loadError}
        </div>
      )}
      <div ref={containerRef} css={css(mapStyle)} />
    </div>
  );
}

function ApiKeyEntry({
  keyProvider,
  providerLabel,
  value,
  onSave,
}: {
  keyProvider: ApiKeyProvider;
  providerLabel: string;
  value: string;
  onSave: (keyProvider: ApiKeyProvider, apiKey: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleSave = () => {
    const nextKey = draft.trim();
    if (!nextKey) {
      setStatus("Enter an API key first.");
      return;
    }

    onSave(keyProvider, nextKey);
    setStatus("Saved locally.");
  };

  return (
    <div
      css={css({
        ...mapStyle,
        position: "relative",
        backgroundColor: "#eef1f4",
      })}
    >
      <div css={apiKeyPanelStyle}>
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontWeight: 700,
          })}
        >
          <KeyRound css={IconSize} />
          {providerLabel} API key
        </div>
        <div
          css={css({
            color: "#475569",
            fontSize: "13px",
            lineHeight: 1.35,
          })}
        >
          Paste the key and press Enter. It is saved in this browser only and
          used immediately for this map provider.
        </div>
        <div css={toolRowStyle}>
          <input
            css={inputStyle}
            type="password"
            value={draft}
            placeholder={`${providerLabel} API key`}
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSave();
            }}
          />
          <button css={toolButtonStyle} onClick={handleSave}>
            <Save css={IconSize} />
            Save
          </button>
        </div>
        <div css={statusStyle}>{status}</div>
      </div>
    </div>
  );
}

const MUSEUM_BOUNDS_SOUTH = 23.768;
const MUSEUM_BOUNDS_NORTH = 23.777;
const MUSEUM_BOUNDS_WEST = 90.371;
const MUSEUM_BOUNDS_EAST = 90.381;

function HistoryPage({
  recentSearches,
  onSelect,
  onBack,
  onDeleteAll,
  onDeleteSelected,
}: {
  recentSearches: RecentSearchItem[];
  onSelect: (item: MapPoint) => void;
  onBack: () => void;
  onDeleteAll: () => void;
  onDeleteSelected: (items: RecentSearchItem[]) => void;
}) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedItems(new Set());
  };

  const toggleItem = (key: string) => {
    const next = new Set(selectedItems);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedItems(next);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === recentSearches.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(recentSearches.map(getRecentSearchKey)));
    }
  };

  const handleDeleteSelected = () => {
    const itemsToDelete = recentSearches.filter((item) =>
      selectedItems.has(getRecentSearchKey(item))
    );
    onDeleteSelected(itemsToDelete);
    setSelectedItems(new Set());
    setIsSelectMode(false);
  };

  const handleDeleteAll = () => {
    onDeleteAll();
    setSelectedItems(new Set());
    setIsSelectMode(false);
  };

  return (
    <div css={historyPageStyle}>
      <div css={historyPageHeaderStyle}>
        <span css={historyPageTitleStyle}>Search History</span>
        <span css={historyPageCountStyle}>{recentSearches.length} places</span>
      </div>

      <div css={historyPageToolbarStyle}>
        <button css={historyToolbarButtonStyle} onClick={onBack}>
          ← Back
        </button>
        <div css={historyToolbarSpacerStyle} />
        <button css={historyToolbarButtonStyle} onClick={toggleSelectMode}>
          {isSelectMode ? "Cancel" : "Select"}
        </button>
        {isSelectMode && selectedItems.size > 0 ? (
          <button css={historyDeleteButtonStyle} onClick={handleDeleteSelected}>
            <Trash size={14} />
            Delete Selected ({selectedItems.size})
          </button>
        ) : (
          <button css={historyDeleteAllButtonStyle} onClick={handleDeleteAll}>
            <Trash size={14} />
            Delete All
          </button>
        )}
      </div>

      <div css={historyPageListStyle}>
        {recentSearches.length === 0 ? (
          <div css={historyPageEmptyStyle}>No history yet</div>
        ) : (
          recentSearches.map((item, index) => {
            const key = getRecentSearchKey(item);
            const isSelected = selectedItems.has(key);
            return (
              <div
                key={key}
                css={historyPageItemStyle(isSelected)}
                onClick={() => (isSelectMode ? toggleItem(key) : onSelect(item))}
              >
                {isSelectMode && (
                  <div css={historyCheckboxStyle(isSelected)}>
                    {isSelected && "✓"}
                  </div>
                )}
                <div css={historyPageItemIndexStyle}>{index + 1}</div>
                <div css={historyPageItemContentStyle}>
                  <div css={historyPageItemLabelStyle}>
                    {item.label || `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`}
                  </div>
                  {"visitedAt" in item && item.visitedAt && (
                    <div css={historyPageItemDateStyle}>
                      {new Date(item.visitedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <button
                  css={historyDeleteItemButtonStyle}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSelected([item]);
                  }}
                  title="Delete"
                >
                  <Trash size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {recentSearches.length > 0 && (
        <div css={historyPageFooterStyle}>
          History auto-clears after 30 days
        </div>
      )}
    </div>
  );
}

function DarkModeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mapglb.darkMode");
      return stored !== null ? stored === "true" : true;
    }
    return true;
  });

  const toggleDarkMode = () => {
    const newMode = !isDark;
    setIsDark(newMode);
    localStorage.setItem("mapglb.darkMode", String(newMode));
    document.documentElement.classList.toggle("dark", newMode);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return (
    <button
      css={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "2.25rem",
        height: "2.25rem",
        padding: 0,
        color: isDark ? "#fbbf24" : "#1e293b",
        backgroundColor: "rgba(255, 255, 255, 0.75)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.5)",
        borderRadius: "10px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        ":hover": {
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          transform: "scale(1.05)",
          boxShadow: isDark
            ? "0 0 20px rgba(251, 191, 36, 0.4)"
            : "0 4px 12px rgba(0, 0, 0, 0.12)",
        },
        ":active": {
          transform: "scale(0.95)",
        },
      })}
      onClick={toggleDarkMode}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      <Sun
        css={css({
          width: "16px",
          height: "16px",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: isDark ? "rotate(180deg) scale(0.8)" : "rotate(0deg) scale(1)",
          color: isDark ? "#fbbf24" : "#1e293b",
          filter: isDark ? "drop-shadow(0 0 6px rgba(251, 191, 36, 0.6))" : "none",
        })}
      />
    </button>
  );
}

export function MapComponent({
  onDone,
  onRemove,
  onHistoryOpen,
}: {
  onDone: (e: BoundsTuple) => void;
  onRemove: () => void;
  onHistoryOpen?: (open: boolean) => void;
}) {
  const [mapProvider, setMapProvider] =
    useState<MapProvider>(getInitialMapProvider);
  const [favoriteMapProviders, setFavoriteMapProviders] = useState<MapProvider[]>(
    getFavoriteMapProviders
  );
  const [apiKeys, setApiKeys] = useState<StoredApiKeys>(getInitialApiKeys);
  const [isDrag, setIsDrag] = useState(true);
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);
  const [drawBounds, setDrawBounds] = useState<LatLngBounds | null>(null);
  const [savedLocation, setSavedLocation] = useState<SavedMapLocation>(
    getSavedMapLocation
  );
  const [recentSearches, setRecentSearches] =
    useState<MapPoint[]>(getRecentSearches);
  const [hasGoogleSelection, setHasGoogleSelection] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [shapeType, setShapeType] = useState<ShapeType>(getInitialShapeType);
  const [circleCenter, setCircleCenter] = useState<LatLng | null>(null);
  const [circleRadius, setCircleRadius] = useState(0);
  const [lassoPoints, setLassoPoints] = useState<LatLng[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const apiKeyProvider = getProviderApiKeyProvider(mapProvider);

  useEffect(() => {
    onHistoryOpen?.(showHistoryModal);
  }, [showHistoryModal, onHistoryOpen]);
  const activeApiKey = apiKeyProvider ? apiKeys[apiKeyProvider] : "";
  const requiresMissingApiKey = Boolean(apiKeyProvider && !activeApiKey);
  const isCurrentProviderFavorite = favoriteMapProviders.includes(mapProvider);

  const hasSelection =
    mapProvider === "google" ? hasGoogleSelection : bounds !== null;

  const handleClickSwitchDrag = () => {
    if (isDrag) {
      setBounds(null);
      setDrawBounds(null);
      setCircleCenter(null);
      setCircleRadius(0);
      setLassoPoints([]);
      setHasGoogleSelection(false);
    }
    setIsDrag(!isDrag);
  };

  const handleClickRemoveBox = () => {
    onRemove();
    setBounds(null);
    setDrawBounds(null);
    setCircleCenter(null);
    setCircleRadius(0);
    setLassoPoints([]);
    setHasGoogleSelection(false);
    setResetToken((token) => token + 1);
    setIsDrag(true);
  };

  const handleChangeDone = (e: LatLngBounds) => {
    setBounds(e);
    onDone(normalizeBoundsTuple([e.getNorthEast(), e.getSouthWest()]));
  };

  const handleChangeDraw = (e: LatLngBounds) => {
    setDrawBounds(e);
    onDone(normalizeBoundsTuple([e.getNorthEast(), e.getSouthWest()]));
  };

  const handleShapeChange = (shape: ShapeType) => {
    setShapeType(shape);
    saveShapeType(shape);
  };

  const handleProviderChange = (provider: MapProvider) => {
    setMapProvider(provider);
    saveLastMapProvider(provider);
    onRemove();
    setBounds(null);
    setDrawBounds(null);
    setHasGoogleSelection(false);
    setResetToken((token) => token + 1);
    setIsDrag(true);
  };

  const handleFavoriteProviderToggle = () => {
    const nextFavorites = isCurrentProviderFavorite
      ? favoriteMapProviders.filter((provider) => provider !== mapProvider)
      : [mapProvider, ...favoriteMapProviders];

    setFavoriteMapProviders(nextFavorites);
    saveFavoriteMapProviders(nextFavorites);
  };

  const handleRecentSearchSaved = (point: MapPoint) => {
    setRecentSearches(rememberRecentSearch(point));
  };

  const handleRecentSearchClick = (point: MapPoint) => {
    const savedPoint = { ...point, savedAt: Date.now() };
    saveMapLocation(point);
    setSavedLocation(savedPoint);
    setRecentSearches(rememberRecentSearch(point));
    onRemove();
    setBounds(null);
    setDrawBounds(null);
    setHasGoogleSelection(false);
    setResetToken((token) => token + 1);
    setIsDrag(true);
  };

  const handlePresetMuseum = () => {
    const museumPoint = {
      lat: MUSEUM_LAT,
      lng: MUSEUM_LNG,
      label: "Liberation War Museum, Dhaka, Bangladesh",
    };
    const sw = L.latLng(MUSEUM_BOUNDS_SOUTH, MUSEUM_BOUNDS_WEST);
    const ne = L.latLng(MUSEUM_BOUNDS_NORTH, MUSEUM_BOUNDS_EAST);
    const areaBounds = L.latLngBounds(sw, ne);
    saveMapLocation(museumPoint);
    setSavedLocation({ ...museumPoint, savedAt: Date.now() });
    setRecentSearches(rememberRecentSearch(museumPoint));
    setBounds(areaBounds);
    setDrawBounds(areaBounds);
    setIsDrag(false);
    onDone(
      normalizeBoundsTuple([
        { lat: MUSEUM_BOUNDS_NORTH, lng: MUSEUM_BOUNDS_EAST },
        { lat: MUSEUM_BOUNDS_SOUTH, lng: MUSEUM_BOUNDS_WEST },
      ])
    );
  };

  const handleApiKeySave = (
    keyProvider: ApiKeyProvider,
    nextApiKey: string
  ) => {
    localStorage.setItem(API_KEY_STORAGE_KEYS[keyProvider], nextApiKey);
    setApiKeys((currentKeys) => ({
      ...currentKeys,
      [keyProvider]: nextApiKey,
    }));
    setResetToken((token) => token + 1);
  };

  const groupedOptions = mapProviderOptions.reduce<Record<string, typeof mapProviderOptions>>(
    (groups, option) => {
      groups[option.group] = [...(groups[option.group] || []), option];
      return groups;
    },
    {}
  );
  const favoriteOptions = favoriteMapProviders
    .map((provider) =>
      mapProviderOptions.find((option) => option.value === provider)
    )
    .filter((option): option is (typeof mapProviderOptions)[number] =>
      Boolean(option)
    );

  return (
    <div
      css={css({
        position: "relative",
        width: "100%",
        height: "100%",
      })}
    >
      <div css={controlPanelStyle}>
        <div css={providerPickerStyle}>
          <MapProviderDropdown
            value={mapProvider}
            favoriteOptions={favoriteOptions}
            groupedOptions={groupedOptions}
            onChange={handleProviderChange}
          />

          <button
            css={favoriteProviderButtonStyle(isCurrentProviderFavorite)}
            type="button"
            aria-pressed={isCurrentProviderFavorite}
            title={
              isCurrentProviderFavorite
                ? `Remove ${getMapProviderLabel(mapProvider)} from favorites`
                : `Favorite ${getMapProviderLabel(mapProvider)}`
            }
            onClick={handleFavoriteProviderToggle}
          >
            <Star
              css={IconSize}
              fill={isCurrentProviderFavorite ? "currentColor" : "none"}
            />
          </button>

          <SearchApiButton />

          <DarkModeToggle />
        </div>

        <button
          css={removeButtonStyle(hasSelection && !isDrag)}
          onClick={handleClickRemoveBox}
        >
          <CircleMinus css={IconSize} /> Remove Box
        </button>

        <ShapeSelectorButton
          shapeType={shapeType}
          isDrag={isDrag}
          onShapeChange={handleShapeChange}
          onToggleDrag={handleClickSwitchDrag}
        />

        <TexturesButton />

        <GpuSelectorButton />
      </div>

      {requiresMissingApiKey && apiKeyProvider ? (
        <ApiKeyEntry
          keyProvider={apiKeyProvider}
          providerLabel={getMapProviderLabel(mapProvider)}
          value={activeApiKey}
          onSave={handleApiKeySave}
        />
      ) : mapProvider === "google" ? (
          <GoogleMapSelector
            apiKey={activeApiKey}
            isDrag={isDrag}
            resetToken={resetToken}
            initialLocation={savedLocation}
            onDone={(nextBounds) => onDone(normalizeBoundsTuple(nextBounds))}
            onLocationSaved={setSavedLocation}
            onRecentSearchSaved={handleRecentSearchSaved}
            onSelectionChange={setHasGoogleSelection}
          />
      ) : (
        <LeafletMapSelector
          bounds={bounds}
          drawBounds={drawBounds}
          isDrag={isDrag}
          shapeType={shapeType}
          initialLocation={savedLocation}
          onLocationSaved={setSavedLocation}
          onRecentSearchSaved={handleRecentSearchSaved}
          tileProvider={buildLeafletTileProvider(mapProvider, activeApiKey)}
          onChangeDone={handleChangeDone}
          onChangeDraw={handleChangeDraw}
          circleCenter={circleCenter}
          circleRadius={circleRadius}
          lassoPoints={lassoPoints}
          onCircleChange={(center, radius) => {
            setCircleCenter(center);
            setCircleRadius(radius);
          }}
          onLassoChange={setLassoPoints}
        />
      )}

      <div css={presetPanelStyle}>
        {recentSearches.slice(0, 4).map((recentSearch) => (
          <button
            key={getRecentSearchKey(recentSearch)}
            css={recentButtonVerticalStyle}
            type="button"
            title={recentSearch.label}
            onClick={() => handleRecentSearchClick(recentSearch)}
          >
            <Search size={13} />
            {recentSearch.label ||
              `${recentSearch.lat.toFixed(4)}, ${recentSearch.lng.toFixed(4)}`}
          </button>
        ))}
        {recentSearches.length > 0 && (
          <button
            css={historyButtonVerticalStyle}
            type="button"
            onClick={() => setShowHistoryModal(true)}
          >
            <Clock size={13} />
            History ({recentSearches.length})
          </button>
        )}
      </div>

      {showHistoryModal && (
        <HistoryPage
          recentSearches={recentSearches}
          onSelect={(item) => {
            handleRecentSearchClick(item);
            setShowHistoryModal(false);
          }}
          onBack={() => setShowHistoryModal(false)}
          onDeleteAll={() => {
            localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
            setRecentSearches([]);
          }}
          onDeleteSelected={(items) => {
            const keysToDelete = new Set(items.map(getRecentSearchKey));
            const remaining = recentSearches.filter(
              (item) => !keysToDelete.has(getRecentSearchKey(item))
            );
            localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(remaining));
            setRecentSearches(remaining);
          }}
        />
      )}
    </div>
  );
}

function ShapeSelectorButton({
  shapeType,
  isDrag,
  onShapeChange,
  onToggleDrag,
}: {
  shapeType: ShapeType;
  isDrag: boolean;
  onShapeChange: (shape: ShapeType) => void;
  onToggleDrag: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const shapeOptions: { type: ShapeType; label: string; icon: typeof Square; desc: string }[] = [
    { type: "rectangle", label: "Rectangle", icon: Square, desc: "Draw a box" },
    { type: "lasso", label: "Lasso", icon: Lasso, desc: "Free-form shape" },
  ];

  const currentShape = shapeOptions.find((s) => s.type === shapeType) || shapeOptions[0];
  const ShapeIcon = currentShape.icon;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleShapeSelect = (type: ShapeType) => {
    onShapeChange(type);
    setIsOpen(false);
    if (isDrag) {
      onToggleDrag();
    }
  };

  const handleMainClick = () => {
    onToggleDrag();
  };

  return (
    <div ref={dropdownRef} css={css({ position: "relative", display: "flex" })}>
      <button
        css={shapeMainButtonStyle(isDrag)}
        onClick={handleMainClick}
        title={isDrag ? "Switch to select mode" : "Back to drag mode"}
        type="button"
      >
        <ShapeIcon css={IconSize} />
        <MousePointerClick css={IconSize} />
        <span>{isDrag ? "Select" : currentShape.label}</span>
      </button>
      <button
        css={shapeDropdownButtonStyle}
        onClick={() => setIsOpen(!isOpen)}
        title="Choose selection shape"
        type="button"
      >
        <ChevronDown
          css={css({
            width: "10px",
            height: "10px",
            transition: "transform 0.2s ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          })}
        />
      </button>

      {isOpen && (
        <div
          css={css({
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.35rem",
            minWidth: "10rem",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            boxShadow: "0 0.5rem 1.5rem rgba(15, 23, 42, 0.18)",
            overflow: "hidden",
            zIndex: 10000,
            animation: "dropdownFadeIn 0.15s ease",
          })}
        >
          {shapeOptions.map((option) => {
            const OptionIcon = option.icon;
            return (
              <button
                key={option.type}
                css={shapeOptionStyle(shapeType === option.type)}
                onClick={() => handleShapeSelect(option.type)}
                type="button"
              >
                <OptionIcon css={IconSize} />
                <div>
                  <div css={shapeOptionTitleStyle}>{option.label}</div>
                  <div css={shapeOptionDescStyle}>{option.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const shapeMainButtonStyle = (active: boolean) =>
  css({
    ...buttonBaseStyle,
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    color: "#1e293b",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.5)",
    borderRadius: "10px 0 0 10px",
    borderRight: "none",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
    ":hover": {
      backgroundColor: "rgba(255, 255, 255, 0.9)",
    },
  });

const shapeDropdownButtonStyle = css({
  ...buttonBaseStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.75rem",
  padding: 0,
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "0 10px 10px 0",
  borderLeft: "1px solid rgba(0, 0, 0, 0.08)",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
});

const shapeDropdownStyle = css({
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: "0.35rem",
  minWidth: "10rem",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  boxShadow: "0 0.5rem 1.5rem rgba(15, 23, 42, 0.18)",
  overflow: "hidden",
  zIndex: 10000,
  animation: "dropdownFadeIn 0.15s ease",
});

const shapeOptionStyle = (active: boolean) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "none",
    borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
    backgroundColor: active ? "rgba(59, 130, 246, 0.1)" : "transparent",
    cursor: "pointer",
    textAlign: "left",
    transition: "background-color 0.15s ease",
    ":hover": {
      backgroundColor: active ? "rgba(59, 130, 246, 0.15)" : "rgba(0, 0, 0, 0.04)",
    },
  });

const shapeOptionTitleStyle = css({
  fontSize: "13px",
  fontWeight: 600,
  color: "#1e3a5f",
});

const shapeOptionDescStyle = css({
  fontSize: "11px",
  color: "#6b7280",
});

function TexturesButton() {
  const materialPreset = useSceneStore((state) => state.materialPreset);
  const setMaterialPreset = useSceneStore((state) => state.setMaterialPreset);
  const textureEnabled = useSceneStore((state) => state.textureEnabled);
  const setTextureEnabled = useSceneStore((state) => state.setTextureEnabled);
  const heightScale = useSceneStore((state) => state.heightScale);
  const setHeightScale = useSceneStore((state) => state.setHeightScale);
  const defaultHeight = useSceneStore((state) => state.defaultHeight);
  const setDefaultHeight = useSceneStore((state) => state.setDefaultHeight);
  const levelHeight = useSceneStore((state) => state.levelHeight);
  const setLevelHeight = useSceneStore((state) => state.setLevelHeight);
  const heightmapEnabled = useSceneStore((state) => state.heightmapEnabled);
  const setHeightmapEnabled = useSceneStore((state) => state.setHeightmapEnabled);
  const heightmapStrength = useSceneStore((state) => state.heightmapStrength);
  const setHeightmapStrength = useSceneStore((state) => state.setHeightmapStrength);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const materialOptions = [
    { label: "Real Life Auto", value: "realistic" },
    { label: "Concrete", value: "concrete" },
    { label: "Brick", value: "brick" },
    { label: "Glass", value: "glass" },
    { label: "Sand", value: "sand" },
    { label: "Cinematic Realism", value: "cinematicMod" },
    { label: "Neon Coastal", value: "neonCoast" },
    { label: "Next-gen Glass", value: "nextGenGlass" },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} css={css({ position: "relative" })}>
      <button
        css={texturesButtonStyle}
        onClick={() => setIsOpen(!isOpen)}
        title="Scene settings: material, texture, height"
        type="button"
      >
        <Palette css={IconSize} />
        <span>Textures</span>
      </button>

      {isOpen && (
        <div css={texturesPanelStyle}>
          <div css={texturesSectionStyle}>
            <div css={texturesSectionTitleStyle}>
              <Palette size={13} />
              Material
            </div>
            <label css={texturesLabelStyle}>
              Preset
              <select
                css={texturesSelectStyle}
                value={materialPreset}
                onChange={(e) => setMaterialPreset(e.target.value as any)}
              >
                {materialOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label css={texturesLabelStyle}>
              <span css={css({ display: "flex", alignItems: "center", gap: "0.4rem" })}>
                <Image size={13} />
                Texture
              </span>
              <input
                type="checkbox"
                checked={textureEnabled}
                onChange={(e) => setTextureEnabled(e.target.checked)}
              />
            </label>
          </div>

          <div css={texturesSectionStyle}>
            <div css={texturesSectionTitleStyle}>
              <Ruler size={13} />
              Height
            </div>
            <label css={texturesLabelStyle}>
              Scale
              <span css={css({ display: "flex", alignItems: "center", gap: "0.4rem" })}>
                <input
                  type="range"
                  css={texturesRangeStyle}
                  min="0.2"
                  max="3"
                  step="0.1"
                  value={heightScale}
                  onChange={(e) => setHeightScale(Number(e.target.value))}
                />
                {heightScale.toFixed(1)}x
              </span>
            </label>
            <label css={texturesLabelStyle}>
              Default Height
              <input
                css={texturesInputStyle}
                type="number"
                min="1"
                max="200"
                value={defaultHeight}
                onChange={(e) => setDefaultHeight(Number(e.target.value))}
              />
            </label>
            <label css={texturesLabelStyle}>
              Level Height
              <input
                css={texturesInputStyle}
                type="number"
                min="1"
                max="10"
                step="0.1"
                value={levelHeight}
                onChange={(e) => setLevelHeight(Number(e.target.value))}
              />
            </label>
          </div>

          <div css={texturesSectionStyle}>
            <div css={texturesSectionTitleStyle}>
              <Mountain size={13} />
              Heightmap
            </div>
            <label css={texturesLabelStyle}>
              Terrain
              <input
                type="checkbox"
                checked={heightmapEnabled}
                onChange={(e) => setHeightmapEnabled(e.target.checked)}
              />
            </label>
            <label css={texturesLabelStyle}>
              Strength
              <span css={css({ display: "flex", alignItems: "center", gap: "0.4rem" })}>
                <input
                  type="range"
                  css={texturesRangeStyle}
                  min="0"
                  max="12"
                  step="0.5"
                  value={heightmapStrength}
                  disabled={!heightmapEnabled}
                  onChange={(e) => setHeightmapStrength(Number(e.target.value))}
                />
                {heightmapStrength.toFixed(1)}
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

const texturesButtonStyle = css({
  ...buttonBaseStyle,
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
});

const texturesPanelStyle = css({
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: "0.35rem",
  width: "16rem",
  backgroundColor: "rgba(255, 255, 255, 0.85)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "12px",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
  overflow: "hidden",
  zIndex: 10000,
  animation: "dropdownFadeIn 0.15s ease",
});

const texturesSectionStyle = css({
  padding: "0.6rem 0.75rem",
  borderBottom: "1px solid #f3f4f6",
});

const texturesSectionTitleStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  fontSize: "11px",
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "0.4rem",
});

const texturesLabelStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  fontSize: "12px",
  color: "#374151",
  marginBottom: "0.3rem",
});

const texturesSelectStyle = css({
  width: "8rem",
  padding: "0.3rem 0.4rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  fontSize: "11px",
  color: "#1f2937",
  backgroundColor: "#ffffff",
  outline: "none",
  cursor: "pointer",
});

const texturesInputStyle = css({
  width: "4rem",
  padding: "0.25rem 0.4rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  fontSize: "11px",
  textAlign: "right",
  outline: "none",
});

const texturesRangeStyle = css({
  width: "5rem",
  accentColor: "#7c3aed",
});

function GpuSelectorButton() {
  const computeMode = useRuntimeStore((state) => state.computeMode);
  const setComputeMode = useRuntimeStore((state) => state.setComputeMode);
  const remoteEndpoint = useRuntimeStore((state) => state.remoteEndpoint);
  const setRemoteEndpoint = useRuntimeStore((state) => state.setRemoteEndpoint);
  const remoteApiKey = useRuntimeStore((state) => state.remoteApiKey);
  const setRemoteApiKey = useRuntimeStore((state) => state.setRemoteApiKey);
  const selectedProvider = useRuntimeStore((state) => state.selectedProvider);
  const setSelectedProvider = useRuntimeStore((state) => state.setSelectedProvider);
  const [isOpen, setIsOpen] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const [draftEndpoint, setDraftEndpoint] = useState(remoteEndpoint);
  const [draftApiKey, setDraftApiKey] = useState(remoteApiKey);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isRemote = computeMode === "remote";
  const providers = getProviders();
  const activeProvider = selectedProvider ? getProvider(selectedProvider) : null;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowProviders(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setDraftEndpoint(remoteEndpoint);
    setDraftApiKey(remoteApiKey);
  }, [remoteEndpoint, remoteApiKey]);

  const handleSelectLocal = () => {
    setComputeMode("local");
    setShowProviders(false);
    setIsOpen(false);
  };

  const handleSelectOnline = () => {
    setComputeMode("remote");
    setShowProviders(true);
  };

  const handleSelectProvider = (provider: GPUProvider) => {
    setSelectedProvider(provider.id);
    if (provider.defaultEndpoint) {
      setDraftEndpoint(provider.defaultEndpoint);
    }
  };

  const handleSaveConfig = () => {
    setRemoteEndpoint(draftEndpoint);
    setRemoteApiKey(draftApiKey);
    setShowProviders(false);
    setIsOpen(false);
  };

  const costColors: Record<string, string> = {
    free: "#16a34a",
    low: "#ca8a04",
    medium: "#ea580c",
    high: "#dc2626",
  };

  return (
    <div ref={dropdownRef} css={css({ position: "relative" })}>
      <button
        css={gpuButtonStyle(isRemote)}
        onClick={() => setIsOpen(!isOpen)}
        title={isRemote ? `Online GPU: ${activeProvider?.name || "Custom"}` : "Local processing selected"}
        type="button"
      >
        {isRemote ? <Zap css={IconSize} /> : <Cpu css={IconSize} />}
        <span>{isRemote ? (activeProvider?.name || "Online GPU") : "Local"}</span>
      </button>

      {isOpen && (
        <div css={gpuDropdownStyle}>
          <button
            css={gpuOptionStyle(computeMode === "local")}
            onClick={handleSelectLocal}
            type="button"
          >
            <Cpu css={IconSize} />
            <div>
              <div css={gpuOptionTitleStyle}>Local Machine</div>
              <div css={gpuOptionDescStyle}>Process on your GPU</div>
            </div>
          </button>
          <button
            css={gpuOptionStyle(computeMode === "remote")}
            onClick={handleSelectOnline}
            type="button"
          >
            <Zap css={IconSize} />
            <div>
              <div css={gpuOptionTitleStyle}>Online GPU</div>
              <div css={gpuOptionDescStyle}>Use cloud GPU server</div>
            </div>
          </button>

          {showProviders && (
            <div css={gpuProviderPanelStyle}>
              <div css={gpuProviderHeaderStyle}>
                <Cloud size={14} />
                Select GPU Provider
              </div>

              <div css={gpuProviderListStyle}>
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    css={gpuProviderItemStyle(selectedProvider === provider.id)}
                    onClick={() => handleSelectProvider(provider)}
                    type="button"
                  >
                    <div css={gpuProviderItemHeaderStyle}>
                      <span css={gpuProviderNameStyle}>{provider.name}</span>
                      <span
                        css={gpuCostBadgeStyle(costColors[provider.estimatedCost] || "#6b7280")}
                      >
                        {provider.estimatedCost}
                      </span>
                    </div>
                    <div css={gpuProviderDescStyle}>{provider.description}</div>
                    <div css={gpuProviderGpuStyle}>
                      GPU: {provider.gpuTypes.slice(0, 3).join(", ")}
                      {provider.gpuTypes.length > 3 && ` +${provider.gpuTypes.length - 3} more`}
                    </div>
                  </button>
                ))}
              </div>

              {activeProvider && (
                <div css={gpuProviderDetailStyle}>
                  <div css={gpuProviderDetailHeaderStyle}>
                    {activeProvider.name} Setup
                  </div>
                  {activeProvider.type === "notebook" && (
                    <div css={gpuProviderStepsStyle}>
                      <div css={gpuProviderStepStyle}>1. Open the notebook in {activeProvider.name}</div>
                      <div css={gpuProviderStepStyle}>2. Enable GPU runtime</div>
                      <div css={gpuProviderStepStyle}>3. Run all cells</div>
                      <div css={gpuProviderStepStyle}>4. Copy the ngrok URL from output</div>
                      <div css={gpuProviderStepStyle}>5. Paste URL in GPU Endpoint below</div>
                      {activeProvider.notebookUrl && (
                        <button
                          css={gpuOpenNotebookStyle}
                          onClick={() => window.open(activeProvider.notebookUrl, "_blank")}
                          type="button"
                        >
                          Open Notebook
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div css={gpuConfigStyle}>
                <div css={gpuConfigLabelStyle}>GPU Server Endpoint</div>
                <input
                  css={gpuConfigInputStyle}
                  value={draftEndpoint}
                  placeholder="https://your-server.example"
                  onChange={(e) => setDraftEndpoint(e.target.value)}
                />
                <div css={gpuConfigLabelStyle}>API Key (optional)</div>
                <input
                  css={gpuConfigInputStyle}
                  type="password"
                  value={draftApiKey}
                  placeholder="Bearer token"
                  onChange={(e) => setDraftApiKey(e.target.value)}
                />
                <button css={gpuConfigSaveStyle} onClick={handleSaveConfig}>
                  Save & Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const gpuButtonStyle = (active: boolean) =>
  css({
    ...buttonBaseStyle,
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    color: "#1e293b",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.5)",
    ":hover": {
      backgroundColor: "rgba(255, 255, 255, 0.9)",
    },
  });

const gpuDropdownStyle = css({
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: "0.35rem",
  minWidth: "11rem",
  backgroundColor: "rgba(255, 255, 255, 0.85)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "12px",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
  overflow: "hidden",
  zIndex: 10000,
  animation: "dropdownFadeIn 0.15s ease",
});

const gpuOptionStyle = (active: boolean) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    width: "100%",
    padding: "0.6rem 0.75rem",
    border: "none",
    borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
    backgroundColor: active ? "rgba(139, 92, 246, 0.1)" : "transparent",
    cursor: "pointer",
    textAlign: "left",
    transition: "background-color 0.15s ease",
    ":hover": {
      backgroundColor: active ? "rgba(139, 92, 246, 0.15)" : "rgba(0, 0, 0, 0.04)",
    },
  });

const gpuOptionTitleStyle = css({
  fontSize: "13px",
  fontWeight: 600,
  color: "#1e1b4b",
});

const gpuOptionDescStyle = css({
  fontSize: "11px",
  color: "#6b7280",
  marginTop: "1px",
});

const gpuConfigStyle = css({
  padding: "0.6rem 0.75rem",
  borderTop: "1px solid #e5e7eb",
  backgroundColor: "#f9fafb",
});

const gpuConfigLabelStyle = css({
  fontSize: "11px",
  fontWeight: 600,
  color: "#4b5563",
  marginBottom: "0.25rem",
});

const gpuConfigInputStyle = css({
  width: "100%",
  padding: "0.4rem 0.5rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  fontSize: "12px",
  marginBottom: "0.5rem",
  outline: "none",
  boxSizing: "border-box",
  ":focus": {
    borderColor: "#7c3aed",
  },
});

const gpuConfigSaveStyle = css({
  width: "100%",
  padding: "0.4rem",
  border: "none",
  borderRadius: "4px",
  backgroundColor: "#7c3aed",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  ":hover": {
    backgroundColor: "#6d28d9",
  },
});

const gpuProviderPanelStyle = css({
  borderTop: "1px solid #e5e7eb",
});

const gpuProviderHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.6rem 0.75rem",
  fontSize: "11px",
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  backgroundColor: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
});

const gpuProviderListStyle = css({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.25rem",
  maxHeight: "180px",
  overflowY: "auto",
});

const gpuProviderItemStyle = (active: boolean) =>
  css({
    display: "block",
    padding: "0.5rem",
    border: active ? "1px solid rgba(139, 92, 246, 0.4)" : "1px solid rgba(0, 0, 0, 0.06)",
    borderRadius: "8px",
    backgroundColor: active ? "rgba(139, 92, 246, 0.1)" : "transparent",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s ease",
    ":hover": {
      backgroundColor: active ? "rgba(139, 92, 246, 0.15)" : "rgba(0, 0, 0, 0.04)",
    },
  });

const gpuProviderItemHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "2px",
});

const gpuProviderNameStyle = css({
  fontSize: "12px",
  fontWeight: 600,
  color: "#1e293b",
});

const gpuProviderDescStyle = css({
  fontSize: "10px",
  color: "#6b7280",
  lineHeight: 1.2,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
});

const gpuProviderGpuStyle = css({
  fontSize: "9px",
  color: "#9ca3af",
  marginTop: "2px",
});

const gpuCostBadgeStyle = (color: string) =>
  css({
    fontSize: "10px",
    fontWeight: 600,
    color: "#ffffff",
    backgroundColor: color,
    padding: "1px 6px",
    borderRadius: "999px",
    textTransform: "capitalize",
  });

const gpuProviderDetailStyle = css({
  padding: "0.6rem 0.75rem",
  borderTop: "1px solid #e5e7eb",
  backgroundColor: "#f9fafb",
});

const gpuProviderDetailHeaderStyle = css({
  fontSize: "12px",
  fontWeight: 700,
  color: "#374151",
  marginBottom: "0.4rem",
});

const gpuProviderStepsStyle = css({
  fontSize: "11px",
  color: "#4b5563",
  lineHeight: 1.6,
});

const gpuProviderStepStyle = css({
  paddingLeft: "0.5rem",
});

const gpuOpenNotebookStyle = css({
  display: "inline-block",
  marginTop: "0.4rem",
  padding: "0.3rem 0.6rem",
  border: "1px solid #7c3aed",
  borderRadius: "4px",
  backgroundColor: "#ffffff",
  color: "#7c3aed",
  fontSize: "11px",
  fontWeight: 600,
  cursor: "pointer",
  ":hover": {
    backgroundColor: "#f5f3ff",
  },
});

function SelectBox() {
  return (
    <>
      <MapIcon css={IconSize} />
      <MousePointerClick css={IconSize} />
      <span>Select Box</span>
    </>
  );
}
