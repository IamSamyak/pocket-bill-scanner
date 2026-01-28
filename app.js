import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, push, get, onValue, set } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

/* ================= FIREBASE ================= */
const firebaseConfig = {
  apiKey: "AIzaSyBBPZOSFp4Xg5ASC4jd_zEbeVulDRp4Xsk",
  authDomain: "testing-pocket-bill.firebaseapp.com",
  databaseURL: "https://testing-pocket-bill-default-rtdb.asia-southeast1.firebasedatabase.app",
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

/* ================= STATUS BANNER ================= */
let statusBanner = document.createElement("div");
statusBanner.className = "status-banner";
statusBanner.textContent = "Initializing...";
scannerFrame.appendChild(statusBanner);

function updateStatus(text, type = "") {
  statusBanner.textContent = text;
  statusBanner.className = "status-banner " + type;
}

/* ================= SOUND ================= */
const beepSound = new Audio("scanner-beep.mp3");
beepSound.preload = "auto";

/* ================= STATE ================= */
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
  try {
    await set(ref(db, "client_token"), {
      token: token,
      lastUpdated: Date.now()
    });
    console.log("✅ Client token written to DB");
  } catch (err) {
    console.error("❌ Failed to write client token:", err);
  }
}

/* ================= MACHINE STATUS ================= */
async function checkServerStatus() {
  try {
    const statusRef = ref(db, "server_status/isMatchingListening/value");

    // Check once on startup
    const snapshot = await get(statusRef);
    let isListening = snapshot.exists() ? snapshot.val() : false;

    if (!isListening) {
      updateStatus("❌ Machine is not listening!", "error");
    } else {
      updateStatus("✅ Machine is listening", "success");
    }

    // Listen to real-time updates
    onValue(statusRef, (snap) => {
      isListening = snap.exists() ? snap.val() : false;
      if (!isListening) {
        updateStatus("❌ Machine is not listening!", "error");
      } else {
        updateStatus("✅ Machine is listening", "success");
      }
    });
  } catch (err) {
    console.error("Failed to get server status:", err);
    updateStatus("❌ Unable to read machine status", "error");
  }
}

/* ================= INIT: WRITE TOKEN THEN CHECK STATUS ================= */
if (TOKEN) {
  writeClientToken(TOKEN).then(() => {
    checkServerStatus();
  });
}

/* ================= HELPERS ================= */
function getBackCameraIndex(list) {
  const keywords = ["back", "rear", "environment"];
  return list.findIndex(cam =>
    keywords.some(k => cam.label.toLowerCase().includes(k))
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
  if (scanLocked) return;
  scanLocked = true;

  if (!TOKEN) return;

  try {
    await push(ref(db, "instant_scans"), {
      qr,
      token: TOKEN,
      createdAt: Date.now()
    });

    beepSound.currentTime = 0;
    beepSound.play().catch(() => {});
    updateStatus("✅ QR scanned successfully!", "success");
  } catch (err) {
    console.error(err);
    updateStatus("❌ Scan failed", "error");
  }

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

  try {
    cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) {
      updateStatus("❌ No cameras found", "error");
      return;
    }

    const backIndex = getBackCameraIndex(cameras);
    currentCameraIndex = backIndex !== -1 ? backIndex : 0;
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
  } catch (err) {
    console.error(err);
    updateStatus("❌ Camera error", "error");
  }
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

  try {
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
  } catch {
    updateStatus("❌ Flash error", "error");
  }
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
    const file = input.files[0];
    if (!file) return;

    try {
      const qr = await scanner.scanFile(file, true);
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

  try {
    await push(ref(db, "instant_commands"), {
      type: "print",
      token: TOKEN,
      createdAt: Date.now()
    });

    updateStatus("✅ Print sent", "success");
  } catch {
    updateStatus("❌ Print failed", "error");
  }
};
