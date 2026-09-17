import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, localStorageColorSchemeManager } from "@mantine/core";
import "@mantine/core/styles.css";
import "./global.css";
import { Provider } from "react-redux";
import { store } from "./store";
import { theme } from "./theme";
import App from "./App";

// Type faces (ui-plan §2): display, body, and mono for measured numbers.
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

const rootElement = document.getElementById("root")!;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <MantineProvider
        theme={theme}
        defaultColorScheme="light"
        // Color scheme choice is persisted across reloads (plan §4).
        colorSchemeManager={localStorageColorSchemeManager({
          key: "spool-tracker:color-scheme",
        })}
      >
        <App />
      </MantineProvider>
    </Provider>
  </React.StrictMode>,
);
