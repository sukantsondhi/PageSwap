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
    alert(error.message || "Error processing files. Please try again.");
  }

  hideLoading();
}

// Process a single image file
async function processImage(file) {
  loadingText.textContent = `Processing ${file.name}...`;

  // Check for HEIC/HEIF which aren't natively supported by browsers
  const isHeic =
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif");
  if (isHeic) {
    throw new Error(
      `HEIC/HEIF format is not supported directly by browsers. Please convert "${file.name}" to JPEG or PNG first.`,
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();

      // Add timeout for image loading (10 seconds)
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Timeout loading image: ${file.name}. The file may be too large or corrupted.`,
          ),
        );
      }, 10000);

      img.onload = () => {
        clearTimeout(timeout);

        // Validate image dimensions
        if (img.width === 0 || img.height === 0) {
          reject(new Error(`Invalid image dimensions for: ${file.name}`));
          return;
        }

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
      img.onerror = () => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Failed to load image: ${file.name}. The format may not be supported by your browser.`,
          ),
        );
      };
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

  // Validate PDF - check for %PDF- header within first 1024 bytes
  if (pdfBytes.length < 5) {
    throw new Error(`"${file.name}" is too small to be a valid PDF file.`);
  }

  // Look for %PDF- header within first 1024 bytes (some PDFs have extra bytes before header)
  let foundPdfHeader = false;
  const searchLimit = Math.min(pdfBytes.length, 1024);
  for (let i = 0; i < searchLimit - 4; i++) {
    if (
      pdfBytes[i] === 0x25 &&
      pdfBytes[i + 1] === 0x50 &&
      pdfBytes[i + 2] === 0x44 &&
      pdfBytes[i + 3] === 0x46
    ) {
      // Found %PDF
      foundPdfHeader = true;
      break;
    }
  }

  if (!foundPdfHeader) {
    throw new Error(
      `"${file.name}" does not appear to be a valid PDF file. It may have the wrong file extension or be corrupted.`,
    );
  }

  // Load with PDF.js for rendering (with password handling)
  let pdf;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes.slice(),
      // Try to handle owner-password-only PDFs (viewing allowed but editing restricted)
      password: "",
    });

    // Handle password prompt
    loadingTask.onPassword = (updateCallback, reason) => {
      if (reason === pdfjsLib.PasswordResponses.NEED_PASSWORD) {
        throw new Error(
          `"${file.name}" is password-protected. Please unlock it first using Adobe Reader or another PDF tool, then save an unlocked copy.`,
        );
      } else if (reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
        throw new Error(`"${file.name}" requires a password to open.`);
      }
    };

    pdf = await loadingTask.promise;
  } catch (loadError) {
    console.error(`Error loading PDF "${file.name}":`, loadError);

    // Provide specific error messages
    const errorMsg = loadError.message || "";
    if (
      errorMsg.includes("password") ||
      errorMsg.includes("Password") ||
      errorMsg.includes("encrypted")
    ) {
      throw new Error(
        `"${file.name}" is protected. Bank statements are often encrypted. Try: 1) Open in Adobe Reader, 2) Print to PDF to create an unlocked copy.`,
      );
    } else if (errorMsg.includes("Invalid PDF")) {
      throw new Error(
        `"${file.name}" appears to be corrupted or is not a standard PDF.`,
      );
    } else {
      throw new Error(
        `Failed to load "${file.name}": ${errorMsg || "The PDF may be corrupted or protected."}`,
      );
    }
  }

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
    // Check if PDFLib is available
    if (typeof PDFLib === "undefined") {
      throw new Error(
        "PDF library not loaded. Please refresh the page and try again.",
      );
    }

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
            sourceName: page.sourceName,
            pageIndices: [],
          });
        }
        sourceMap.get(key).pageIndices.push({
          originalIndex: page.pageIndex,
          orderIndex: pages.indexOf(page),
        });
      }
    }

    // Load source PDFs with validation
    const loadedPdfs = new Map();

    for (const [key, data] of sourceMap) {
      // Validate PDF bytes exist
      if (!data.pdfBytes || data.pdfBytes.length < 5) {
        throw new Error(
          `Invalid PDF data for "${data.sourceName}". The file may be corrupted. Please try uploading it again.`,
        );
      }

      // Look for %PDF- header within first 1024 bytes
      let foundPdfHeader = false;
      const searchLimit = Math.min(data.pdfBytes.length, 1024);
      for (let i = 0; i < searchLimit - 4; i++) {
        if (
          data.pdfBytes[i] === 0x25 &&
          data.pdfBytes[i + 1] === 0x50 &&
          data.pdfBytes[i + 2] === 0x44 &&
          data.pdfBytes[i + 3] === 0x46
        ) {
          foundPdfHeader = true;
          break;
        }
      }

      if (!foundPdfHeader) {
        throw new Error(
          `"${data.sourceName}" does not appear to be a valid PDF file. Please try uploading it again.`,
        );
      }

      try {
        const srcPdf = await PDFDocument.load(data.pdfBytes, {
          ignoreEncryption: true,
        });
        loadedPdfs.set(key, srcPdf);
      } catch (loadError) {
        console.error(`Error loading PDF "${data.sourceName}":`, loadError);
        const errorMsg = loadError.message || "";
        if (
          errorMsg.includes("encrypt") ||
          errorMsg.includes("password") ||
          errorMsg.includes("Password")
        ) {
          throw new Error(
            `"${data.sourceName}" has security restrictions preventing export. Try: Open in Adobe Reader → Print → Save as PDF to create an unlocked copy.`,
          );
        }
        throw new Error(
          `Failed to process "${data.sourceName}": ${errorMsg || "The PDF may be corrupted or have security restrictions."}`,
        );
      }
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
      } else if (page.type === "image") {
        // Validate canvas exists and has valid dimensions
        if (
          !page.canvas ||
          page.canvas.width === 0 ||
          page.canvas.height === 0
        ) {
          console.error(
            `Invalid canvas for page ${i + 1} (${page.sourceName})`,
          );
          throw new Error(
            `Failed to process image "${page.sourceName}". The image may be corrupted or in an unsupported format.`,
          );
        }

        // Embed image as a page - always convert to PNG for compatibility
        let img;
        try {
          const pngDataUrl = page.canvas.toDataURL("image/png");
          const base64 = pngDataUrl.split(",")[1];
          if (!base64) {
            throw new Error("Failed to convert image to PNG format.");
          }
          const imgBytes = Uint8Array.from(atob(base64), (c) =>
            c.charCodeAt(0),
          );
          img = await mergedPdf.embedPng(imgBytes);
        } catch (embedError) {
          console.error(
            `Error embedding image ${page.sourceName}:`,
            embedError,
          );
          throw new Error(
            `Failed to embed image "${page.sourceName}" into PDF. Please try a different image format.`,
          );
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
    alert(error.message || "Error creating PDF. Please try again.");
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
