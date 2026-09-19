import React, { useState } from "react";
import LiveMap from "./LiveMap";
import TrafficPoliceTracker from "./TrafficPoliceTracker";

function getAmbulanceIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = (params.get("ambulanceId") || "").trim().toUpperCase();
    if (/^AMB[A-Z0-9_-]+$/.test(id)) return id;
  } catch {}
  return "";
}

export default function App() {
  const [policeMode, setPoliceMode] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [logoutNonce, setLogoutNonce] = useState(0);
  const [policeLocation, setPoliceLocation] = useState(null);
  const ambulanceId = getAmbulanceIdFromUrl();

  // Ambulance URL mode is kept separate from Police login.
  // Example: ?ambulanceId=AMB102
  if (ambulanceId) {
    return (
      <main className="app">
        <header>
          <h1>🚑 EMMC — Ambulance GPS</h1>
          <p>Ambulance {ambulanceId} • Real Device GPS Tracking</p>
        </header>
        <LiveMap
          ambulanceMode={true}
          gpsEnabled={true}
          ambulanceId={ambulanceId}
          onStopGPS={() => {}}
          onLogout={() => {}}
        />
      </main>
    );
  }

  const handleStartMap = () => setMapOpen(true);

  const handleStopMap = () => {
    setMapOpen(false);
  };

  const handlePoliceLogout = () => {
    setMapOpen(false);
    setLogoutNonce((n) => n + 1);
  };

  if (policeMode) {
    return (
      <main className="app">
        <header>
          <h1>🚔 EMMC — Traffic Police</h1>
          <p>Authorized Police Login • Real GPS • Live Ambulance Distance • 1 KM Alert</p>
        </header>

        {/* Keep the tracker mounted while the map is open so its REAL police GPS
            continues sending to the shared EMMC backend. */}
        <div style={{ display: mapOpen ? "none" : "block" }}>
          <TrafficPoliceTracker
            onStartMap={handleStartMap}
            onPoliceLocationChange={setPoliceLocation}
            mapOpen={mapOpen}
            logoutNonce={logoutNonce}
          />
        </div>

        {mapOpen && (
          <LiveMap
            ambulanceMode={false}
            gpsEnabled={false}
            onStopGPS={handleStopMap}
            onLogout={handlePoliceLogout}
            policeLocation={policeLocation}
            policeLive={!!policeLocation}
          />
        )}

        {!mapOpen && (
          <button
            onClick={() => setPoliceMode(false)}
            style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}
          >
            ← Back to Police Login
          </button>
        )}
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <h1>🚔 EMMC — Traffic Police Login</h1>
        <p>Authorized Traffic Police • Real GPS • Emergency Traffic Alerts</p>
      </header>
      <section style={{ maxWidth: "520px", margin: "32px auto", background: "#fff", padding: "24px", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,.12)" }}>
        <h2>Traffic Police Access</h2>
        <p>Login with your authorized Police ID. Ambulance devices use their separate dashboard.</p>
        <button
          onClick={() => setPoliceMode(true)}
          style={{ width: "100%", padding: "13px", border: 0, borderRadius: "10px", cursor: "pointer", fontWeight: 700 }}
        >
          🚔 Open Traffic Police Login
        </button>
      </section>
    </main>
  );
}
