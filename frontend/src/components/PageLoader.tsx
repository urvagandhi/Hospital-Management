/**
 * PageLoader — consistent full-page loading treatment for authenticated
 * pages inside MainLayout. Keeps the Navbar visible above and fills the
 * remaining viewport with the same bg + primary ambient glow the loaded
 * pages use, so the transition feels seamless instead of dropping onto
 * an empty white canvas.
 */

import React from "react";
import Spinner from "./Spinner";

interface PageLoaderProps {
  label?: string;
}

const PageLoader: React.FC<PageLoaderProps> = ({ label }) => {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-surface-bg flex items-center justify-center overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-100/50 blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-3">
        <Spinner variant="heartbeat" size="lg" className="text-primary-600" />
        {label && (
          <p className="text-sm text-neutral-500 font-medium">{label}</p>
        )}
      </div>
    </div>
  );
};

export default PageLoader;
