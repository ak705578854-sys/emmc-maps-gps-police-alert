import React, { useState } from "react";
import LiveMap from "./LiveMap";
import TrafficPoliceTracker from "./TrafficPoliceTracker";

export default function App() {
  // Police GPS dashboard is the first screen. The map opens only after
  // Enable Mobile Alerts + START LIVE GPS + first real GPS fix.
  const [mapOpen, setMapOpen] = useState(false);
  const [logoutNonce, setLogoutNonce] = useState(0);

  const openMap = () => setMapOpen(true);

  const stopGPSAndReturn = () => {
    setMapOpen(false);
  };

  const logoutToLogin = () => {
    setMapOpen(false);
    setLogoutNonce((n) => n + 1);
  };

  return (
    <main className="app">
      <header>
        <h1>{mapOpen ? "🚑 EMMC — Maps + GPS" : "🚔 Traffic Police GPS"}</h1>
        <p>{mapOpen ? "Live Ambulance Tracking & Police Traffic Alert" : "Authorized Traffic Police Login & Live GPS Dashboard"}</p>
      </header>

      {/* Keep the police component mounted while the map is open so its
          live GPS watch, socket connection and push subscription remain active. */}
      <div style={{ display: mapOpen ? "none" : "block" }}>
        <TrafficPoliceTracker
          onStartMap={openMap}
          mapOpen={mapOpen}
          logoutNonce={logoutNonce}
        />
      </div>

      {mapOpen && (
        <LiveMap
          onStopGPS={stopGPSAndReturn}
          onLogout={logoutToLogin}
        />
      )}
    </main>
  );
}
