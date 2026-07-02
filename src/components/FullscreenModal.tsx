import { css } from "@emotion/react";
import React from "react";

export function FullscreenModal({
  children,
  isOpen = false,
  fullScreen = false,
}: {
  children: React.ReactNode;
  isOpen?: boolean;
  fullScreen?: boolean;
}) {
  return (
    <div
      css={css({
        width: "100%",
        height: "100%",
        position: "fixed",
        zIndex: 999,
        backgroundColor: fullScreen ? "#ffffff" : "#ffffffc9",
        backdropFilter: fullScreen ? "none" : "blur(12px)",
        display: isOpen ? "flex" : "none",
        flexDirection: "column",
      })}
    >
      <div
        css={css({
          padding: fullScreen ? "0 0.75rem 0.75rem 0.75rem" : "2rem",
          paddingTop: fullScreen ? "3.25rem" : "4rem",
          width: "100%",
          flex: fullScreen ? 1 : "none",
          minHeight: 0,
          boxSizing: "border-box",
        })}
      >
        {children}
      </div>
    </div>
  );
}
