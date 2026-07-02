import { css } from "@emotion/react";
import { GPUProvider } from "@/providers/types";
import { getProviders } from "@/providers/registry";
import { ProviderCard } from "./ProviderCard";
import { Server, ChevronDown } from "lucide-react";
import { useState } from "react";

const containerStyle = css({
  display: "grid",
  gap: "0.5rem",
});

const selectWrapperStyle = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
});

const selectStyle = css({
  width: "100%",
  height: "2.25rem",
  boxSizing: "border-box",
  padding: "0 2rem 0 0.75rem",
  border: "1px solid #dddfe5",
  borderRadius: "6px",
  backgroundColor: "#f7f8fa",
  color: "#25272c",
  fontSize: "13px",
  appearance: "none",
  cursor: "pointer",
  outline: "none",
  ":focus": {
    borderColor: "#2563eb",
  },
});

const chevronStyle = css({
  position: "absolute",
  right: "0.5rem",
  pointerEvents: "none",
  color: "#64748b",
});

const labelStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  color: "#5b5d63",
  fontSize: "13px",
});

interface ProviderSelectorProps {
  selectedProviderId: string | null;
  onSelectProvider: (providerId: string | null) => void;
}

export function ProviderSelector({
  selectedProviderId,
  onSelectProvider,
}: ProviderSelectorProps) {
  const providers = getProviders();
  const [showCard, setShowCard] = useState(false);

  const groupedProviders = providers.reduce<
    Record<string, GPUProvider[]>
  >((acc, provider) => {
    const group =
      provider.type === "notebook"
        ? "Free Notebooks"
        : provider.type === "serverless"
        ? "Serverless GPU"
        : "Dedicated GPU";
    if (!acc[group]) acc[group] = [];
    acc[group].push(provider);
    return acc;
  }, {});

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  return (
    <div css={containerStyle}>
      <label css={labelStyle}>
        <span
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          })}
        >
          <Server size={15} />
          GPU Provider
        </span>
      </label>

      <div css={selectWrapperStyle}>
        <select
          css={selectStyle}
          value={selectedProviderId || ""}
          onChange={(e) => {
            const value = e.target.value || null;
            onSelectProvider(value);
            setShowCard(!!value);
          }}
        >
          <option value="">Select provider...</option>
          {Object.entries(groupedProviders).map(([group, groupProviders]) => (
            <optgroup key={group} label={group}>
              {groupProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.estimatedCost})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown css={chevronStyle} size={16} />
      </div>

      {selectedProvider && showCard && (
        <ProviderCard provider={selectedProvider} />
      )}
    </div>
  );
}
