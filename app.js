import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  get,
  onValue,
  set,
  off
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

/* ================= FIREBASE ================= */
const firebaseConfig = {
  apiKey: "AIzaSyBBPZOSFp4Xg5ASC4jd_zEbeVulDRp4Xsk",
  authDomain: "testing-pocket-bill.firebaseapp.com",
  databaseURL:
    "https://testing-pocket-bill-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "testing-pocket-bill",
  storageBucket: "testing-pocket-bill.firebasestorage.app",
  messagingSenderId: "72049299092",
  appId: "1:72049299092:web:20a3b9e18ce110c61a6e81"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ================= DOM ================= */
const overlay = document.getElementById("overlay");
const scannerFrame = document.querySelector(".scanner-frame");
const cameraBtn = document.getElementById("cameraBtn");
const uploadBtn = document.getElementById("uploadBtn");
const flipBtn = document.getElementById("flipBtn");
const printBtn = document.getElementById("printBtn");
const flashBtn = document.getElementById("flashBtn");
const refreshBtn = document.getElementById("refreshBtn");

/* ================= STATUS BANNER ================= */
const statusBanner = document.createElement("div");
statusBanner.className = "status-banner";
statusBanner.textContent = "Initializing...";
scannerFrame.appendChild(statusBanner);

function updateStatus(text, type = "") {
  statusBanner.textContent = text;
  statusBanner.className = "status-banner " + type;
}

// REFRESH BUTTON
refreshBtn.onclick = () => {
  location.reload();
};


/* ================= SOUND ================= */
const beepSound = new Audio("scanner-beep.mp3");
beepSound.preload = "auto";

/* ================= SCANNER STATE ================= */
const scanner = new Html5Qrcode("reader");
let cameraActive = false;
let cameras = [];
let currentCameraIndex = 0;
let flashOn = false;
let scanLocked = false;

/* ================= TOKEN ================= */
const TOKEN =
  new URLSearchParams(location.search).get("token") ||
  localStorage.getItem("instant_token");

if (!TOKEN) {
  updateStatus("❌ No token found!", "error");
  alert("❌ No token found. Unable to proceed.");
} else {
  localStorage.setItem("instant_token", TOKEN);
}

/* ================= CLIENT TOKEN WRITE ================= */
async function writeClientToken(token) {
  await set(ref(db, "client_token"), {
    token,
    lastUpdated: Date.now()
  });
}

/* ================= SERVER LISTENING HANDSHAKE ================= */
async function checkServerListeningStatus() {
  const requestRef = ref(db, "server_status/serverListeningRequest");
  const responseRef = ref(db, "server_status/serverListeningResponse");

  updateStatus("🔄 Checking machine status...");

  const requestTime = Date.now();
  let responded = false;

  // 1️⃣ Send request
  await set(requestRef, { askedAt: requestTime });

  // 2️⃣ Listen for fresh response only
  const unsubscribe = onValue(responseRef, (snap) => {
    if (!snap.exists()) return;

    const data = snap.val();
    if (!data.respondedAt || data.respondedAt < requestTime) return;

    responded = true;
    off(responseRef);
    clearTimeout(timeoutId);

    if (data.isListening) {
      updateStatus("✅ Machine is listening", "success");
    } else {
      updateStatus("⚠️ Machine is ON but not listening", "warning");
    }
  });

  // 3️⃣ Timeout → OFFLINE
  const timeoutId = setTimeout(() => {
    if (responded) return;

    off(responseRef);
    updateStatus("❌ Machine is OFFLINE", "error");
  }, 3000); // 3 seconds is perfect
}

/* ================= INIT ================= */
if (TOKEN) {
  writeClientToken(TOKEN).then(checkServerListeningStatus);
}

/* ================= HELPERS ================= */
function getBackCameraIndex(list) {
  const keywords = ["back", "rear", "environment"];
  return list.findIndex((cam) =>
    keywords.some((k) => cam.label.toLowerCase().includes(k))
  );
}

async function stopCamera() {
  if (!cameraActive) return;

  try {
    await scanner.stop();
    await scanner.clear();
  } catch {}

  cameraActive = false;
  flashOn = false;
  cameraBtn.classList.remove("active");
  flashBtn.classList.remove("active");
  flashBtn.style.display = "none";
  overlay.style.display = "flex";
}

/* ================= SCAN HANDLER ================= */
async function handleScan(qr) {
  if (scanLocked || !TOKEN) return;
  scanLocked = true;

  await push(ref(db, "instant_scans"), {
    qr,
    token: TOKEN,
    createdAt: Date.now()
  });

  beepSound.currentTime = 0;
  beepSound.play().catch(() => {});
  updateStatus("✅ QR scanned successfully!", "success");
  await stopCamera();
}

/* ================= CAMERA START ================= */
cameraBtn.onclick = async () => {
  if (!TOKEN) return;

  if (cameraActive) {
    await stopCamera();
    updateStatus("📷 Camera stopped");
    return;
  }

  cameras = await Html5Qrcode.getCameras();
  if (!cameras.length) {
    updateStatus("❌ No cameras found", "error");
    return;
  }

  currentCameraIndex = getBackCameraIndex(cameras) || 0;
  scanLocked = false;

  await scanner.start(
    { deviceId: { exact: cameras[currentCameraIndex].id } },
    { fps: 12, qrbox: { width: 350, height: 350 } },
    handleScan
  );

  cameraActive = true;
  cameraBtn.classList.add("active");
  overlay.style.display = "none";
  flashBtn.style.display = "flex";
  updateStatus("📷 Scanning...");
};

/* ================= CAMERA FLIP ================= */
flipBtn.onclick = async () => {
  if (!cameraActive || cameras.length < 2) {
    updateStatus("❌ Cannot flip camera", "error");
    return;
  }

  await stopCamera();
  currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
  cameraBtn.onclick();
};

/* ================= FLASH ================= */
flashBtn.onclick = async () => {
  if (!cameraActive) return;

  const track = scanner.getRunningTrack();
  const caps = track.getCapabilities();
  if (!caps.torch) {
    updateStatus("❌ Flash not supported", "warning");
    return;
  }

  flashOn = !flashOn;
  await track.applyConstraints({ advanced: [{ torch: flashOn }] });
  flashBtn.classList.toggle("active", flashOn);
  updateStatus(flashOn ? "🔦 Flash on" : "🔦 Flash off");
};

/* ================= IMAGE UPLOAD ================= */
uploadBtn.onclick = async () => {
  if (!TOKEN) return;

  await stopCamera();
  scanLocked = false;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.click();

  input.onchange = async () => {
    try {
      const qr = await scanner.scanFile(input.files[0], true);
      await handleScan(qr);
    } catch {
      updateStatus("❌ No QR found in image", "error");
    } finally {
      await scanner.clear();
      input.value = "";
    }
  };
};

/* ================= PRINT ================= */
printBtn.onclick = async () => {
  if (!TOKEN) return;

  await push(ref(db, "instant_commands"), {
    type: "print",
    token: TOKEN,
    createdAt: Date.now()
  });

  updateStatus("✅ Print sent", "success");
};
