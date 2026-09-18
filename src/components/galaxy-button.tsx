import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type GalaxyButtonVariant = "default" | "violet" | "light" | "outline";
export type GalaxyButtonSize = "sm" | "md" | "lg";

type StarConfig = {
  duration: number;
  delay: number;
  alpha: number;
  size: number;
  distance: number;
};

const ORBIT_STARS: StarConfig[] = [
  { duration: 8, delay: 1, alpha: .75, size: 2, distance: 56 },
  { duration: 11, delay: 4, alpha: .55, size: 3, distance: 70 },
  { duration: 14, delay: 2, alpha: .8, size: 2, distance: 84 },
  { duration: 18, delay: 7, alpha: .48, size: 4, distance: 98 },
  { duration: 9, delay: 5, alpha: .65, size: 2, distance: 110 },
  { duration: 16, delay: 8, alpha: .7, size: 3, distance: 122 },
  { duration: 20, delay: 1, alpha: .45, size: 4, distance: 136 },
  { duration: 12, delay: 6, alpha: .8, size: 2, distance: 148 },
  { duration: 17, delay: 3, alpha: .52, size: 3, distance: 160 },
  { duration: 10, delay: 9, alpha: .68, size: 2, distance: 172 },
  { duration: 19, delay: 5, alpha: .5, size: 4, distance: 184 },
  { duration: 13, delay: 2, alpha: .72, size: 2, distance: 194 },
];

const STATIC_STARS = [
  { duration: 7, delay: 1, alpha: .9, size: 3, distance: 0 },
  { duration: 10, delay: 4, alpha: .9, size: 2, distance: 0 },
  { duration: 13, delay: 7, alpha: .9, size: 3, distance: 0 },
  { duration: 16, delay: 2, alpha: .9, size: 2, distance: 0 },
];

function starStyle(star: StarConfig | (typeof STATIC_STARS)[number]): CSSProperties {
  return {
    "--duration": star.duration,
    "--delay": star.delay,
    "--alpha": star.alpha,
    "--size": star.size,
    "--distance": star.distance,
  } as CSSProperties;
}

export function GalaxyButton({
  label = "Explore",
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: ReactNode;
  variant?: GalaxyButtonVariant;
  size?: GalaxyButtonSize;
}) {
  return (
    <span className={cn("galaxy-button", `galaxy-button--${variant}`, `galaxy-button--${size}`)}>
      <button
        {...props}
        type={type}
        className={cn("galaxy-button__trigger", className)}
        aria-label={props["aria-label"] ?? (typeof label === "string" ? label : undefined)}
      >
        <span className="galaxy-button__spark" aria-hidden="true" />
        <span className="galaxy-button__backdrop" aria-hidden="true" />
        <span className="galaxy-button__container" aria-hidden="true">
          {STATIC_STARS.map((star, index) => <span key={`static-${index}`} className="galaxy-button__star galaxy-button__star--static" style={starStyle(star)} />)}
        </span>
        <span className="galaxy-button__galaxy" aria-hidden="true">
          <span className="galaxy-button__ring">
            {ORBIT_STARS.map((star, index) => <span key={`orbit-${index}`} className="galaxy-button__star" style={starStyle(star)} />)}
          </span>
        </span>
        <span className="galaxy-button__text">{label}</span>
      </button>
      <span className="galaxy-button__bodydrop" aria-hidden="true" />
    </span>
  );
}
