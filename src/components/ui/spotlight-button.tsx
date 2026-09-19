"use client";

import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

interface SpotlightButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  /**
   * Inner color of the radial gradient (default: rgb(255,200,200))
   */
  innerColor?: string;
  /**
   * Outer color of the radial gradient (default: rgb(255,100,100))
   */
  outerColor?: string;
  /**
   * Hover inner color (default: rgb(200,220,255))
   */
  hoverInnerColor?: string;
  /**
   * Hover outer color (default: rgb(100,150,255))
   */
  hoverOuterColor?: string;
  /**
   * Color transition duration in seconds (default: 0.5)
   */
  colorDuration?: number;
}

export function SpotlightButton({ 
  children, 
  className = '', 
  innerColor = 'rgb(255,200,200)',
  outerColor = 'rgb(255,100,100)',
  hoverInnerColor = 'rgb(200,220,255)',
  hoverOuterColor = 'rgb(100,150,255)',
  colorDuration = 0.5,
  ...props 
}: SpotlightButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const gradientRef = useRef({
    innerColor,
    outerColor
  });

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const updateGradient = () => {
      if (!button) return;
      button.style.background = `radial-gradient(
        129% 99% at 112% 85%,
        ${gradientRef.current.innerColor} 20%,
        ${gradientRef.current.outerColor} 90%
      ),
      url("https://assets.codepen.io/16327/noise-e82662fe.png")`;
    };

    const handleMouseEnter = () => {
      gsap.to(gradientRef.current, {
        innerColor: hoverInnerColor,
        outerColor: hoverOuterColor,
        duration: colorDuration,
        onUpdate: updateGradient,
        ease: "power2.out"
      });
    };

    const handleMouseLeave = () => {
      gsap.to(gradientRef.current, {
        innerColor: innerColor,
        outerColor: outerColor,
        duration: colorDuration,
        onUpdate: updateGradient,
        ease: "power2.out"
      });
    };

    button.addEventListener('mouseenter', handleMouseEnter);
    button.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      button.removeEventListener('mouseenter', handleMouseEnter);
      button.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [innerColor, outerColor, hoverInnerColor, hoverOuterColor, colorDuration]);

  return (
    <button
      ref={buttonRef}
      className={`px-6 py-3 cursor-pointer rounded-full font-medium text-white transition-transform duration-300 hover:scale-105 active:scale-95 ${className}`}
      style={{
        background: `radial-gradient(
      129% 99% at 112% 85%,
      ${innerColor} 20%,
      ${outerColor} 90%
    ),
    url("https://assets.codepen.io/16327/noise-e82662fe.png")`,
        backgroundBlendMode: "color-dodge",
      }}
      {...props}
    >
      {children}
    </button>
  );
}
