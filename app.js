import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

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
const overlay   = document.getElementById("overlay");
const status    = document.getElementById("status");
const cameraBtn = document.getElementById("cameraBtn");
const uploadBtn = document.getElementById("uploadBtn");
const flipBtn   = document.getElementById("flipBtn");
const printBtn  = document.getElementById("printBtn");
const flashBtn  = document.getElementById("flashBtn");

/* ================= SOUND ================= */
const beepSound = new Audio("scanner-beep.mp3");
beepSound.preload = "auto";

/* ================= STATE ================= */
const scanner = new Html5Qrcode("reader");

let cameraActive = false;
let cameras = [];
let currentCameraIndex = 0;
let flashOn = false;
let scanLocked = false; // 🔒 HARD LOCK

/* ================= TOKEN ================= */
const TOKEN =
  new URLSearchParams(location.search).get("token") ||
  localStorage.getItem("instant_token");

if (!TOKEN) {
  status.textContent = "❌ No token found.";
  alert("❌ No token found. Unable to proceed.");
} else {
  localStorage.setItem("instant_token", TOKEN);
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
    await scanner.clear(); // 🔥 removes camera / image UI
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
  if (scanLocked) return;   // 🔥 BLOCK duplicates
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
    status.textContent = "✅ QR scanned successfully!";
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Scan failed";
  }

  // 🔥 FORCE CAMERA CLOSE AFTER ONE SCAN
  await stopCamera();
}

/* ================= CAMERA START ================= */
cameraBtn.onclick = async () => {
  if (!TOKEN) return;

  if (cameraActive) {
    await stopCamera();
    status.textContent = "📷 Camera stopped";
    return;
  }

  try {
    cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) {
      status.textContent = "❌ No cameras found";
      return;
    }

    const backIndex = getBackCameraIndex(cameras);
    currentCameraIndex = backIndex !== -1 ? backIndex : 0;

    scanLocked = false; // 🔓 RESET LOCK ON START

    await scanner.start(
      { deviceId: { exact: cameras[currentCameraIndex].id } },
      { fps: 12, qrbox: { width: 350, height: 350 } },
      handleScan
    );

    cameraActive = true;
    cameraBtn.classList.add("active");
    overlay.style.display = "none";
    flashBtn.style.display = "flex";
    status.textContent = "📷 Scanning...";
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Camera error";
  }
};

/* ================= CAMERA FLIP ================= */
flipBtn.onclick = async () => {
  if (!cameraActive || cameras.length < 2) {
    status.textContent = "❌ Cannot flip camera";
    return;
  }

  await stopCamera();
  currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
  cameraBtn.onclick(); // restart camera cleanly
};

/* ================= FLASH ================= */
flashBtn.onclick = async () => {
  if (!cameraActive) return;

  try {
    const track = scanner.getRunningTrack();
    const caps = track.getCapabilities();
    if (!caps.torch) {
      status.textContent = "❌ Flash not supported";
      return;
    }

    flashOn = !flashOn;
    await track.applyConstraints({ advanced: [{ torch: flashOn }] });

    flashBtn.classList.toggle("active", flashOn);
    status.textContent = flashOn ? "🔦 Flash on" : "🔦 Flash off";
  } catch {
    status.textContent = "❌ Flash error";
  }
};

/* ================= IMAGE UPLOAD ================= */
uploadBtn.onclick = async () => {
  if (!TOKEN) return;

  await stopCamera(); // 🔥 ensure camera is fully closed
  scanLocked = false; // allow image scan once

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
      status.textContent = "❌ No QR found in image";
    } finally {
      await scanner.clear(); // 🔥 remove image preview
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

    status.textContent = "✅ Print sent";
  } catch {
    status.textContent = "❌ Print failed";
  }
};
