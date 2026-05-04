const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const backgroundInput = document.getElementById("backgroundInput");
const backgroundDropzone = document.getElementById("backgroundDropzone");
const personImageInput = document.getElementById("personImageInput");
const personDropzone = document.getElementById("personDropzone");
const statusText = document.getElementById("statusText");
const clearBackgroundButton = document.getElementById("clearBackgroundButton");
const addTextButton = document.getElementById("addTextButton");
const removeTextButton = document.getElementById("removeTextButton");
const duplicateTextButton = document.getElementById("duplicateTextButton");
const selectedTextItem = document.getElementById("selectedTextItem");
const selectedImageItem = document.getElementById("selectedImageItem");
const removeImageButton = document.getElementById("removeImageButton");
const downloadButton = document.getElementById("downloadButton");
const imageStatus = document.getElementById("imageStatus");
const backgroundTitle = document.getElementById("backgroundTitle");
const canvas = document.getElementById("previewCanvas");
const canvasContext = canvas.getContext("2d");
const canvasPlaceholder = document.getElementById("canvasPlaceholder");
const canvasInfo = document.getElementById("canvasInfo");
const openRegisterButton = document.getElementById("openRegisterButton");
const openLoginButton = document.getElementById("openLoginButton");
const logoutButton = document.getElementById("logoutButton");
const authStatus = document.getElementById("authStatus");
const authPanel = document.getElementById("authPanel");
const authPanelTitle = document.getElementById("authPanelTitle");
const authUsername = document.getElementById("authUsername");
const authImageInput = document.getElementById("authImageInput");
const authImageGroup = document.getElementById("authImageGroup");
const authMessage = document.getElementById("authMessage");
const authSaveButton = document.getElementById("authSaveButton");
const authCancelButton = document.getElementById("authCancelButton");

const textContent = document.getElementById("textContent");
const fontFamily = document.getElementById("fontFamily");
const fontWeight = document.getElementById("fontWeight");
const fontSize = document.getElementById("fontSize");
const textColor = document.getElementById("textColor");
const textAlign = document.getElementById("textAlign");
const shadowColor = document.getElementById("shadowColor");
const shadowBlur = document.getElementById("shadowBlur");
const shadowOffsetY = document.getElementById("shadowOffsetY");
const alignLeftButton = document.getElementById("alignLeftButton");
const alignCenterButton = document.getElementById("alignCenterButton");
const alignRightButton = document.getElementById("alignRightButton");

const imageScale = document.getElementById("imageScale");
const removeBgEnabled = document.getElementById("removeBgEnabled");
const DEFAULT_BG_THRESHOLD = 52;
const MOBILE_REMBG_MAX_EDGE = 960;
const DESKTOP_REMBG_MAX_EDGE = 2200;
const MOBILE_PROCESSING_QUALITY = 0.82;
const DESKTOP_PROCESSING_QUALITY = 0.92;
const MAX_SHARE_EXPORT_BYTES = 7.5 * 1024 * 1024;
const MOBILE_SHARE_MAX_EDGE = 1600;
const DESKTOP_SHARE_MAX_EDGE = 2200;
const PYTHON_API_BASE_URL = (
  window.APP_CONFIG?.PYTHON_API_BASE_URL ||
  window.APP_CONFIG?.PYTHON_API_URL?.replace(/\/remove-background\/?$/, "") ||
  "http://localhost:9000"
).replace(/\/$/, "");
const PYTHON_API_URL =
  window.APP_CONFIG?.PYTHON_API_URL || `${PYTHON_API_BASE_URL}/remove-background`;
const USER_STORAGE_KEY = "sale-report-username";
const IS_MOBILE_DEVICE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    navigator.userAgent
  ) || window.matchMedia("(max-width: 920px)").matches;
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

const state = {
  background: null,
  texts: [],
  images: [],
  selectedTextId: null,
  selectedImageId: null,
  activeLayerType: null,
  user: {
    username: localStorage.getItem(USER_STORAGE_KEY) || "",
  },
  drag: {
    active: false,
    type: null,
    id: null,
    offsetX: 0,
    offsetY: 0,
  },
  debugLogs: [],
};

function createDefaultTextItem() {
  return {
    id: `text-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    content: "",
    xRatio: 0.1,
    yRatio: 0.15,
    fontFamily: "Prompt",
    fontWeight: "600",
    fontSizeRatio: 52 / 1200,
    color: "#ffffff",
    align: "left",
    lineHeight: 1.2,
    shadowColor: "#000000",
    shadowBlur: 8,
    shadowOffsetY: 4,
  };
}

function getSelectedText() {
  return state.texts.find((item) => item.id === state.selectedTextId) || null;
}

function getSelectedImage() {
  return state.images.find((item) => item.id === state.selectedImageId) || null;
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

function updateStatus(message) {
  statusText.textContent = message;
}

function getRemoveBgEnabledValue() {
  return removeBgEnabled ? removeBgEnabled.checked : true;
}

function appendDebugLog(message) {
  console.debug(message);
}

function resetDebugLog(message) {
  state.debugLogs = [];
  console.debug(message);
}

function formatErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  try {
    return JSON.stringify(error);
  } catch (jsonError) {
    return String(error);
  }
}

function updateBackgroundTitle(fileName) {
  backgroundTitle.textContent = fileName || "ยังไม่มีไฟล์ background";
}

function getApiUrl(path) {
  return new URL(path.replace(/^\//, ""), `${PYTHON_API_BASE_URL}/`).toString();
}

function setAuthMessage(message) {
  authMessage.textContent = message || "";
}

function getCleanAuthUsername() {
  return authUsername.value.trim();
}

function updateAuthStatus() {
  if (state.user.username) {
    authStatus.textContent = `Login อยู่ด้วย username: ${state.user.username}`;
    logoutButton.hidden = false;
    return;
  }

  authStatus.textContent = "ยังไม่ได้ login";
  logoutButton.hidden = true;
}

function openAuthPanel(mode) {
  authPanel.dataset.mode = mode;
  authPanel.hidden = false;
  authPanelTitle.textContent = mode === "register" ? "Register" : "Login";
  authImageGroup.hidden = mode !== "register";
  authSaveButton.textContent = mode === "register" ? "Save" : "Login";
  authUsername.value = state.user.username || "";
  authImageInput.value = "";
  setAuthMessage("");
  authUsername.focus();
}

function closeAuthPanel() {
  authPanel.hidden = true;
  authUsername.value = "";
  authImageInput.value = "";
  setAuthMessage("");
}

function setLoggedInUser(username) {
  state.user.username = username;
  localStorage.setItem(USER_STORAGE_KEY, username);
  updateAuthStatus();
}

function logoutUser() {
  state.user.username = "";
  localStorage.removeItem(USER_STORAGE_KEY);
  updateAuthStatus();
  setAuthMessage("Logout แล้ว");
}

function setCanvasPlaceholderVisible(isVisible) {
  canvasPlaceholder.hidden = !isVisible;
  canvasPlaceholder.style.display = isVisible ? "grid" : "none";
}

function getReferenceDimensions() {
  if (state.background?.image) {
    return {
      width: state.background.image.naturalWidth,
      height: state.background.image.naturalHeight,
    };
  }

  return {
    width: canvas.width,
    height: canvas.height,
  };
}

function getTextMetrics(item) {
  const { width, height } = getReferenceDimensions();

  return {
    x: Math.round((item.xRatio ?? 0) * width),
    y: Math.round((item.yRatio ?? 0) * height),
    fontSize: Math.max(12, Math.round((item.fontSizeRatio ?? 0.043333) * width)),
  };
}

function getTextBounds(item) {
  const metrics = getTextMetrics(item);
  const lines = item.content.split("\n");
  const lineStep = metrics.fontSize * item.lineHeight;

  canvasContext.save();
  canvasContext.font = `${item.fontWeight} ${metrics.fontSize}px "${item.fontFamily}"`;

  const widths = lines.map((line) => canvasContext.measureText(line || " ").width);
  const maxWidth = widths.length > 0 ? Math.max(...widths) : 0;
  const totalHeight = Math.max(lineStep * lines.length, metrics.fontSize);

  canvasContext.restore();

  let left = metrics.x;

  if (item.align === "center") {
    left -= maxWidth / 2;
  } else if (item.align === "right") {
    left -= maxWidth;
  }

  return {
    left,
    top: metrics.y,
    width: maxWidth,
    height: totalHeight,
    metrics,
  };
}

function getImageMetrics(item) {
  const { width, height } = getReferenceDimensions();
  const drawWidth = Math.max(40, item.widthRatio * width);
  const aspectRatio = item.heightRatio / item.widthRatio;
  const drawHeight = Math.max(40, drawWidth * aspectRatio);

  return {
    x: item.xRatio * width,
    y: item.yRatio * height,
    width: drawWidth,
    height: drawHeight,
  };
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function averageColors(samples) {
  const total = samples.reduce(
    (accumulator, sample) => {
      accumulator.r += sample.r;
      accumulator.g += sample.g;
      accumulator.b += sample.b;
      return accumulator;
    },
    { r: 0, g: 0, b: 0 }
  );

  return {
    r: total.r / samples.length,
    g: total.g / samples.length,
    b: total.b / samples.length,
  };
}

function colorDistance(pixel, reference) {
  const dr = pixel.r - reference.r;
  const dg = pixel.g - reference.g;
  const db = pixel.b - reference.b;

  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getPixelColor(data, pixelIndex) {
  const offset = pixelIndex * 4;

  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
  };
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to load processed image"));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type = "image/png", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to prepare image for processing"));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

function imageHasTransparency(image) {
  const workCanvas = document.createElement("canvas");
  const workContext = workCanvas.getContext("2d", { willReadFrequently: true });
  const maxEdge = 360;
  const longestSide = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
  const scale = longestSide > maxEdge ? maxEdge / longestSide : 1;

  workCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  workCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  workContext.drawImage(image, 0, 0, workCanvas.width, workCanvas.height);

  const { data } = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 250) {
      return true;
    }
  }

  return false;
}

async function createProcessingFile(file, image) {
  const maxEdge = IS_MOBILE_DEVICE ? MOBILE_REMBG_MAX_EDGE : DESKTOP_REMBG_MAX_EDGE;
  const longestSide = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);

  if (!longestSide || longestSide <= maxEdge) {
    return file;
  }

  const scale = maxEdge / longestSide;
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const workCanvas = document.createElement("canvas");
  const workContext = workCanvas.getContext("2d");

  workCanvas.width = targetWidth;
  workCanvas.height = targetHeight;
  workContext.drawImage(image, 0, 0, targetWidth, targetHeight);

  const exportType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const quality = IS_MOBILE_DEVICE ? MOBILE_PROCESSING_QUALITY : DESKTOP_PROCESSING_QUALITY;
  const blob = await canvasToBlob(workCanvas, exportType, quality);

  return new File([blob], file.name, {
    type: blob.type || exportType,
    lastModified: file.lastModified || Date.now(),
  });
}

const MAX_SHARE_FILE_SIZE = 8 * 1024 * 1024; // 8MB

async function createShareExportBlob() {
  const canvas = document.querySelector("canvas");

  if (!canvas) {
    throw new Error("Canvas not found");
  }

  let quality = 0.9;
  let scale = 1.0;

  while (quality >= 0.45) {
    const blob = await exportCanvasToJpegBlob(canvas, quality, scale);

    appendDebugLog(
      `Compress test: quality=${quality.toFixed(2)}, scale=${scale.toFixed(2)}, size=${formatFileSize(blob.size)}`
    );

    if (blob.size <= MAX_SHARE_FILE_SIZE) {
      return blob;
    }

    quality -= 0.1;
  }

  // ถ้าลด quality แล้วยังเกิน 8MB ให้ลดขนาดภาพลง
  quality = 0.75;

  while (scale >= 0.4) {
    scale -= 0.1;

    const blob = await exportCanvasToJpegBlob(canvas, quality, scale);

    appendDebugLog(
      `Resize test: quality=${quality.toFixed(2)}, scale=${scale.toFixed(2)}, size=${formatFileSize(blob.size)}`
    );

    if (blob.size <= MAX_SHARE_FILE_SIZE) {
      return blob;
    }
  }

  throw new Error("File size exceeds 8MB after compression");
}

function exportCanvasToJpegBlob(sourceCanvas, quality = 0.85, scale = 1.0) {
  return new Promise((resolve, reject) => {
    const targetCanvas = document.createElement("canvas");

    targetCanvas.width = Math.floor(sourceCanvas.width * scale);
    targetCanvas.height = Math.floor(sourceCanvas.height * scale);

    const ctx = targetCanvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Cannot create canvas context"));
      return;
    }

    ctx.drawImage(
      sourceCanvas,
      0,
      0,
      targetCanvas.width,
      targetCanvas.height
    );

    targetCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Cannot export canvas blob"));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function removeWithPythonApi(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);

  imageStatus.textContent = "กำลังลบพื้นหลัง...";
  console.info("Calling remove-background API", PYTHON_API_URL, {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  });

  const response = await fetch(PYTHON_API_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`python api failed: ${response.status} ${errorText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const blob = await response.blob();

  if (!contentType.includes("image/png") || blob.size < 2048) {
    const errorText = await blob.text().catch(() => "");
    throw new Error(
      `python api returned invalid image: ${contentType || "unknown type"}, ${blob.size} bytes ${errorText}`
    );
  }

  const image = await blobToImage(blob);

  if (!imageHasTransparency(image)) {
    throw new Error("python api returned PNG without transparency");
  }

  return image;
}

function removeImageBackground(image, threshold) {
  const workCanvas = document.createElement("canvas");
  workCanvas.width = image.naturalWidth;
  workCanvas.height = image.naturalHeight;
  const workContext = workCanvas.getContext("2d", { willReadFrequently: true });

  workContext.drawImage(image, 0, 0);

  const imageData = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);
  const { data, width, height } = imageData;
  const samples = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 32));

  for (let x = 0; x < width; x += step) {
    const topIndex = (x * 4);
    const bottomIndex = ((height - 1) * width + x) * 4;

    samples.push({ r: data[topIndex], g: data[topIndex + 1], b: data[topIndex + 2] });
    samples.push({ r: data[bottomIndex], g: data[bottomIndex + 1], b: data[bottomIndex + 2] });
  }

  for (let y = 0; y < height; y += step) {
    const leftIndex = (y * width) * 4;
    const rightIndex = (y * width + (width - 1)) * 4;

    samples.push({ r: data[leftIndex], g: data[leftIndex + 1], b: data[leftIndex + 2] });
    samples.push({ r: data[rightIndex], g: data[rightIndex + 1], b: data[rightIndex + 2] });
  }

  const referenceColor = averageColors(samples);
  const softThreshold = Math.max(8, threshold * 0.82);
  const feather = Math.max(10, threshold * 0.35);
  const visited = new Uint8Array(width * height);
  const queue = [];
  let head = 0;

  function tryQueue(pixelIndex) {
    if (visited[pixelIndex]) {
      return;
    }

    const color = getPixelColor(data, pixelIndex);
    const distance = colorDistance(color, referenceColor);

    if (distance > softThreshold) {
      return;
    }

    visited[pixelIndex] = 1;
    queue.push(pixelIndex);
  }

  for (let x = 0; x < width; x += 1) {
    tryQueue(x);
    tryQueue((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    tryQueue(y * width);
    tryQueue(y * width + (width - 1));
  }

  while (head < queue.length) {
    const pixelIndex = queue[head];
    head += 1;

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const neighbors = [];

    if (x > 0) {
      neighbors.push(pixelIndex - 1);
    }
    if (x < width - 1) {
      neighbors.push(pixelIndex + 1);
    }
    if (y > 0) {
      neighbors.push(pixelIndex - width);
    }
    if (y < height - 1) {
      neighbors.push(pixelIndex + width);
    }

    neighbors.forEach((neighborIndex) => {
      if (visited[neighborIndex]) {
        return;
      }

      const color = getPixelColor(data, neighborIndex);
      const distance = colorDistance(color, referenceColor);

      if (distance <= threshold) {
        visited[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    });
  }

  for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    if (!visited[pixelIndex]) {
      continue;
    }

    const color = getPixelColor(data, pixelIndex);
    const distance = colorDistance(color, referenceColor);
    const alphaIndex = pixelIndex * 4 + 3;

    if (distance <= softThreshold) {
      data[alphaIndex] = 0;
      continue;
    }

    const opacity = Math.max(0, Math.min(1, (distance - softThreshold) / feather));
    data[alphaIndex] = Math.round(data[alphaIndex] * opacity);
  }

  workContext.putImageData(imageData, 0, 0);
  return workCanvas;
}

async function processPersonLayer(layer) {
  layer.isProcessing = true;
  fillImageEditor();

  try {
    if (!layer.removeBgEnabled) {
      layer.renderSource = layer.originalImage;
      layer.processingMode = "original";
      return;
    }

    layer.renderSource = await removeWithPythonApi(layer.processingFile || layer.originalFile);
    layer.processingMode = "python-api";
  } catch (error) {
    console.error("Python background removal failed", error);
    layer.renderSource = layer.originalImage;
    layer.processingMode = "original";
    imageStatus.textContent = "ลบ background ไม่สำเร็จ ใช้รูปต้นฉบับแทน";
    throw error;
  } finally {
    layer.isProcessing = false;
  }
}

function refreshTextSelector() {
  const previousSelection = state.selectedTextId;
  selectedTextItem.innerHTML = "";

  if (state.texts.length === 0) {
    const option = document.createElement("option");
    option.textContent = "ยังไม่มีข้อความ";
    option.value = "";
    selectedTextItem.append(option);
    selectedTextItem.disabled = true;
    removeTextButton.disabled = true;
    duplicateTextButton.disabled = true;
    state.selectedTextId = null;
    return;
  }

  selectedTextItem.disabled = false;
  removeTextButton.disabled = false;
  duplicateTextButton.disabled = false;

  state.texts.forEach((item, index) => {
    const option = document.createElement("option");
    const title = item.content.split("\n")[0].trim() || `ข้อความ ${index + 1}`;

    option.value = item.id;
    option.textContent = `${index + 1}. ${title}`;
    selectedTextItem.append(option);
  });

  if (state.texts.some((item) => item.id === previousSelection)) {
    state.selectedTextId = previousSelection;
  } else {
    state.selectedTextId = state.texts[0].id;
  }

  selectedTextItem.value = state.selectedTextId;
}

function refreshImageSelector() {
  const previousSelection = state.selectedImageId;
  selectedImageItem.innerHTML = "";

  if (state.images.length === 0) {
    const option = document.createElement("option");
    option.textContent = "ยังไม่มีรูปคนขาย";
    option.value = "";
    selectedImageItem.append(option);
    selectedImageItem.disabled = true;
    removeImageButton.disabled = true;
    imageScale.disabled = true;
    if (removeBgEnabled) {
      removeBgEnabled.disabled = true;
    }
    imageStatus.textContent = "ยังไม่มีรูปคนขาย";
    state.selectedImageId = null;
    return;
  }

  selectedImageItem.disabled = false;
  removeImageButton.disabled = false;
  imageScale.disabled = false;
  if (removeBgEnabled) {
    removeBgEnabled.disabled = false;
  }

  state.images.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${index + 1}. ${item.name}`;
    selectedImageItem.append(option);
  });

  if (state.images.some((item) => item.id === previousSelection)) {
    state.selectedImageId = previousSelection;
  } else {
    state.selectedImageId = state.images[0].id;
  }

  selectedImageItem.value = state.selectedImageId;
}

function fillTextEditor() {
  const selectedText = getSelectedText();

  if (!selectedText) {
    textContent.value = "";
    fontFamily.value = "Prompt";
    fontWeight.value = "600";
    fontSize.value = 52;
    textColor.value = "#ffffff";
    textAlign.value = "left";
    shadowColor.value = "#000000";
    shadowBlur.value = 8;
    shadowOffsetY.value = 4;
    return;
  }

  const metrics = getTextMetrics(selectedText);
  textContent.value = selectedText.content;
  fontFamily.value = selectedText.fontFamily;
  fontWeight.value = selectedText.fontWeight;
  fontSize.value = metrics.fontSize;
  textColor.value = selectedText.color;
  textAlign.value = selectedText.align;
  shadowColor.value = selectedText.shadowColor;
  shadowBlur.value = selectedText.shadowBlur;
  shadowOffsetY.value = selectedText.shadowOffsetY;
}

function fillImageEditor() {
  const selectedImage = getSelectedImage();

  if (!selectedImage) {
    imageScale.value = 28;
    if (removeBgEnabled) {
      removeBgEnabled.checked = true;
    }
    imageStatus.textContent = "ยังไม่มีรูปคนขาย";
    return;
  }

  const { width } = getReferenceDimensions();
  imageScale.value = Math.round(selectedImage.widthRatio * 100);
  if (removeBgEnabled) {
    removeBgEnabled.checked = selectedImage.removeBgEnabled;
  }

  if (selectedImage.isProcessing) {
    imageStatus.textContent = `${selectedImage.name} • กำลังลบพื้นหลัง...`;
    return;
  }

  const modeLabel = {
    "python-api": "พร้อมใช้งาน",
    original: "ใช้รูปต้นฉบับ",
    pending: "รอประมวลผล",
  }[selectedImage.processingMode] || "พร้อมใช้งาน";

  imageStatus.textContent = `${selectedImage.name} • ${modeLabel} • ${Math.round(
    selectedImage.widthRatio * width
  )} px`;
}

function selectTextItem(textId) {
  state.selectedTextId = textId;
  state.activeLayerType = "text";
  refreshTextSelector();
  fillTextEditor();
  drawCanvas();
}

function selectImageItem(imageId) {
  state.selectedImageId = imageId;
  state.activeLayerType = "image";
  refreshImageSelector();
  fillImageEditor();
  drawCanvas();
}

function syncTextEditorToSelectedText() {
  const selectedText = getSelectedText();

  if (!selectedText) {
    return;
  }

  selectedText.content = textContent.value;
  selectedText.fontFamily = fontFamily.value;
  selectedText.fontWeight = fontWeight.value;
  selectedText.color = textColor.value;
  selectedText.align = textAlign.value;
  selectedText.shadowColor = shadowColor.value;
  selectedText.shadowBlur = Number(shadowBlur.value) || 0;
  selectedText.shadowOffsetY = Number(shadowOffsetY.value) || 0;

  const { width } = getReferenceDimensions();
  selectedText.fontSizeRatio = (Number(fontSize.value) || 52) / width;

  refreshTextSelector();
  fillTextEditor();
  drawCanvas();
}

async function syncImageEditorToSelectedImage() {
  const selectedImage = getSelectedImage();

  if (!selectedImage) {
    return;
  }

  selectedImage.widthRatio = Math.max(0.05, Number(imageScale.value) / 100);
  selectedImage.heightRatio = selectedImage.widthRatio * selectedImage.aspectRatio;
  fillImageEditor();
  drawCanvas();
}

function queueImageReprocessSettings() {
  const selectedImage = getSelectedImage();

  if (!selectedImage) {
    return;
  }

  selectedImage.threshold = DEFAULT_BG_THRESHOLD;
  selectedImage.removeBgEnabled = getRemoveBgEnabledValue();
  fillImageEditor();
}

function setCanvasSize(width, height) {
  canvas.width = width;
  canvas.height = height;
  if (canvasInfo) {
    canvasInfo.textContent = `Canvas ขนาด ${width} x ${height} px`;
  }
}

function drawSelectionOutline(x, y, width, height) {
  canvasContext.save();
  canvasContext.strokeStyle = "rgba(193, 92, 45, 0.95)";
  canvasContext.lineWidth = Math.max(2, canvas.width / 600);
  canvasContext.setLineDash([10, 8]);
  canvasContext.strokeRect(x - 10, y - 10, width + 20, height + 20);
  canvasContext.restore();
}

function hasCanvasContent() {
  const hasBackground = Boolean(state.background?.image);
  const hasImages = state.images.length > 0;
  const hasTexts = state.texts.some((item) => item.content.trim().length > 0);

  return hasBackground || hasImages || hasTexts;
}

function drawCanvas(options = {}) {
  const { hideSelection = false } = options;

  canvasContext.clearRect(0, 0, canvas.width, canvas.height);

  if (state.background?.image) {
    canvasContext.drawImage(state.background.image, 0, 0, canvas.width, canvas.height);
    setCanvasPlaceholderVisible(false);
  } else {
    canvasContext.fillStyle = "#fff7ef";
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    setCanvasPlaceholderVisible(true);
  }

  state.images.forEach((item) => {
    const metrics = getImageMetrics(item);
    canvasContext.drawImage(item.renderSource, metrics.x, metrics.y, metrics.width, metrics.height);

    if (!hideSelection && state.activeLayerType === "image" && item.id === state.selectedImageId) {
      drawSelectionOutline(metrics.x, metrics.y, metrics.width, metrics.height);
    }
  });

  state.texts.forEach((item) => {
    const metrics = getTextMetrics(item);

    canvasContext.save();
    canvasContext.font = `${item.fontWeight} ${metrics.fontSize}px "${item.fontFamily}"`;
    canvasContext.fillStyle = item.color;
    canvasContext.textAlign = item.align;
    canvasContext.textBaseline = "top";
    canvasContext.shadowColor = item.shadowColor;
    canvasContext.shadowBlur = item.shadowBlur;
    canvasContext.shadowOffsetX = 0;
    canvasContext.shadowOffsetY = item.shadowOffsetY;

    const lines = item.content.split("\n");
    const lineStep = metrics.fontSize * item.lineHeight;

    lines.forEach((line, index) => {
      canvasContext.fillText(line, metrics.x, metrics.y + index * lineStep);
    });

    canvasContext.restore();

    if (!hideSelection && state.activeLayerType === "text" && item.id === state.selectedTextId) {
      const bounds = getTextBounds(item);
      drawSelectionOutline(bounds.left, bounds.top, bounds.width, bounds.height);
    }
  });

  downloadButton.disabled = !hasCanvasContent();
}

function validateImageFile(file) {
  if (!file) {
    return "ยังไม่ได้เลือกไฟล์";
  }

  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension =
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".gif");

  if (!ACCEPTED_TYPES.has(file.type) && !hasSupportedExtension) {
    return `ไฟล์ ${file.name} ไม่ใช่ชนิดรูปที่รองรับ`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `ไฟล์ ${file.name} มีขนาดเกิน 8MB`;
  }

  return "";
}

async function fetchUserImage(username) {
  const response = await fetch(getApiUrl(`/users/${encodeURIComponent(username)}`));

  if (!response.ok) {
    throw new Error(`login failed: ${response.status}`);
  }

  return response.json();
}

async function registerUser() {
  const username = getCleanAuthUsername();
  const file = authImageInput.files?.[0];

  if (!username) {
    setAuthMessage("กรุณากรอก username");
    return;
  }

  if (!file) {
    setAuthMessage("กรุณาเลือกรูปก่อนกด Save");
    return;
  }

  const error = validateImageFile(file);

  if (error) {
    setAuthMessage(error);
    return;
  }

  const formData = new FormData();
  formData.append("username", username);
  formData.append("file", file, file.name);

  authSaveButton.disabled = true;
  setAuthMessage("กำลัง save และตัด background ด้วย Python API...");

  try {
    const response = await fetch(getApiUrl("/register"), {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`register failed: ${response.status}`);
    }

    const data = await response.json();
    setLoggedInUser(data.username);
    await loadUserDefaultImage(data);
    closeAuthPanel();
    updateStatus(`Register สำเร็จ และโหลดรูป ${data.username}.png แล้ว`);
  } catch (error) {
    setAuthMessage("Register ไม่สำเร็จ กรุณาเช็คว่า Python API พร้อมใช้งาน");
  } finally {
    authSaveButton.disabled = false;
  }
}

async function loginUser() {
  const username = getCleanAuthUsername();

  if (!username) {
    setAuthMessage("กรุณากรอก username");
    return;
  }

  authSaveButton.disabled = true;
  setAuthMessage("กำลังค้นหารูปของ username นี้...");

  try {
    const data = await fetchUserImage(username);

    if (!data.exists || !data.images?.length) {
      setAuthMessage("ไม่พบรูปของ username นี้ กรุณา Register ก่อน");
      return;
    }

    setLoggedInUser(data.username);
    await loadUserDefaultImage(data);
    closeAuthPanel();
    updateStatus(`Login สำเร็จ และโหลดรูป ${data.username}.png แล้ว`);
  } catch (error) {
    setAuthMessage("Login ไม่สำเร็จ กรุณาเช็คว่า Python API พร้อมใช้งาน");
  } finally {
    authSaveButton.disabled = false;
  }
}

async function loadUserDefaultImage(userData) {
  const imageData = userData.images?.[0];

  if (!imageData?.url) {
    return;
  }

  const imageUrl = new URL(imageData.url, `${PYTHON_API_BASE_URL}/`).toString();
  const response = await fetch(`${imageUrl}?t=${Date.now()}`);

  if (!response.ok) {
    throw new Error(`image load failed: ${response.status}`);
  }

  const blob = await response.blob();
  const fileName = imageData.fileName || `${userData.username}.png`;
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  const objectUrl = URL.createObjectURL(blob);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to load user image"));
    img.src = objectUrl;
  });

  state.images
    .filter((item) => item.isUserDefault && item.username === userData.username)
    .forEach((item) => URL.revokeObjectURL(item.url));
  state.images = state.images.filter(
    (item) => !(item.isUserDefault && item.username === userData.username)
  );

  const layer = createPersonLayer(file, image, objectUrl);
  layer.name = fileName;
  layer.username = userData.username;
  layer.isUserDefault = true;
  layer.processingMode = "python-api";
  layer.removeBgEnabled = true;
  layer.renderSource = image;
  layer.xRatio = 0.36;
  layer.yRatio = 0.42;

  state.images.push(layer);
  state.selectedImageId = layer.id;
  state.activeLayerType = "image";
  refreshImageSelector();
  fillImageEditor();
  drawCanvas();
}

async function restoreSavedLogin() {
  updateAuthStatus();

  if (!state.user.username) {
    return;
  }

  try {
    const data = await fetchUserImage(state.user.username);

    if (data.exists && data.images?.length) {
      await loadUserDefaultImage(data);
      updateStatus(`โหลดรูป default ของ ${state.user.username} แล้ว`);
    }
  } catch (error) {
    updateStatus("ยังโหลดรูปจาก username ที่เคย login ไม่สำเร็จ");
  }
}

function handleAuthSave() {
  if (authPanel.dataset.mode === "login") {
    loginUser();
    return;
  }

  registerUser();
}

function handleBackgroundFile(file) {
  const error = validateImageFile(file);

  if (error) {
    updateStatus(error);
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    if (state.background?.url) {
      URL.revokeObjectURL(state.background.url);
    }

    state.background = {
      fileName: file.name,
      size: file.size,
      url: objectUrl,
      image,
    };

    setCanvasSize(image.naturalWidth, image.naturalHeight);
    drawCanvas();
    clearBackgroundButton.disabled = false;
    updateBackgroundTitle(file.name);
    fillTextEditor();
    fillImageEditor();
    updateStatus(`โหลด background สำเร็จ: ${file.name} (${formatFileSize(file.size)})`);
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    updateStatus(`ไม่สามารถเปิดไฟล์ ${file.name} ได้`);
  };

  image.src = objectUrl;
}

function clearBackground() {
  if (state.background?.url) {
    URL.revokeObjectURL(state.background.url);
  }

  state.background = null;
  backgroundInput.value = "";
  clearBackgroundButton.disabled = true;
  updateBackgroundTitle("");
  setCanvasSize(1200, 675);
  drawCanvas();
  updateStatus("ล้างรูป background แล้ว");
}

function addTextItem() {
  const newItem = createDefaultTextItem();
  const { width, height } = getReferenceDimensions();

  newItem.content = textContent.value.trim();
  newItem.xRatio = 120 / width;
  newItem.yRatio = 160 / height;

  state.texts.push(newItem);
  state.selectedTextId = newItem.id;
  state.activeLayerType = "text";
  refreshTextSelector();
  fillTextEditor();
  drawCanvas();
}

function removeSelectedText() {
  const selectedText = getSelectedText();

  if (!selectedText) {
    return;
  }

  state.texts = state.texts.filter((item) => item.id !== selectedText.id);
  state.selectedTextId = state.texts[0]?.id || null;
  state.activeLayerType = state.selectedTextId ? "text" : null;
  refreshTextSelector();
  fillTextEditor();
  drawCanvas();
}

function duplicateSelectedText() {
  const selectedText = getSelectedText();

  if (!selectedText) {
    return;
  }

  const { width, height } = getReferenceDimensions();
  const clonedItem = {
    ...selectedText,
    id: `text-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    xRatio: selectedText.xRatio + 24 / width,
    yRatio: selectedText.yRatio + 24 / height,
  };

  state.texts.push(clonedItem);
  state.selectedTextId = clonedItem.id;
  state.activeLayerType = "text";
  refreshTextSelector();
  fillTextEditor();
  drawCanvas();
}

function alignSelectedText(position) {
  const selectedText = getSelectedText();

  if (!selectedText) {
    return;
  }

  const { width } = getReferenceDimensions();
  const sidePadding = Math.max(24, Math.round(width * 0.04));

  if (position === "left") {
    selectedText.align = "left";
    selectedText.xRatio = sidePadding / width;
  } else if (position === "center") {
    selectedText.align = "center";
    selectedText.xRatio = 0.5;
  } else {
    selectedText.align = "right";
    selectedText.xRatio = (width - sidePadding) / width;
  }

  state.activeLayerType = "text";
  refreshTextSelector();
  fillTextEditor();
  drawCanvas();
}

function createPersonLayer(file, image, objectUrl) {
  const { width, height } = getReferenceDimensions();
  const maxWidth = width * 0.28;
  const maxHeight = height * 0.45;
  const fitScale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
  const drawWidth = image.naturalWidth * fitScale;
  const drawHeight = image.naturalHeight * fitScale;

  const layer = {
    id: `image-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: file.name,
    originalFile: file,
    processingFile: file,
    fileSize: file.size,
    url: objectUrl,
    originalImage: image,
    renderSource: image,
    xRatio: 0.36,
    yRatio: 0.3,
    widthRatio: drawWidth / width,
    heightRatio: drawHeight / height,
    aspectRatio: drawHeight / drawWidth,
    threshold: DEFAULT_BG_THRESHOLD,
    removeBgEnabled: true,
    isProcessing: false,
  };

  layer.processingMode = "pending";
  return layer;
}

function handlePersonFiles(fileList) {
  const files = Array.from(fileList);

  if (files.length === 0) {
    return;
  }

  imageStatus.textContent = "กำลังประมวลผลรูปคนขาย...";
  updateStatus(`กำลังเพิ่มรูปคนขาย ${files.length} ไฟล์`);

  let successCount = 0;
  let latestLayerId = null;

  files.forEach((file, index) => {
    const error = validateImageFile(file);

    if (error) {
      if (index === 0) {
        updateStatus(error);
        imageStatus.textContent = error;
      }
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      const layer = createPersonLayer(file, image, objectUrl);
      layer.xRatio = Math.min(0.82, 0.12 + state.images.length * 0.06);
      layer.yRatio = Math.min(0.78, 0.28 + state.images.length * 0.04);

      state.images.push(layer);
      state.selectedImageId = layer.id;
      state.activeLayerType = "image";
      successCount += 1;
      latestLayerId = layer.id;

      refreshImageSelector();
      fillImageEditor();
      drawCanvas();
      updateStatus(`เพิ่มรูปคนขายแล้ว ${successCount} ไฟล์`);

      if (latestLayerId) {
        selectImageItem(latestLayerId);
      }

      (async () => {
        try {
          if (IS_MOBILE_DEVICE) {
            imageStatus.textContent = "กำลังเตรียมรูป...";
          }
          try {
            layer.processingFile = await createProcessingFile(file, image);
          } catch (error) {
            console.warn("Image preprocessing failed, using original file for API", error);
            layer.processingFile = file;
          }

          imageStatus.textContent = "กำลังลบพื้นหลัง...";
          await processPersonLayer(layer);
          fillImageEditor();
          drawCanvas();
          updateStatus(`ลบพื้นหลังรูป ${file.name} สำเร็จ`);
        } catch (error) {
          console.error("Seller image processing failed", error);
          layer.isProcessing = false;
          fillImageEditor();
          drawCanvas();
          updateStatus(`ลบ background รูป ${file.name} ไม่สำเร็จ ใช้รูปต้นฉบับแทน`);
        }
      })();
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      imageStatus.textContent = "ไม่สามารถเปิดรูปนี้ได้";
      updateStatus(`ไม่สามารถเปิดไฟล์ ${file.name} ได้`);
    };

    image.src = objectUrl;
  });
}

function removeSelectedImage() {
  const selectedImage = getSelectedImage();

  if (!selectedImage) {
    return;
  }

  URL.revokeObjectURL(selectedImage.url);
  state.images = state.images.filter((item) => item.id !== selectedImage.id);
  state.selectedImageId = state.images[0]?.id || null;
  state.activeLayerType = state.selectedImageId ? "image" : null;
  refreshImageSelector();
  fillImageEditor();
  drawCanvas();
}

function hitTestImage(x, y) {
  for (let index = state.images.length - 1; index >= 0; index -= 1) {
    const item = state.images[index];
    const metrics = getImageMetrics(item);

    if (
      x >= metrics.x &&
      x <= metrics.x + metrics.width &&
      y >= metrics.y &&
      y <= metrics.y + metrics.height
    ) {
      return { type: "image", item, metrics };
    }
  }

  return null;
}

function hitTestText(x, y) {
  for (let index = state.texts.length - 1; index >= 0; index -= 1) {
    const item = state.texts[index];
    const bounds = getTextBounds(item);
    const padding = 10;

    if (
      x >= bounds.left - padding &&
      x <= bounds.left + bounds.width + padding &&
      y >= bounds.top - padding &&
      y <= bounds.top + bounds.height + padding
    ) {
      return { type: "text", item, bounds };
    }
  }

  return null;
}

function hitTestLayer(x, y) {
  return hitTestText(x, y) || hitTestImage(x, y);
}

function handleCanvasPointerDown(event) {
  const point = getCanvasPoint(event);
  const hit = hitTestLayer(point.x, point.y);

  if (!hit) {
    return;
  }

  event.preventDefault();

  if (hit.type === "text") {
    selectTextItem(hit.item.id);
    state.drag.active = true;
    state.drag.type = "text";
    state.drag.id = hit.item.id;
    state.drag.offsetX = point.x - hit.bounds.metrics.x;
    state.drag.offsetY = point.y - hit.bounds.metrics.y;
  } else {
    selectImageItem(hit.item.id);
    state.drag.active = true;
    state.drag.type = "image";
    state.drag.id = hit.item.id;
    state.drag.offsetX = point.x - hit.metrics.x;
    state.drag.offsetY = point.y - hit.metrics.y;
  }

  canvas.style.cursor = "grabbing";
}

function handleCanvasPointerMove(event) {
  const point = getCanvasPoint(event);
  const hoverHit = hitTestLayer(point.x, point.y);

  if (!state.drag.active) {
    canvas.style.cursor = hoverHit ? "grab" : "default";
    return;
  }

  const { width, height } = getReferenceDimensions();

  if (state.drag.type === "text") {
    const selectedText = getSelectedText();

    if (!selectedText) {
      return;
    }

    const nextX = Math.max(0, Math.min(width, point.x - state.drag.offsetX));
    const nextY = Math.max(0, Math.min(height, point.y - state.drag.offsetY));
    selectedText.xRatio = nextX / width;
    selectedText.yRatio = nextY / height;
  } else if (state.drag.type === "image") {
    const selectedImage = getSelectedImage();

    if (!selectedImage) {
      return;
    }

    const metrics = getImageMetrics(selectedImage);
    const overflowX = metrics.width * 0.35;
    const overflowTop = metrics.height * 0.15;
    const overflowBottom = metrics.height * 0.55;
    const nextX = Math.max(
      -overflowX,
      Math.min(width - metrics.width + overflowX, point.x - state.drag.offsetX)
    );
    const nextY = Math.max(
      -overflowTop,
      Math.min(height - metrics.height + overflowBottom, point.y - state.drag.offsetY)
    );

    selectedImage.xRatio = nextX / width;
    selectedImage.yRatio = nextY / height;
    fillImageEditor();
  }

  drawCanvas();
}

function stopCanvasDrag() {
  state.drag.active = false;
  state.drag.type = null;
  state.drag.id = null;
  state.drag.offsetX = 0;
  state.drag.offsetY = 0;
  canvas.style.cursor = "default";
}

function getOutputFileName() {
  const baseName =
    state.background?.fileName ||
    state.images[0]?.name ||
    state.user.username ||
    "sale-report";
  const safeName = baseName.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-");

  return `${safeName}-report.png`;
}

async function exportCanvasForSharing(blob, fileName) {
  appendDebugLog(`STEP 3: exportCanvasForSharing start (${fileName}, ${formatFileSize(blob.size)})`);
  const formData = new FormData();
  const uploadFileName = fileName.replace(/\.png$/i, ".jpg");
  formData.append("file", new File([blob], uploadFileName, { type: blob.type || "image/jpeg" }));

  const exportUrl = getApiUrl("/export-report");
  appendDebugLog(`STEP 4: calling API ${exportUrl}`);
  console.info("Calling export-report API", exportUrl);
  const response = await fetch(exportUrl, {
    method: "POST",
    body: formData,
  });
  appendDebugLog(`STEP 5: API response status ${response.status}`);

  if (!response.ok) {
    let detail = "";

    try {
      const payload = await response.json();
      detail = payload?.detail || payload?.message || "";
    } catch (error) {
      detail = "";
    }

    appendDebugLog(`STEP 6: API failed detail = ${detail || "none"}`);
    throw new Error(detail || `Export failed (${response.status})`);
  }

  const payload = await response.json();
  appendDebugLog(`STEP 6: API success payload url = ${payload?.url || "missing"}`);

  if (!payload?.url) {
    throw new Error("Export API did not return image URL");
  }

  return {
    ...payload,
    absoluteUrl: new URL(payload.url, `${PYTHON_API_BASE_URL}/`).toString(),
    absoluteDownloadUrl: new URL(
      payload.downloadUrl || `${payload.url}?download=1`,
      `${PYTHON_API_BASE_URL}/`
    ).toString(),
  };
}

async function shareExportedUrlIfAvailable(exportedImage, fileName) {
  if (!navigator.share) {
    appendDebugLog("STEP 7: navigator.share not available");
    return false;
  }

  appendDebugLog(`STEP 7: opening share sheet with ${exportedImage.absoluteUrl}`);
  await navigator.share({
    title: "Sale Report",
    text: `ภาพรายงานยอดขาย: ${fileName}`,
    url: exportedImage.absoluteUrl,
  });
  appendDebugLog("STEP 8: share sheet completed");
  return true;
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.append(textArea);
  textArea.select();

  try {
    document.execCommand("copy");
  } finally {
    textArea.remove();
  }

  return Promise.resolve();
}

function triggerUrlDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

function buildChromeIntentUrl(url) {
  const parsedUrl = new URL(url);
  const scheme = parsedUrl.protocol.replace(":", "");
  const path = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  return `intent://${parsedUrl.host}${path}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}

function openChromeIntent(url) {
  const chromeIntentUrl = buildChromeIntentUrl(url);
  appendDebugLog(`STEP 10: open Chrome intent ${chromeIntentUrl}`);
  window.location.href = chromeIntentUrl;
}

function showDownloadPreview(exportedImage, fileName) {
  appendDebugLog(`STEP 9: show fallback popup (${exportedImage.absoluteUrl})`);
  const previousOverlay = document.querySelector(".download-preview-overlay");

  if (previousOverlay) {
    previousOverlay.remove();
  }

  const actionHeading = IS_ANDROID
    ? "เปิดต่อใน Chrome และบันทึกรูป"
    : "คัดลอก URL ไปเปิดใน Safari";
  const actionHelp = IS_ANDROID
    ? "Android: ปุ่มด้านล่างจะพยายามเปิด Chrome โดยตรง และปุ่ม Save จะเปิดลิงก์ดาวน์โหลดเพื่อให้ Chrome เซฟรูปลงเครื่อง"
    : "iPhone/iPad: LINE browser ไม่อนุญาตให้บันทึกรูปลง Gallery ตรง ๆ ให้คัดลอก URL แล้วนำไปเปิดใน Safari เพื่อบันทึกรูปแทน";
  const actionButtons = IS_ANDROID
    ? `
      <div class="download-preview-actions">
        <a class="brand-button download-preview-link" href="${buildChromeIntentUrl(
          exportedImage.absoluteUrl
        )}">เปิดใน Chrome</a>
        <a class="ghost-button download-preview-link" href="${buildChromeIntentUrl(
          exportedImage.absoluteDownloadUrl
        )}">Save ลง Gallery</a>
        <button class="ghost-button" type="button" data-copy-link>คัดลอกลิงก์</button>
      </div>
    `
    : `
      <div class="download-preview-actions">
        <button class="brand-button" type="button" data-copy-link>คัดลอก URL รูป</button>
        <button class="ghost-button" type="button" data-copy-download-link>คัดลอก URL สำหรับ Save</button>
      </div>
    `;

  const overlay = document.createElement("div");
  overlay.className = "download-preview-overlay";
  overlay.innerHTML = `
    <div class="download-preview-panel" role="dialog" aria-modal="true">
      <div class="download-preview-header">
        <div>
          <p class="eyebrow">Share Preview</p>
          <h2>${actionHeading}</h2>
        </div>
        <button class="ghost-button" type="button" data-close-preview>ปิด</button>
      </div>
      <p class="download-preview-help">
        ${actionHelp}
      </p>
      <img class="download-preview-image" alt="${fileName}" />
      ${actionButtons}
    </div>
  `;

  const image = overlay.querySelector(".download-preview-image");
  const closeButton = overlay.querySelector("[data-close-preview]");
  const copyButton = overlay.querySelector("[data-copy-link]");
  const copyDownloadButton = overlay.querySelector("[data-copy-download-link]");

  image.src = exportedImage.absoluteUrl;
  closeButton.addEventListener("click", () => {
    overlay.remove();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });

  copyButton.addEventListener("click", async () => {
    try {
      await copyText(exportedImage.absoluteUrl);
      updateStatus(IS_ANDROID ? "คัดลอกลิงก์รูปแล้ว" : "คัดลอก URL รูปแล้ว ให้นำไปเปิดใน Safari");
    } catch (error) {
      console.error("Copy link failed", error);
      updateStatus("คัดลอกลิงก์ไม่สำเร็จ กรุณาเปิดรูปแล้วคัดลอกลิงก์เอง");
    }
  });

  if (copyDownloadButton) {
    copyDownloadButton.addEventListener("click", async () => {
      try {
        await copyText(exportedImage.absoluteDownloadUrl);
        updateStatus("คัดลอก URL สำหรับดาวน์โหลดแล้ว ให้นำไปเปิดใน Safari");
      } catch (error) {
        console.error("Copy download link failed", error);
        updateStatus("คัดลอก URL สำหรับดาวน์โหลดไม่สำเร็จ");
      }
    });
  }

  document.body.append(overlay);
}

async function saveOrShareCanvasImage() {
  if (!hasCanvasContent()) {
    updateStatus("ยังไม่มีข้อมูลบน canvas สำหรับแชร์หรือบันทึกรูป");
    return;
  }

  const fileName = getOutputFileName();
  const isLineBrowser = /Line\//i.test(navigator.userAgent);
  const shouldPreferShare = isLineBrowser || IS_MOBILE_DEVICE;
  try {
    resetDebugLog(`STEP 1: click share button (LINE=${isLineBrowser}, mobile=${IS_MOBILE_DEVICE})`);
    drawCanvas({ hideSelection: true });
    appendDebugLog("STEP 2: drawing canvas for export");
    const blob = await createShareExportBlob();
    appendDebugLog(`STEP 2: compressed share blob ready (${blob.type || "image/jpeg"}, ${formatFileSize(blob.size)})`);
    drawCanvas();
    const exportedImage = await exportCanvasForSharing(blob, fileName);

    if (shouldPreferShare) {
      if (isLineBrowser) {
        showDownloadPreview(exportedImage, fileName);
        updateStatus(
          IS_ANDROID
            ? "Android: ใช้ปุ่มเปิดใน Chrome หรือ Save ลง Gallery ได้เลย"
            : "iOS: คัดลอก URL แล้วนำไปเปิดใน Safari เพื่อบันทึกรูป"
        );
        return;
      }

      try {
        if (await shareExportedUrlIfAvailable(exportedImage, fileName)) {
          updateStatus("เปิดเมนูแชร์แล้ว คุณสามารถส่งลิงก์รูปต่อได้จากเมนูนี้");
          return;
        }
      } catch (shareError) {
        console.warn("Share URL failed, falling back to preview", shareError);
        appendDebugLog(`STEP 8: share failed = ${formatErrorMessage(shareError)}`);
        showDownloadPreview(exportedImage, fileName);
        updateStatus("แชร์ตรงไม่สำเร็จ แต่เราเตรียมลิงก์ให้แล้ว");
        return;
      }
    }

    if (isLineBrowser) {
      showDownloadPreview(exportedImage, fileName);
      updateStatus("สร้างลิงก์รูปแล้ว");
      return;
    }

    appendDebugLog(`STEP 9: download from ${exportedImage.absoluteDownloadUrl}`);
    triggerUrlDownload(exportedImage.absoluteDownloadUrl, fileName);
    updateStatus(`เริ่มดาวน์โหลดรูป ${fileName} แล้ว`);
  } catch (error) {
    drawCanvas();
    console.error("Download failed", error);
    updateStatus("แชร์/บันทึกรูปไม่สำเร็จ กรุณาลองใหม่");
  }
}

function registerDropzone(dropzone, handler) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    handler(event.dataTransfer.files);
  });
}

openRegisterButton.addEventListener("click", () => openAuthPanel("register"));
openLoginButton.addEventListener("click", () => openAuthPanel("login"));
logoutButton.addEventListener("click", logoutUser);
authSaveButton.addEventListener("click", handleAuthSave);
authCancelButton.addEventListener("click", closeAuthPanel);
authUsername.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleAuthSave();
  }
});

backgroundInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  if (file) {
    handleBackgroundFile(file);
  }

  backgroundInput.value = "";
});

personImageInput.addEventListener("change", (event) => {
  handlePersonFiles(event.target.files);
  personImageInput.value = "";
});

clearBackgroundButton.addEventListener("click", clearBackground);
addTextButton.addEventListener("click", addTextItem);
removeTextButton.addEventListener("click", removeSelectedText);
duplicateTextButton.addEventListener("click", duplicateSelectedText);
downloadButton.addEventListener("click", saveOrShareCanvasImage);
removeImageButton.addEventListener("click", removeSelectedImage);
alignLeftButton.addEventListener("click", () => alignSelectedText("left"));
alignCenterButton.addEventListener("click", () => alignSelectedText("center"));
alignRightButton.addEventListener("click", () => alignSelectedText("right"));

selectedTextItem.addEventListener("change", (event) => {
  if (event.target.value) {
    selectTextItem(event.target.value);
  }
});

selectedImageItem.addEventListener("change", (event) => {
  if (event.target.value) {
    selectImageItem(event.target.value);
  }
});

[
  textContent,
  fontFamily,
  fontWeight,
  fontSize,
  textColor,
  textAlign,
  shadowColor,
  shadowBlur,
  shadowOffsetY,
].forEach((input) => {
  input.addEventListener("input", syncTextEditorToSelectedText);
});

imageScale.addEventListener("input", syncImageEditorToSelectedImage);

if (removeBgEnabled) {
  removeBgEnabled.addEventListener("change", queueImageReprocessSettings);
}

canvas.addEventListener("pointerdown", handleCanvasPointerDown);
canvas.addEventListener("pointermove", handleCanvasPointerMove);
canvas.addEventListener("pointerleave", stopCanvasDrag);
window.addEventListener("pointerup", stopCanvasDrag);

registerDropzone(backgroundDropzone, (files) => {
  const file = files?.[0];

  if (file) {
    handleBackgroundFile(file);
  }
});

registerDropzone(personDropzone, handlePersonFiles);

setCanvasSize(1200, 675);
refreshTextSelector();
refreshImageSelector();
fillTextEditor();
fillImageEditor();
drawCanvas();
updateStatus("ยังไม่ได้เลือกรูป background");
updateBackgroundTitle("");
restoreSavedLogin();
