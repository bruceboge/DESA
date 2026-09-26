# CivicVote backend

The backend connects to Firestore with Firebase Admin SDK credentials. Keep the service-account private key only in Render environment variables or an untracked local `backend/.env` file. Never place it in frontend files.

## Firebase and administrator setup

1. Create a Firebase project and enable Firestore Database.
2. In Firebase Console, open Authentication -> Sign-in method and enable Email/Password.
3. Open Authentication -> Users and add each administrator account. Require each administrator to verify their email address.
4. Register a Firebase Web App in Project settings -> General -> Your apps. Copy its `apiKey`, `authDomain`, `projectId`, and `appId` into `frontend/firebase-config.js`. These web-app settings are public identifiers, not service-account secrets.
5. In Project settings -> Service accounts, generate a private key for the backend. Copy its `project_id`, `client_email`, and `private_key` into the environment values below.
6. Publish the deny-by-default rules from the repository's `firestore.rules` in Firestore -> Rules. The backend Admin SDK bypasses Firestore rules; browsers and other Firebase clients do not.

## Local run

1. Install Node.js 18 or newer.
2. From this folder, run `npm install`.
3. Copy `.env.example` to `.env` and fill in the Firebase server credentials.
4. Set `FIREBASE_ADMIN_EMAILS` to the comma-separated, verified email addresses of dashboard administrators.
5. Set `FRONTEND_ORIGIN` to the exact browser origin serving the frontend, such as `http://localhost:5500`. For Vercel, use the deployed HTTPS domain (no trailing slash).
6. Start the app with `npm start`.

The frontend sends Firebase ID tokens to `/api/admin/*`. The backend verifies the token, requires a verified email, and checks it against `FIREBASE_ADMIN_EMAILS`. Do not rely on the hidden dashboard UI as the security boundary; the API enforces authorization independently.

## Render environment

Set these in Render -> your service -> Environment:

```env
NODE_ENV=production
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-firebase-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
FIREBASE_ADMIN_EMAILS=admin@example.com
FRONTEND_ORIGIN=https://your-vercel-domain.vercel.app
```

Render supplies `PORT`; do not set it unless your service configuration explicitly requires it. Add each additional Vercel preview/production origin to `FRONTEND_ORIGIN` as comma-separated exact origins if needed.
