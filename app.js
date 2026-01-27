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

const overlay = document.getElementById("overlay");
const status = document.getElementById("status");
const cameraBtn = document.getElementById("cameraBtn");
const uploadBtn = document.getElementById("uploadBtn");
const flipBtn = document.getElementById("flipBtn");
const printBtn = document.getElementById("printBtn");
const flashBtn = document.getElementById("flashBtn");

/* ================= SOUND ================= */

const beepSound = new Audio("scanner-beep.mp3");
beepSound.preload = "auto";

/* ================= STATE ================= */

let scanner = null;
let cameraActive = false;
let cameras = [];
let currentCameraIndex = 0;
let flashOn = false;

let lastScanTime = 0;
let scanInProgress = false;
const SCAN_DELAY = 1000;

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

function getBackCameraIndex(cameras) {
  const keywords = ["back", "rear", "environment"];
  return cameras.findIndex(cam =>
    keywords.some(k => cam.label.toLowerCase().includes(k))
  );
}

/* ================= SCAN HANDLER ================= */

async function handleScan(qr) {
  if (!TOKEN) return;

  const now = Date.now();
  if (scanInProgress || now - lastScanTime < SCAN_DELAY) return;

  scanInProgress = true;
  lastScanTime = now;

  try {
    await push(ref(db, "instant_scans"), {
      qr,
      token: TOKEN,
      createdAt: now
    });

    beepSound.currentTime = 0;
    beepSound.play().catch(() => {});
    status.textContent = "✅ QR scanned successfully!";
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Scan failed";
  }

  setTimeout(() => (scanInProgress = false), SCAN_DELAY);
}

/* ================= CAMERA START / STOP ================= */

cameraBtn.onclick = async () => {
  if (!TOKEN) return;

  if (!cameraActive) {
    try {
      cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) {
        status.textContent = "❌ No cameras found";
        return;
      }

      const backIndex = getBackCameraIndex(cameras);
      currentCameraIndex = backIndex !== -1 ? backIndex : 0;

      scanner ??= new Html5Qrcode("reader");

      await scanner.start(
        { deviceId: { exact: cameras[currentCameraIndex].id } },
        { fps: 15, qrbox: { width: 400, height: 400 }, aspectRatio: 1 },
        handleScan
      );

      cameraActive = true;
      cameraBtn.classList.add("active");
      overlay.style.display = "none";
      flashBtn.style.display = "flex";
      status.textContent = "📷 Camera active";
    } catch (err) {
      console.error(err);
      status.textContent = "❌ Camera error";
    }
  } else {
    await scanner.stop();
    await scanner.clear();
    cameraActive = false;
    flashOn = false;

    cameraBtn.classList.remove("active");
    flashBtn.classList.remove("active");
    flashBtn.style.display = "none";
    overlay.style.display = "flex";

    status.textContent = "📷 Camera stopped";
  }
};

/* ================= CAMERA FLIP ================= */

flipBtn.onclick = async () => {
  if (!cameraActive || cameras.length < 2) {
    status.textContent = "❌ Cannot flip camera";
    return;
  }

  try {
    await scanner.stop();
    await scanner.clear();
    flashOn = false;
    flashBtn.classList.remove("active");

    currentCameraIndex = (currentCameraIndex + 1) % cameras.length;

    await scanner.start(
      { deviceId: { exact: cameras[currentCameraIndex].id } },
      { fps: 15, qrbox: { width: 400, height: 400 }, aspectRatio: 1 },
      handleScan
    );

    status.textContent = "📷 Camera switched";
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Flip failed";
  }
};

/* ================= FLASH (TORCH) ================= */

flashBtn.onclick = async () => {
  if (!scanner || !cameraActive) return;

  try {
    const track = scanner.getRunningTrack();
    const caps = track.getCapabilities();

    if (!caps.torch) {
      status.textContent = "❌ Flash not supported";
      return;
    }

    flashOn = !flashOn;

    await track.applyConstraints({
      advanced: [{ torch: flashOn }]
    });

    flashBtn.classList.toggle("active", flashOn);
    status.textContent = flashOn ? "🔦 Flash on" : "🔦 Flash off";
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Flash error";
  }
};

/* ================= IMAGE UPLOAD ================= */

uploadBtn.onclick = async () => {
  if (!TOKEN) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.click();

  input.onchange = async () => {
    try {
      scanner ??= new Html5Qrcode("reader");
      const qr = await scanner.scanFile(input.files[0], true);
      await handleScan(qr);
    } catch {
      status.textContent = "❌ No QR found in image";
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
