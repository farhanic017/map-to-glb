import { css } from "@emotion/react";
import { DESC_COLOR } from "@/theme/color";

export function Description({ children }: { children?: React.ReactNode }) {
  return (
    <p
      css={css({
        margin: 0,
        color: DESC_COLOR,
        fontSize: "1rem",
        fontWeight: "400",
      })}
    >
      {children}
    </p>
  );
}
