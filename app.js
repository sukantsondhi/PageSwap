// PageSwap - PDF Page Rearrangement Tool
// Created by Sukant Sondhi

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// DOM Elements
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const pagesSection = document.getElementById("pages-section");
const pagesContainer = document.getElementById("pages-container");
const exportBtn = document.getElementById("export-btn");
const filenameInput = document.getElementById("filename-input");
const themeToggle = document.getElementById("theme-toggle");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const selectAllBtn = document.getElementById("select-all-btn");
const deleteSelectedBtn = document.getElementById("delete-selected-btn");
const clearAllBtn = document.getElementById("clear-all-btn");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomLevelDisplay = document.getElementById("zoom-level");

// State
let pages = []; // Array of { id, pdfBytes, pageIndex, sourceName, canvas, type, originalPageNum, imageData }
let sortable = null;
let pageIdCounter = 0;
let zoomLevel = 100; // Percentage
const ZOOM_STEP = 25;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;

// Supported file types
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
];
const SUPPORTED_PDF_TYPE = "application/pdf";

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initEventListeners();
  initSortable();
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = themeToggle.querySelector("i");
  icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
}

// Event Listeners
function initEventListeners() {
  // Theme toggle
  themeToggle.addEventListener("click", toggleTheme);

  // File input change
  fileInput.addEventListener("change", handleFileSelect);

  // Drag and drop for upload
  dropZone.addEventListener("dragover", handleDragOver);
  dropZone.addEventListener("dragleave", handleDragLeave);
  dropZone.addEventListener("drop", handleDrop);

  // Fix: Only trigger file input if not clicking on the label/button
  dropZone.addEventListener("click", (e) => {
    // Don't trigger if clicking on the label (it already triggers the input)
    if (e.target.tagName !== "LABEL" && !e.target.closest("label")) {
      fileInput.click();
    }
  });

  // Export button
  exportBtn.addEventListener("click", exportPDF);

  // Selection buttons
  selectAllBtn.addEventListener("click", toggleSelectAll);
  deleteSelectedBtn.addEventListener("click", deleteSelected);
  clearAllBtn.addEventListener("click", clearAll);

  // Zoom controls
  if (zoomInBtn) zoomInBtn.addEventListener("click", zoomIn);
  if (zoomOutBtn) zoomOutBtn.addEventListener("click", zoomOut);
}

// Initialize Sortable.js for drag and drop reordering
function initSortable() {
  sortable = new Sortable(pagesContainer, {
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    handle: ".page-card",
    onEnd: function (evt) {
      // Update pages array to match new order
      const movedPage = pages.splice(evt.oldIndex, 1)[0];
      pages.splice(evt.newIndex, 0, movedPage);
      updatePageNumbers();
    },
  });
}

// Handle drag over event
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add("drag-over");
}

// Handle drag leave event
function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove("drag-over");
}

// Handle drop event
function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove("drag-over");

  const files = Array.from(e.dataTransfer.files).filter(
    (file) =>
      file.type === SUPPORTED_PDF_TYPE ||
      SUPPORTED_IMAGE_TYPES.includes(file.type) ||
      file.name.toLowerCase().endsWith(".heic") ||
      file.name.toLowerCase().endsWith(".heif"),
  );
  if (files.length > 0) {
    processFiles(files);
  }
}

// Handle file selection
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length > 0) {
    processFiles(files);
  }
  // Reset input so same file can be selected again
  e.target.value = "";
}

// Process uploaded PDF files
async function processFiles(files) {
  showLoading("Loading files...");

  try {
    for (const file of files) {
      if (file.type === SUPPORTED_PDF_TYPE) {
        await processPDF(file);
      } else if (
        SUPPORTED_IMAGE_TYPES.includes(file.type) ||
        file.name.toLowerCase().endsWith(".heic") ||
        file.name.toLowerCase().endsWith(".heif")
      ) {
        await processImage(file);
      }
    }
    updateUI();
  } catch (error) {
    console.error("Error processing files:", error);
    alert("Error processing files. Please try again.");
  }

  hideLoading();
}

// Process a single image file
async function processImage(file) {
  loadingText.textContent = `Processing ${file.name}...`;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas for the image
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Set canvas size to match image (with max dimensions to prevent memory issues)
        const maxDim = 2000;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height / width) * maxDim;
            width = maxDim;
          } else {
            width = (width / height) * maxDim;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Store the image data
        pages.push({
          id: pageIdCounter++,
          pdfBytes: null,
          pageIndex: 0,
          sourceName: file.name,
          canvas: canvas,
          type: "image",
          originalPageNum: 1,
          imageData: e.target.result,
        });

        resolve();
      };
      img.onerror = () =>
        reject(new Error(`Failed to load image: ${file.name}`));
      img.src = e.target.result;
    };
    reader.onerror = () =>
      reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// Process a single PDF file
async function processPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  // Load with PDF.js for rendering
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;

  loadingText.textContent = `Processing ${file.name}...`;

  // Process each page
  for (let i = 1; i <= pdf.numPages; i++) {
    loadingText.textContent = `Processing ${file.name} - Page ${i}/${pdf.numPages}`;

    const page = await pdf.getPage(i);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    // Create canvas for rendering
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render page
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Store page data
    pages.push({
      id: pageIdCounter++,
      pdfBytes: pdfBytes,
      pageIndex: i - 1, // 0-based index
      sourceName: file.name,
      canvas: canvas,
      type: "pdf",
      originalPageNum: i,
      imageData: null,
    });
  }
}

// Update UI after processing files
function updateUI() {
  if (pages.length > 0) {
    pagesSection.classList.remove("hidden");
    exportBtn.disabled = false;
    renderPages();
  } else {
    pagesSection.classList.add("hidden");
    exportBtn.disabled = true;
  }
  updateDeleteSelectedBtn();
}

// Render all pages
function renderPages() {
  pagesContainer.innerHTML = "";

  pages.forEach((page, index) => {
    const pageCard = createPageCard(page, index);
    pagesContainer.appendChild(pageCard);
  });
}

// Create a page card element
function createPageCard(page, index) {
  const card = document.createElement("div");
  card.className = "page-card";
  card.dataset.id = page.id;

  // Checkbox for selection
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "page-checkbox";
  checkbox.addEventListener("change", () => {
    card.classList.toggle("selected", checkbox.checked);
    updateDeleteSelectedBtn();
  });

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "page-delete";
  deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deletePage(page.id);
  });

  // Clone canvas for display
  const displayCanvas = document.createElement("canvas");
  displayCanvas.width = page.canvas.width;
  displayCanvas.height = page.canvas.height;
  displayCanvas.getContext("2d").drawImage(page.canvas, 0, 0);

  // Page info - show both new position and original page number
  const pageInfo = document.createElement("div");
  pageInfo.className = "page-info";
  const typeIcon =
    page.type === "image"
      ? '<i class="fas fa-image"></i>'
      : '<i class="fas fa-file-pdf"></i>';
  const originalLabel =
    page.type === "image" ? "Image" : `Orig: ${page.originalPageNum}`;
  pageInfo.innerHTML = `
        <div class="page-numbers">
          <span class="new-page-number">New: ${index + 1}</span>
          <span class="original-page-number">${originalLabel}</span>
        </div>
        <div class="page-source" title="${page.sourceName}">${typeIcon} ${page.sourceName}</div>
    `;

  card.appendChild(checkbox);
  card.appendChild(deleteBtn);
  card.appendChild(displayCanvas);
  card.appendChild(pageInfo);

  return card;
}

// Update page numbers after reordering
function updatePageNumbers() {
  const cards = pagesContainer.querySelectorAll(".page-card");
  cards.forEach((card, index) => {
    const newPageNumber = card.querySelector(".new-page-number");
    if (newPageNumber) {
      newPageNumber.textContent = `New: ${index + 1}`;
    }
  });
}

// Delete a single page
function deletePage(id) {
  pages = pages.filter((p) => p.id !== id);
  updateUI();
}

// Toggle select all
function toggleSelectAll() {
  const checkboxes = pagesContainer.querySelectorAll(".page-checkbox");
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

  checkboxes.forEach((checkbox) => {
    checkbox.checked = !allChecked;
    checkbox.dispatchEvent(new Event("change"));
  });
}

// Delete selected pages
function deleteSelected() {
  const selectedCards = pagesContainer.querySelectorAll(".page-card.selected");
  const selectedIds = Array.from(selectedCards).map((card) =>
    parseInt(card.dataset.id),
  );

  pages = pages.filter((p) => !selectedIds.includes(p.id));
  updateUI();
}

// Update delete selected button state
function updateDeleteSelectedBtn() {
  const selectedCount = pagesContainer.querySelectorAll(
    ".page-card.selected",
  ).length;
  deleteSelectedBtn.disabled = selectedCount === 0;
  deleteSelectedBtn.innerHTML = `<i class="fas fa-trash"></i> Delete Selected${selectedCount > 0 ? ` (${selectedCount})` : ""}`;
}

// Clear all pages
function clearAll() {
  if (pages.length === 0) return;

  if (confirm("Are you sure you want to clear all pages?")) {
    pages = [];
    pageIdCounter = 0;
    updateUI();
  }
}

// Export PDF
async function exportPDF() {
  if (pages.length === 0) return;

  showLoading("Creating PDF...");

  try {
    // Create a new PDF document
    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    // Group PDF pages by source for efficient copying
    const sourceMap = new Map();

    for (const page of pages) {
      if (page.type === "pdf" && page.pdfBytes) {
        const key = page.pdfBytes;
        if (!sourceMap.has(key)) {
          sourceMap.set(key, {
            pdfBytes: page.pdfBytes,
            pageIndices: [],
          });
        }
        sourceMap.get(key).pageIndices.push({
          originalIndex: page.pageIndex,
          orderIndex: pages.indexOf(page),
        });
      }
    }

    // Load source PDFs
    const loadedPdfs = new Map();

    for (const [key, data] of sourceMap) {
      const srcPdf = await PDFDocument.load(data.pdfBytes);
      loadedPdfs.set(key, srcPdf);
    }

    // Process pages in order
    loadingText.textContent = "Building PDF...";

    for (let i = 0; i < pages.length; i++) {
      loadingText.textContent = `Processing page ${i + 1}/${pages.length}...`;

      const page = pages[i];

      if (page.type === "pdf" && page.pdfBytes) {
        // Copy PDF page
        const srcPdf = loadedPdfs.get(page.pdfBytes);
        const [copiedPage] = await mergedPdf.copyPages(srcPdf, [
          page.pageIndex,
        ]);
        mergedPdf.addPage(copiedPage);
      } else if (page.type === "image" && page.imageData) {
        // Embed image as a page
        let img;
        const dataUrl = page.imageData;

        if (dataUrl.includes("image/png")) {
          const base64 = dataUrl.split(",")[1];
          const imgBytes = Uint8Array.from(atob(base64), (c) =>
            c.charCodeAt(0),
          );
          img = await mergedPdf.embedPng(imgBytes);
        } else if (
          dataUrl.includes("image/jpeg") ||
          dataUrl.includes("image/jpg")
        ) {
          const base64 = dataUrl.split(",")[1];
          const imgBytes = Uint8Array.from(atob(base64), (c) =>
            c.charCodeAt(0),
          );
          img = await mergedPdf.embedJpg(imgBytes);
        } else {
          // For other formats, convert canvas to PNG
          const pngDataUrl = page.canvas.toDataURL("image/png");
          const base64 = pngDataUrl.split(",")[1];
          const imgBytes = Uint8Array.from(atob(base64), (c) =>
            c.charCodeAt(0),
          );
          img = await mergedPdf.embedPng(imgBytes);
        }

        // Create a page with the image dimensions (convert pixels to points: 72 points = 1 inch, assuming 96 DPI)
        const scaleFactor = 72 / 96;
        const pageWidth = page.canvas.width * scaleFactor;
        const pageHeight = page.canvas.height * scaleFactor;

        const pdfPage = mergedPdf.addPage([pageWidth, pageHeight]);
        pdfPage.drawImage(img, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
      }
    }

    // Save the merged PDF
    loadingText.textContent = "Saving PDF...";
    const pdfBytes = await mergedPdf.save();

    // Download
    let filename = filenameInput.value.trim() || "merged.pdf";
    if (!filename.toLowerCase().endsWith(".pdf")) {
      filename += ".pdf";
    }

    downloadBlob(pdfBytes, filename, "application/pdf");
  } catch (error) {
    console.error("Error exporting PDF:", error);
    alert("Error creating PDF. Please try again.");
  }

  hideLoading();
}

// Download blob
function downloadBlob(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

// Show loading overlay
function showLoading(text = "Processing...") {
  loadingText.textContent = text;
  loadingOverlay.classList.remove("hidden");
}

// Hide loading overlay
function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

// Zoom functions
function zoomIn() {
  if (zoomLevel < MAX_ZOOM) {
    zoomLevel += ZOOM_STEP;
    applyZoom();
  }
}

function zoomOut() {
  if (zoomLevel > MIN_ZOOM) {
    zoomLevel -= ZOOM_STEP;
    applyZoom();
  }
}

function applyZoom() {
  // Update display
  if (zoomLevelDisplay) {
    zoomLevelDisplay.textContent = `${zoomLevel}%`;
  }

  // Calculate new min-width based on zoom
  const baseWidth = 180;
  const newWidth = Math.round(baseWidth * (zoomLevel / 100));

  // Apply to grid
  pagesContainer.style.gridTemplateColumns = `repeat(auto-fill, minmax(${newWidth}px, 1fr))`;

  // Update button states
  if (zoomInBtn) zoomInBtn.disabled = zoomLevel >= MAX_ZOOM;
  if (zoomOutBtn) zoomOutBtn.disabled = zoomLevel <= MIN_ZOOM;
}
