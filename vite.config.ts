import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages at https://ncheewee.github.io/rocky-dashboard/ -> base must be the repo path.
// The car PNG and the data JSON are imported from src/, so Vite rewrites/bundles them under this base.
export default defineConfig({ plugins: [react()], base: "/rocky-dashboard/" });
