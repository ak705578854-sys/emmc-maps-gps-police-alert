import React, { useState } from "react";
import LiveMap from "./LiveMap";
import TrafficPoliceTracker from "./TrafficPoliceTracker";

export default function App() {
  const [role, setRole] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [logoutNonce, setLogoutNonce] = useState(0);

  const openMap = () => {
    setMapOpen(true);
  };

  const stopGPSAndReturn = () => {
    setMapOpen(false);
  };

  const logoutToLogin = () => {
    setMapOpen(false);
    setRole(null);
    setLogoutNonce((n) => n + 1);
  };

  // POLICE DASHBOARD + MAP
  if (role === "police") {
    return (
      <main className="app">
        <header>
          <h1>🚔 EMMC — Traffic Police</h1>
          <p>
            Authorized Police Login • Real GPS • 1 KM Ambulance Alert
          </p>
        </header>

        {!mapOpen ? (
          <TrafficPoliceTracker
            onStartMap={openMap}
            mapOpen={mapOpen}
            logoutNonce={logoutNonce}
          />
        ) : (
          <LiveMap
            onStopGPS={stopGPSAndReturn}
            onLogout={logoutToLogin}
          />
        )}
      </main>
    );
  }

  // ONLY POLICE LOGIN
  return (
    <main className="app">
      <header>
        <h1>🚨 EMMC Emergency GPS System</h1>
        <p>Authorized Traffic Police Access</p>
      </header>

      <section
        style={{
          maxWidth: "520px",
          margin: "24px auto",
          display: "grid",
          gap: "18px",
        }}
      >
        <div
          style={{
            background: "#fff",
            padding: "22px",
            borderRadius: "16px",
            boxShadow: "0 4px 20px rgba(0,0,0,.12)",
          }}
        >
          <h2>🚔 Traffic Police Login</h2>

          <p>
            Police ID login opens only the Traffic Police dashboard.
          </p>

          <button
            onClick={() => setRole("police")}
            style={{
              width: "100%",
              padding: "13px",
              border: 0,
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Open Traffic Police Login
          </button>
        </div>
      </section>
    </main>
  );
}
