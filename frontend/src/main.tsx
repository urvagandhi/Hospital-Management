/**
 * React Application Entry Point
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Prevent console from clearing on HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log("[HMR] Hot module reload triggered");
  });
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
