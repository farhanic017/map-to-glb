import { css } from "@emotion/react";
import { GPUProvider } from "@/providers/types";
import { ExternalLink, Cpu, Building2, Zap } from "lucide-react";

const cardStyle = css({
  padding: "0.75rem",
  borderRadius: "8px",
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  display: "grid",
  gap: "0.5rem",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
});

const nameStyle = css({
  fontSize: "14px",
  fontWeight: 600,
  color: "#1e293b",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
});

const badgeStyle = (cost: string) =>
  css({
    fontSize: "11px",
    fontWeight: 600,
    padding: "0.15rem 0.5rem",
    borderRadius: "999px",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    backgroundColor:
      cost === "free"
        ? "#dcfce7"
        : cost === "low"
        ? "#dbeafe"
        : cost === "medium"
        ? "#fef3c7"
        : "#fee2e2",
    color:
      cost === "free"
        ? "#166534"
        : cost === "low"
        ? "#1e40af"
        : cost === "medium"
        ? "#92400e"
        : "#991b1b",
  });

const descriptionStyle = css({
  fontSize: "12px",
  color: "#64748b",
  lineHeight: 1.4,
  margin: 0,
});

const setupSectionStyle = css({
  padding: "0.5rem",
  borderRadius: "6px",
  backgroundColor: "#eff6ff",
  border: "1px solid #bfdbfe",
});

const setupTitleStyle = css({
  fontSize: "12px",
  fontWeight: 600,
  color: "#1e40af",
  margin: "0 0 0.35rem 0",
});

const stepsStyle = css({
  fontSize: "11px",
  color: "#1e3a5f",
  margin: "0 0 0.5rem 1.25rem",
  padding: 0,
  lineHeight: 1.5,
});

const openButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.4rem 0.75rem",
  borderRadius: "6px",
  border: "none",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "0.2s",
  ":hover": {
    backgroundColor: "#1d4ed8",
  },
});

const linkStyle = css({
  color: "#2563eb",
  fontSize: "12px",
  textDecoration: "none",
  ":hover": {
    textDecoration: "underline",
  },
});

const infoRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "11px",
  color: "#64748b",
});

const IconSize = css({
  width: "12px",
  height: "12px",
});

export function ProviderCard({ provider }: { provider: GPUProvider }) {
  return (
    <div css={cardStyle}>
      <div css={headerStyle}>
        <span css={nameStyle}>
          <Cpu css={IconSize} />
          {provider.name}
        </span>
        <span css={badgeStyle(provider.estimatedCost)}>
          {provider.estimatedCost}
        </span>
      </div>

      <p css={descriptionStyle}>{provider.description}</p>

      {provider.type === "notebook" && (
        <div css={setupSectionStyle}>
          <p css={setupTitleStyle}>Setup Instructions:</p>
          <ol css={stepsStyle}>
            <li>Open the notebook in {provider.name}</li>
            <li>Enable GPU runtime (Runtime → Change runtime type → GPU)</li>
            <li>Run all cells</li>
            <li>Copy the ngrok URL from the output</li>
            <li>Paste the URL in the GPU Endpoint field above</li>
          </ol>
          {provider.notebookUrl && (
            <button
              css={openButtonStyle}
              onClick={() => window.open(provider.notebookUrl, "_blank")}
            >
              <ExternalLink css={IconSize} />
              Open Notebook
            </button>
          )}
        </div>
      )}

      {provider.type === "serverless" && provider.setupUrl && (
        <div css={setupSectionStyle}>
          <p css={setupTitleStyle}>Setup:</p>
          <a
            href={provider.setupUrl}
            target="_blank"
            rel="noopener noreferrer"
            css={linkStyle}
          >
            Create account at {provider.name} →
          </a>
        </div>
      )}

      <div css={infoRowStyle}>
        <Zap css={IconSize} />
        <span>GPUs: {provider.gpuTypes.join(", ")}</span>
      </div>

      <div css={infoRowStyle}>
        <Building2 css={IconSize} />
        <span>Max buildings: {provider.maxBuildings.toLocaleString()}</span>
      </div>
    </div>
  );
}
