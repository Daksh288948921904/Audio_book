import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import CMSApp from "./cms/CMSApp";
import "./index.css";
import "./App.css";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const isCMS = window.location.pathname.startsWith("/cms");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      {isCMS ? <CMSApp /> : <App />}
    </GoogleOAuthProvider>
  </React.StrictMode>
);
