# Login & Logout Tracker

A real-time web application for tracking user login and logout actions. All data is shared globally across devices using **Firebase Firestore**, with timestamps displayed in **Philippine Standard Time (Asia/Manila)**.

![Login Logout Tracker](https://img.shields.io/badge/Stack-HTML%20%7C%20CSS%20%7C%20JS-blue)
![Firebase](https://img.shields.io/badge/Database-Firestore-orange)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Log In / Log Out** — Record actions with Full Name and Section
- **Real-time sync** — All users see updates instantly without refreshing
- **Dashboard stats** — Total Log Ins, Total Log Outs, Active Users
- **Currently logged-in users** — Based on each user's latest action
- **Search & filter** — Find logs by name/section, filter by IN/OUT/All
- **CSV export** — Download filtered records
- **Dark mode** — Toggle between light and dark themes
- **Mobile-responsive** — Works on phones, tablets, and desktops
- **Philippine Standard Time** — All timestamps in Asia/Manila timezone

---

## Quick Start

### Prerequisites

- A [Firebase](https://firebase.google.com/) account (free tier works)
- A modern web browser
- Optional: [GitHub](https://github.com/) account for deployment

---

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** and follow the setup wizard
3. Once created, click **Build → Firestore Database**
4. Click **Create database**
5. Choose **Start in test mode** (for development) and select a region close to the Philippines (e.g., `asia-southeast1`)
6. Click **Enable**

### Step 2: Register a Web App

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll to **Your apps** and click the **Web** icon (`</>`)
3. Register your app with a nickname (e.g., "Login Tracker")
4. Copy the `firebaseConfig` object values

### Step 3: Configure the App

Open `js/firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",           // Your API key
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Step 4: Set Firestore Security Rules

In Firebase Console → **Firestore Database → Rules**, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /attendance_logs/{logId} {
      allow read, write: if true;
    }
  }
}
```

> **Note:** These rules allow public read/write access, suitable for internal/trusted use. For production, implement Firebase Authentication and restrict writes to authenticated users.

Click **Publish**.

### Step 5: Run Locally

Since the app uses ES modules from CDN, you need a local server (browsers block Firebase from `file://` URLs).

**Option A — VS Code Live Server:**
1. Install the "Live Server" extension
2. Right-click `index.html` → **Open with Live Server**

**Option B — Python:**
```bash
# Python 3
python -m http.server 8080
```
Then open `http://localhost:8080`

**Option C — Node.js:**
```bash
npx serve .
```

---

## Deploy to GitHub Pages

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Add login/logout tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/login-logout-tracker.git
git push -u origin main
```

### Step 2: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings → Pages**
3. Under **Source**, select **Deploy from a branch**
4. Choose **main** branch and **/ (root)** folder
5. Click **Save**

Your app will be live at: `https://YOUR_USERNAME.github.io/login-logout-tracker/`

### Step 3: Add Firebase Authorized Domain

1. In Firebase Console → **Authentication → Settings → Authorized domains**
2. Add your GitHub Pages URL: `YOUR_USERNAME.github.io`

> Firestore does not require domain authorization, but if you add Auth later, this step is needed.

---

## Project Structure

```
login-logout-tracker/
├── index.html              # Main HTML page
├── css/
│   └── styles.css          # All styles (light/dark mode, responsive)
├── js/
│   ├── firebase-config.js  # Firebase credentials (configure this)
│   └── app.js              # Application logic
└── README.md               # This file
```

---

## How It Works

### Data Model

Each log entry in Firestore (`attendance_logs` collection):

| Field         | Type      | Description                    |
|---------------|-----------|--------------------------------|
| `fullName`    | string    | User's full name               |
| `section`     | string    | User's section                 |
| `actionType`  | string    | `"IN"` or `"OUT"`              |
| `timestamp`   | timestamp | Server timestamp (Firestore)   |
| `dateDisplay` | string    | Pre-formatted date (PST)       |
| `timeDisplay` | string    | Pre-formatted time (PST)       |
| `createdAt`   | string    | ISO string fallback            |

### Active Users Logic

A user (identified by **Full Name + Section**) is considered "logged in" if their **most recent action** is `IN`.

### Real-time Updates

The app uses Firestore's `onSnapshot()` listener. When any user logs in or out, all connected clients receive the update instantly.

### Timezone

All displayed times use `Intl.DateTimeFormat` with `timeZone: 'Asia/Manila'` (Philippine Standard Time, UTC+8).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Firebase not configured" banner | Update `js/firebase-config.js` with your credentials |
| "Failed to sync data" | Check Firestore rules and internet connection |
| Blank table after setup | Verify Firestore database is created and rules are published |
| CORS errors locally | Use a local server, not `file://` |
| Data not shared between devices | Ensure both devices use the same Firebase project |

---

## Production Recommendations

1. **Add Firebase Authentication** — Require users to sign in before logging actions
2. **Tighten Firestore rules** — Restrict writes to authenticated users
3. **Add input validation rules** — Limit name/section length in security rules
4. **Enable App Check** — Protect against abuse
5. **Set up Firestore indexes** — If querying large datasets

Example production Firestore rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /attendance_logs/{logId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.fullName is string
        && request.resource.data.fullName.size() > 0
        && request.resource.data.fullName.size() <= 100
        && request.resource.data.section is string
        && request.resource.data.actionType in ['IN', 'OUT'];
      allow update, delete: if false;
    }
  }
}
```

---

## License

MIT License — free to use and modify.
