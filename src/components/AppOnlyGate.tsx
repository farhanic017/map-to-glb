import { css } from "@emotion/react";
import { MonitorCog, Terminal } from "lucide-react";
import { Column } from "./flex/Column";
import { Title } from "./text/Title";
import { Description } from "./text/Description";

export function AppOnlyGate() {
  return (
    <main
      css={css({
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        backgroundColor: "#f5f6f8",
        color: "#24262b",
      })}
    >
      <section
        css={css({
          width: "min(100%, 34rem)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          backgroundColor: "#ffffff",
          border: "1px solid #e0e3e8",
          borderRadius: "8px",
          padding: "1.5rem",
          boxShadow: "0 16px 40px rgba(28, 32, 38, 0.08)",
        })}
      >
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: "#2f6fed",
          })}
        >
          <MonitorCog size={22} />
          <Terminal size={21} />
        </div>

        <Column gap="0.5rem">
          <Title>Map3D is now app-first</Title>
          <Description>
            The public website build is being phased out. Use the desktop app,
            CLI, MCP server, terminal, or IDE integration for full agent and
            remote GPU processing support.
          </Description>
        </Column>
      </section>
    </main>
  );
}
