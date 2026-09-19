import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { BACKEND_URL, AUTHORIZED_POLICE_ID, POLICE_ALERT_RADIUS_KM } from "./config";

function distanceKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, x))), Math.sqrt(1 - Math.min(1, Math.max(0, x))));
}

function showMobileNotification(title, body) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  const send = () => {
    try {
      new Notification(title, { body, tag: "emmc-ambulance-alert", renotify: true });
    } catch (error) {
      console.warn("Mobile notification failed:", error);
    }
  };
  if (Notification.permission === "granted") send();
  else if (Notification.permission === "default") Notification.requestPermission().then((permission) => { if (permission === "granted") send(); });
}

function isValidGPS(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export default function TrafficPoliceTracker({ onStartMap, onPoliceLocationChange, mapOpen = false, logoutNonce = 0 }) {
  const [policeId, setPoliceId] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState("Police Login Required");
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] =
    useState("Checking Backend...");

  const [lastUpdated, setLastUpdated] = useState(null);
  const [ambulanceNearby, setAmbulanceNearby] = useState(null);
  const [ambulanceDistances, setAmbulanceDistances] = useState({});
  const [trafficAlerts, setTrafficAlerts] = useState([]);
  const [mobileAlertEnabled, setMobileAlertEnabled] = useState(false);
  const lastAlertRef = useRef(null);

  const watchIdRef = useRef(null);

  // When the map is closed from its STOP GPS button, stop the police GPS watch.
  useEffect(() => {
    if (!mapOpen && watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, [mapOpen]);

  // Logout requested by the parent (for example from the map screen).
  const lastLogoutNonceRef = useRef(logoutNonce);
  useEffect(() => {
    if (logoutNonce !== lastLogoutNonceRef.current) {
      lastLogoutNonceRef.current = logoutNonce;
      logout();
    }
  }, [logoutNonce]);

  // ENABLE MOBILE BROWSER NOTIFICATIONS
  const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  };

  const enableMobileAlerts = async () => {
    setError("");

    if (window.isSecureContext !== true) {
      setMobileAlertEnabled(false);
      setError("Mobile Alerts के लिए यह EMMC Vercel HTTPS site खोलें। HTTP/IP address से Push काम नहीं करेगा।");
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMobileAlertEnabled(false);
      setError("इस browser में Web Push support नहीं है। Android Chrome/Edge में EMMC site खोलें।");
      return;
    }

    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

      if (permission !== "granted") {
        setMobileAlertEnabled(false);
        setError("Browser Notification permission को Allow करें, फिर Enable Mobile Alerts दोबारा दबाएँ।");
        return;
      }

      // Register the service worker before creating the push subscription.
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // Check the Render backend first. This gives a useful error instead of
      // the old generic “Backend और HTTPS check करें” message.
      const healthResponse = await fetch(`${BACKEND_URL}/api/health`, { cache: "no-store" });
      if (!healthResponse.ok) {
        throw new Error(`Backend health failed (HTTP ${healthResponse.status})`);
      }
      const health = await healthResponse.json();
      if (!health?.ok) {
        throw new Error("Backend health check returned an invalid response");
      }
      if (!health?.pushConfigured) {
        throw new Error("Render backend VAPID keys are not configured");
      }

      const keyResponse = await fetch(`${BACKEND_URL}/api/push/public-key`, { cache: "no-store" });
      if (!keyResponse.ok) {
        throw new Error(`VAPID public-key endpoint failed (HTTP ${keyResponse.status})`);
      }
      const keyData = await keyResponse.json();
      if (!keyData?.publicKey || typeof keyData.publicKey !== "string") {
        throw new Error("VAPID public key missing on Render");
      }

      let subscription = await registration.pushManager.getSubscription();

      // If an old subscription exists, reuse it. If the browser rejects it
      // while subscribing, remove the stale subscription and create a fresh one.
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        });
      }

      let saveResponse = await fetch(`${BACKEND_URL}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policeId: AUTHORIZED_POLICE_ID, subscription }),
      });

      if (!saveResponse.ok) {
        const saveText = await saveResponse.text().catch(() => "");
        throw new Error(`Push subscription save failed (HTTP ${saveResponse.status})${saveText ? `: ${saveText}` : ""}`);
      }

      setMobileAlertEnabled(true);
      setError("");
      setStatus("🔔 Mobile Alerts Enabled • Ready to start GPS");
    } catch (err) {
      console.error("Mobile Push setup error:", err);
      setMobileAlertEnabled(false);
      setError(`Mobile Push setup failed: ${err?.message || "Unknown error"}`);
    }
  };

  // LIVE AMBULANCE PROXIMITY + MOBILE ALERT
  useEffect(() => {
    if (!loggedIn) return undefined;

    const socket = io(BACKEND_URL);
    socket.on("connect", () => socket.emit("registerPolice", { policeId: AUTHORIZED_POLICE_ID }));
    const handlePoliceAlert = (data) => {
      // Accept alerts from every ambulance, not only AMB102.
      if (!mobileAlertEnabled) return;
      if (data?.policeId && data.policeId !== AUTHORIZED_POLICE_ID) return;
      const ambulanceId = String(data?.ambulanceId || data?.data?.ambulanceId || "").trim();
      if (!ambulanceId) return;
      

      // Backend distance is authoritative for an alert; client GPS distance is
      // used only as a live fallback when both coordinates are available.
      const rawDistance = data?.data?.distanceMeters ?? data?.distanceMeters;
      const distanceMeters = Number(rawDistance);
      const alert = {
        id: `${ambulanceId}-${Date.now()}-${Math.random()}`,
        ambulanceId,
        time: new Date(),
        distanceMeters: Number.isFinite(distanceMeters) ? Math.max(0, Math.round(distanceMeters)) : null,
        emergencyCategory: data?.data?.emergencyCategory || data?.emergencyCategory || 'Critical / High Priority',
        destination: data?.data?.destination || data?.destination || 'Emergency Hospital',
        message: data?.message || data?.body || 'Please clear traffic / jam and assist the ambulance.',
      };
      setTrafficAlerts((prev) => [alert, ...prev].slice(0, 10));
      if (Number.isFinite(distanceMeters)) {
        setAmbulanceDistances((prev) => ({ ...prev, [ambulanceId]: Math.max(0, Math.round(distanceMeters)) }));
        setAmbulanceNearby((prev) => ({ ...(prev || {}), ambulanceId, distance: distanceMeters / 1000 }));
      }
      showMobileNotification(
        data?.title || `🚨 EMMC Traffic Alert • ${ambulanceId}`,
        data?.body || alert.message
      );
    };

    socket.on('policeAlert', handlePoliceAlert);
    socket.on('trafficPoliceAlert', handlePoliceAlert);

    socket.on('trafficPoliceAlertCleared', (data) => {
      const ambulanceId = String(data?.ambulanceId || '').trim();
      if (!ambulanceId) return;
      setTrafficAlerts((prev) => prev.filter((alert) => alert.ambulanceId !== ambulanceId));
      setAmbulanceDistances((prev) => {
        const next = { ...prev };
        delete next[ambulanceId];
        return next;
      });
      setAmbulanceNearby((prev) => prev?.ambulanceId === ambulanceId ? null : prev);
    });

    socket.on("ambulanceLocation", (data) => {
      const ambulanceId = String(data?.ambulanceId || '').trim();
      if (!ambulanceId) return;
      const latitude = Number(data?.latitude);
      const longitude = Number(data?.longitude);
      if (!isValidGPS(latitude, longitude) || !location) return;

      const distance = distanceKm(
        { latitude: location.latitude, longitude: location.longitude },
        { latitude, longitude }
      );
      if (distance === null) return;
      const distanceMeters = Math.max(0, Math.round(distance * 1000));
      setAmbulanceDistances((prev) => ({ ...prev, [ambulanceId]: distanceMeters }));
      setAmbulanceNearby({ ambulanceId, latitude, longitude, distance });
    });

    return () => socket.disconnect();
  }, [loggedIn, location, mobileAlertEnabled]);

  // BACKEND CHECK
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/traffic-police`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(() => {
        setBackendStatus("🟢 Backend Connected");
      })
      .catch(() => {
        setBackendStatus("🔴 Backend Not Connected");
      });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(
          watchIdRef.current
        );
      }
    };
  }, []);

  // LOGIN
  const handleLogin = () => {
    if (policeId.trim() !== AUTHORIZED_POLICE_ID) {
      setError("❌ Unauthorized Traffic Police ID");
      return;
    }

    setError("");
    setLoggedIn(true);
    setStatus("Ready to start GPS");
  };

  // START GPS
  const startGPS = () => {
    setError("");

    if (!mobileAlertEnabled) {
      setError("पहले Enable Mobile Alerts पर click करके alerts enable करें।");
      return;
    }

    if (!navigator.geolocation) {
      setStatus("GPS unavailable");
      setError(
        "This device/browser does not support GPS."
      );
      return;
    }

    setStatus("Requesting GPS permission...");

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(
        watchIdRef.current
      );
    }

    watchIdRef.current =
      navigator.geolocation.watchPosition(
        async (position) => {
          const latitude = Number(
            position.coords.latitude
          );

          const longitude = Number(
            position.coords.longitude
          );

          if (!isValidGPS(latitude, longitude)) {
            setError("Invalid GPS coordinates.");
            return;
          }

          const nextLocation = {
            latitude,
            longitude,
            accuracy: position.coords.accuracy,
          };

          setLocation(nextLocation);
          if (typeof onPoliceLocationChange === "function") {
            onPoliceLocationChange(nextLocation);
          }

          // Open the shared live map after the first REAL police GPS fix.
          if (typeof onStartMap === "function") {
            onStartMap();
          }

          setStatus("🟢 Live GPS");
          setError("");

          try {
            const response = await fetch(
              `${BACKEND_URL}/api/traffic-police/location`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  policeId: AUTHORIZED_POLICE_ID,
                  latitude,
                  longitude,
                }),
              }
            );

            const data = await response.json();

            if (!response.ok) {
              throw new Error(
                data.message || "Backend Error"
              );
            }

            setBackendStatus(
              "🟢 Backend Connected • GPS Sent"
            );

            setLastUpdated(new Date());

            setStatus(
              "🟢 Live GPS • Location Sent"
            );

            console.log(
              "🚔 REAL POLICE GPS:",
              latitude,
              longitude
            );
          } catch (err) {
            console.error(err);

            setStatus(
              "GPS Active • Backend Error"
            );

            setBackendStatus(
              "🔴 Backend Connection Error"
            );

            setError(
              "GPS मिल रहा है लेकिन Backend तक नहीं पहुँच रहा।"
            );
          }
        },

        (gpsError) => {
          console.error(
            "GPS Error:",
            gpsError.code,
            gpsError.message
          );

          if (gpsError.code === 1) {
            setStatus("Location Permission Denied");
            setError(
              "Location permission Allow करें।"
            );
          } else if (gpsError.code === 2) {
            setStatus("GPS Unavailable");
            setError(
              "Actual GPS location नहीं मिल रही है।"
            );
          } else if (gpsError.code === 3) {
            setStatus("GPS Timeout");
            setError(
              "GPS location मिलने में timeout हुआ।"
            );
          } else {
            setStatus("GPS Error");
            setError(
              "Actual GPS location प्राप्त नहीं हुई।"
            );
          }
        },

        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        }
      );
  };

  // STOP GPS
  const stopGPS = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(
        watchIdRef.current
      );

      watchIdRef.current = null;
    }

    setStatus("GPS Stopped");
  };

  // LOGOUT
  const logout = () => {
    stopGPS();

    setLoggedIn(false);
    setPoliceId("");
    setLocation(null);
    if (typeof onPoliceLocationChange === "function") onPoliceLocationChange(null);
    setStatus("Police Login Required");
    setError("");
  };

  return (
    <div
      style={{
        maxWidth: "500px",
        margin: "20px auto",
        padding: "24px",
        borderRadius: "16px",
        background: "#ffffff",
        boxShadow:
          "0 4px 20px rgba(0,0,0,.12)",
        fontFamily: "Arial, sans-serif",
      }}
    >

      {!loggedIn ? (
        <>
          <h2 style={{ marginTop: 0 }}>
            🚔 Traffic Police Mode
          </h2>

          <p style={{ color: "#667085" }}>
            Authorized Traffic Police Login
          </p>

          <input
            value={policeId}
            onChange={(e) =>
              setPoliceId(e.target.value)
            }
            placeholder="Enter Police ID"
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              marginBottom: "12px",
              fontSize: "15px",
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={handleLogin}
            style={{
              width: "100%",
              padding: "13px",
              border: "none",
              borderRadius: "10px",
              background: "#16a34a",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            🚔 LOGIN
          </button>

          <div
            style={{
              marginTop: "15px",
              padding: "12px",
              borderRadius: "10px",
              background: "#f3f4f6",
              fontSize: "13px",
            }}
          >
            Authorized ID: <b>TP001</b>
          </div>

          {error && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                borderRadius: "8px",
                background: "#fee2e2",
                color: "#991b1b",
              }}
            >
              ⚠️ {error}
            </div>
          )}
        </>
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>
            🚔 Traffic Police GPS
          </h2>

          <div
            style={{
              padding: "14px",
              borderRadius: "10px",
              background: "#f3f4f6",
              marginBottom: "12px",
            }}
          >
            <b>Police ID:</b> TP001
          </div>

          <div
            style={{
              padding: "14px",
              borderRadius: "10px",
              background:
                status.includes("Live")
                  ? "#dcfce7"
                  : "#f3f4f6",
              marginBottom: "12px",
            }}
          >
            <b>Status:</b> {status}
          </div>

          <div
            style={{
              padding: "14px",
              borderRadius: "10px",
              background: "#eff6ff",
              marginBottom: "12px",
            }}
          >
            <b>Backend:</b> {backendStatus}
          </div>

          <button
            onClick={enableMobileAlerts}
            style={{
              width: "100%",
              padding: "13px",
              border: "none",
              borderRadius: "10px",
              background: mobileAlertEnabled ? "#16a34a" : "#2563eb",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
              marginBottom: "12px",
            }}
          >
            {mobileAlertEnabled ? "🔔 Mobile Alerts Enabled" : "🔔 Enable Mobile Alerts"}
          </button>

          {mobileAlertEnabled && (
            <div
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                marginBottom: "12px",
              }}
            >
              <b>🚑 Live Ambulance Distances</b>
              <div style={{ marginTop: "8px" }}>
                {Object.entries(ambulanceDistances).length > 0 ? Object.entries(ambulanceDistances).map(([id, meters]) => {
                  const inRadius = Number.isFinite(meters) && meters <= POLICE_ALERT_RADIUS_KM * 1000;
                  return (
                    <div key={id} style={{ marginTop: "7px", padding: "8px 10px", borderRadius: "8px", background: inRadius ? "#fee2e2" : "#f8fafc" }}>
                      <b>{id}</b>: {Number.isFinite(meters) ? <><b>{meters} m</b> {inRadius ? "🚨 WITHIN 1 KM" : ""}</> : <span style={{ color: "#64748b" }}>Waiting for GPS</span>}
                    </div>
                  );
                }) : <div style={{ color: "#64748b" }}>Waiting for real ambulance GPS...</div>}
              </div>
            </div>
          )}

          {/* TRAFFIC ALERTS — visible only after Mobile Alerts are enabled */}
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: trafficAlerts.length ? "#fff1f2" : "#f8fafc",
              border: trafficAlerts.length ? "2px solid #ef4444" : "1px solid #e2e8f0",
              marginBottom: "12px",
            }}
          >
            <h3 style={{ margin: "0 0 10px" }}>🚨 Traffic Alerts</h3>
            {trafficAlerts.length === 0 ? (
              <div style={{ color: "#64748b" }}>
                No active traffic alert. Alert will appear here when an ambulance enters the 1 km radius.
              </div>
            ) : (
              trafficAlerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: "12px",
                    borderRadius: "10px",
                    background: "#fee2e2",
                    marginBottom: "8px",
                  }}
                >
                  <b>🚑 Ambulance {alert.ambulanceId} — WITHIN 1 KM</b>
                  <div style={{ marginTop: 6 }}>
                    📏 Distance: <b>{alert.distanceMeters == null ? "Within 1 km" : `${alert.distanceMeters} m`}</b>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    ⚠️ Emergency: <b>{alert.emergencyCategory}</b>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    🏥 Destination: <b>{alert.destination}</b>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    🚦 <b>ACTION:</b> Please clear traffic / jam and give the ambulance a clear route.
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: .75 }}>
                    Alert received: {alert.time.toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>

          {location ? (
            <div
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "#eff6ff",
                marginBottom: "12px",
              }}
            >
              <div>
                📍 <b>Latitude:</b>{" "}
                {location.latitude.toFixed(6)}
              </div>

              <div style={{ marginTop: "8px" }}>
                📍 <b>Longitude:</b>{" "}
                {location.longitude.toFixed(6)}
              </div>

              <div style={{ marginTop: "8px" }}>
                🎯 <b>GPS Accuracy:</b>{" "}
                {location.accuracy
                  ? `${location.accuracy.toFixed(1)} m`
                  : "N/A"}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "#fef3c7",
                marginBottom: "12px",
              }}
            >
              📍 Waiting for actual GPS...
            </div>
          )}

          <button
            onClick={startGPS}
            style={{
              width: "100%",
              padding: "13px",
              border: "none",
              borderRadius: "10px",
              background: "#16a34a",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
              marginBottom: "10px",
            }}
          >
            📍 START LIVE GPS
          </button>

          <button
            onClick={stopGPS}
            style={{
              width: "100%",
              padding: "13px",
              border: "none",
              borderRadius: "10px",
              background: "#dc2626",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
              marginBottom: "10px",
            }}
          >
            ⛔ STOP GPS
          </button>

          {lastUpdated && (
            <div
              style={{
                fontSize: "13px",
                opacity: 0.75,
                marginBottom: "12px",
              }}
            >
              Last GPS update:{" "}
              {lastUpdated.toLocaleTimeString()}
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "12px",
                borderRadius: "8px",
                background: "#fee2e2",
                color: "#991b1b",
                marginBottom: "12px",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={logout}
            style={{
              width: "100%",
              padding: "11px",
              border: "1px solid #d1d5db",
              borderRadius: "10px",
              background: "white",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </>
      )}
    </div>
  );
}
