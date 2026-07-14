/* Optional cloud sync via Firebase (Auth + Firestore).
   Loaded only over http(s); on the offline single-file build / artifact this
   script is stripped, and if the CDN can't load the app just stays local-only.
   Progress is stored per user at users/{uid} as a JSON string. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxse8uzTDi3eiMEZGsqPFEWXlMySK67Ts",
  authDomain: "smle-study.firebaseapp.com",
  projectId: "smle-study",
  storageBucket: "smle-study.firebasestorage.app",
  messagingSenderId: "721369503093",
  appId: "1:721369503093:web:ad55277e4e42e90373ef3c",
};

const $ = (s) => document.querySelector(s);
const box = $("#cloud-box");
const statusEl = $("#cloud-status");
const btnIn = $("#btn-signin");
const btnOut = $("#btn-signout");
const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

let auth, db;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  if (box) box.hidden = false; // Firebase is available → reveal the cloud section
} catch (e) {
  // SDK/config problem → stay local-only, leave the cloud box hidden
  console.warn("Firebase init failed; running local-only.", e);
}

if (auth && db) {
  let currentUser = null;
  let unsub = null;
  let pushTimer = null;

  const label = (u) => u && (u.email || u.displayName || "signed in");
  const cloudRef = (uid) => doc(db, "users", uid);

  async function writeCloud(uid, state) {
    await setDoc(cloudRef(uid), { data: JSON.stringify({ v: 1, state }), updated: serverTimestamp() });
  }

  function friendlyError(e) {
    const c = (e && e.code) || "";
    if (c === "auth/operation-not-allowed") return "Turn on Google sign-in in Firebase → Authentication.";
    if (c === "auth/unauthorized-domain") return "Add this site to Firebase → Auth → Settings → Authorized domains.";
    if (c === "permission-denied" || c === "firestore/permission-denied") return "Set the Firestore security rules (see setup) and enable Firestore.";
    return "Sync error: " + ((e && (e.message || e.code)) || e);
  }

  if (btnIn) btnIn.onclick = async () => {
    setStatus("Opening Google sign-in…");
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      const c = (e && e.code) || "";
      if (c === "auth/popup-blocked" || c === "auth/cancelled-popup-request" || c === "auth/popup-closed-by-user" || c === "auth/operation-not-supported-in-this-environment") {
        try { await signInWithRedirect(auth, provider); return; } catch (_) { /* fall through */ }
      }
      setStatus(friendlyError(e));
    }
  };
  if (btnOut) btnOut.onclick = () => signOut(auth).catch(() => {});

  getRedirectResult(auth).catch(() => {});

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (unsub) { unsub(); unsub = null; }

    if (!user) {
      if (btnIn) btnIn.hidden = false;
      if (btnOut) btnOut.hidden = true;
      setStatus("Sign in to sync your progress across all your devices.");
      return;
    }
    if (btnIn) btnIn.hidden = true;
    if (btnOut) btnOut.hidden = false;
    setStatus("Syncing… (" + label(user) + ")");

    try {
      const snap = await getDoc(cloudRef(user.uid));
      if (snap.exists() && snap.data().data) {
        const remote = JSON.parse(snap.data().data);
        const merged = window.__smle.mergeIncoming(remote.state ? remote.state : remote);
        await writeCloud(user.uid, merged); // push the merged result back up
      } else {
        await writeCloud(user.uid, window.__smle.getState()); // first time: seed the cloud
      }
      setStatus("Synced ✓  (" + label(user) + ")");
    } catch (e) {
      setStatus(friendlyError(e));
      return;
    }

    // live updates from other devices
    unsub = onSnapshot(cloudRef(user.uid), (snap) => {
      if (snap.metadata.hasPendingWrites) return; // ignore our own just-written data
      const d = snap.data();
      if (d && d.data) {
        try {
          const remote = JSON.parse(d.data);
          window.__smle.mergeIncoming(remote.state ? remote.state : remote);
          setStatus("Synced ✓  (" + label(user) + ")");
        } catch (_) { /* ignore malformed */ }
      }
    });
  });

  // debounced push whenever local progress changes
  window.__smle.onChange = () => {
    if (!currentUser) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        await writeCloud(currentUser.uid, window.__smle.getState());
        setStatus("Synced ✓  (" + label(currentUser) + ")");
      } catch (e) {
        setStatus(friendlyError(e));
      }
    }, 1500);
  };
}
