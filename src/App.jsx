import React, { useState } from "react";
import LiveMap from "./LiveMap";
import TrafficPoliceTracker from "./TrafficPoliceTracker";

export default function App() {
  const [mode, setMode] = useState("dashboard");

  return (
    <main className="app">

      <header>
        <h1>🚑 EMMC — Maps + GPS</h1>
        <p>Live Ambulance Tracking & Police Traffic Alert</p>
      </header>

      {/* MODE BUTTONS */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "14px",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setMode("dashboard")}
          style={{
            flex: 1,
            minWidth: "180px",
            padding: "13px",
            border: "none",
            borderRadius: "10px",
            background:
              mode === "dashboard" ? "#2563eb" : "#e5e7eb",
            color:
              mode === "dashboard" ? "white" : "#111827",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          🚑 EMMS Dashboard
        </button>

        <button
          onClick={() => setMode("police")}
          style={{
            flex: 1,
            minWidth: "180px",
            padding: "13px",
            border: "none",
            borderRadius: "10px",
            background:
              mode === "police" ? "#16a34a" : "#e5e7eb",
            color:
              mode === "police" ? "white" : "#111827",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          🚔 Traffic Police Mode
        </button>
      </div>

      {/* DASHBOARD */}
      {mode === "dashboard" && <LiveMap />}

      {/* POLICE MODE */}
      {mode === "police" && <TrafficPoliceTracker />}
    </main>
  );
}
