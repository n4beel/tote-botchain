import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  const isBusy = loading;

  const padStyle = size === "sm"
    ? "px-3 py-1 text-xs"
    : size === "lg"
    ? "px-6 py-3 text-base"
    : "px-4 py-2 text-sm";

  let colorStyle = "bg-[var(--accent)] text-[var(--accent-ink)] border-2 border-[var(--border-strong)] hover:brightness-105 active:translate-y-0.5 shadow-[2px_2px_0px_var(--text-primary)]";
  if (variant === "secondary") {
    colorStyle = "bg-[var(--bg-surface)] text-[var(--text-primary)] border-2 border-[var(--border-strong)] hover:bg-[var(--bg-elevated)] active:translate-y-0.5";
  } else if (variant === "danger") {
    colorStyle = "bg-[var(--danger)] text-white border-2 border-[var(--border-strong)] hover:brightness-110 active:translate-y-0.5 shadow-[2px_2px_0px_var(--text-primary)]";
  } else if (variant === "ghost") {
    colorStyle = "bg-transparent text-[var(--text-primary)] border-2 border-transparent hover:bg-[var(--bg-elevated)]";
  }

  return (
    <button
      disabled={disabled || isBusy}
      className={`inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${padStyle} ${colorStyle} ${className}`}
      {...props}
    >
      {isBusy && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      <span>{children}</span>
    </button>
  );
}

export default Button;
