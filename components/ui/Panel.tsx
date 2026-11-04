import React from "react";

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: React.ReactNode;
  action?: React.ReactNode;
  shadow?: boolean;
}

export function Panel({
  heading,
  action,
  shadow = true,
  children,
  className = "",
  ...props
}: PanelProps) {
  return (
    <div
      className={`bg-[var(--bg-surface)] text-[var(--text-primary)] border-2 border-[var(--border-strong)] ${
        shadow ? "shadow-[4px_4px_0px_#04141F]" : ""
      } ${className}`}
      {...props}
    >
      {(heading || action) && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-[var(--bg-elevated)] border-b-2 border-[var(--border-strong)]">
          {heading && <div className="text-sm font-black uppercase tracking-wider">{heading}</div>}
          {action && <div className="text-xs font-mono">{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export default Panel;
