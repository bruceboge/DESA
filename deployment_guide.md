# 🚀 DESA Decides 2026 — Full Deployment Guide

> **Single repo, three platforms**: One GitHub repo → Firebase (database + auth) → Render (backend) → Vercel (frontend)

---

## Step 0: Prerequisites

- [x] A **GitHub** account
- [x] A **Firebase** account (free Spark plan works) — [console.firebase.google.com](https://console.firebase.google.com)
- [x] A **Render** account (free tier works) — [render.com](https://render.com)
- [x] A **Vercel** account (free Hobby plan works) — [vercel.com](https://vercel.com)
- [x] **Node.js 18+** installed locally
- [x] **Git** installed locally

---

## Step 1: Initialize Git & Push to GitHub

Open a terminal in `C:\Users\bogeb\OneDrive\Documents\DESA`:

```bash
# Initialize git repo
git init

# Stage all files (the .gitignore files will exclude secrets automatically)
git add .

# Verify no secrets are staged — CHECK THIS CAREFULLY
git status

# You should NOT see:
#   backend/.env          (contains Firebase private key)
#   frontend/firebase-config.js  (contains project credentials)
# If you DO see them, run: git rm --cached <filename>

# Commit
git commit -m "Initial commit: DESA Decides 2026 voting app"

# Create the GitHub repo (using GitHub CLI, or create it on github.com)
# Option A — GitHub CLI:
gh repo create DESA --private --source=. --push

# Option B — Manual:
# 1. Go to github.com → New repository → Name it "DESA" → Private → Create
# 2. Then run:
git remote add origin https://github.com/YOUR_USERNAME/DESA.git
git branch -M main
git push -u origin main
```

> [!CAUTION]
> **Before pushing**, run `git status` and verify that `backend/.env` and `frontend/firebase-config.js` do NOT appear. These contain secrets. The `.gitignore` files should exclude them, but always double-check.

---

## Step 2: Firebase Setup

### 2.1 Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project**
3. Name it (e.g., `desa-decides-2026`)
4. Disable Google Analytics (optional, not needed)
5. Click **Create project**

### 2.2 Enable Firestore Database

1. In the Firebase Console sidebar → **Build** → **Firestore Database**
2. Click **Create database**
3. Choose a location close to your users (e.g., `us-central1` or `europe-west1`)
4. Start in **Production mode** (we'll deploy deny-all rules)
5. Click **Enable**

### 2.3 Deploy Firestore Security Rules

1. In Firestore → **Rules** tab
2. Replace the editor content with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**

> [!NOTE]
> These rules deny ALL browser/client access. The backend uses the Firebase Admin SDK, which **bypasses** Firestore rules entirely. This means only your server can read/write data — browsers cannot.

### 2.4 Enable Email/Password Authentication

1. Firebase Console sidebar → **Build** → **Authentication**
2. Click **Get started**
3. Go to **Sign-in method** tab
4. Click **Email/Password** → Enable it → **Save**

### 2.5 Create an Admin User

1. Still in Authentication → **Users** tab
2. Click **Add user**
3. Enter your admin email and a strong password
4. Click **Add user**
5. **Important**: Send a verification email or use the Firebase Admin SDK to verify the email. The backend requires `email_verified = true`.

> [!TIP]
> To verify the email quickly: sign in with this account in a test page, call `sendEmailVerification()`, and click the link in the email. Or use the Firebase CLI: `firebase auth:update <UID> --email-verified`

### 2.6 Register a Web App (for the frontend)

1. Firebase Console → **Project settings** (⚙️ gear icon) → **General**
2. Scroll to **Your apps** → Click the **Web** icon (`</>`)
3. Register the app (name it anything, e.g., "DESA Frontend")
4. **Do NOT** enable Firebase Hosting
5. Copy the config values shown:

```javascript
// You'll get something like:
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "desa-decides-2026.firebaseapp.com",
  projectId: "desa-decides-2026",
  appId: "1:123456789:web:abc123"
};
```

6. Open your local `frontend/firebase-config.js` and paste these values:

```javascript
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSy...',
  authDomain: 'desa-decides-2026.firebaseapp.com',
  projectId: 'desa-decides-2026',
  appId: '1:123456789:web:abc123'
};
```

> [!NOTE]
> These Firebase Web App keys are **public client identifiers**, not secrets. They're safe to deploy to Vercel. Firebase Security Rules and Authentication protect your data, not these keys.

### 2.7 Generate a Service Account Key (for the backend)

1. Firebase Console → **Project settings** → **Service accounts** tab
2. Click **Generate new private key** → **Generate key**
3. A JSON file downloads. Open it and note these three values:
   - `project_id`
   - `client_email`
   - `private_key`

4. Put them in your local `backend/.env`:

```env
PORT=3000
FIREBASE_PROJECT_ID=desa-decides-2026
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@desa-decides-2026.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...your key here...\n-----END PRIVATE KEY-----\n"
FIREBASE_ADMIN_EMAILS=your-admin@email.com
FRONTEND_ORIGIN=http://localhost:5500
```

> [!CAUTION]
> **NEVER commit this `.env` file or the downloaded JSON key.** The `.gitignore` already excludes it. The private key gives full admin access to your Firebase project.

### 2.8 Test Locally

```bash
# Terminal 1: Start backend
cd backend
npm install
npm start
# Should print: CivicVote is running at http://localhost:3000/...

# Terminal 2: Serve frontend (e.g., with VS Code Live Server on port 5500)
# Or use: npx serve frontend -l 5500
```

---

## Step 3: Deploy Backend to Render

### 3.1 Connect Your Repo

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your **GitHub account** if not already connected
4. Select your **DESA** repository
5. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `desa-backend` |
| **Region** | Oregon (or closest to your users) |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | Free |

### 3.2 Set Environment Variables

Still on the Render service page → **Environment** tab → Add each:

| Key | Value | Type |
|-----|-------|------|
| `NODE_ENV` | `production` | Plain |
| `FIREBASE_PROJECT_ID` | `desa-decides-2026` | **Secret** |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@desa-decides-2026.iam.gserviceaccount.com` | **Secret** |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\nMIIEv...` | **Secret** |
| `FIREBASE_ADMIN_EMAILS` | `your-admin@email.com` | **Secret** |
| `FRONTEND_ORIGIN` | *(set this AFTER Vercel deploy — come back to this)* | Plain |

> [!IMPORTANT]
> For `FIREBASE_PRIVATE_KEY`: paste the key **exactly** as it appears in the JSON file, including the `\n` characters. Do NOT add extra quotes around it in Render's UI — Render handles the value as-is.

### 3.3 Deploy

1. Click **Create Web Service** (or **Manual Deploy** → **Deploy latest commit**)
2. Wait for the build to complete (2-5 minutes on free tier)
3. Note your Render URL, e.g.: `https://desa-backend.onrender.com`
4. Test it: visit `https://desa-backend.onrender.com/api/health` — should return `{"ok":true}`

> [!TIP]
> Free Render services spin down after inactivity. The first request after idle takes ~30 seconds. This is normal for free tier.

---

## Step 4: Deploy Frontend to Vercel

### 4.1 Update `vercel.json` with Your Render URL

Before deploying, update the API rewrite in `frontend/vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://desa-backend.onrender.com/api/$1"
    }
  ]
}
```

Replace `your-render-service.onrender.com` with your actual Render hostname from Step 3.3.

**Commit and push this change:**

```bash
git add frontend/vercel.json
git commit -m "Update vercel.json with Render backend URL"
git push
```

### 4.2 Also commit `firebase-config.js`

Since the Firebase Web App config contains **public identifiers** (not secrets), you need to commit it so Vercel can serve it. Remove it from gitignore temporarily or commit it directly:

```bash
# Force-add it even though it's gitignored (it's safe — these are public keys)
git add -f frontend/firebase-config.js
git commit -m "Add Firebase web config (public client identifiers)"
git push
```

> [!NOTE]
> If you prefer not to commit it, you can instead inline the config values directly in `index.html`. But committing is simpler — Firebase Web App keys are designed to be public.

### 4.3 Connect to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. **Import** your GitHub **DESA** repository
4. Configure:

| Setting | Value |
|---------|-------|
| **Project Name** | `desa-decides` (or anything you want) |
| **Framework Preset** | Other |
| **Root Directory** | Click **Edit** → type `frontend` → confirm |
| **Build Command** | *(leave empty — it's static HTML)* |
| **Output Directory** | `.` |

5. Click **Deploy**

### 4.4 Note Your Vercel URL

After deploy completes, Vercel gives you a URL like:
```
https://desa-decides.vercel.app
```

### 4.5 Go Back to Render — Set FRONTEND_ORIGIN

1. Go to your Render service → **Environment**
2. Set `FRONTEND_ORIGIN` to your exact Vercel URL:
   ```
   https://desa-decides.vercel.app
   ```
   (No trailing slash!)
3. Render will auto-redeploy with the updated CORS origin

---

## Step 5: Post-Deployment Verification

### Checklist

- [ ] Visit `https://your-render-url.onrender.com/api/health` → should return `{"ok":true}`
- [ ] Visit `https://desa-decides.vercel.app` → the app should load
- [ ] Try logging in as a voter (you'll need to add voters via admin first)
- [ ] Go to Admin tab → sign in with your admin email/password
- [ ] Add a voter, an election, and a candidate
- [ ] Log in as the voter and cast a vote
- [ ] Try voting again in the same election → should be blocked ("already voted")

### Common Issues

| Problem | Solution |
|---------|----------|
| Admin sign-in says "not authorized" | Verify the email in `FIREBASE_ADMIN_EMAILS` matches exactly. Ensure the email is **verified** in Firebase Auth. |
| CORS errors in browser console | `FRONTEND_ORIGIN` on Render must be the **exact** Vercel URL (including `https://`, no trailing slash) |
| API calls fail / timeout | Free Render services sleep after 15 min. Wait ~30s for cold start. Check Render logs for errors. |
| "Firebase web configuration is missing" | `firebase-config.js` wasn't deployed. Ensure it was committed and pushed (Step 4.2). |
| `FIREBASE_PRIVATE_KEY` error on Render | Paste the key value without surrounding quotes in Render's UI. Include the `\n` literally. |

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│                    GitHub (Single Repo)                       │
│  DESA/                                                       │
│  ├── frontend/    ──→  Vercel (static HTML/JS/CSS)           │
│  ├── backend/     ──→  Render (Node.js Express API)          │
│  └── firestore.rules   (deployed manually in Firebase Console)│
└──────────────────────────────────────────────────────────────┘

Browser → Vercel (frontend) → /api/* rewrite → Render (backend) → Firebase Admin SDK → Firestore
                             → Firebase Auth (client-side sign-in for admin)
```

### What lives where

| Platform | What | Secrets? |
|----------|------|----------|
| **GitHub** | All source code, `vercel.json`, `render.yaml`, `firebase-config.js` | ❌ No secrets in repo |
| **Firebase** | Firestore database, Auth users, security rules | Managed by Google |
| **Render** | Backend API server + all env secrets (`FIREBASE_PRIVATE_KEY`, etc.) | ✅ Set in Render Dashboard |
| **Vercel** | Static frontend files, API proxy rewrite | ❌ No secrets needed |
