
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const rootEl = document.getElementById("root");

if (!rootEl) {
  document.body.innerHTML = "<h1 style='color:white;background:black;padding:20px'>Root element missing</h1>";
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
