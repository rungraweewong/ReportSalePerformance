import * as ort from "onnxruntime-web";
import { newSession, remove, rembgConfig } from "@bunnio/rembg-web";

const imageInput = document.getElementById("imageInput");
const modelSelect = document.getElementById("modelSelect");
const foregroundThreshold = document.getElementById("foregroundThreshold");
const backgroundThreshold = document.getElementById("backgroundThreshold");
const erodeSize = document.getElementById("erodeSize");
const runButton = document.getElementById("runButton");
const downloadButton = document.getElementById("downloadButton");
const statusBox = document.getElementById("statusBox");
const originalPreview = document.getElementById("originalPreview");
const resultPreview = document.getElementById("resultPreview");
const originalMeta = document.getElementById("originalMeta");
const resultMeta = document.getElementById("resultMeta");

const state = {
  file: null,
  originalUrl: "",
  resultBlob: null,
  resultUrl: "",
  rembgModule: null,
  sessions: new Map(),
};

const REMBG_MODEL_PATHS = {
  u2net_human_seg:
    "https://huggingface.co/jellybox/u2net-human-seg/resolve/736b768145e597134968bde9ace5bf8fd19ffa8c/u2net_human_seg.onnx?download=true",
};

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/";
ort.env.logLevel = "warning";

function setStatus(message) {
  statusBox.textContent = message;
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function revokeUrlIfExists(url) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

async function getRembgModule() {
  if (!state.rembgModule) {
    state.rembgModule = { newSession, remove, rembgConfig };
  }

  return state.rembgModule;
}

async function getSession(modelName) {
  if (state.sessions.has(modelName)) {
    return state.sessions.get(modelName);
  }

  const module = await getRembgModule();
  const customModelPath = REMBG_MODEL_PATHS[modelName];

  if (customModelPath) {
    module.rembgConfig.setCustomModelPath(modelName, customModelPath);
  }

  const session = module.newSession(modelName);
  state.sessions.set(modelName, session);
  return session;
}

function blobToUrl(blob) {
  return URL.createObjectURL(blob);
}

function updateOriginalPreview() {
  if (!state.file) {
    originalPreview.removeAttribute("src");
    originalMeta.textContent = "ยังไม่มีรูป";
    runButton.disabled = true;
    return;
  }

  originalPreview.src = state.originalUrl;
  originalMeta.textContent = `${state.file.name} • ${formatFileSize(state.file.size)}`;
  runButton.disabled = false;
}

function clearResult() {
  revokeUrlIfExists(state.resultUrl);
  state.resultBlob = null;
  state.resultUrl = "";
  resultPreview.removeAttribute("src");
  resultMeta.textContent = "ยังไม่มีผลลัพธ์";
  downloadButton.disabled = true;
}

imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  revokeUrlIfExists(state.originalUrl);
  clearResult();

  if (!file) {
    state.file = null;
    state.originalUrl = "";
    updateOriginalPreview();
    setStatus("ยังไม่ได้เลือกรูป");
    return;
  }

  state.file = file;
  state.originalUrl = URL.createObjectURL(file);
  updateOriginalPreview();
  setStatus("เลือกรูปแล้ว พร้อมทดสอบ rembg-web");
});

runButton.addEventListener("click", async () => {
  if (!state.file) {
    setStatus("กรุณาเลือกรูปก่อน");
    return;
  }

  clearResult();
  runButton.disabled = true;
  setStatus("กำลังโหลด rembg-web...");

  try {
    const module = await getRembgModule();
    const modelName = modelSelect.value;
    const session = await getSession(modelName);
    const usesRemoteModel = Boolean(REMBG_MODEL_PATHS[modelName]);

    setStatus(
      usesRemoteModel
        ? "กำลังประมวลผลรูปด้วย rembg-web และ remote model..."
        : "กำลังประมวลผลรูป..."
    );

    const resultBlob = await module.remove(state.file, {
      session,
      postProcessMask: true,
      bgcolor: [0, 0, 0, 0],
      alphaMatting: true,
      alphaMattingForegroundThreshold: Number(foregroundThreshold.value),
      alphaMattingBackgroundThreshold: Number(backgroundThreshold.value),
      alphaMattingErodeSize: Number(erodeSize.value),
      onProgress: (info) => {
        const progress =
          typeof info.progress === "number" ? ` ${Math.round(info.progress)}%` : "";
        setStatus(`${info.step || "processing"}${progress}`);
      },
    });

    state.resultBlob = resultBlob;
    state.resultUrl = blobToUrl(resultBlob);
    resultPreview.src = state.resultUrl;
    resultMeta.textContent = `${modelName} • ${formatFileSize(resultBlob.size)}`;
    downloadButton.disabled = false;
    setStatus("ประมวลผลเสร็จแล้ว เปรียบเทียบผลกับ Python ได้เลย");
  } catch (error) {
    setStatus(`เกิดข้อผิดพลาด: ${error.message}`);
  } finally {
    runButton.disabled = false;
  }
});

downloadButton.addEventListener("click", () => {
  if (!state.resultBlob || !state.file) {
    return;
  }

  const link = document.createElement("a");
  const safeName = state.file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-");
  link.href = state.resultUrl;
  link.download = `${safeName}-rembg-web.png`;
  link.click();
});
