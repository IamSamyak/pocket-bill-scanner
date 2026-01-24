import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

// ---------------------------
// Firebase Config
// ---------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBBPZOSFp4xg5ASC4jd_zEbeVulDRp4Xsk",
  authDomain: "testing-pocket-bill.firebaseapp.com",
  databaseURL: "https://testing-pocket-bill-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "testing-pocket-bill",
  storageBucket: "testing-pocket-bill.firebasestorage.app",
  messagingSenderId: "72049299092",
  appId: "1:72049299092:web:20a3b9e18ce110c61a6e81"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let scanner = null;
const reader = document.getElementById("reader");
const status = document.getElementById("status");

// ---------------------------
// TOKEN HANDLING
// ---------------------------
const urlParams = new URLSearchParams(window.location.search);
const urlToken = urlParams.get("token");
const storedToken = localStorage.getItem("instant_token");
const TOKEN = urlToken || storedToken;

if (urlToken) {
  localStorage.setItem("instant_token", urlToken);
  console.log("✅ Token stored in browser");
}

if (!TOKEN) {
  alert("❌ No token found. Please scan QR again.");
}

// ---------------------------
// Handle scanned QR
// ---------------------------
async function handleScanResult(qrText) {
  if (!TOKEN) return;

  try {
    await push(ref(db, "instant_scans"), {
      qr: qrText,
      createdAt: Date.now(),
      token: TOKEN
    });
    status.innerText = "✅ Item added!";
  } catch (err) {
    status.innerText = "❌ Failed to push QR";
    console.error(err);
  } finally {
    if (scanner) {
      await scanner.stop();
      await scanner.clear();
      reader.style.display = "none";
    }
    status.innerText += " | Camera stopped";
  }
}

// ---------------------------
// Camera Scan
// ---------------------------
window.startScan = async () => {
  if (!TOKEN) {
    alert("Invalid token! Cannot scan.");
    return;
  }

  reader.style.display = "block";
  status.innerText = "📷 Opening camera...";

  scanner ??= new Html5Qrcode("reader");

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      async (qrText) => { await handleScanResult(qrText); }
    );
    status.innerText = "📷 Scan ready...";
  } catch (err) {
    status.innerText = "❌ Camera error";
    console.error(err);
  }
};

// ---------------------------
// Upload QR Image
// ---------------------------
window.uploadQRImage = async () => {
  if (!TOKEN) {
    alert("Invalid token! Cannot upload.");
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.click();

  input.onchange = async () => {
    try {
      scanner ??= new Html5Qrcode("reader");
      const qrText = await scanner.scanFile(input.files[0], true);

      await push(ref(db, "instant_scans"), {
        qr: qrText,
        createdAt: Date.now(),
        token: TOKEN
      });

      status.innerText = "✅ QR uploaded!";
    } catch (err) {
      status.innerText = "❌ QR read failed";
      console.error(err);
    }
  };
};

// ---------------------------
// Send print/save commands
// ---------------------------
window.sendCommand = async (type) => {
  if (!TOKEN) {
    alert("Invalid token! Cannot send command.");
    return;
  }

  try {
    await push(ref(db, "instant_commands"), {
      type,
      createdAt: Date.now(),
      token: TOKEN
    });

    status.innerText = `✅ ${type} sent`;
  } catch (err) {
    status.innerText = `❌ ${type} failed`;
    console.error(err);
  }
};
