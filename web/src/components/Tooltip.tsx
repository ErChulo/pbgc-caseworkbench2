import { useState, type ReactNode } from "react";

export function Tooltip({
  content,
  children,
}: {
  readonly content: string;
  readonly children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={() => { setVisible(true); }}
      onMouseLeave={() => { setVisible(false); }}
      onFocus={() => { setVisible(true); }}
      onBlur={() => { setVisible(false); }}
    >
      {children}
      {visible && (
        <span className="tooltip" role="tooltip">
          {content}
        </span>
      )}
    </span>
  );
}
