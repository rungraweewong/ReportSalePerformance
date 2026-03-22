import * as ort from "onnxruntime-web";
import { newSession, remove, rembgConfig } from "@bunnio/rembg-web";

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

const REMBG_MODEL_PATHS = {
  u2net_human_seg:
    "https://huggingface.co/jellybox/u2net-human-seg/resolve/736b768145e597134968bde9ace5bf8fd19ffa8c/u2net_human_seg.onnx?download=true",
};

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/";
ort.env.logLevel = "warning";

const state = {
  background: null,
  texts: [],
  images: [],
  selectedTextId: null,
  selectedImageId: null,
  activeLayerType: null,
  rembg: {
    session: null,
    loadingPromise: null,
    available: true,
  },
  drag: {
    active: false,
    type: null,
    id: null,
    offsetX: 0,
    offsetY: 0,
  },
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

function updateBackgroundTitle(fileName) {
  backgroundTitle.textContent = fileName || "ยังไม่มีไฟล์ background";
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

async function getRembgSession() {
  if (!state.rembg.available) {
    throw new Error("rembg-web unavailable");
  }

  if (state.rembg.session) {
    return state.rembg.session;
  }

  if (!state.rembg.loadingPromise) {
    state.rembg.loadingPromise = (async () => {
      rembgConfig.setCustomModelPath("u2net_human_seg", REMBG_MODEL_PATHS.u2net_human_seg);
      const session = newSession("u2net_human_seg");
      state.rembg.session = session;
      return session;
    })();
  }

  return state.rembg.loadingPromise;
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

async function removeWithRembg(file, threshold) {
  const session = await getRembgSession();
  const result = await remove(file, {
    session,
    postProcessMask: true,
    bgcolor: [0, 0, 0, 0],
    alphaMatting: true,
    alphaMattingForegroundThreshold: Math.max(180, 220 - threshold),
    alphaMattingBackgroundThreshold: Math.min(60, Math.round(threshold * 0.45)),
    alphaMattingErodeSize: 4,
    onProgress: (info) => {
      const progressText =
        typeof info.progress === "number" ? ` ${Math.round(info.progress)}%` : "";
      imageStatus.textContent = `${info.step || "processing"}${progressText}`;
    },
  });

  return blobToImage(result);
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
  try {
    if (!layer.removeBgEnabled) {
      layer.renderSource = layer.originalImage;
      layer.processingMode = "original";
      return;
    }

    if (state.rembg.available) {
      layer.renderSource = await removeWithRembg(layer.originalFile, layer.threshold);
      layer.processingMode = "rembg-web";
      return;
    }

    layer.renderSource = removeImageBackground(layer.originalImage, layer.threshold);
    layer.processingMode = "color-fallback";
  } catch (error) {
    try {
      layer.renderSource = removeImageBackground(layer.originalImage, layer.threshold);
      layer.processingMode = "color-fallback";
    } catch (fallbackError) {
      layer.renderSource = layer.originalImage;
      layer.processingMode = "original";
    }
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
    removeBgEnabled.disabled = true;
    imageStatus.textContent = "ยังไม่มีรูปคนขาย";
    state.selectedImageId = null;
    return;
  }

  selectedImageItem.disabled = false;
  removeImageButton.disabled = false;
  imageScale.disabled = false;
  removeBgEnabled.disabled = false;

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
    removeBgEnabled.checked = true;
    imageStatus.textContent = "ยังไม่มีรูปคนขาย";
    return;
  }

  const { width } = getReferenceDimensions();
  imageScale.value = Math.round(selectedImage.widthRatio * 100);
  removeBgEnabled.checked = selectedImage.removeBgEnabled;
  imageStatus.textContent = `${selectedImage.name} • ${Math.round(selectedImage.widthRatio * width)} px`;
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
  selectedImage.removeBgEnabled = removeBgEnabled.checked;
  fillImageEditor();
  imageStatus.textContent = "อัปเดตการเปิด/ปิดการตัดพื้นหลังแล้ว";
}

function setCanvasSize(width, height) {
  canvas.width = width;
  canvas.height = height;
  canvasInfo.textContent = `Canvas ขนาด ${width} x ${height} px`;
}

function drawSelectionOutline(x, y, width, height) {
  canvasContext.save();
  canvasContext.strokeStyle = "rgba(193, 92, 45, 0.95)";
  canvasContext.lineWidth = Math.max(2, canvas.width / 600);
  canvasContext.setLineDash([10, 8]);
  canvasContext.strokeRect(x - 10, y - 10, width + 20, height + 20);
  canvasContext.restore();
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

  downloadButton.disabled = !state.background;
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

    image.onload = async () => {
      try {
        const layer = createPersonLayer(file, image, objectUrl);
        await processPersonLayer(layer);
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
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        imageStatus.textContent = "เพิ่มรูปไม่สำเร็จ";
        updateStatus(`ประมวลผลรูป ${file.name} ไม่สำเร็จ`);
      }
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

function downloadCanvasImage() {
  if (!state.background) {
    updateStatus("กรุณาอัปโหลด background ก่อนดาวน์โหลด");
    return;
  }

  const link = document.createElement("a");
  const safeName = (state.background.fileName || "sale-report")
    .replace(/\.[^/.]+$/, "")
    .replace(/\s+/g, "-");

  drawCanvas({ hideSelection: true });
  link.href = canvas.toDataURL("image/png");
  link.download = `${safeName}-report.png`;
  link.click();
  drawCanvas();
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
downloadButton.addEventListener("click", downloadCanvasImage);
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
removeBgEnabled.addEventListener("change", queueImageReprocessSettings);

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
