import { css } from "@emotion/react";
import { ButtonHTMLAttributes, DetailedHTMLProps } from "react";

interface ButtonProps
  extends DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  isShow?: boolean;
}

const mq = "@media (max-width: 768px)";

const buttonStyle = css({
  position: "absolute",
  zIndex: 9999,
  bottom: "1.5rem",
  color: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.85)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(0, 0, 0, 0.1)",
  padding: "0.6rem 1rem",
  borderRadius: "10px",
  fontWeight: "500",
  fontSize: "13px",
  boxShadow: "0 2px 12px rgba(0, 0, 0, 0.1)",
  cursor: "pointer",
  transition: "all 0.2s ease",
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  [mq]: {
    bottom: "1rem",
    padding: "0.5rem 0.75rem",
    fontSize: "12px",
  },
  ":hover": {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
  },
  ":disabled": {
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    cursor: "not-allowed",
    opacity: 0.6,
  },
});

export function NextButton(props: ButtonProps) {
  return (
    <button
      css={css(buttonStyle, { right: "1rem" }, { [mq]: { right: "0.5rem" } })}
      style={{ display: props.isShow ? "flex" : "none" }}
      {...props}
    >
      {props.children}
    </button>
  );
}

export function PrevButton(props: ButtonProps) {
  return (
    <button
      css={css(buttonStyle, { right: "calc(1rem + 9rem)" }, { [mq]: { right: "calc(0.5rem + 7rem)" } })}
      style={{ display: props.isShow ? "flex" : "none" }}
      {...props}
    >
      {props.children}
    </button>
  );
}

export function Button(props: ButtonProps) {
  return (
    <button
      css={buttonStyle}
      style={{ position: "relative", display: props.isShow ? "flex" : "none" }}
      {...props}
    >
      {props.children}
    </button>
  );
}
