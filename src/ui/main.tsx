import { studioBuild } from "../shared/build";
document.documentElement.dataset.studioBuild = studioBuild;
document.documentElement.dataset.assetCategories = "usage-v1";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@xyflow/react/dist/style.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
