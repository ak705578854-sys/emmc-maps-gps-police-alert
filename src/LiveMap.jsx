import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
} from "react-leaflet";
import { io } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// =====================================================
// CONFIG
// =====================================================

import { BACKEND_URL, AMBULANCE_ID, AUTHORIZED_POLICE_ID, POLICE_ALERT_RADIUS_KM } from "./config";

const DEMO_AMBULANCE = [23.3441, 85.3096];

const DEMO_HOSPITAL = [23.356343, 85.323337];

const DEMO_HOSPITAL_NAME =
  "Raj Hospital and Research Center, Ranchi";

// =====================================================
// MAP ICONS
// =====================================================

const ambulanceIcon = L.divIcon({
  className: "custom-marker",
  html: `
    <div style="
      width:24px;
      height:24px;
      background:#4285F4;
      border:4px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
    "></div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const hospitalIcon = L.divIcon({
  className: "custom-marker",
  html: `
    <div style="
      width:28px;
      height:28px;
      background:#EA4335;
      border:3px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,.35);
      position:relative;
    ">
      <div style="
        width:10px;
        height:10px;
        background:white;
        border-radius:50%;
        position:absolute;
        top:6px;
        left:6px;
      "></div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -30],
});

const policeIcon = L.divIcon({
  className: "custom-marker",
  html: `
    <div style="
      width:30px;
      height:30px;
      background:#1f2937;
      border:3px solid white;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      color:white;
      font-size:16px;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
    ">
      🚔
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// =====================================================
// GPS VALIDATION
// =====================================================

function isValidCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function isValidLocation(location) {
  return (
    Array.isArray(location) &&
    location.length === 2 &&
    isValidCoordinate(
      Number(location[0]),
      Number(location[1])
    )
  );
}

// =====================================================
// ACTUAL GPS DISTANCE - HAVERSINE
// =====================================================

function distanceKm(a, b) {
  if (
    !isValidLocation(a) ||
    !isValidLocation(b)
  ) {
    return null;
  }

  const R = 6371;
  const rad = Math.PI / 180;

  const lat1 = Number(a[0]);
  const lon1 = Number(a[1]);
  const lat2 = Number(b[0]);
  const lon2 = Number(b[1]);

  const dLat = (lat2 - lat1) * rad;
  const dLng = (lon2 - lon1) * rad;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLng / 2) ** 2;

  const safeX = Math.min(
    1,
    Math.max(0, x)
  );

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(safeX),
      Math.sqrt(1 - safeX)
    )
  );
}

// =====================================================
// DISTANCE DISPLAY
// =====================================================

function bearingDegrees(a, b) {
  if (!isValidLocation(a) || !isValidLocation(b)) return 0;
  const lat1 = Number(a[0]) * Math.PI / 180;
  const lat2 = Number(b[0]) * Math.PI / 180;
  const dLng = (Number(b[1]) - Number(a[1])) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Animated direction arrow shown directly above the ambulance.
// It rotates with the live GPS heading so the user can immediately see
// which direction the ambulance is moving.
const movingAmbulanceArrowIcon = (rotation) => L.divIcon({
  className: "moving-ambulance-arrow-marker",
  html: `<div class="moving-ambulance-arrow" style="transform: rotate(${rotation}deg);">➤</div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const arrowIcon = (rotation) => L.divIcon({
  className: "route-arrow-marker",
  html: `<div style="transform: rotate(${rotation}deg); font-size:22px; font-weight:900; color:#2563eb; text-shadow:0 1px 3px rgba(255,255,255,.95); line-height:1;">➤</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function getRouteArrows(routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return [];
  const step = Math.max(8, Math.floor(routePoints.length / 10));
  const arrows = [];
  for (let i = step; i < routePoints.length - 1; i += step) {
    const a = routePoints[i - 1];
    const b = routePoints[i + 1];
    arrows.push({
      position: routePoints[i],
      rotation: bearingDegrees(a, b) - 90,
      key: `route-arrow-${i}`,
    });
  }
  return arrows;
}

function formatDistance(km) {
  if (
    km === null ||
    !Number.isFinite(km)
  ) {
    return "";
  }

  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }

  return `${km.toFixed(2)} km`;
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function LiveMap({ onStopGPS, onLogout }) {

  // ===================================================
  // AMBULANCE GPS
  // ===================================================

  const [gpsLocation, setGpsLocation] =
    useState(null);

  const [backendLocation, setBackendLocation] =
    useState(null);

  // All ambulances currently known by the backend. Each ambulance has its
  // own ID, GPS location and emergency details. There is no 1-ambulance limit.
  const [ambulanceLocations, setAmbulanceLocations] = useState({});
  const [ambulanceAlerts, setAmbulanceAlerts] = useState({});

  // ===================================================
  // TRAFFIC POLICE ACTUAL LIVE GPS
  // ===================================================

  const [
    trafficPoliceLocation,
    setTrafficPoliceLocation,
  ] = useState(null);

  const [
    trafficPoliceLive,
    setTrafficPoliceLive,
  ] = useState(false);

  const [
    policeLastUpdated,
    setPoliceLastUpdated,
  ] = useState(null);

  const [
    policeStatus,
    setPoliceStatus,
  ] = useState(
    "Waiting for authorized Traffic Police GPS..."
  );

  // ===================================================
  // ALERT
  // ===================================================

  const [
    trafficPoliceAlert,
    setTrafficPoliceAlert,
  ] = useState(null);

  // ===================================================
  // GENERAL STATE
  // ===================================================

  const [gpsError, setGpsError] =
    useState("");

  const [route, setRoute] =
    useState([]);

  const [distance, setDistance] =
    useState(null);

  const [duration, setDuration] =
    useState(null);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [ambulanceHeading, setAmbulanceHeading] =
    useState(null);

  const previousAmbulanceLocationRef = useRef(null);

  const [routeStatus, setRouteStatus] =
    useState("Calculating route...");

  const [backendStatus, setBackendStatus] =
    useState("Connecting to backend...");

  const routeArrows = useMemo(() => getRouteArrows(route), [route]);

  // ===================================================
  // AMBULANCE LOCATION FOR MAP
  // ===================================================

  const ambulanceLocation = useMemo(() => {

    if (
      isValidLocation(
        backendLocation
      )
    ) {
      return backendLocation;
    }

    if (
      isValidLocation(
        gpsLocation
      )
    ) {
      return gpsLocation;
    }

    // Demo location is ONLY used for map/route.
    // It is NEVER used for police distance.
    return DEMO_AMBULANCE;

  }, [
    backendLocation,
    gpsLocation,
  ]);

  // ===================================================
  // ACTUAL AMBULANCE GPS
  // ===================================================

  const actualAmbulanceGPS =
    useMemo(() => {

      if (
        isValidLocation(
          backendLocation
        )
      ) {
        return backendLocation;
      }

      if (
        isValidLocation(
          gpsLocation
        )
      ) {
        return gpsLocation;
      }

      return null;

    }, [
      backendLocation,
      gpsLocation,
    ]);

  // ===================================================
  // ACTUAL POLICE DISTANCE
  // ===================================================

  const policeDistance =
    useMemo(() => {

      // Police must have actual live GPS.
      if (
        !trafficPoliceLive ||
        !isValidLocation(
          trafficPoliceLocation
        )
      ) {
        return null;
      }

      // Ambulance must have actual GPS.
      if (
        !isValidLocation(
          actualAmbulanceGPS
        )
      ) {
        return null;
      }

      // ONLY ACTUAL GPS COORDINATES
      return distanceKm(
        actualAmbulanceGPS,
        trafficPoliceLocation
      );

    }, [
      trafficPoliceLive,
      trafficPoliceLocation,
      actualAmbulanceGPS,
    ]);

  // ===================================================
  // POLICE RANGE
  // ===================================================

  const policeInRange =
    trafficPoliceLive &&
    policeDistance !== null &&
    policeDistance <=
      POLICE_ALERT_RADIUS_KM;

  // ===================================================
  // POLICE DISTANCE TEXT
  // ===================================================

  const policeDistanceText =
    formatDistance(
      policeDistance
    );

  // ===================================================
  // EMERGENCY CATEGORY
  // ===================================================

  const patientEmergencyCategory =
    trafficPoliceAlert?.emergencyCategory ||
    "Critical / High Priority";

  // ===================================================
  // SOCKET.IO
  // ===================================================

  useEffect(() => {

    const socket =
      io(BACKEND_URL);

    // =================================================
    // CONNECT
    // =================================================

    socket.on(
      "connect",
      () => {

        console.log(
          "Connected to EMMC Backend:",
          socket.id
        );

        setBackendStatus(
          "Backend Connected"
        );

      }
    );

    // =================================================
    // LIVE AMBULANCE GPS
    // =================================================

    socket.on(
      "ambulanceLocation",
      (data) => {

        console.log(
          "🚑 Ambulance ACTUAL GPS:",
          data
        );

        const latitude =
          Number(
            data?.latitude
          );

        const longitude =
          Number(
            data?.longitude
          );

        if (
          data?.ambulanceId &&
          isValidCoordinate(latitude, longitude)
        ) {
          const ambulanceId = String(data.ambulanceId);
          const nextLocation = [latitude, longitude];

          // Keep every ambulance, not just AMB102.
          setAmbulanceLocations((prev) => ({
            ...prev,
            [ambulanceId]: {
              ...prev[ambulanceId],
              ...data,
              ambulanceId,
              latitude,
              longitude,
              updatedAt: data.updatedAt || Date.now(),
            },
          }));

          // AMB102 remains the primary ambulance for the existing route/GPS UI.
          if (ambulanceId === AMBULANCE_ID) {
            const previous = previousAmbulanceLocationRef.current;
            if (previous) {
              setAmbulanceHeading(bearingDegrees(previous, nextLocation));
            }
            previousAmbulanceLocationRef.current = nextLocation;
            setBackendLocation(nextLocation);
            setLastUpdated(new Date());
          }
        }

      }
    );

    // =================================================
    // LIVE AUTHORIZED TRAFFIC POLICE GPS
    // =================================================

    socket.on(
      "policeLocation",
      (data) => {

        console.log(
          "🚔 Traffic Police ACTUAL GPS:",
          data
        );

        const policeData = data?.police || data;
        const policeId =
          policeData?.policeId ||
          policeData?.id;

        const latitude =
          Number(
            policeData?.latitude
          );

        const longitude =
          Number(
            policeData?.longitude
          );

        // ---------------------------------------------
        // ONLY TP001
        // ---------------------------------------------

        if (
          policeId !==
          AUTHORIZED_POLICE_ID
        ) {

          console.warn(
            "Unauthorized Traffic Police ignored:",
            policeId
          );

          return;
        }

        // ---------------------------------------------
        // GPS VALIDATION
        // ---------------------------------------------

        if (
          !isValidCoordinate(
            latitude,
            longitude
          )
        ) {

          console.warn(
            "Invalid Traffic Police GPS ignored"
          );

          return;
        }

        // ---------------------------------------------
        // ACTUAL LIVE LOCATION
        // ---------------------------------------------

        const location = [
          latitude,
          longitude,
        ];

        setTrafficPoliceLocation(
          location
        );

        setTrafficPoliceLive(
          true
        );

        setPoliceLastUpdated(
          new Date()
        );

        setPoliceStatus(
          "LIVE GPS • Authorized TP001"
        );

      }
    );

    // =================================================
    // TRAFFIC POLICE ALERT
    // =================================================

    socket.on(
      "trafficPoliceAlert",
      (data) => {

        console.log(
          "🚨 Traffic Police Alert:",
          data
        );

        if (
          data?.ambulanceId &&
          (!data?.policeId || data.policeId === AUTHORIZED_POLICE_ID)
        ) {
          setAmbulanceAlerts((prev) => ({
            ...prev,
            [String(data.ambulanceId)]: data,
          }));
          setTrafficPoliceAlert(data);
          setPoliceStatus("🚨 Alert Triggered • LIVE GPS");
        }

      }
    );

    // Backend's authoritative police-room alert event.
    socket.on("policeAlert", (data) => {
      if (data?.ambulanceId && (!data?.policeId || data.policeId === AUTHORIZED_POLICE_ID)) {
        setAmbulanceAlerts((prev) => ({
          ...prev,
          [String(data.ambulanceId)]: data,
        }));
        setTrafficPoliceAlert(data);
        setPoliceStatus("🚨 Alert Triggered • LIVE GPS");
      }
    });

    // =================================================
    // ALERT CLEARED
    // =================================================

    socket.on(
      "trafficPoliceAlertCleared",
      (data) => {

        console.log(
          "🟢 Traffic Police Alert Cleared:",
          data
        );

        if (data?.ambulanceId) {
          const ambulanceId = String(data.ambulanceId);
          setAmbulanceAlerts((prev) => {
            const next = { ...prev };
            delete next[ambulanceId];
            return next;
          });
          setTrafficPoliceAlert((current) =>
            current?.ambulanceId === ambulanceId ? null : current
          );
          setPoliceStatus("LIVE GPS • Outside 1 KM");
        }

      }
    );

    // =================================================
    // DISCONNECT
    // =================================================

    socket.on(
      "disconnect",
      () => {

        console.log(
          "Disconnected from EMMC Backend"
        );

        setBackendStatus(
          "Backend Disconnected"
        );

      }
    );

    // =================================================
    // CONNECTION ERROR
    // =================================================

    socket.on(
      "connect_error",
      (error) => {

        console.error(
          "Backend connection error:",
          error.message
        );

        setBackendStatus(
          "Backend not connected"
        );

      }
    );

    // =================================================
    // CLEANUP
    // =================================================

    return () => {

      socket.off(
        "connect"
      );

      socket.off(
        "ambulanceLocation"
      );

      socket.off(
        "trafficPoliceLocation"
      );

      socket.off(
        "trafficPoliceAlert"
      );

      socket.off(
        "policeAlert"
      );

      socket.off(
        "trafficPoliceAlertCleared"
      );

      socket.off(
        "disconnect"
      );

      socket.off(
        "connect_error"
      );

      socket.disconnect();

    };

  }, []);

  // ===================================================
  // INITIAL TRAFFIC POLICE GPS
  // ===================================================

  useEffect(() => {

    async function getPoliceLocation() {

      try {

        const response =
          await fetch(
            `${BACKEND_URL}/api/traffic-police`
          );

        if (!response.ok) {

          throw new Error(
            `Backend returned ${response.status}`
          );

        }

        const data =
          await response.json();

        console.log(
          "Traffic Police API:",
          data
        );

        // Backend returns { ok, policeOnline, ambulancesOnline, police: {...} }
        // Accept both the wrapped response and a direct police object.
        const policeData = data?.police || data;

        const policeId =
          policeData?.policeId ||
          policeData?.id;

        const latitude =
          Number(
            policeData?.latitude
          );

        const longitude =
          Number(
            policeData?.longitude
          );

        // ---------------------------------------------
        // ONLY AUTHORIZED TP001
        // ---------------------------------------------

        if (
          policeId !==
          AUTHORIZED_POLICE_ID
        ) {

          console.warn(
            "Unauthorized Police API data ignored"
          );

          return;
        }

        // ---------------------------------------------
        // NEVER ACCEPT OLD DEMO LOCATION
        // ---------------------------------------------

        if (
          policeData?.isLive !== true
        ) {

          console.log(
            "No actual Traffic Police GPS yet."
          );

          setTrafficPoliceLocation(
            null
          );

          setTrafficPoliceLive(
            false
          );

          setPoliceStatus(
            "Waiting for authorized Traffic Police LIVE GPS..."
          );

          return;
        }

        // ---------------------------------------------
        // VALID LIVE GPS
        // ---------------------------------------------

        if (
          !isValidCoordinate(
            latitude,
            longitude
          )
        ) {

          setTrafficPoliceLocation(
            null
          );

          setTrafficPoliceLive(
            false
          );

          setPoliceStatus(
            "Waiting for authorized Traffic Police LIVE GPS..."
          );

          return;
        }

        setTrafficPoliceLocation([
          latitude,
          longitude,
        ]);

        setTrafficPoliceLive(
          true
        );

        setPoliceLastUpdated(
          data?.lastUpdated
            ? new Date(
                data.lastUpdated
              )
            : new Date()
        );

        setPoliceStatus(
          "LIVE GPS • Authorized TP001"
        );

      } catch (error) {

        console.warn(
          "Traffic Police GPS request failed:",
          error.message
        );

        setTrafficPoliceLocation(
          null
        );

        setTrafficPoliceLive(
          false
        );

        setPoliceStatus(
          "Waiting for authorized Traffic Police LIVE GPS..."
        );

      }

    }

    getPoliceLocation();

    // Load all ambulances that were already online before this map opened.
    fetch(`${BACKEND_URL}/api/ambulances`)
      .then((response) => {
        if (!response.ok) throw new Error(`Backend returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const list = Array.isArray(data?.ambulances) ? data.ambulances : [];
        const next = {};
        for (const amb of list) {
          const id = amb?.ambulanceId;
          if (id && isValidCoordinate(Number(amb.latitude), Number(amb.longitude))) {
            next[String(id)] = { ...amb, latitude: Number(amb.latitude), longitude: Number(amb.longitude) };
          }
        }
        setAmbulanceLocations(next);
      })
      .catch((error) => console.warn("All ambulances request failed:", error.message));

  }, []);

  // ===================================================
  // AMBULANCE DEVICE GPS
  // ===================================================

  useEffect(() => {

    if (
      !navigator.geolocation
    ) {

      setGpsError(
        "This browser/device does not support Geolocation."
      );

      return;
    }

    const id =
      navigator.geolocation.watchPosition(

        async (position) => {

          const latitude =
            Number(
              position.coords.latitude
            );

          const longitude =
            Number(
              position.coords.longitude
            );

          // -------------------------------------------
          // VALIDATE ACTUAL GPS
          // -------------------------------------------

          if (
            !isValidCoordinate(
              latitude,
              longitude
            )
          ) {

            console.warn(
              "Invalid ambulance GPS ignored"
            );

            return;
          }

          const location = [
            latitude,
            longitude,
          ];

          // -------------------------------------------
          // LOCAL ACTUAL GPS
          // -------------------------------------------

          const previous = previousAmbulanceLocationRef.current;
          if (previous) {
            setAmbulanceHeading(bearingDegrees(previous, location));
          }
          previousAmbulanceLocationRef.current = location;

          setGpsLocation(location);

          setGpsError("");

          setLastUpdated(
            new Date()
          );

          // -------------------------------------------
          // SEND ACTUAL GPS TO BACKEND
          // -------------------------------------------

          try {

            const response =
              await fetch(
                `${BACKEND_URL}/api/ambulance/location`,
                {
                  method: "POST",

                  headers: {
                    "Content-Type":
                      "application/json",
                  },

                  body:
                    JSON.stringify({
                      ambulanceId:
                        AMBULANCE_ID,

                      latitude,

                      longitude,

                      accuracy:
                        position.coords.accuracy,
                    }),
                }
              );

            if (
              !response.ok
            ) {

              throw new Error(
                `Backend returned ${response.status}`
              );

            }

            const data =
              await response.json();

            console.log(
              "🚑 Actual Ambulance GPS sent:",
              data
            );

          } catch (error) {

            console.error(
              "Ambulance backend GPS error:",
              error.message
            );

          }

        },

        (error) => {

          console.warn(
            "Ambulance GPS Error:",
            error.message
          );

          setGpsError(
            "Ambulance GPS permission allow nahi hui."
          );

        },

        {
          enableHighAccuracy:
            true,

          maximumAge:
            2000,

          timeout:
            10000,
        }
      );

    return () => {

      navigator.geolocation.clearWatch(
        id
      );

    };

  }, []);

  // ===================================================
  // ROUTE CALCULATION
  // ===================================================

  useEffect(() => {

    const controller =
      new AbortController();

    async function getRoute() {

      try {

        setRouteStatus(
          "Recalculating route..."
        );

        const [
          fromLat,
          fromLng,
        ] =
          ambulanceLocation;

        const [
          toLat,
          toLng,
        ] =
          DEMO_HOSPITAL;

        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${fromLng},${fromLat};${toLng},${toLat}` +
          `?overview=full&geometries=geojson`;

        const response =
          await fetch(
            url,
            {
              signal:
                controller.signal,
            }
          );

        if (
          !response.ok
        ) {

          throw new Error(
            `Routing request failed: ${response.status}`
          );

        }

        const data =
          await response.json();

        if (
          data.routes?.length
        ) {

          const selectedRoute =
            data.routes[0];

          const routePoints =
            selectedRoute
              .geometry
              .coordinates
              .map(
                ([lng, lat]) => [
                  lat,
                  lng,
                ]
              );

          setRoute(
            routePoints
          );

          setDistance(
            (
              selectedRoute.distance /
              1000
            ).toFixed(2)
          );

          setDuration(
            Math.round(
              selectedRoute.duration /
                60
            )
          );

          setRouteStatus(
            "Live route updated"
          );

        } else {

          setRouteStatus(
            "Route unavailable"
          );

        }

      } catch (error) {

        if (
          error.name !==
          "AbortError"
        ) {

          console.error(
            "Route error:",
            error
          );

          setRouteStatus(
            "Route calculation failed"
          );

        }

      }

    }

    getRoute();

    return () => {

      controller.abort();

    };

  }, [
    ambulanceLocation,
  ]);

  // ===================================================
  // DEMO FLEET — AMB102 to AMB106
  // ===================================================

  const sendDemoFleet = async () => {
    // Demo ambulances are intentionally placed close to the demo hospital,
    // so the demo route distance stays realistic instead of hundreds of km.
    const demoFleet = [
      { ambulanceId: "AMB102", dLat: 0.0020, dLng: 0.0000 },
      { ambulanceId: "AMB103", dLat: -0.0020, dLng: 0.0010 },
      { ambulanceId: "AMB104", dLat: 0.0010, dLng: -0.0020 },
      { ambulanceId: "AMB105", dLat: -0.0010, dLng: -0.0020 },
      { ambulanceId: "AMB106", dLat: 0.0005, dLng: 0.0025 },
    ];

    for (const amb of demoFleet) {
      try {
        await fetch(`${BACKEND_URL}/api/ambulance/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ambulanceId: amb.ambulanceId,
            latitude: DEMO_HOSPITAL[0] + amb.dLat,
            longitude: DEMO_HOSPITAL[1] + amb.dLng,
            destination: DEMO_HOSPITAL_NAME,
            emergencyCategory: "Critical / High Priority",
            heading: 90,
          }),
        });
      } catch (error) {
        console.warn("Demo fleet send failed", amb.ambulanceId, error);
      }
    }
    setPoliceStatus("🧪 Demo Fleet Sent • AMB102–AMB106");
  };

  // ===================================================
  // UI
  // ===================================================

  return (

    <section className="map-card">

      {/* POLICE CONTROLS — always visible above the map */}
      <div className="map-top-controls">
        <div className="map-live-label">🚔 Traffic Police • {AUTHORIZED_POLICE_ID} • 🟢 LIVE GPS</div>
        <div className="map-control-buttons">
          <button className="map-stop-button" onClick={onStopGPS}>⛔ STOP GPS</button>
          <button className="map-logout-button" onClick={onLogout}>🚪 LOGOUT</button>
        </div>
      </div>

      {/* =================================================
          MAP
      ================================================= */}

      <div className="map">

        <MapContainer
          center={
            ambulanceLocation
          }
          zoom={14}
          style={{
            height: "100%",
            width: "100%",
          }}
          dragging={true}
          touchZoom={true}
          scrollWheelZoom={true}
          doubleClickZoom={true}
          zoomControl={true}
          keyboard={true}
        >

          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* ===========================================
              AMBULANCE
          =========================================== */}

          <Marker
            position={
              ambulanceLocation
            }
            icon={ambulanceIcon}
          >

            <Popup>

              🚑{" "}

              <b>
                Ambulance {AMBULANCE_ID}
              </b>

              <br />

              {actualAmbulanceGPS
                ? "LIVE GPS"
                : "Demo / Waiting for GPS"}

              {ambulanceHeading !== null && (
                <>
                  <br />🧭 Direction: {Math.round(ambulanceHeading)}°
                </>
              )}

            </Popup>

          </Marker>

          {/* ===========================================
              ALL LIVE AMBULANCES
          =========================================== */}

          {Object.values(ambulanceLocations).map((amb) => {
            const position = [Number(amb.latitude), Number(amb.longitude)];
            const isPrimary = amb.ambulanceId === AMBULANCE_ID;
            return (
              <Marker
                key={`ambulance-${amb.ambulanceId}`}
                position={position}
                icon={ambulanceIcon}
              >
                <Popup>
                  🚑 <b>Ambulance {amb.ambulanceId}</b>
                  <br />🟢 LIVE GPS
                  <br />📍 {Number(amb.latitude).toFixed(6)}, {Number(amb.longitude).toFixed(6)}
                  {amb.emergencyCategory && (<>
                    <br />⚠️ {amb.emergencyCategory}
                  </>)}
                  {amb.destination && (<>
                    <br />🏥 {amb.destination}
                  </>)}
                  {isPrimary && <><br />⭐ Primary demo ambulance</>}
                </Popup>
              </Marker>
            );
          })}

          {/* ===========================================
              HOSPITAL
          =========================================== */}

          <Marker
            position={
              DEMO_HOSPITAL
            }
            icon={hospitalIcon}
          >

            <Popup>

              🏥{" "}

              <b>
                {DEMO_HOSPITAL_NAME}
              </b>

              <br />

              Emergency Department

            </Popup>

          </Marker>

          {/* ===========================================
              ONLY ACTUAL TP001 TRAFFIC POLICE
          =========================================== */}

          {trafficPoliceLive &&
            isValidLocation(
              trafficPoliceLocation
            ) && (

            <>

              <Marker
                position={
                  trafficPoliceLocation
                }
                icon={policeIcon}
              >

                <Popup>

                  🚔{" "}

                  <b>
                    Authorized Traffic Police
                  </b>

                  <br />

                  Police ID:{" "}

                  <b>
                    {AUTHORIZED_POLICE_ID}
                  </b>

                  <br />

                  🟢 LIVE GPS

                  <br />

                  📍 Latitude:{" "}

                  {trafficPoliceLocation[0].toFixed(
                    6
                  )}

                  <br />

                  📍 Longitude:{" "}

                  {trafficPoliceLocation[1].toFixed(
                    6
                  )}

                  <br />

                  📏 Actual Distance:{" "}

                  <b>
                    {policeDistanceText}
                  </b>

                  <br />

                  🚨 Status:{" "}

                  <b>
                    {policeInRange
                      ? "Alert Triggered"
                      : "No Alert"}
                  </b>

                </Popup>

              </Marker>

              {/* ONLY ONE POLICE 1 KM RANGE */}

              <Circle
                center={
                  trafficPoliceLocation
                }
                radius={
                  POLICE_ALERT_RADIUS_KM *
                  1000
                }
                pathOptions={{
                  weight: 2,
                  dashArray: "8 8",
                }}
              />

            </>

          )}

          {/* ===========================================
              ROUTE
          =========================================== */}

          {route.length > 0 && (

            <Polyline
              positions={
                route
              }
              pathOptions={{
                weight: 5,
              }}
            />

          )}

          {/* DIRECTION ARROWS — show the ambulance travel direction */}
          {routeArrows.map((arrow) => (
            <Marker
              key={arrow.key}
              position={arrow.position}
              icon={arrowIcon(arrow.rotation)}
              interactive={false}
            />
          ))}

        </MapContainer>

      </div>

      {/* =================================================
          INFORMATION PANEL
      ================================================= */}

      <div className="info">

        {/* =============================================
            BACKEND
        ============================================= */}

        <div className="status">

          🔌{" "}

          <b>
            Backend:
          </b>{" "}

          {backendStatus}

        </div>

        {/* =============================================
            ALL AMBULANCE TRAFFIC ALERTS
        ============================================= */}

        <div className="status" style={{ marginTop: "8px" }}>
          🚑 <b>Ambulances Online:</b> {Object.keys(ambulanceLocations).length}
          {Object.keys(ambulanceLocations).length > 1 && " • Multiple ambulance tracking enabled"}
        </div>

        <div style={{ marginTop: "10px", marginBottom: "10px" }}>
          <button
            onClick={sendDemoFleet}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#eef6ff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            🧪 Send 5 Demo Ambulances (AMB102–AMB106)
          </button>
        </div>

        {Object.keys(ambulanceAlerts).length > 0 && (
          <div className="alert">
            <h3>🚨 Traffic Alerts — All Ambulances</h3>
            {Object.values(ambulanceAlerts).map((alert) => (
              <div key={`alert-${alert.ambulanceId}`} style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid rgba(0,0,0,.12)" }}>
                🚑 <b>{alert.ambulanceId}</b> — {alert.body || "Ambulance is within 1 km."}
                <br />📏 Distance: <b>{alert.data?.distanceMeters ?? "—"} m</b>
                <br />⚠️ Emergency: <b>{alert.emergencyCategory || alert.data?.emergencyCategory || "Critical / High Priority"}</b>
                <br />🏥 Destination: <b>{alert.destination || alert.data?.destination || "Emergency Hospital"}</b>
              </div>
            ))}
          </div>
        )}

        {/* =============================================
            AMBULANCE GPS
        ============================================= */}

        <div className="status">

          🚑{" "}

          {actualAmbulanceGPS ? (

            <>

              <b>
                Ambulance LIVE GPS
              </b>

              {" — "}

              {actualAmbulanceGPS[0].toFixed(
                5
              )}

              {", "}

              {actualAmbulanceGPS[1].toFixed(
                5
              )}

            </>

          ) : (

            <>

              <b>
                Waiting for Ambulance LIVE GPS
              </b>

            </>

          )}

          {lastUpdated && (

            <>

              {" • Updated "}

              {lastUpdated.toLocaleTimeString()}

            </>

          )}

        </div>

        <div className="status">
          🧭 <b>Ambulance Direction:</b>{" "}
          {ambulanceHeading === null
            ? "Waiting for movement"
            : `${Math.round(ambulanceHeading)}° heading`}
          {route.length > 1 && " • Blue arrows show the route direction →"}
        </div>

        {/* =============================================
            GPS ERROR
        ============================================= */}

        {gpsError && (

          <div className="status">

            ⚠️{" "}
            {gpsError}

          </div>

        )}

        {/* =============================================
            TRAFFIC POLICE STATUS
        ============================================= */}

        <div className="status">

          🚔{" "}

          <b>
            Authorized Traffic Police:
          </b>{" "}

          {trafficPoliceLive
            ? "🟢 LIVE GPS • TP001"
            : "📡 Waiting for LIVE GPS"}

        </div>

        {/* =============================================
            POLICE PROXIMITY
        ============================================= */}

        {trafficPoliceLive &&
        isValidLocation(
          trafficPoliceLocation
        ) &&
        policeDistance !== null ? (

          policeInRange ? (

            // =========================================
            // WITHIN 1 KM
            // =========================================

            <div className="alert">

              <h3>
                🚨 Traffic Police Alert
              </h3>

              <div>

                🚑 Ambulance{" "}

                <b>
                  {AMBULANCE_ID}
                </b>

                {" "}is within{" "}

                <b>
                  1 km
                </b>

                {" "}of authorized Traffic Police.

              </div>

              <div>

                🚔 Police ID:{" "}

                <b>
                  {AUTHORIZED_POLICE_ID}
                </b>

              </div>

              <div>

                📍 Police GPS:{" "}

                <b>

                  {trafficPoliceLocation[0].toFixed(
                    5
                  )}

                  {", "}

                  {trafficPoliceLocation[1].toFixed(
                    5
                  )}

                </b>

              </div>

              <div>

                📏 Actual Distance:{" "}

                <b>
                  {policeDistanceText}
                </b>

              </div>

              <div>

                🏥 Destination:{" "}

                <b>
                  {trafficPoliceAlert?.destination ||
                    DEMO_HOSPITAL_NAME}
                </b>

              </div>

              <div>

                ⚠️ Emergency Category:{" "}

                <b>
                  {patientEmergencyCategory}
                </b>

              </div>

              <div>

                🚦 Action: Traffic Police can
                coordinate traffic clearance
                for the ambulance.

              </div>

              <div>

                ⚡ Source:{" "}

                <b>
                  Authorized Traffic Police LIVE GPS
                </b>

              </div>

            </div>

          ) : (

            // =========================================
            // OUTSIDE 1 KM
            // =========================================

            <div className="police">

              <h3>
                🚔 Traffic Police Proximity
              </h3>

              <div>

                Authorized Traffic Police{" "}

                <b>
                  {policeDistanceText}
                </b>

                {" "}away from Ambulance.

              </div>

              <div>

                🟢{" "}

                <span className="badge">
                  No Alert
                </span>

              </div>

              <div style={{
                marginTop: "8px",
                fontSize: "13px",
                opacity: 0.8,
              }}>

                Alert threshold:{" "}
                <b>
                  1 km
                </b>

                {" • "}

                Actual GPS distance:{" "}

                <b>
                  {policeDistanceText}
                </b>

              </div>

              <div style={{
                marginTop: "6px",
                fontSize: "13px",
                opacity: 0.8,
              }}>

                🚔 Police GPS:{" "}
                <b>
                  LIVE • TP001
                </b>

              </div>

            </div>

          )

        ) : (

          // =========================================
          // WAITING FOR ACTUAL GPS
          // =========================================

          <div className="police">

            <h3>
              🚔 Traffic Police Proximity
            </h3>

            <div>

              📡{" "}

              <b>
                Waiting for actual Traffic Police GPS
              </b>

            </div>

            <div style={{
              marginTop: "8px",
              fontSize: "13px",
              opacity: 0.8,
            }}>

              Authorized Police ID:{" "}
              <b>
                {AUTHORIZED_POLICE_ID}
              </b>

              {" • "}

              Actual GPS distance will be shown
              automatically.

            </div>

          </div>

        )}

        {/* =============================================
            ROUTE
        ============================================= */}

        <div className="status">

          🛣️{" "}

          <b>
            Route:
          </b>{" "}

          {routeStatus}

        </div>

        {/* =============================================
            STATS
        ============================================= */}

        <div className="stats">

          <div className="stat">

            <span>
              📏 Distance
            </span>

            <strong>

              {distance
                ? `${distance} km`
                : "Calculating..."}

            </strong>

          </div>

          <div className="stat">

            <span>
              ⏱️ ETA
            </span>

            <strong>

              {duration !== null
                ? `${duration} min`
                : "Calculating..."}

            </strong>

          </div>

          <div className="stat">

            <span>
              🚑 Ambulance
            </span>

            <strong>
              {AMBULANCE_ID}
            </strong>

          </div>

          <div className="stat">

            <span>
              🏥 Destination
            </span>

            <strong>
              {DEMO_HOSPITAL_NAME}
            </strong>

          </div>

        </div>

        {/* =============================================
            FINAL POLICE LOGIC
        ============================================= */}

        <div className="police">

          <h3>
            🚔 Traffic Police Alert Logic
          </h3>

          <div>

            <b>
              Authorized ID:
            </b>{" "}

            {AUTHORIZED_POLICE_ID}

            {" | "}

            <b>
              Range:
            </b>{" "}

            1 km

            {" | "}

            <b>
              Current Actual Distance:
            </b>{" "}

            {policeDistance !== null
              ? policeDistanceText
              : "Waiting for GPS"}

          </div>

          <div style={{
            marginTop: "6px",
          }}>

            <b>
              GPS Status:
            </b>{" "}

            {trafficPoliceLive
              ? "🟢 LIVE"
              : "📡 Waiting"}

            {" | "}

            <b>
              Alert:
            </b>{" "}

            {policeDistance === null
              ? "📡 Waiting for actual GPS"
              : policeInRange
              ? "🚨 Triggered"
              : "🟢 No Alert"}

          </div>

          {policeLastUpdated && (

            <div style={{
              marginTop: "6px",
              fontSize: "12px",
              opacity: 0.75,
            }}>

              Police GPS updated:{" "}

              {policeLastUpdated.toLocaleTimeString()}

            </div>

          )}

        </div>

      </div>

    </section>

  );
}
