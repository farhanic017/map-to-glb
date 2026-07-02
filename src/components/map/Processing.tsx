import { css, keyframes } from "@emotion/react";
import { Loader2 } from "lucide-react";

export interface Building {
  id: number;
  tags: { [key: string]: string | undefined };
  geometry?: { lat: number; lng: number }[];
}

const spinAnimation = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

export function BuildingHeights({
  buildings,
  loading,
}: {
  buildings: Building[];
  loading: boolean;
}) {
  return (
    <div
      css={css({
        position: "relative",
      })}
    >
      {loading && (
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "#555",
          })}
        >
          <Loader2
            css={css({
              animation: `${spinAnimation} 1s linear infinite`,
            })}
            size={16}
          />
          Fetching map features...
        </div>
      )}
      <ul
        css={css({
          overflow: "scroll",
          zIndex: 999,
          position: "absolute",
          top: "1rem",
          height: "80vh",
        })}
      >
        {buildings.map((b) => (
          <li key={b.id}>
            <div>Building {b.id}</div>
            <div>Height: {b.tags.height || "No height info"}</div>
            <div>Location/Shape:</div>
            {b.geometry ? (
              <ul>
                {b.geometry.map((pt, index) => (
                  <li key={index}>
                    ({pt.lat.toFixed(5)}, {pt.lng.toFixed(5)})
                  </li>
                ))}
              </ul>
            ) : (
              <div>No geometry info</div>
            )}
            <div>Other Tags: {JSON.stringify(b.tags)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
