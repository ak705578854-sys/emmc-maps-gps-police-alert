// EMMC backend configuration.
// Set VITE_BACKEND_URL in .env for your deployed backend, for example:
// VITE_BACKEND_URL=https://your-emmc-backend.onrender.com
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");
export const AMBULANCE_ID = "AMB102";
export const AUTHORIZED_POLICE_ID = "TP001";
export const POLICE_ALERT_RADIUS_KM = 1;
