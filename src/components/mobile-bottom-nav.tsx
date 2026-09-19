"use client";

import type { ReactNode } from "react";

export type MobileBottomNavItem = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
};

export function MobileBottomNav({
  items,
  ariaLabel = "Mobile navigation",
  className = "",
}: {
  items: MobileBottomNavItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav className={`mobile-bottom-nav ${className}`.trim()} aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`mobile-bottom-nav__item ${item.active ? "is-active" : ""}`}
          aria-current={item.active ? "page" : undefined}
          aria-label={item.label}
          disabled={item.disabled}
          onClick={item.onClick}
        >
          <span className="mobile-bottom-nav__icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
