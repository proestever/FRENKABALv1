import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Import Ethereum shim to prevent console errors
import "./utils/ethereum-shim";

// Global error handler for unhandled rejections
window.addEventListener('unhandledrejection', (event) => {
  // Prevent console error for unhandled rejections
  event.preventDefault();
  
  // Silently handle these errors in production
  // In development, you might want to log them
  if (process.env.NODE_ENV !== 'production') {
    console.debug('Unhandled promise rejection handled by global handler');
  }
});

createRoot(document.getElementById("root")!).render(<App />);
