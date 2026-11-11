import React from 'react';

/**
 * pixOS loading mark: the two capsules of the heart "breathe" while a thin
 * ring turns slowly (same drawing as @pixos/kit PixosLoader). Motion stops
 * with prefers-reduced-motion.
 */
export function PixosLoaderMark({ className = '', size = 56 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="-20 -20 225 203"
      width={size * 1.2}
      height={size * 1.1}
      className={`px-loader-mark ${className}`}
      aria-hidden
    >
      <circle
        className="px-loader-ring"
        cx="92.4"
        cy="81.5"
        r="98"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g transform="matrix(0.707107 -0.707107 -0.707107 -0.707107 92.426 163.137)">
        <path
          className="px-loader-back"
          d="M7,0 L110,0 A50,50 0 0 1 110,100 L100,100 L100,110 A50,50 0 0 1 0,110 L0,7 Q0,0 7,0 Z"
        />
        <path
          className="px-loader-front"
          d="M30,0 L110,0 A50,50 0 0 1 110,100 L58,100 Q30,100 30,72 Z"
        />
      </g>
    </svg>
  );
}

export default PixosLoaderMark;
