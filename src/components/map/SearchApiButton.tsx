import { css } from "@emotion/react";
import { useState, useRef, useEffect } from "react";
import { Search, Plus, Trash2, GripVertical, X, Check } from "lucide-react";
import {
  searchProviders,
  getConfiguredApis,
  addApiConfig,
  removeApiConfig,
  updateApiConfigPriority,
  StoredApiConfig,
} from "@/services/searchApis";

const IconSize = css({ width: "14px", height: "14px" });

export function SearchApiButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [configs, setConfigs] = useState<StoredApiConfig[]>(getConfiguredApis);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConfigs(getConfiguredApis());
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowAddForm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAdd = () => {
    if (!selectedProvider || !apiKey.trim()) return;
    addApiConfig({
      providerId: selectedProvider,
      apiKey: apiKey.trim(),
      priority: configs.length,
      enabled: true,
    });
    setConfigs(getConfiguredApis());
    setSelectedProvider("");
    setApiKey("");
    setShowAddForm(false);
  };

  const handleRemove = (providerId: string) => {
    removeApiConfig(providerId);
    setConfigs(getConfiguredApis());
  };

  const handleToggle = (providerId: string) => {
    const config = configs.find((c) => c.providerId === providerId);
    if (config) {
      addApiConfig({ ...config, enabled: !config.enabled });
      setConfigs(getConfiguredApis());
    }
  };

  const unconfiguredProviders = searchProviders.filter(
    (p) => !configs.find((c) => c.providerId === p.id)
  );

  return (
    <div ref={dropdownRef} css={css({ position: "relative" })}>
      <button
        css={buttonStyle}
        onClick={() => setIsOpen(!isOpen)}
        title="Configure search APIs for building images"
        type="button"
      >
        <Search css={IconSize} />
      </button>

      {isOpen && (
        <div css={dropdownStyle}>
          <div css={headerStyle}>
            <span>Search APIs</span>
            <button css={closeButtonStyle} onClick={() => setIsOpen(false)}>
              <X size={14} />
            </button>
          </div>

          <div css={listStyle}>
            {configs.length === 0 && !showAddForm && (
              <div css={emptyStyle}>No APIs configured. Add one below.</div>
            )}

            {configs.map((config) => {
              const provider = searchProviders.find((p) => p.id === config.providerId);
              if (!provider) return null;
              return (
                <div key={config.providerId} css={apiItemStyle}>
                  <div css={apiInfoStyle}>
                    <div css={apiNameStyle}>{provider.name}</div>
                    <div css={apiDescStyle}>
                      {config.usageCount} uses | Priority: {config.priority + 1}
                    </div>
                  </div>
                  <div css={apiActionsStyle}>
                    <button
                      css={toggleStyle(config.enabled)}
                      onClick={() => handleToggle(config.providerId)}
                      title={config.enabled ? "Disable" : "Enable"}
                    >
                      {config.enabled ? <Check size={12} /> : <X size={12} />}
                    </button>
                    <button
                      css={deleteButtonStyle}
                      onClick={() => handleRemove(config.providerId)}
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {showAddForm ? (
            <div css={addFormStyle}>
              <select
                css={selectStyle}
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                <option value="">Select provider...</option>
                {unconfiguredProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                css={inputStyle}
                type="password"
                placeholder="API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <div css={addFormActionsStyle}>
                <button css={cancelButtonStyle} onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
                <button css={addButtonStyle} onClick={handleAdd}>
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button css={addNewButtonStyle} onClick={() => setShowAddForm(true)}>
              <Plus size={14} />
              Add API
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const buttonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2.25rem",
  height: "2.25rem",
  padding: 0,
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "10px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
  cursor: "pointer",
  transition: "all 0.2s ease",
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
});

const dropdownStyle = css({
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: "0.35rem",
  width: "18rem",
  backgroundColor: "rgba(255, 255, 255, 0.9)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.5)",
  borderRadius: "12px",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
  overflow: "hidden",
  zIndex: 10001,
  animation: "dropdownFadeIn 0.15s ease",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0.6rem 0.75rem",
  borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
  fontSize: "13px",
  fontWeight: 600,
  color: "#1e293b",
});

const closeButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.25rem",
  height: "1.25rem",
  border: "none",
  backgroundColor: "transparent",
  color: "#6b7280",
  cursor: "pointer",
  borderRadius: "4px",
  ":hover": { backgroundColor: "rgba(0, 0, 0, 0.05)" },
});

const listStyle = css({
  maxHeight: "12rem",
  overflowY: "auto",
  padding: "0.25rem",
});

const emptyStyle = css({
  padding: "1rem",
  textAlign: "center",
  color: "#9ca3af",
  fontSize: "12px",
});

const apiItemStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0.5rem 0.5rem",
  borderRadius: "6px",
  ":hover": { backgroundColor: "rgba(0, 0, 0, 0.03)" },
});

const apiInfoStyle = css({ flex: 1, minWidth: 0 });

const apiNameStyle = css({
  fontSize: "12px",
  fontWeight: 600,
  color: "#1e293b",
});

const apiDescStyle = css({
  fontSize: "10px",
  color: "#9ca3af",
});

const apiActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
});

const toggleStyle = (active: boolean) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.25rem",
    height: "1.25rem",
    border: "none",
    borderRadius: "4px",
    backgroundColor: active ? "#dcfce7" : "#f3f4f6",
    color: active ? "#16a34a" : "#9ca3af",
    cursor: "pointer",
    ":hover": { backgroundColor: active ? "#bbf7d0" : "#e5e7eb" },
  });

const deleteButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.25rem",
  height: "1.25rem",
  border: "none",
  borderRadius: "4px",
  backgroundColor: "transparent",
  color: "#9ca3af",
  cursor: "pointer",
  ":hover": { backgroundColor: "#fef2f2", color: "#ef4444" },
});

const addNewButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.35rem",
  width: "100%",
  padding: "0.5rem",
  border: "none",
  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
  backgroundColor: "transparent",
  color: "#3b82f6",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
  ":hover": { backgroundColor: "rgba(59, 130, 246, 0.05)" },
});

const addFormStyle = css({
  padding: "0.5rem 0.75rem",
  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
});

const selectStyle = css({
  width: "100%",
  padding: "0.4rem 0.5rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "12px",
  outline: "none",
});

const inputStyle = css({
  width: "100%",
  padding: "0.4rem 0.5rem",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "12px",
  outline: "none",
});

const addFormActionsStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.35rem",
});

const cancelButtonStyle = css({
  padding: "0.3rem 0.6rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  backgroundColor: "#ffffff",
  fontSize: "11px",
  cursor: "pointer",
});

const addButtonStyle = css({
  padding: "0.3rem 0.6rem",
  border: "none",
  borderRadius: "4px",
  backgroundColor: "#3b82f6",
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: 500,
  cursor: "pointer",
  ":hover": { backgroundColor: "#2563eb" },
});
