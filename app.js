import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBBPZOSFp4Xg5ASC4jd_zEbeVulDRp4Xsk",
  authDomain: "testing-pocket-bill.firebaseapp.com",
  databaseURL: "https://testing-pocket-bill-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "testing-pocket-bill",
  storageBucket: "testing-pocket-bill.firebasestorage.app",
  messagingSenderId: "72049299092",
  appId: "1:72049299092:web:20a3b9e18ce110c61a6e81"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const reader = document.getElementById("reader");
const overlay = document.getElementById("overlay");
const status = document.getElementById("status");
const cameraBtn = document.getElementById("cameraBtn");
const uploadBtn = document.getElementById("uploadBtn");
const printBtn = document.getElementById("printBtn");

// 🔊 Beep sound
const beepSound = new Audio("scanner-beep.mp3");
beepSound.preload = "auto";

// Global variables
let scanner = null;
let cameraActive = false;

// ⏱️ Scan control
let lastScanTime = 0;
let scanInProgress = false;
const SCAN_DELAY = 1000; // 1 second

// Get token
const TOKEN =
  new URLSearchParams(location.search).get("token") ||
  localStorage.getItem("instant_token");

if (!TOKEN) {
  status.textContent = "❌ No token found. Please provide a valid token.";
  alert("❌ No token found. Unable to proceed.");
} else {
  localStorage.setItem("instant_token", TOKEN);
}

// Handle QR scan
async function handleScan(qr) {
  if (!TOKEN) return;

  const now = Date.now();

  // ⛔ Prevent rapid / duplicate scans
  if (scanInProgress || now - lastScanTime < SCAN_DELAY) {
    return;
  }

  scanInProgress = true;
  lastScanTime = now;

  try {
    await push(ref(db, "instant_scans"), {
      qr,
      token: TOKEN,
      createdAt: now
    });

    // 🔊 Beep on successful scan
    beepSound.currentTime = 0;
    beepSound.play().catch(() => {});

    status.textContent = "✅ QR scanned successfully!";
    console.log("QR scanned:", qr);
  } catch (err) {
    console.error(err);
    if (err.code === "PERMISSION_DENIED") {
      status.textContent =
        "❌ Token invalid or expired. Please get a new token from Pocket Bill app.";
      alert("❌ Your token is invalid or expired.");
    } else {
      status.textContent =
        "❌ Failed to add item: " + (err.message || "Unknown error");
    }
  }

  // 📷 Stop camera automatically after scan
  if (scanner && cameraActive) {
    try {
      await scanner.stop();
      await scanner.clear();
      cameraBtn.classList.remove("active");
      cameraActive = false;
      overlay.style.display = "flex";
      status.textContent += " 📷 Camera stopped";
    } catch (err) {
      console.error("Error stopping camera:", err);
    }
  }

  // 🔓 Unlock after delay
  setTimeout(() => {
    scanInProgress = false;
  }, SCAN_DELAY);
}

// Camera button click
cameraBtn.onclick = async () => {
  if (!TOKEN) {
    status.textContent = "❌ Cannot start camera: invalid token.";
    return;
  }

  if (!cameraActive) {
    let cameras = [];
    try {
      cameras = await Html5Qrcode.getCameras();
    } catch (err) {
      console.error("Camera list error:", err);
      status.textContent = "❌ Cannot list cameras: " + err.message;
      return;
    }

    if (!cameras.length) {
      status.textContent = "❌ No cameras found";
      return;
    }

    const cameraId = cameras[0].id;
    scanner ??= new Html5Qrcode("reader");

    try {
      await scanner.start(
        { deviceId: { exact: cameraId } },
        { fps: 15, qrbox: { width: 400, height: 400 }, aspectRatio: 1.0 },
        (decodedText) => handleScan(decodedText)
      );

      cameraBtn.classList.add("active");
      cameraActive = true;
      overlay.style.display = "none";
      status.textContent = "📷 Camera active. Scan QR code...";
    } catch (err) {
      console.error("Camera start error:", err);
      status.textContent = "❌ Cannot access camera: " + err.message;
    }
  } else {
    try {
      await scanner.stop();
      await scanner.clear();
      cameraBtn.classList.remove("active");
      cameraActive = false;
      overlay.style.display = "flex";
      status.textContent = "📷 Camera stopped";
    } catch (err) {
      console.error("Stop camera error:", err);
      status.textContent = "❌ Error stopping camera: " + err.message;
    }
  }
};

// Upload button click (scan from image)
uploadBtn.onclick = async () => {
  if (!TOKEN) {
    status.textContent = "❌ Cannot scan image: invalid token.";
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.click();

  input.onchange = async () => {
    scanner ??= new Html5Qrcode("reader");
    try {
      const qr = await scanner.scanFile(input.files[0], true);
      await handleScan(qr);
    } catch (err) {
      console.error(err);
      status.textContent = "❌ No QR found in image";
    }
  };
};

// Print button click
printBtn.onclick = async () => {
  if (!TOKEN) {
    status.textContent = "❌ Cannot send print: invalid token.";
    return;
  }

  try {
    await push(ref(db, "instant_commands"), {
      type: "print",
      token: TOKEN,
      createdAt: Date.now()
    });

    status.textContent = "✅ Print sent";
  } catch (err) {
    console.error(err);
    if (err.code === "PERMISSION_DENIED") {
      status.textContent = "❌ Token invalid or expired.";
      alert("❌ Your token is invalid or expired.");
    } else {
      status.textContent =
        "❌ Failed to send print: " + (err.message || "Unknown error");
    }
  }
};
