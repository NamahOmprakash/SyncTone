import React, { useRef, useState, useCallback } from 'react';

/**
 * Interactive3DCard Component
 * Wraps novel catalog cards with hardware-accelerated 3D perspective tilt,
 * dynamic specular sheen, physical book depth, and smooth spring physics.
 */
export default function Interactive3DCard({
  children,
  className = '',
  style = {},
  onClick,
  onKeyDown,
  ariaLabel,
  ...rest
}) {
  const cardRef = useRef(null);
  const [transformStyle, setTransformStyle] = useState({
    transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
    glareX: 50,
    glareY: 50,
    glareOpacity: 0,
    transition: 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 400ms ease',
  });

  const handlePointerMove = useCallback((e) => {
    // Only apply dynamic 3D tilt on devices that support hover (not mobile touch screens)
    if (window.matchMedia('(hover: none)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const normX = x / rect.width - 0.5;
    const normY = y / rect.height - 0.5;

    // Subtle, controlled tilt angles (max ~10-12deg)
    const rotX = -normY * 12;
    const rotY = normX * 14;

    setTransformStyle({
      transform: `perspective(900px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateY(-4px) translateZ(10px)`,
      glareX: Math.round((x / rect.width) * 100),
      glareY: Math.round((y / rect.height) * 100),
      glareOpacity: 0.18,
      transition: 'transform 80ms ease-out', // Responsive tracking during mouse movement
    });
  }, []);

  const handlePointerLeave = useCallback(() => {
    // Smooth deceleration back to neutral rest position
    setTransformStyle({
      transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px) translateZ(0px)',
      glareX: 50,
      glareY: 50,
      glareOpacity: 0,
      transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 420ms ease',
    });
  }, []);

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      tabIndex={0}
      role="article"
      style={{
        ...style,
        transform: transformStyle.transform,
        transition: transformStyle.transition,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      className={`relative select-none ${className}`}
      {...rest}
    >
      {/* Specular Glare Overlay Layer */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none z-30 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at ${transformStyle.glareX}% ${transformStyle.glareY}%, rgba(255, 255, 255, ${transformStyle.glareOpacity}) 0%, transparent 60%)`,
          opacity: transformStyle.glareOpacity > 0 ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
}

