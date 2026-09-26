# DESA Frontend

This folder contains the Vercel-deployable frontend for the DESA voting app.

## Firebase Auth setup

1. In Firebase Console -> Project settings -> General, register a Web App in the Firebase project used by the backend.
2. Copy its `apiKey`, `authDomain`, `projectId`, and `appId` into `firebase-config.js`. These are public client settings; never put a service-account private key here.
3. In Firebase Console -> Authentication -> Sign-in method, enable Email/Password.
4. Add an administrator under Authentication -> Users and verify that account's email.
5. Add the same verified email to the backend's `FIREBASE_ADMIN_EMAILS` environment variable. Only listed addresses can access the admin API and dashboard.

## Local development

Serve this folder on `http://localhost:5500` (for example, with VS Code Live Server) and run the backend on port 3000. Set `FRONTEND_ORIGIN=http://localhost:5500` in the backend environment. If using a different local frontend port, update that value to match exactly.

## Vercel deployment

Replace `your-render-service.onrender.com` in `vercel.json` with the actual Render service hostname. Production API calls then go through Vercel's `/api` rewrite. Set the exact Vercel site origin in Render's `FRONTEND_ORIGIN`, for example `https://your-project.vercel.app` with no trailing slash. Localhost uses `http://localhost:3000` automatically. Keep Firebase Admin credentials only in Render environment variables.
