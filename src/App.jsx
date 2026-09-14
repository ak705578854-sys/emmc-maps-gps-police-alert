import React, { useState } from "react";
import LiveMap from "./LiveMap";
import TrafficPoliceTracker from "./TrafficPoliceTracker";

export default function App() {
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
        <h1>
          {mapOpen ? "🚑 EMMC — Maps + GPS" : "🚔 Traffic Police GPS"}
        </h1>

        <p>
          {mapOpen
            ? "Live Ambulance Tracking & Police Traffic Alert"
            : "Authorized Traffic Police Login & Live GPS Dashboard"}
        </p>
      </header>

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
