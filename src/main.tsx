import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

declare global {
  interface Window {
    twemoji: {
      parse: (node: HTMLElement, options?: Record<string, unknown>) => void;
    };
  }
}

// Parse emojis globally with Twemoji after every DOM update
const observer = new MutationObserver(() => {
  if (window.twemoji) {
    window.twemoji.parse(document.body, {
      folder: 'svg',
      ext: '.svg',
    });
  }
});

createRoot(document.getElementById("root")!).render(<App />);

// Start observing after initial render
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial parse
if (window.twemoji) {
  window.twemoji.parse(document.body, {
    folder: 'svg',
    ext: '.svg',
  });
}
