# EMMC Maps + GPS — Real 1 KM Police Push Alert

This package contains the frontend and a separate Node/Express backend for real Web Push notifications.

## What was fixed
- Both Ambulance and Traffic Police now use the same `VITE_BACKEND_URL` configuration.
- Removed the old hard-coded/non-existent `emmc-backend.onrender.com` URL.
- Added backend health/push configuration checks.
- Added real Web Push subscription flow for Traffic Police.
- Added 1 km proximity alert with a 60-second cooldown.
- Added route direction arrows.

## Important
A browser frontend cannot create a real background push notification by itself. The `server/` backend must be deployed and configured with VAPID keys. The frontend must then be rebuilt with the backend URL.

## Local test
Terminal 1:
```bash
cd server
npm install
npm run generate-vapid
```
Copy the generated public/private keys into `server/.env` and set `FRONTEND_ORIGIN=http://localhost:5173`.

Then:
```bash
npm start
```

Terminal 2 (project root):
```bash
npm install
```
Create `.env` from `.env.example` and keep:
```env
VITE_BACKEND_URL=http://localhost:3001
```
Then:
```bash
npm run dev
```

## Production
1. Deploy `server/` to Render (the included `server/render.yaml` can be used as a guide).
2. Set `FRONTEND_ORIGIN` to the exact Vercel frontend URL.
3. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on Render.
4. Set `VITE_BACKEND_URL=https://YOUR-RENDER-BACKEND.onrender.com` in the Vercel project environment variables.
5. Redeploy Vercel.
6. On Traffic Police mobile, open the HTTPS Vercel site, login with the authorized police ID, tap **Enable Mobile Alerts**, and choose **Allow**.

## 1 KM logic
The backend calculates Haversine distance using actual GPS coordinates received from the ambulance and authorized traffic police. When distance is <= 1 km, a Web Push notification is sent to the police subscription.


### Traffic Alerts
When authorized Traffic Police TP001 is within 1 km of ambulance AMB102, the backend emits a police-room `policeAlert` event and attempts Web Push. The Police screen shows a bottom `Traffic Alerts` panel with distance, emergency priority, destination, and the action to clear traffic/jam.
