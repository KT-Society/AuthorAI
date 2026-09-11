/**
 * Entry point for the React app. Sets up the MUI dark theme and mounts the
 * App component into the root element. Referenced from `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import App from "./App";
import "./index.css";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#00f2ff", // Neon Cyan
    },
    secondary: {
      main: "#ff00db", // Cyber Magenta
    },
    background: {
      default: "#0a0b10",
      paper: "rgba(255, 255, 255, 0.05)",
    },
  },
  typography: {
    fontFamily: '"Outfit", "Inter", "system-ui", sans-serif',
  },
});

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);

// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
(import.meta.hot.data.root ??= createRoot(elem)).render(app);
