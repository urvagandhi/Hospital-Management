/**
 * Skeleton Loader Component
 * Animated loading placeholders
 */

import React from "react";

interface SkeletonLoaderProps {
  count?: number;
  height?: string;
  className?: string;
  variant?: "text" | "card" | "circle";
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ count = 1, height = "h-12", className = "", variant = "text" }) => {
  const getVariantClasses = () => {
    switch (variant) {
      case "card":
        return "h-64 w-full";
      case "circle":
        return "h-12 w-12 rounded-full";
      default:
        return height;
    }
  };

  const baseClasses = `bg-gray-200 rounded-lg mb-4 animate-pulse ${className}`;
  const variantClasses = getVariantClasses();

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={`${baseClasses} ${variantClasses}`} />
      ))}
    </>
  );
};

export default SkeletonLoader;
