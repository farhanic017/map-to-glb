/**
 * Map to GLB - 3D Building Mapping Service
 * Copyright (C) 2026 Farhan Dhrubo
 * Licensed under GNU General Public License v3.0
 * https://github.com/farhanic017/map-to-glb
 */
import { css, keyframes } from "@emotion/react";
import { Space } from "../three/Space";
import { FullscreenModal } from "../components/FullscreenModal";
import { Title } from "@/components/text/Title";
import { Description } from "@/components/text/Description";
import { Column } from "@/components/flex/Column";
import { MapComponent } from "@/components/map/SelectMap";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  NextButton,
  PrevButton,
} from "@/components/button/BottomButton";
import { BuildingHeights, Building } from "@/components/map/Processing";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { useAreaStore } from "@/state/areaStore";
import { useActionStore, ExportFilter } from "@/state/exportStore";
import { Modal } from "@/components/modal/Modal";
import { TopNav } from "@/components/nav/TopNav";
import { getCookie } from "@/utils/cookie";
import { Row } from "@/components/flex/Row";
import instanceFleet from "@/api/axios";
import { getDeviceBrainProfile, limitForDevice } from "@/utils/deviceBrain";
import { cachedJson, fetchJsonWithTimeout } from "@/utils/requestCache";
import { useRuntimeStore } from "@/state/runtimeStore";
import { requestRemoteBuildings } from "@/utils/remoteCompute";
import { AppOnlyGate } from "@/components/AppOnlyGate";
import { shouldBlockPublicWebsite } from "@/utils/appDistribution";

function WebAds() {
  if (window.__TAURI__) return null;

  useEffect(() => {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7048690805050147";
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
  }, []);

  return null;
}

const IconSize = css({
  width: "14px",
  height: "14px",
});

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const deviceBrain = getDeviceBrainProfile();

const spinAnimation = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

function firstSuccessful<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let rejectedCount = 0;
    let lastError: unknown = null;

    promises.forEach((promise) => {
      promise.then(resolve).catch((error) => {
        rejectedCount += 1;
        lastError = error;

        if (rejectedCount === promises.length) {
          reject(
            lastError instanceof Error
              ? lastError
              : new Error("All requests failed.")
          );
        }
      });
    });
  });
}

async function fetchOverpassJson(query: string) {
  return cachedJson<any>({
    key: `overpass:${query}`,
    ttlMs: deviceBrain.cacheTtlMs,
    storageKey: "map3d.overpassCache",
    maxEntries: 30,
    request: async () => {
      const requests = OVERPASS_ENDPOINTS.flatMap((endpoint) => {
        const formBody = new URLSearchParams({ data: query });
        return [
          fetchJsonWithTimeout(
            `${endpoint}?data=${encodeURIComponent(query)}`,
            { headers: { Accept: "*/*" } },
            deviceBrain.requestTimeoutMs
          ),
          fetchJsonWithTimeout(
            endpoint,
            {
              method: "POST",
              body: formBody,
              headers: { Accept: "*/*" },
            },
            deviceBrain.requestTimeoutMs
          ),
        ];
      });

      return firstSuccessful(
        requests.map((request) =>
          request.then((data: any) => {
            if (!Array.isArray(data.elements)) {
              throw new Error("Overpass response did not include elements.");
            }
            return data;
          })
        )
      );
    },
  });
}

function createPreviewBuildings({
  south,
  west,
  north,
  east,
}: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Building[] {
  const latSpan = Math.max(0.0005, north - south);
  const lngSpan = Math.max(0.0005, east - west);
  const rows = 5;
  const columns = 5;
  const buildings: Building[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const seed = row * columns + column + 1;
      if (seed % 7 === 0) continue;

      const centerLat = south + latSpan * ((row + 0.5) / rows);
      const centerLng = west + lngSpan * ((column + 0.5) / columns);
      const footprintLat = latSpan * (0.045 + (seed % 3) * 0.012);
      const footprintLng = lngSpan * (0.045 + (seed % 4) * 0.01);
      const angle = ((seed % 5) - 2) * 0.08;
      const corners = [
        [-footprintLat, -footprintLng],
        [-footprintLat, footprintLng],
        [footprintLat, footprintLng],
        [footprintLat, -footprintLng],
      ].map(([latOffset, lngOffset]) => ({
        lat:
          centerLat +
          latOffset * Math.cos(angle) -
          lngOffset * Math.sin(angle) * 0.45,
        lng:
          centerLng +
          lngOffset * Math.cos(angle) +
          latOffset * Math.sin(angle) * 0.45,
      }));

      buildings.push({
        id: -seed,
        tags: {
          building:
            seed % 5 === 0
              ? "commercial"
              : seed % 3 === 0
              ? "apartments"
              : "yes",
          height: String(8 + (seed % 6) * 3),
          "building:levels": String(2 + (seed % 5)),
          source: "Generated preview - not real OSM footprint",
        },
        geometry: [...corners, corners[0]],
      });
    }
  }

  return buildings;
}

function hasValidBuildingGeometry(building: Building) {
  if (!building.geometry || building.geometry.length < 4) return false;

  const uniquePoints = new Set(
    building.geometry.map(
      (point) => `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`
    )
  );

  return uniquePoints.size >= 3;
}

function isBuildingFeature(feature: Building) {
  const tags = feature.tags || {};
  return Boolean(tags.building || tags["building:part"]);
}

function isLinearMapFeature(feature: Building) {
  const tags = feature.tags || {};
  return Boolean(tags.highway || tags.railway || tags.waterway);
}

function isSurfaceMapFeature(feature: Building) {
  const tags = feature.tags || {};
  return Boolean(
    tags.natural ||
      tags.water ||
      tags.landuse ||
      tags.leisure ||
      tags.amenity === "parking" ||
      tags.tourism === "attraction"
  );
}

function isPointMapFeature(feature: Building) {
  const tags = feature.tags || {};
  return Boolean(
    tags.natural === "tree" ||
      tags.traffic_sign ||
      tags.information === "guidepost" ||
      tags.highway === "street_lamp" ||
      tags.highway === "traffic_signals" ||
      tags.highway === "bus_stop" ||
      tags.highway === "stop" ||
      tags.highway === "give_way" ||
      tags.amenity === "bench" ||
      tags.amenity === "waste_basket" ||
      tags.amenity === "recycling" ||
      tags.amenity === "shelter" ||
      tags.amenity === "drinking_water" ||
      tags.barrier === "bollard" ||
      tags.barrier === "gate" ||
      tags.man_made === "street_cabinet" ||
      tags.man_made === "surveillance" ||
      tags.man_made === "flagpole"
  );
}

function hasValidMapFeatureGeometry(feature: Building) {
  if (!feature.geometry || feature.geometry.length < 1) return false;

  if (isBuildingFeature(feature)) return hasValidBuildingGeometry(feature);

  const uniquePoints = new Set(
    feature.geometry.map(
      (point) => `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`
    )
  );

  if (isLinearMapFeature(feature)) return uniquePoints.size >= 2;
  if (isPointMapFeature(feature)) return uniquePoints.size >= 1;
  if (isSurfaceMapFeature(feature)) return uniquePoints.size >= 3;
  return false;
}

function toMapFeature(element: any): Building {
  return {
    id: element.id,
    tags: element.tags || {},
    geometry: element.geometry
      ? element.geometry.map((pt: any) => ({ lat: pt.lat, lng: pt.lon }))
      : typeof element.lat === "number" && typeof element.lon === "number"
      ? [{ lat: element.lat, lng: element.lon }]
      : undefined,
  };
}

function Map3DApp() {
  const [isNextButtonDisabled, setIsNextButtonDisabled] = useState(true);
  const [areaData, setAreaData] = useState([]);
  const steps = ["front", "processing", "scene"];
  const [step, setStep] = useState(0);
  const [isWarnModal, setIsWarnModal] = useState(false);
  const [isExportModal, setIsExportModal] = useState(false);
  const [_isFleetLogin, setIsFleetLogin] = useState(false);
  const [isFleetModal, setIsFleetModal] = useState(false);
  const [spaceList, setSpaceList] = useState([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [sceneFeatures, setSceneFeatures] = useState<Building[]>([]);
  const [isFetchingBuildings, setIsFetchingBuildings] = useState(false);
  const [hasFetchedBuildings, setHasFetchedBuildings] = useState(false);
  const [buildingFetchError, setBuildingFetchError] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const exportFilter = useActionStore((state) => state.exportFilter);
  const exportStatus = useActionStore((state) => state.exportStatus);
  const exportError = useActionStore((state) => state.exportError);
  const setExportFilter = useActionStore((state) => state.setExportFilter);
  const computeMode = useRuntimeStore((state) => state.computeMode);
  const remoteEndpoint = useRuntimeStore((state) => state.remoteEndpoint);
  const remoteApiKey = useRuntimeStore((state) => state.remoteApiKey);

  const setCenter = useAreaStore((state) => state.setCenter);
  const appendAreas = useAreaStore((state) => state.appendAreas);
  const clearAreas = useAreaStore((state) => state.clearAreas);
  const setAction = useActionStore((state) => state.setAction);
  const setFleet = useActionStore((state) => state.setFleet);

  const checkIsBig = () => {
    const a = Math.abs(areaData[0].lat - areaData[1].lat);
    const b = Math.abs(areaData[0].lng - areaData[1].lng);

    return a + b > 0.1;
  };

  const exportFile = () => {
    setAction(true);
  };

  const exportFleet = () => {
    setAction(true);
  };

  const getFleetSpaces = async () => {
    const getSpace: any = await instanceFleet.get("space");

    setSpaceList([
      ...getSpace.data.spaces.map((item) => {
        return {
          ...item,
          key: item.id,
        };
      }),
    ]);
  };

  const putGlbOnFleetSpace = (spaceId) => {
    setFleet(spaceId, "fleet");
    setTimeout(() => {
      exportFleet();
    }, 100);
  };

  const _loadFleetSpace = () => {
    getFleetSpaces();
    setIsFleetModal(true);
  };

  const checkFleetLogin = () => {
    try {
      const isCookie = getCookie("token");
      if (isCookie) {
        setIsFleetLogin(true);
      }
    } catch {
      // Cookie access can fail in locked-down browsers; fleet export stays hidden.
    }
  };

  const handleDone = (data) => {
    setAreaData(data);
    setCenter(data);
    setIsNextButtonDisabled(false);
    setBuildings([]);
    setSceneFeatures([]);
    clearAreas();
    setHasFetchedBuildings(false);
    setBuildingFetchError("");
  };

  const handleRemove = () => {
    setAreaData([]);
    setIsNextButtonDisabled(true);
    setBuildings([]);
    setSceneFeatures([]);
    clearAreas();
    setHasFetchedBuildings(false);
    setBuildingFetchError("");
  };

  const requestBuildings = useCallback(async () => {
    if (areaData.length < 2) return false;

    setIsFetchingBuildings(true);

    const south = Math.min(areaData[0].lat, areaData[1].lat);
    const west = Math.min(areaData[0].lng, areaData[1].lng);
    const north = Math.max(areaData[0].lat, areaData[1].lat);
    const east = Math.max(areaData[0].lng, areaData[1].lng);
    const buildingQuery = `[out:json][timeout:18];
(
  way["building"](${south},${west},${north},${east});
  way["building:part"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  relation["building:part"](${south},${west},${north},${east});
);
out body geom;`;
    const linearQuery = `[out:json][timeout:14];
(
  way["highway"](${south},${west},${north},${east});
  way["railway"](${south},${west},${north},${east});
  way["waterway"](${south},${west},${north},${east});
);
out body geom;`;
    const waterSurfaceQuery = `[out:json][timeout:12];
(
  way["natural"~"^(water|wetland|beach|coastline)$"](${south},${west},${north},${east});
  way["water"](${south},${west},${north},${east});
  way["landuse"~"^(reservoir|basin)$"](${south},${west},${north},${east});
);
out body geom;`;
    const greenSurfaceQuery = `[out:json][timeout:12];
(
  way["natural"~"^(wood|scrub|grassland|wetland|beach)$"](${south},${west},${north},${east});
  way["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|cemetery|farmland)$"](${south},${west},${north},${east});
  way["leisure"~"^(park|garden|playground|pitch|nature_reserve|golf_course)$"](${south},${west},${north},${east});
);
out body geom;`;
    const pavedSurfaceQuery = `[out:json][timeout:12];
(
  way["amenity"="parking"](${south},${west},${north},${east});
  way["area:highway"~"^(footway|pedestrian|path|service)$"](${south},${west},${north},${east});
);
out body geom;`;
    const pointQuery = `[out:json][timeout:14];
(
  node["natural"="tree"](${south},${west},${north},${east});
  node["traffic_sign"](${south},${west},${north},${east});
  node["information"="guidepost"](${south},${west},${north},${east});
  node["highway"~"^(street_lamp|traffic_signals|bus_stop|stop|give_way|crossing)$"](${south},${west},${north},${east});
  node["amenity"~"^(bench|waste_basket|recycling|shelter|drinking_water)$"](${south},${west},${north},${east});
  node["barrier"~"^(bollard|gate)$"](${south},${west},${north},${east});
  node["man_made"~"^(street_cabinet|surveillance|flagpole)$"](${south},${west},${north},${east});
);
out body geom;`;
    const fetchLocalFeatures = async (query: string) => {
      const data = await fetchOverpassJson(query);
      return (data.elements || [])
        .map(toMapFeature)
        .filter(hasValidMapFeatureGeometry);
    };

    try {
      setBuildingFetchError("");
      let fetchedBuildings: Building[] = [];
      let fetchedSceneFeatures: Building[] = [];

      if (computeMode === "remote" && remoteEndpoint.trim()) {
        setBuildingFetchError(
          "Remote GPU processing is running. This can take longer than local processing."
        );
        fetchedBuildings = await requestRemoteBuildings({
          endpoint: remoteEndpoint,
          apiKey: remoteApiKey,
          bounds: { south, west, north, east },
          deviceProfile: deviceBrain,
        });
        fetchedSceneFeatures = fetchedBuildings;

        try {
          const localResults = await Promise.allSettled([
            fetchLocalFeatures(linearQuery),
            fetchLocalFeatures(waterSurfaceQuery),
            fetchLocalFeatures(greenSurfaceQuery),
            fetchLocalFeatures(pavedSurfaceQuery),
            fetchLocalFeatures(pointQuery),
          ]);
          const localFeatures = localResults
            .filter(
              (result): result is PromiseFulfilledResult<Building[]> =>
                result.status === "fulfilled"
            )
            .flatMap((result) => result.value);
          fetchedSceneFeatures = [
            ...fetchedBuildings,
            ...localFeatures.filter((feature) => !isBuildingFeature(feature)),
          ];
        } catch (error) {
          console.warn("Could not fetch local map context features:", error);
        }
      } else {
        const featureResults = await Promise.allSettled([
          fetchLocalFeatures(buildingQuery),
          fetchLocalFeatures(linearQuery),
          fetchLocalFeatures(waterSurfaceQuery),
          fetchLocalFeatures(greenSurfaceQuery),
          fetchLocalFeatures(pavedSurfaceQuery),
          fetchLocalFeatures(pointQuery),
        ]);
        const successfulFeatureGroups = featureResults
          .filter(
            (result): result is PromiseFulfilledResult<Building[]> =>
              result.status === "fulfilled"
          )
          .map((result) => result.value);

        if (successfulFeatureGroups.length === 0) {
          const failedResult = featureResults.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected"
          );
          throw failedResult?.reason || new Error("No OSM feature request succeeded.");
        }

        fetchedSceneFeatures = successfulFeatureGroups.flat();
        fetchedBuildings = fetchedSceneFeatures
          .filter(isBuildingFeature)
          .filter(hasValidBuildingGeometry);
      }

      const blds = limitForDevice(fetchedBuildings, deviceBrain.maxBuildings);
      const contextFeatures = fetchedSceneFeatures.filter(
        (feature) => !isBuildingFeature(feature)
      );
      const limitedSceneFeatures = [
        ...blds,
        ...limitForDevice(contextFeatures, deviceBrain.maxRoads),
      ];
      setBuildings(blds);
      setSceneFeatures(limitedSceneFeatures);
      appendAreas(limitedSceneFeatures);
      setHasFetchedBuildings(true);
      if (limitedSceneFeatures.length === 0) {
        setBuildingFetchError(
          "No roads, buildings, gardens, lakes, or other supported OSM features were returned for this exact selection. Try a different or smaller area with mapped features."
        );
      } else if (blds.length === 0) {
        setBuildingFetchError(
          `No real buildings were returned, but ${limitedSceneFeatures.length} roads, water, gardens, or land features loaded for this selection.`
        );
      } else if (
        fetchedBuildings.length > blds.length ||
        fetchedSceneFeatures.length > limitedSceneFeatures.length
      ) {
        setBuildingFetchError(
          `Device brain optimized this area for ${deviceBrain.tier} hardware, loading ${limitedSceneFeatures.length} of ${fetchedSceneFeatures.length} mapped features to avoid freezes.`
        );
      } else {
        setBuildingFetchError("");
      }
      return limitedSceneFeatures.length > 0;
    } catch (error) {
      console.error("Error fetching map feature data:", error);
      setBuildings([]);
      setSceneFeatures([]);
      appendAreas([]);
      setHasFetchedBuildings(true);
      setBuildingFetchError(
        "Could not fetch live OSM features for this area. Try again, select a smaller area, or configure a remote GPU/server data endpoint."
      );
      return false;
    } finally {
      setIsFetchingBuildings(false);
    }
  }, [appendAreas, areaData, computeMode, remoteApiKey, remoteEndpoint]);

  const handleRetryBuildings = async () => {
    setBuildings([]);
    setSceneFeatures([]);
    clearAreas();
    setHasFetchedBuildings(false);
    setBuildingFetchError("Retrying live map feature data...");

    const didFetchBuildings = await requestBuildings();
    if (didFetchBuildings) {
      setStep(2);
    }
  };

  const handlePreviewGeneratedMassing = () => {
    if (areaData.length < 2) return;

    const south = Math.min(areaData[0].lat, areaData[1].lat);
    const west = Math.min(areaData[0].lng, areaData[1].lng);
    const north = Math.max(areaData[0].lat, areaData[1].lat);
    const east = Math.max(areaData[0].lng, areaData[1].lng);
    const previewBuildings = createPreviewBuildings({
      south,
      west,
      north,
      east,
    });

    setBuildings(previewBuildings);
    setSceneFeatures(previewBuildings);
    appendAreas(previewBuildings);
    setHasFetchedBuildings(true);
    setBuildingFetchError(
      "Generated preview massing is loaded. This is not real OSM building geometry."
    );
    setStep(2);
  };

  const handleClickNextStep = async () => {
    if (step == 0 && checkIsBig()) {
      setIsWarnModal(true);
      return false;
    }
    if (step == 0) {
      setStep(1);
      return;
    }
    if (step == 1 && isFetchingBuildings) {
      return;
    }
    if (step == 1 && !hasFetchedBuildings) {
      const didFetchBuildings = await requestBuildings();
      if (didFetchBuildings) {
        setStep(step + 1);
      }
      return;
    }
    setStep(step + 1);
  };

  const handleClickPrevStep = () => {
    if (step === 2) {
      setStep(0);
      return;
    }

    setStep(Math.max(0, step - 1));
  };

  const handleClickExport = () => {
    setIsExportModal(true);
  };

  useEffect(() => {
    checkFleetLogin();
  }, []);

  useEffect(() => {
    if (step === 1 && hasFetchedBuildings && sceneFeatures.length > 0) {
      setStep(2);
      return;
    }

    if (
      step !== 1 ||
      isFetchingBuildings ||
      areaData.length < 2 ||
      hasFetchedBuildings
    ) {
      return;
    }

    let cancelled = false;

    requestBuildings().then((didFetchBuildings) => {
      if (!cancelled && didFetchBuildings) {
        setStep(2);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    step,
    hasFetchedBuildings,
    isFetchingBuildings,
    areaData,
    requestBuildings,
    sceneFeatures.length,
  ]);

  return (
    <div css={css({ height: "100%", width: "100%", backgroundColor: "#ffffff" })}>
      <WebAds />
      <TopNav step={step} />

      <FullscreenModal isOpen={steps[step] == "front"} fullScreen>
        <MapComponent
          onRemove={handleRemove}
          onDone={handleDone}
          onHistoryOpen={setIsHistoryOpen}
        />
      </FullscreenModal>

      <FullscreenModal isOpen={steps[step] == "processing"}>
        <Column gap="1rem">
          <Column gap="0.5rem">
            <Title>Processing</Title>
            <Description>
              Fetching roads, buildings, gardens, lakes, and other mapped OSM
              features. The 3D scene opens automatically when real features are
              ready.
            </Description>

            <BuildingHeights
              buildings={buildings}
              loading={isFetchingBuildings}
            />
            {buildingFetchError && (
              <Description>{buildingFetchError}</Description>
            )}
            {hasFetchedBuildings && sceneFeatures.length === 0 && (
              <Row gap="0.5rem">
                <Button
                  isShow={true}
                  disabled={isFetchingBuildings}
                  onClick={handleRetryBuildings}
                >
                  Retry live data
                </Button>
                <Button
                  isShow={true}
                  disabled={isFetchingBuildings}
                  onClick={handlePreviewGeneratedMassing}
                >
                  Preview generated massing
                </Button>
              </Row>
            )}
          </Column>
        </Column>
      </FullscreenModal>

      <PrevButton isShow={step != 0 && !isHistoryOpen} onClick={handleClickPrevStep}>
        <ChevronLeft css={IconSize} /> Prev Step
      </PrevButton>

      <NextButton
        isShow={step != 2 && !isHistoryOpen}
        disabled={
          isNextButtonDisabled ||
          isFetchingBuildings ||
          (step === 1 && hasFetchedBuildings && sceneFeatures.length === 0)
        }
        onClick={handleClickNextStep}
      >
        {isFetchingBuildings ? (
          <>
            <Loader2
              css={[
                IconSize,
                css({ animation: `${spinAnimation} 1s linear infinite` }),
              ]}
            />
            Fetching...
          </>
        ) : (
          <>
            Next Step <ChevronRight css={IconSize} />
          </>
        )}
      </NextButton>

      <NextButton isShow={step == 2 && !isHistoryOpen} onClick={handleClickExport}>
        Export GLB <Download css={IconSize} />
      </NextButton>

      {/* Bottom Banner - Only in web browser, completely removed from desktop */}
      {step === 0 && !window.__TAURI__ && (
        <div
          css={css({
            position: "fixed",
            bottom: "1rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9998,
            padding: "0.5rem 1rem",
            backgroundColor: document.documentElement.classList.contains("dark")
              ? "rgba(30, 41, 59, 0.95)"
              : "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: document.documentElement.classList.contains("dark")
              ? "1px solid rgba(255, 255, 255, 0.15)"
              : "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: "12px",
            boxShadow: "0 4px 24px rgba(0, 0, 0, 0.2)",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            fontSize: "13px",
            color: document.documentElement.classList.contains("dark") ? "#e2e8f0" : "#1e293b",
            transition: "background-color 0.3s ease, color 0.3s ease",
          })}
        >
          <a
            href="https://www.patreon.com/cw/Farhanic"
            target="_blank"
            rel="noopener noreferrer"
            css={css({
              color: "#e03e4a",
              textDecoration: "none",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.35rem 0.75rem",
              borderRadius: "8px",
              backgroundColor: "rgba(224, 62, 74, 0.1)",
              transition: "all 0.2s ease",
              ":hover": {
                backgroundColor: "rgba(224, 62, 74, 0.2)",
              },
            })}
          >
            ❤️ Support on Patreon
          </a>
          <ins
            className="adsbygoogle"
            style={{ display: "inline-block", width: "728px", height: "90px" }}
            data-ad-client="ca-pub-7048690805050147"
            data-ad-slot="3619618713"
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      )}

      <Modal isOpen={isWarnModal} onClose={() => setIsWarnModal(false)}>
        <Column gap="0.5rem">
          <Title>The area is too big </Title>
          <Description>Do you want to proceed?</Description>
          <Button
            isShow={step != 2}
            disabled={isNextButtonDisabled}
            onClick={() => {
              setStep(step + 1);
              setIsWarnModal(false);
            }}
          >
            Next Step <ChevronRight css={IconSize} />
          </Button>
        </Column>
      </Modal>

      <Modal isOpen={isExportModal} onClose={() => setIsExportModal(false)}>
        <Column gap="1rem">
          <Title>Export</Title>
          <Description>Choose what to export</Description>

          <div css={css({ display: "flex", flexDirection: "column", gap: "0.5rem" })}>
            <span css={css({ fontSize: "13px", fontWeight: 600, color: "#374151" })}>
              Export Filter
            </span>
            <div css={css({ display: "flex", flexWrap: "wrap", gap: "0.4rem" })}>
              {[
                { value: "all", label: "All Features" },
                { value: "buildings", label: "Buildings" },
                { value: "routes", label: "Routes & Roads" },
                { value: "surfaces", label: "Surfaces" },
                { value: "points", label: "Street Furniture" },
              ].map((option) => (
                <button
                  key={option.value}
                  css={css({
                    padding: "0.5rem 0.75rem",
                    border: exportFilter === option.value
                      ? "2px solid #3b82f6"
                      : "1px solid #d1d5db",
                    borderRadius: "8px",
                    backgroundColor:
                      exportFilter === option.value ? "#eff6ff" : "#ffffff",
                    color: exportFilter === option.value ? "#1d4ed8" : "#374151",
                    fontSize: "13px",
                    fontWeight: exportFilter === option.value ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    ":hover": {
                      backgroundColor:
                        exportFilter === option.value ? "#dbeafe" : "#f9fafb",
                    },
                  })}
                  onClick={() => setExportFilter(option.value as ExportFilter)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {exportStatus === "error" && exportError && (
            <div
              css={css({
                padding: "0.75rem",
                borderRadius: "8px",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: "13px",
              })}
            >
              {exportError}
            </div>
          )}

          {exportStatus === "success" && (
            <div
              css={css({
                padding: "0.75rem",
                borderRadius: "8px",
                backgroundColor: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#166534",
                fontSize: "13px",
              })}
            >
              Export completed successfully!
            </div>
          )}

          <Row gap="0.5rem">
            <Button
              isShow={true}
              onClick={exportFile}
              disabled={exportStatus === "exporting"}
            >
              {exportStatus === "exporting" ? (
                <>
                  <Loader2
                    css={css({
                      width: "14px",
                      height: "14px",
                      animation: "spin 1s linear infinite",
                    })}
                  />
                  Exporting...
                </>
              ) : (
                <>
                  Export GLB <Download css={IconSize} />
                </>
              )}
            </Button>
          </Row>
        </Column>
      </Modal>

      <Modal isOpen={isFleetModal} onClose={() => setIsFleetModal(false)}>
        <Column gap="0.5rem">
          <Title>Select Fleet Space</Title>
          {spaceList.map((item) => (
            <Button isShow={true} onClick={() => putGlbOnFleetSpace(item.id)}>
              {item.title}
            </Button>
          ))}
        </Column>
      </Modal>

      <Space></Space>
    </div>
  );
}

function App() {
  if (shouldBlockPublicWebsite()) {
    return <AppOnlyGate />;
  }

  return <Map3DApp />;
}

export default App;
