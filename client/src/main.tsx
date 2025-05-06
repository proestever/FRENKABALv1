import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Import Ethereum shim to prevent console errors
import "./utils/ethereum-shim";

createRoot(document.getElementById("root")!).render(<App />);
