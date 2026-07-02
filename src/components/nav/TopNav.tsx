import { css } from "@emotion/react";
import { DetailedHTMLProps, ButtonHTMLAttributes, useEffect, useState } from "react";

function useDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
import { Modal } from "../modal/Modal";
import { Column } from "../flex/Column";
import { Title } from "../text/Title";
import { Description } from "../text/Description";
import {
  BuildingMaterialPreset,
  useSceneStore,
} from "@/state/sceneStore";
import { Bot, Cpu, Image, Mountain, Palette, Ruler, Server, Terminal } from "lucide-react";
import { ComputeMode, useRuntimeStore } from "@/state/runtimeStore";
import { ProviderSelector } from "../gpu/ProviderSelector";
import { getProvider } from "@/providers/registry";

const TOP_PANEL_HEIGHT = "3rem";
const BORDER_COLOR = "#ededf290";

const breakpoints = [768];
const mq = breakpoints.map((bp) => `@media (max-width: ${bp}px)`);

const materialOptions: Array<{
  label: string;
  value: BuildingMaterialPreset;
}> = [
  { label: "Real Life Auto", value: "realistic" },
  { label: "Concrete", value: "concrete" },
  { label: "Brick", value: "brick" },
  { label: "Glass", value: "glass" },
  { label: "Sand", value: "sand" },
  { label: "Cinematic Realism", value: "cinematicMod" },
  { label: "Neon Coastal", value: "neonCoast" },
  { label: "Next-gen Glass", value: "nextGenGlass" },
];

const optionSection = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  padding: "0.25rem 0 0.75rem",
  borderBottom: "1px solid #ededf2",
});

const sectionTitle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  color: "#5b5d63",
  fontSize: "13px",
  fontWeight: 700,
});

const labelStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  color: "#5b5d63",
  fontSize: "13px",
});

const fieldStyle = css({
  width: "9rem",
  boxSizing: "border-box",
  color: "#25272c",
  backgroundColor: "#f7f8fa",
  border: "1px solid #dddfe5",
  borderRadius: "6px",
  padding: "0.45rem 0.55rem",
  fontSize: "13px",
});

const rangeStyle = css({
  width: "9rem",
  accentColor: "#007bff",
});

interface ButtonProps
  extends DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  isShow?: boolean;
}

export function TopNav({ step }: { step: number }) {
  const materialPreset = useSceneStore((state) => state.materialPreset);
  const textureEnabled = useSceneStore((state) => state.textureEnabled);
  const heightScale = useSceneStore((state) => state.heightScale);
  const defaultHeight = useSceneStore((state) => state.defaultHeight);
  const levelHeight = useSceneStore((state) => state.levelHeight);
  const heightmapEnabled = useSceneStore((state) => state.heightmapEnabled);
  const heightmapStrength = useSceneStore((state) => state.heightmapStrength);
  const setMaterialPreset = useSceneStore((state) => state.setMaterialPreset);
  const setTextureEnabled = useSceneStore((state) => state.setTextureEnabled);
  const setHeightScale = useSceneStore((state) => state.setHeightScale);
  const setDefaultHeight = useSceneStore((state) => state.setDefaultHeight);
  const setLevelHeight = useSceneStore((state) => state.setLevelHeight);
  const setHeightmapEnabled = useSceneStore(
    (state) => state.setHeightmapEnabled
  );
  const setHeightmapStrength = useSceneStore(
    (state) => state.setHeightmapStrength
  );
  const computeMode = useRuntimeStore((state) => state.computeMode);
  const remoteEndpoint = useRuntimeStore((state) => state.remoteEndpoint);
  const remoteApiKey = useRuntimeStore((state) => state.remoteApiKey);
  const agentMode = useRuntimeStore((state) => state.agentMode);
  const setComputeMode = useRuntimeStore((state) => state.setComputeMode);
  const setRemoteEndpoint = useRuntimeStore(
    (state) => state.setRemoteEndpoint
  );
  const setRemoteApiKey = useRuntimeStore((state) => state.setRemoteApiKey);
  const setAgentMode = useRuntimeStore((state) => state.setAgentMode);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    useRuntimeStore.getState().selectedProvider || null
  );

  const [openModal, setOpenModal] = useState(false);

  const handleSelectProvider = (providerId: string | null) => {
    setSelectedProviderId(providerId);
    useRuntimeStore.getState().setSelectedProvider(providerId);

    if (providerId) {
      const provider = getProvider(providerId);
      if (provider) {
        setComputeMode("remote");
        if (provider.defaultEndpoint) {
          setRemoteEndpoint(provider.defaultEndpoint);
        }
      }
    }
  };

  return (
    <>
      <div
        css={css({
          display: "flex",
          transition: "background-color 0.3s ease",
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: TOP_PANEL_HEIGHT,
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid #000000",
          zIndex: 9999,
          justifyContent: "space-between",
          alignItems: "center",
        })}
      >
        <div
          css={css({
            paddingLeft: "1rem",
            [mq[0]]: { paddingLeft: "0.75rem" },
            alignItems: "center",
            flexDirection: "row",
            display: "flex",
            gap: "0.75rem",
          })}
        >
          <img
            src="/favicon.png"
            alt="Map to GLB"
            css={css({
              width: "20px",
              height: "20px",
              borderRadius: "4px",
            })}
          />
          <span
            css={css({
              fontSize: "14px",
              fontWeight: "700",
              color: "#25272c",
            })}
          >
            Map to GLB
          </span>
          <a
            href="https://www.patreon.com/cw/Farhanic"
            target="_blank"
            rel="noopener noreferrer"
            css={css({
              fontSize: "11px",
              color: "#ff424d",
              textDecoration: "none",
              fontWeight: "500",
              padding: "2px 8px",
              borderRadius: "12px",
              backgroundColor: "rgba(255, 66, 77, 0.1)",
              transition: "all 0.2s ease",
              ":hover": {
                backgroundColor: "rgba(255, 66, 77, 0.2)",
              },
            })}
          >
            ❤️ Patreon
          </a>
        </div>

        <div
          css={css({
            padding: "0rem 0rem",
            [mq[0]]: {
              display: "none",
            },
          })}
        ></div>

        <div
          css={css({
            paddingRight: "1rem",
            [mq[0]]: { paddingRight: "0.5rem", gap: "0.3rem" },
            display: "flex",
            flexDirection: "row",
            gap: "0.5rem",
          })}
        >
          <NavButton
            isShow={true}
            onClick={() => window.open("https://github.com/farhanic017/map-to-glb")}
          >
            GitHub
          </NavButton>
          <NavButton isShow={step >= 1} onClick={() => setOpenModal(true)}>
            Options
          </NavButton>
        </div>
      </div>

      <Modal
        isOpen={openModal}
        isScroll={true}
        onClose={() => setOpenModal(false)}
      >
        <Column gap="1rem">
          <Title>Options </Title>
          <Description>Scene generation controls</Description>

          <div css={optionSection}>
            <div css={sectionTitle}>
              <Cpu size={15} />
              Compute Runtime
            </div>
            <label css={labelStyle}>
              Processing
              <select
                css={fieldStyle}
                value={computeMode}
                onChange={(event) =>
                  setComputeMode(event.target.value as ComputeMode)
                }
              >
                <option value="local">Local machine</option>
                <option value="remote">Remote GPU server</option>
              </select>
            </label>
            {computeMode === "remote" && (
              <ProviderSelector
                selectedProviderId={selectedProviderId}
                onSelectProvider={handleSelectProvider}
              />
            )}
            <label css={labelStyle}>
              <span
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                })}
              >
                <Server size={15} />
                GPU Endpoint
              </span>
              <input
                css={fieldStyle}
                value={remoteEndpoint}
                placeholder="https://server"
                onChange={(event) => setRemoteEndpoint(event.target.value)}
              />
            </label>
            <label css={labelStyle}>
              API Key
              <input
                css={fieldStyle}
                type="password"
                value={remoteApiKey}
                placeholder="optional"
                onChange={(event) => setRemoteApiKey(event.target.value)}
              />
            </label>
            <label css={labelStyle}>
              <span
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                })}
              >
                <Bot size={15} />
                Agent Mode
              </span>
              <input
                type="checkbox"
                checked={agentMode}
                onChange={(event) => setAgentMode(event.target.checked)}
              />
            </label>
            <div
              css={css({
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#6b7280",
                fontSize: "12px",
                lineHeight: 1.35,
              })}
            >
              <Terminal size={14} />
              CLI, MCP, terminal, and IDE integrations use the same remote GPU
              endpoint contract.
            </div>
          </div>

          <div css={optionSection}>
            <div css={sectionTitle}>
              <Palette size={15} />
              Material
            </div>
            <label css={labelStyle}>
              Preset
              <select
                css={fieldStyle}
                value={materialPreset}
                onChange={(event) =>
                  setMaterialPreset(
                    event.target.value as BuildingMaterialPreset
                  )
                }
              >
                {materialOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label css={labelStyle}>
              <span
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                })}
              >
                <Image size={15} />
                Texture
              </span>
              <input
                type="checkbox"
                checked={textureEnabled}
                onChange={(event) => setTextureEnabled(event.target.checked)}
              />
            </label>
          </div>

          <div css={optionSection}>
            <div css={sectionTitle}>
              <Ruler size={15} />
              Height
            </div>
            <label css={labelStyle}>
              Scale
              <span
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                })}
              >
                <input
                  css={rangeStyle}
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.1"
                  value={heightScale}
                  onChange={(event) =>
                    setHeightScale(Number(event.target.value))
                  }
                />
                {heightScale.toFixed(1)}x
              </span>
            </label>
            <label css={labelStyle}>
              Default Height
              <input
                css={fieldStyle}
                type="number"
                min="1"
                max="200"
                value={defaultHeight}
                onChange={(event) =>
                  setDefaultHeight(Number(event.target.value))
                }
              />
            </label>
            <label css={labelStyle}>
              Level Height
              <input
                css={fieldStyle}
                type="number"
                min="1"
                max="10"
                step="0.1"
                value={levelHeight}
                onChange={(event) =>
                  setLevelHeight(Number(event.target.value))
                }
              />
            </label>
          </div>

          <div
            css={[
              optionSection,
              css({
                borderBottom: "none",
                paddingBottom: 0,
              }),
            ]}
          >
            <div css={sectionTitle}>
              <Mountain size={15} />
              Heightmap
            </div>
            <label css={labelStyle}>
              Terrain
              <input
                type="checkbox"
                checked={heightmapEnabled}
                onChange={(event) =>
                  setHeightmapEnabled(event.target.checked)
                }
              />
            </label>
            <label css={labelStyle}>
              Strength
              <span
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                })}
              >
                <input
                  css={rangeStyle}
                  type="range"
                  min="0"
                  max="12"
                  step="0.5"
                  value={heightmapStrength}
                  disabled={!heightmapEnabled}
                  onChange={(event) =>
                    setHeightmapStrength(Number(event.target.value))
                  }
                />
                {heightmapStrength.toFixed(1)}
              </span>
            </label>
          </div>
        </Column>
      </Modal>
    </>
  );
}

export function NavButton(props: ButtonProps) {
  return (
    <button
      css={css({
        color: "#25272c",
        backgroundColor: "rgba(0, 0, 0, 0.06)",
        backdropFilter: "blur(8px)",
        border: "1px solid #000000",
        padding: "0.5rem 1rem",
        borderRadius: "8px",
        fontWeight: "500",
        fontSize: "12px",
        [mq[0]]: { padding: "0.4rem 0.6rem", fontSize: "11px" },
        display: props.isShow ? "" : "none",
        cursor: "pointer",
        transition: "all 0.2s ease",
        whiteSpace: "nowrap",
        ":hover": {
          backgroundColor: "rgba(0, 0, 0, 0.12)",
        },
      })}
      {...props}
    >
      {props.children}
    </button>
  );
}
