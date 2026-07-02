import { css } from "@emotion/react";

export function Column({
  children,
  gap = "0.25rem",
  justify = "unset",
  height = "auto",
}: {
  children?: React.ReactNode;
  gap?: string;
  justify?: string;
  height?: string;
}) {
  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "column",
        gap: gap,
        justifyContent: justify,
        height: height,
      })}
    >
      {children}
    </div>
  );
}
