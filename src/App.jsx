import React, { useState } from "react";
import LiveMap from "./LiveMap";
import TrafficPoliceTracker from "./TrafficPoliceTracker";

export default function App() {
  const [role, setRole] = useState(null);
  const [ambulanceId, setAmbulanceId] = useState("");
  const [ambulanceInput, setAmbulanceInput] = useState("");

  const ambulanceLogin = () => {
    const id = ambulanceInput.trim().toUpperCase();
    if (!id) return;
    localStorage.setItem("emmc_ambulance_id", id);
    setAmbulanceId(id);
    setRole("ambulance");
  };

  const ambulanceLogout = () => {
    localStorage.removeItem("emmc_ambulance_id");
    setAmbulanceId("");
    setRole(null);
  };

  if (role === "police") {
    return (
      <main className="app">
        <header>
          <h1>🚔 EMMC — Traffic Police</h1>
          <p>Authorized Police Login • Real GPS • 1 KM Ambulance Alert</p>
        </header>
        <TrafficPoliceTracker
          onStartMap={() => {}}
          mapOpen={false}
          logoutNonce={0}
        />
      </main>
    );
  }

  if (role === "ambulance") {
    return (
      <main className="app">
        <header>
          <h1>🚑 EMMC — Ambulance GPS</h1>
          <p>{ambulanceId} • Real Device GPS Tracking</p>
        </header>
        <LiveMap
          ambulanceId={ambulanceId}
          onStopGPS={ambulanceLogout}
          onLogout={ambulanceLogout}
        />
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <h1>🚨 EMMC Emergency GPS System</h1>
        <p>Choose your authorized role</p>
      </header>

      <section style={{maxWidth: "520px", margin: "24px auto", display: "grid", gap: "18px"}}>
        <div style={{background: "#fff", padding: "22px", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,.12)"}}>
          <h2>🚔 Traffic Police Login</h2>
          <p>Police ID login opens only the Traffic Police dashboard.</p>
          <button
            onClick={() => setRole("police")}
            style={{width: "100%", padding: "13px", border: 0, borderRadius: "10px", cursor: "pointer", fontWeight: 700}}
          >
            Open Traffic Police Login
          </button>
        </div>

        <div style={{background: "#fff", padding: "22px", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,.12)"}}>
          <h2>🚑 Ambulance Login</h2>
          <p>Enter the unique ID of this ambulance device.</p>
          <input
            value={ambulanceInput}
            onChange={(e) => setAmbulanceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ambulanceLogin(); }}
            placeholder="Example: AMB102"
            style={{width: "100%", boxSizing: "border-box", padding: "13px", border: "1px solid #d0d5dd", borderRadius: "10px", marginBottom: "10px"}}
          />
          <button
            onClick={ambulanceLogin}
            disabled={!ambulanceInput.trim()}
            style={{width: "100%", padding: "13px", border: 0, borderRadius: "10px", cursor: "pointer", fontWeight: 700}}
          >
            Login as Ambulance
          </button>
        </div>
      </section>
    </main>
  );
}
