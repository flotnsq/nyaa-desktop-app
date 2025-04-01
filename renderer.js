const searchForm = document.getElementById('search-form');
const searchTermInput = document.getElementById('search-term');
const categorySelect = document.getElementById('search-category');
const filterSelect = document.getElementById('search-filter');
const sortSelect = document.getElementById('search-sort');
const directionSelect = document.getElementById('search-direction');
const resultsTableBody = document.querySelector('#search-results tbody');
const loadingIndicator = document.getElementById('loading');
const errorMessageDiv = document.getElementById('error-message');
const paginationControls = document.getElementById('pagination-controls');
const resultsTableHead = document.querySelector('#search-results thead');
const detailModal = document.getElementById('detail-modal');
const modalBody = document.getElementById('modal-body');
const closeModalButton = detailModal.querySelector('.close-button');
// Download Manager elements
const downloadManagerDiv = document.getElementById('download-manager');
const downloadListDiv = document.getElementById('download-list');
const clearCompletedButton = document.getElementById('clear-completed-downloads'); // Refers to "Clear Finished List Items"
// Search History elements
const searchHistoryListDiv = document.getElementById('search-history-list');
const searchHistoryDatalist = document.getElementById('search-history-datalist');
const clearSearchHistoryButton = document.getElementById('clear-search-history');
// Clear Downloaded Markers button
const clearDownloadedMarkersButton = document.getElementById('clear-downloaded-markers');
// Settings Modal Elements
const settingsModal = document.getElementById('settings-modal');
const openSettingsButton = document.getElementById('open-settings-button');
const settingsCloseButton = document.getElementById('settings-close-button');
const settingsSaveButton = document.getElementById('settings-save-button');
const settingsCancelButton = document.getElementById('settings-cancel-button');
const themeSelect = document.getElementById('theme-select');
const historyLimitInput = document.getElementById('history-limit-input');
const downloadPathInput = document.getElementById('download-path-input');
const browseDownloadPathButton = document.getElementById('browse-download-path');

// Mapping for category codes to display names
const categoryMap = {
    '1_0': 'All Categories',
    '1_1': 'Anime - AMV',
    '1_2': 'Anime - English',
    '1_3': 'Anime - Non-English',
    '1_4': 'Anime - Raw',
    '2_1': 'Audio - Lossless',
    '2_2': 'Audio - Lossy',
    '3_1': 'Literature - English',
    '3_2': 'Literature - Non-English',
    '3_3': 'Literature - Raw',
    '4_1': 'Live Action - English',
    '4_2': 'Live Action - Idol/PV',
    '4_3': 'Live Action - Non-English',
    '4_4': 'Live Action - Raw',
    '5_1': 'Pictures - Graphics',
    '5_2': 'Pictures - Photos',
    '6_1': 'Software - Apps',
    '6_2': 'Software - Games'
    // Add more if needed based on nyaa.si categories
};

// --- State Variables ---
let currentPage = 1;
let maxPages = 1; // Note: Still used internally for logic, even if not displayed
let currentSearchTerm = '';
let currentSearchOptions = {}; // Will be loaded/saved
let debounceTimeout = null;
let lastResultCount = -1;
const downloadedItems = new Set(); // Store IDs of successfully downloaded items
let searchHistory = []; // Array to store recent search terms
let MAX_HISTORY_ITEMS = 10; // Default max number of history items, will be loaded from settings
let currentDownloadPath = ''; // Will be loaded from settings

// --- LocalStorage Keys ---
const LS_OPTIONS_KEY = 'nyaaSearchOptions';
const LS_DOWNLOADED_KEY = 'nyaaDownloadedItems'; // Key for downloaded items
const LS_HISTORY_KEY = 'nyaaSearchHistory'; // Key for search history
const LS_SETTINGS_KEY = 'nyaaAppSettings'; // Key for general app settings

// --- Helper Functions ---

// Function to parse size string (e.g., "1.4 GiB") into MB
function parseSizeToMB(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string') return 0;
    const sizeMatch = sizeStr.match(/([\d.]+)\s*(KiB|MiB|GiB|TiB)/i);
    if (!sizeMatch) return 0;

    const value = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toLowerCase();

    switch (unit) {
        case 'tib': return value * 1024 * 1024;
        case 'gib': return value * 1024;
        case 'mib': return value;
        case 'kib': return value / 1024;
        default: return 0;
    }
}

// Function to format bytes into readable string
function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes'; // Handle 0 or undefined bytes
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    // Handle cases where totalBytes might be 0 initially
    if (bytes <= 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    // Ensure i is within the bounds of the sizes array
    const index = Math.min(i, sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, index)).toFixed(dm)) + ' ' + sizes[index];
}

// Function to get size class based on MB
function getSizeClass(sizeMB) {
    if (sizeMB <= 0) return ''; // No class if size unknown
    if (sizeMB < 500) return 'size-small'; // Less than 500MB
    if (sizeMB < 2048) return 'size-medium'; // 500MB to 2GB
    if (sizeMB < 10240) return 'size-large'; // 2GB to 10GB
    return 'size-xlarge'; // Over 10GB
}

function updateSortIndicators(newSortKey, newDirection) {
    resultsTableHead.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.dataset.sort === newSortKey) {
            th.classList.add(newDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

// Updated function to generate pagination controls (no maxPages)
function renderPaginationControls(currentPage, wasLastPageEmpty) {
    paginationControls.innerHTML = ''; // Clear old controls
    paginationControls.style.display = 'flex'; // Use flex display

    const delta = 2;
    const range = [];
    // Generate numbers around current page
    for (let i = Math.max(2, currentPage - delta); i <= currentPage + delta; i++) {
        // Don't generate page numbers beyond current if last page was empty
        if (!wasLastPageEmpty || i <= currentPage) {
            range.push(i);
        }
    }

    // Add ellipsis/first page if needed
    if (currentPage - delta > 2) {
        range.unshift('...');
    }
    range.unshift(1);

    // Add ellipsis at the end if we think there are more pages
    if (!wasLastPageEmpty) {
        range.push('...');
    }

    const createLink = (page, text, isDisabled = false, isActive = false, isEllipsis = false) => {
        const link = document.createElement('span');
        link.textContent = text || page;
        link.classList.add(isEllipsis ? 'pagination-ellipsis' : 'pagination-link');
        if (isDisabled) link.classList.add('disabled');
        if (isActive) link.classList.add('active');
        if (!isDisabled && !isActive && !isEllipsis) {
            link.dataset.page = page;
            link.addEventListener('click', () => {
                performSearch(currentSearchTerm, page, currentSearchOptions);
            });
        }
        return link;
    };

    // First Page Link
    paginationControls.appendChild(createLink(1, '<<', currentPage <= 1));
    // Previous Page Link
    paginationControls.appendChild(createLink(currentPage - 1, '< Prev', currentPage <= 1));

    // Page Number Links
    let lastPageRendered = 0;
    range.forEach(page => {
        if (page === '...') {
             // Avoid consecutive ellipsis if range is small
             if (lastPageRendered !== '...') {
                paginationControls.appendChild(createLink(null, '...', false, false, true));
                lastPageRendered = '...';
             }
        } else {
            paginationControls.appendChild(createLink(page, null, false, page === currentPage));
            lastPageRendered = page;
        }
    });

    // Next Page Link (Disabled only if the last fetch returned 0 results)
    paginationControls.appendChild(createLink(currentPage + 1, 'Next >', wasLastPageEmpty));
    // Removed Last Page Link
}

// Function to save options to localStorage
function saveOptions(optionsToSave) {
    try {
        localStorage.setItem(LS_OPTIONS_KEY, JSON.stringify(optionsToSave));
    } catch (e) {
        console.error("Failed to save options to localStorage:", e);
    }
}

// Function to load options from localStorage
function loadOptions() {
    try {
        const savedOptions = localStorage.getItem(LS_OPTIONS_KEY);
        if (savedOptions) {
            return JSON.parse(savedOptions);
        }
    } catch (e) {
        console.error("Failed to load options from localStorage:", e);
    }
    // Return defaults if nothing saved or error occurred
    return {
        term: '',
        filter: '0',
        category: '1_0',
        sort: 'name',
        direction: 'desc'
    };
}

// Function to save downloaded items to localStorage
function saveDownloadedItems() {
    try {
        localStorage.setItem(LS_DOWNLOADED_KEY, JSON.stringify(Array.from(downloadedItems)));
    } catch (e) {
        console.error("Failed to save downloaded items to localStorage:", e);
    }
}

// Function to load downloaded items from localStorage
function loadDownloadedItems() {
    try {
        const saved = localStorage.getItem(LS_DOWNLOADED_KEY);
        if (saved) {
            const itemsArray = JSON.parse(saved);
            // Clear the set first in case this is called multiple times (though it shouldn't be)
            downloadedItems.clear();
            itemsArray.forEach(item => downloadedItems.add(item)); // Populate the Set
            console.log(`Loaded ${downloadedItems.size} downloaded item IDs.`);
        }
    } catch (e) {
        console.error("Failed to load downloaded items from localStorage:", e);
        downloadedItems.clear(); // Ensure set is empty on error
    }
}

// --- Search History Functions ---
function loadSearchHistory() {
    try {
        const savedHistory = localStorage.getItem(LS_HISTORY_KEY);
        if (savedHistory) {
            searchHistory = JSON.parse(savedHistory);
            console.log(`Loaded ${searchHistory.length} search history items.`);
        } else {
            searchHistory = [];
        }
    } catch (e) {
        console.error("Failed to load search history from localStorage:", e);
        searchHistory = [];
    }
    displaySearchHistory(); // Update UI after loading
}

function saveSearchHistory() {
    try {
        localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch (e) {
        console.error("Failed to save search history to localStorage:", e);
    }
}

function addSearchToHistory(term) {
    if (!term || term.trim() === '') return; // Don't add empty searches

    // Remove existing instance of the term to move it to the front
    searchHistory = searchHistory.filter(item => item !== term);

    // Add new term to the beginning
    searchHistory.unshift(term);

    // Limit history size
    if (searchHistory.length > MAX_HISTORY_ITEMS) {
        searchHistory = searchHistory.slice(0, MAX_HISTORY_ITEMS);
    }

    saveSearchHistory();
    displaySearchHistory(); // Update UI
}

function displaySearchHistory() {
    // Update Datalist (for autocomplete)
    searchHistoryDatalist.innerHTML = ''; // Clear existing options
    searchHistory.forEach(term => {
        const option = document.createElement('option');
        option.value = term;
        searchHistoryDatalist.appendChild(option);
    });

    // Update Recent Searches List
    searchHistoryListDiv.innerHTML = ''; // Clear existing items
    // Display only a few recent items (e.g., last 5)
    const recentItems = searchHistory.slice(0, 5);
    const historySection = document.getElementById('search-history'); // Get reference to the history section div

    if (recentItems.length > 0) {
        if (historySection) historySection.style.display = 'block'; // Show the section
        if (clearSearchHistoryButton) clearSearchHistoryButton.style.display = 'inline-block'; // Show clear button
        recentItems.forEach(term => {
            const historyItem = document.createElement('span');
            historyItem.classList.add('history-item');
            historyItem.textContent = term;
            historyItem.title = `Search for: ${term}`;
            historyItem.addEventListener('click', () => {
                searchTermInput.value = term;
                // Trigger search immediately when history item is clicked
                searchForm.dispatchEvent(new Event('submit'));
            });
            searchHistoryListDiv.appendChild(historyItem);
        });
    } else {
         if (historySection) historySection.style.display = 'none'; // Hide if no history
         if (clearSearchHistoryButton) clearSearchHistoryButton.style.display = 'none'; // Hide clear button
    }
}

function handleClearSearchHistory() {
    searchHistory = [];
    saveSearchHistory();
    displaySearchHistory(); // Update UI to hide section and button
    console.log('Search history cleared.');
}

function handleClearDownloadedMarkers() {
    // Confirm with the user
    if (!confirm("Are you sure you want to clear all downloaded markers from the list? This cannot be undone.")) {
        return;
    }

    // Clear the set
    downloadedItems.clear();

    // Remove the visual markers from the current table rows
    resultsTableBody.querySelectorAll('tr').forEach(row => {
        const nameCell = row.querySelector('td:nth-child(3)'); // Assuming name is 3rd col
        if (nameCell) {
            nameCell.classList.remove('downloaded-glow');
            // You might also want to remove a specific marker element if you added one
        }
        // Also potentially remove from download list if shown there visually as 'marked'
        const itemId = row.dataset.itemId; // Assuming you have data-item-id on rows
        const downloadItemDiv = downloadListDiv.querySelector(`.download-item[data-id="${itemId}"]`);
        if (downloadItemDiv && !downloadItemDiv.querySelector('.progress-bar')) { // Only remove marker if not actively downloading/downloaded
             const statusSpan = downloadItemDiv.querySelector('.download-status');
             if (statusSpan && statusSpan.textContent.includes('Marked')) {
                statusSpan.textContent = 'Ready'; // Or remove status entirely
             }
        }
    });

    // Save the empty set to localStorage
    saveDownloadedItems();

    console.log("Downloaded markers cleared.");
    // Optionally, show a confirmation message to the user
}

// --- Settings Functions ---
function applyTheme(themeName) {
    console.log("Applying theme:", themeName);
    // Ensure themeName is either 'light' or 'dark'
    const newTheme = themeName === 'light' ? 'light' : 'dark';

    document.body.classList.toggle('light-theme', newTheme === 'light');

    // Update the theme select dropdown in settings
    if (themeSelect) {
        themeSelect.value = newTheme;
    }
}

function saveSettings() {
    const selectedTheme = themeSelect.value;
    const newHistoryLimit = parseInt(historyLimitInput.value, 10);
    const downloadPath = downloadPathInput.value; // Get the path from the input

    if (isNaN(newHistoryLimit) || newHistoryLimit < 0 || newHistoryLimit > 50) {
        alert('Invalid History Limit. Please enter a number between 0 and 50.');
        return; // Don't save invalid settings
    }

    MAX_HISTORY_ITEMS = newHistoryLimit;
    applyTheme(selectedTheme);

    const settingsToSave = {
        theme: selectedTheme,
        historyLimit: MAX_HISTORY_ITEMS,
        downloadPath: downloadPath // Save the download path
    };

    try {
        localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settingsToSave));
        console.log('Settings saved:', settingsToSave);
        // Optionally trim history if limit decreased
        if (searchHistory.length > MAX_HISTORY_ITEMS) {
            searchHistory = searchHistory.slice(0, MAX_HISTORY_ITEMS);
            saveSearchHistory();
            displaySearchHistory();
        }
        closeSettingsModal();
    } catch (e) {
        console.error("Failed to save settings to localStorage:", e);
        alert('Failed to save settings.');
    }
}

function loadSettings() {
    let savedSettings = {};
    try {
        const settingsJson = localStorage.getItem(LS_SETTINGS_KEY);
        if (settingsJson) {
            savedSettings = JSON.parse(settingsJson);
            console.log('Loaded settings:', savedSettings);
        } else {
           console.log('No saved settings found, using defaults.');
        }
    } catch (e) {
        console.error("Failed to load settings from localStorage:", e);
    }

    // Apply Theme
    const theme = savedSettings.theme || 'dark'; // Default to dark
    themeSelect.value = theme;
    applyTheme(theme);

    // Apply History Limit
    const limit = savedSettings.historyLimit !== undefined ? parseInt(savedSettings.historyLimit, 10) : 10; // Default to 10
    MAX_HISTORY_ITEMS = !isNaN(limit) && limit >= 0 && limit <= 50 ? limit : 10;
    historyLimitInput.value = MAX_HISTORY_ITEMS;

    // Apply Download Path
    currentDownloadPath = savedSettings.downloadPath || ''; // Load path or default to empty
    downloadPathInput.value = currentDownloadPath;
}

function openSettingsModal() {
    // Load current settings into modal fields before showing
    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
    themeSelect.value = currentTheme;
    historyLimitInput.value = MAX_HISTORY_ITEMS;
    downloadPathInput.value = currentDownloadPath; // Ensure input reflects current setting
    if (settingsModal) settingsModal.style.display = 'block';
}

function closeSettingsModal() {
    if (settingsModal) settingsModal.style.display = 'none';
}

// --- IPC Communication for Download Path ---
function setupDownloadPathIPC() {
    if (browseDownloadPathButton) {
        browseDownloadPathButton.addEventListener('click', async () => {
            console.log('Browse button clicked');
            if (window.electronAPI && window.electronAPI.selectDirectory) {
                const selectedPath = await window.electronAPI.selectDirectory();
                console.log('Selected path from main:', selectedPath);
                if (selectedPath) {
                    downloadPathInput.value = selectedPath;
                    // No need to set currentDownloadPath here, it's set on save
                } else {
                    console.log('Directory selection cancelled or failed.');
                }
            } else {
                console.error('electronAPI.selectDirectory is not available! Check preload.js');
                alert('Error: Cannot select directory. Feature not available.');
            }
        });
    }
}

// Function to open the modal
function openModal() {
    document.body.classList.add('modal-open'); // Add class to body
    detailModal.style.display = 'flex';
}

// Function to close the modal
function closeModal() {
    document.body.classList.remove('modal-open'); // Remove class from body
    detailModal.style.display = 'none';
    modalBody.innerHTML = 'Loading details...'; // Reset content
}

// --- Download Handling ---
async function triggerDownload(downloadUrl, torrentName, itemId) {
    console.log(`Attempting to trigger download for: ${torrentName}`);
    console.log(`URL: ${downloadUrl}`);

    const downloadInfo = {
        url: downloadUrl,
        filename: torrentName,
        savePath: currentDownloadPath || undefined, // Send path if set, else undefined for default
        itemId: itemId // Pass original Nyaa ID for potential use (though not currently used in main for feedback)
    };

    // Check if electronAPI and the downloadFile function exist
    if (window.electronAPI && window.electronAPI.downloadFile) {
        try {
            // Await the result from the main process
            const result = await window.electronAPI.downloadFile(downloadInfo);
            console.log('Result from electronAPI.downloadFile:', result);
            if (result.success) {
                // Initial UI update (optional, handled by listener now)
                // markItemAsDownloading(itemId);
            } else {
                // Handle immediate trigger failure
                console.error(`Main process failed to trigger download for ${torrentName}:`, result.error);
                // updateFeedbackSpan(itemId, `❌ ${result.error || 'Trigger Fail'}`);
            }
            return result; // Return the result object
        } catch (error) {
            console.error('Error calling electronAPI.downloadFile:', error);
            // updateFeedbackSpan(itemId, '❌ IPC Error');
            return { success: false, error: 'IPC communication error' };
        }
    } else {
        console.error('window.electronAPI.downloadFile is not available! Check preload.js');
        return { success: false, error: 'Download API not available' };
    }
}

// Handler for individual download link clicks
async function handleDownloadClick(event) {
    event.preventDefault(); // Stop the default link behavior
    event.stopPropagation(); // Stop row click event if applicable
    const link = event.currentTarget;
    const downloadUrl = link.dataset.downloadUrl;
    const torrentName = link.dataset.torrentName ? `${link.dataset.torrentName}.torrent` : 'download.torrent';
    const itemId = link.closest('tr').dataset.torrentId; // Get the unique ID

    updateFeedbackSpan(downloadUrl, '⏳ Starting...');
    const result = await triggerDownload(downloadUrl, torrentName, itemId);
    if (result.success) {
        updateFeedbackSpan(downloadUrl, '✅ Downloading...');
        markItemAsDownloaded(itemId);
    } else {
        updateFeedbackSpan(downloadUrl, `❌ ${result.error || 'Fail'}`);
    }
}

// --- Download Manager UI ---

function createOrUpdateDownloadItem(data) {
    downloadManagerDiv.style.display = 'block'; // Show manager if hidden
    let itemDiv = downloadListDiv.querySelector(`.download-item[data-download-id="${data.id}"]`);

    if (!itemDiv) {
        // Create new item
        itemDiv = document.createElement('div');
        itemDiv.classList.add('download-item');
        itemDiv.dataset.downloadId = data.id;
        // Store original URL for tracking
        if (data.url) itemDiv.dataset.originalUrl = data.url;

        const filenameSpan = document.createElement('span');
        filenameSpan.classList.add('filename');
        filenameSpan.textContent = data.filename;
        filenameSpan.title = data.filename; // Show full name on hover

        const progressBar = document.createElement('progress');
        progressBar.max = data.totalBytes || 1; // Avoid division by zero if totalBytes is 0 initially
        progressBar.value = data.receivedBytes || 0;

        const statusSpan = document.createElement('span');
        statusSpan.classList.add('status');

        const cancelButton = document.createElement('button');
        cancelButton.classList.add('cancel-download');
        cancelButton.innerHTML = '&times;'; // Multiplication sign as 'X'
        cancelButton.title = 'Cancel Download';
        cancelButton.addEventListener('click', async () => {
            console.log(`Requesting cancel for download ${data.id}`);
            await window.electronAPI.cancelDownload(data.id);
            // Status update will come via IPC, removing the item or marking as cancelled
        });

        itemDiv.appendChild(filenameSpan);
        itemDiv.appendChild(progressBar);
        itemDiv.appendChild(statusSpan);
        itemDiv.appendChild(cancelButton);

        downloadListDiv.prepend(itemDiv); // Add new downloads to the top
    }

    // Update existing item
    const progressBar = itemDiv.querySelector('progress');
    const statusSpan = itemDiv.querySelector('.status');
    const cancelButton = itemDiv.querySelector('.cancel-download');

    // Ensure progress bar exists before trying to update it
    if (progressBar) {
        progressBar.max = data.totalBytes || 1;
        progressBar.value = data.receivedBytes || 0;
        progressBar.style.display = 'inline-block'; // Ensure it's visible
    }

    itemDiv.classList.remove('completed', 'failed', 'cancelled', 'interrupted', 'paused'); // Clear previous states

    switch (data.state) {
        case 'progressing':
            statusSpan.textContent = `${formatBytes(data.receivedBytes)} / ${formatBytes(data.totalBytes)}`;
            break;
        case 'interrupted':
            statusSpan.textContent = 'Interrupted';
            itemDiv.classList.add('interrupted');
            if (progressBar) progressBar.style.display = 'none'; // Hide progress bar
            if (cancelButton) cancelButton.remove(); // Can't cancel interrupted
            break;
        case 'paused': // May not happen with simple downloadURL
            statusSpan.textContent = 'Paused';
            itemDiv.classList.add('paused');
            break;
        case 'completed':
            statusSpan.textContent = 'Completed';
            itemDiv.classList.add('completed');
            if (progressBar) progressBar.value = progressBar.max; // Ensure it shows 100%
            if (cancelButton) cancelButton.remove(); // Remove cancel button

            // Add to downloaded set and save
            if (itemDiv.dataset.originalUrl) {
                const urlParts = itemDiv.dataset.originalUrl.split('/');
                const torrentId = urlParts[urlParts.length - 1];
                if (torrentId && !downloadedItems.has(torrentId)) {
                    console.log(`Adding torrent ID ${torrentId} to downloaded set.`);
                    downloadedItems.add(torrentId);
                    saveDownloadedItems();
                    // Update the corresponding row in the search results if visible
                    const resultRow = resultsTableBody.querySelector(`tr[data-torrent-id="${torrentId}"]`);
                    if (resultRow) {
                        const nameCell = resultRow.cells[2]; // Assuming name is the 3rd cell (index 2)
                        if (nameCell) { // Check if cell exists
                            nameCell.classList.add('downloaded-glow');
                        }
                    }
                }
            }
            break;
        case 'cancelled':
            statusSpan.textContent = 'Cancelled';
            itemDiv.classList.add('cancelled');
            if (progressBar) progressBar.style.display = 'none'; // Hide progress bar
            if (cancelButton) cancelButton.remove();
            break;
        case 'failed': // Custom state for general failure
             statusSpan.textContent = 'Failed';
             itemDiv.classList.add('failed');
             if (progressBar) progressBar.style.display = 'none'; // Hide progress bar
             if (cancelButton) cancelButton.remove();
             break;
        default: // Handle unknown or initial 'started' state
            statusSpan.textContent = 'Starting...';
            break;
    }

    // Special handling for initial 'started' state before first progress update
    if (!data.state && data.startTime) {
         statusSpan.textContent = 'Starting...';
    }
}

function clearCompletedDownloads() {
    downloadListDiv.querySelectorAll('.download-item.completed, .download-item.failed, .download-item.cancelled, .download-item.interrupted').forEach(item => {
        item.remove();
    });
    // Hide manager if list becomes empty
    if (downloadListDiv.children.length === 0) {
        downloadManagerDiv.style.display = 'none';
    }
}

// Function to fetch and display torrent details
async function showTorrentDetails(torrentId) {
    openModal();
    try {
        const result = await window.electronAPI.getTorrentDetails(torrentId);
        if (result && result.error) {
            modalBody.innerHTML = `<p class="error">Error loading details: ${result.error}</p>`;
        } else if (result && result.info) {
            const info = result.info;

            // Define SVG icons
            const downloadSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 512 512" fill="currentColor"><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>`;
            const magnetSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 576 512" fill="currentColor"><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path d="M320 64c0-53-43-96-96-96H192c-53 0-96 43-96 96v80c0 8.8 7.2 16 16 16s16-7.2 16-16V64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32v80c0 8.8 7.2 16 16 16s16-7.2 16-16V64zM144 256c-53 0-96 43-96 96v16c0 53 43 96 96 96h32c53 0 96-43 96-96v-16c0-53-43-96-96-96H144zm64 112a48 48 0 1 1 -96 0 48 48 0 1 1 96 0zM432 256c-53 0-96 43-96 96v16c0 53 43 96 96 96h32c53 0 96-43 96-96v-16c0-53-43-96-96-96H432zm64 112a48 48 0 1 1 -96 0 48 48 0 1 1 96 0z"/></svg>`;
            const downloadLinkHtml = `${downloadSVG} Download`; // Store for data attribute

            // Basic formatting, can be improved
            let detailHtml = `
                <p><strong>Title:</strong> ${info.name || 'N/A'}</p>
                <p><strong>Category:</strong> ${categoryMap[info.sub_category] || info.sub_category || 'N/A'}</p>
                <p><strong>Submitter:</strong> ${info.uploader_name || 'N/A'}</p>
                <p><strong>Size:</strong> ${info.filesize || 'N/A'}</p>
                <p><strong>Date:</strong> ${info.date ? new Date(info.date).toLocaleString() : 'N/A'}</p>
                <p><strong>Seeders:</strong> <span class="seeders-cell">${info.seeders || 'N/A'}</span></p>
                <p><strong>Leechers:</strong> <span class="leechers-cell">${info.leechers || 'N/A'}</span></p>
                <p><strong>Completed:</strong> ${info.completed || 'N/A'}</p>
                <p><strong>Hash:</strong> ${info.hash || 'N/A'}</p>
                <p>
                    <a href="#" data-download-url="${info.torrent || ''}" data-torrent-name="${info.name || 'torrent'}" data-original-html='${downloadLinkHtml}' class="pagination-link download-torrent-link" title="Download .torrent file (Auto)">${downloadLinkHtml}</a>
                    &nbsp;&nbsp;
                    <a href="${info.magnet || '#'}" class="pagination-link" title="Magnet Link">${magnetSVG} Magnet</a>
                </p>
                `;

            // Description (handle potential HTML)
             if (info.description) {
                 //console.log("Description HTML from scraper:", info.description);
                 // Use a div and set innerHTML to render potential images/links - REVERTED
                 detailHtml += `<h3>Description</h3><div class="description-content">${info.description}</div>`;
             }

            // --- File List Section (Recursive) ---
            let fileListHtml = '';
            function buildFileListHtml(items, level = 0) {
                if (!items || items.length === 0) return '';
                let listHtml = `<ul style="padding-left: ${level > 0 ? 25 : 0}px;">
`;
                items.forEach(item => {
                    const hasChildren = item.children && item.children.length > 0;
                    const iconHtml = item.type === 'folder'
                        ? '<i class="icon icon-folder-closed"></i><i class="icon icon-folder-open"></i>'
                        : '<i class="icon icon-file"></i>';
                    const sizeSpan = item.size ? `<span class="file-size-inline">(${item.size})</span>` : '';
                    const liClass = item.type === 'folder' ? ('folder' + (hasChildren ? ' non-empty-folder' : '')) : '';
                    const indicator = (item.type === 'folder' && hasChildren) ? '<span style="margin-right: 3px;">[+]</span>' : '';
                    const clickablePartStart = item.type === 'folder' ? '<span class="folder-toggle" style="cursor: pointer;">' : '';
                    const clickablePartEnd = item.type === 'folder' ? '</span>' : '';

                    listHtml += `<li class="${liClass}">
`;
                    listHtml += `${clickablePartStart}${indicator}${iconHtml} ${item.name}${clickablePartEnd}${sizeSpan}
`;
                    if (hasChildren) {
                        listHtml += buildFileListHtml(item.children, level + 1);
                    }
                    listHtml += `</li>
`;
                });
                listHtml += `</ul>`;
                return listHtml;
            }

            if (info.files && Array.isArray(info.files) && info.files.length > 0) {
                fileListHtml = buildFileListHtml(info.files);
                detailHtml += `<h3>Files (${info.files.length})</h3><div class="file-list-container">${fileListHtml}</div>`;
            }
            // End File List Section

            // Comments Section
            if (info.comments && Array.isArray(info.comments) && info.comments.length > 0) {
                detailHtml += `<h3>Comments (${info.comments.length})</h3>`;
                info.comments.forEach(comment => {
                    const commentDate = comment.timestamp ? new Date(comment.timestamp * 1000).toLocaleString() : comment.timestamp_text;
                    detailHtml += `
                        <div class="comment-item" style="border: 1px solid var(--border-color); border-radius: 4px; padding: 10px; margin-bottom: 10px; background-color: var(--bg-primary);">
                            <p style="margin-bottom: 5px;">
                                <strong>${comment.user || 'Anonymous'}</strong>
                                <small style="color: var(--text-secondary);">(${commentDate})</small>
                            </p>
                            <div class="comment-content-display">${comment.content_html || ''}</div>
                        </div>
                    `;
                });
            } else {
                 detailHtml += `<h3>Comments</h3><p>No comments found.</p>`;
            }

            modalBody.innerHTML = detailHtml;

            // Add event listeners AFTER setting innerHTML
            // Folder toggles
            modalBody.querySelectorAll('.file-list-container .folder-toggle').forEach(toggle => {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const parentLi = toggle.closest('li.folder');
                    if (parentLi) {
                         parentLi.classList.toggle('expanded');
                         // Find the direct child ul using querySelector with :scope
                         const nestedUl = parentLi.querySelector(':scope > ul');
                         if (nestedUl) {
                             // Toggle display style directly
                             nestedUl.style.display = parentLi.classList.contains('expanded') ? 'block' : 'none';
                             // Toggle indicator text
                             const indicatorSpan = toggle.querySelector('span');
                             if (indicatorSpan) {
                                indicatorSpan.textContent = parentLi.classList.contains('expanded') ? '[-]' : '[+]';
                             }
                         }
                    }
                });
            });
            // Download link in modal
            modalBody.querySelectorAll('.download-torrent-link').forEach(link => {
                link.addEventListener('click', handleDownloadClick);
            });

        } else {
             modalBody.innerHTML = `<p class="error">Failed to load details.</p>`;
        }
    } catch (error) {
        modalBody.innerHTML = `<p class="error">Application error loading details: ${error.message}</p>`;
        console.error("Error fetching details:", error);
    }
}

async function performSearch(term, page, options) {
    currentPage = page;
    currentSearchTerm = term;
    currentSearchOptions = options;
    lastResultCount = -1;

    // Add term to history if it's a new search (page 1) and term is not empty
    if (page === 1 && term.trim() !== '') {
        addSearchToHistory(term.trim());
    }

    // Save the options used for this search (excluding term, we save term separately if needed)
    saveOptions({
        filter: options.filter,
        category: options.category,
        sort: options.sort,
        direction: options.direction
    });

    // Update UI elements to reflect current search state
    searchTermInput.value = currentSearchTerm; // Update search box value
    sortSelect.value = options.sort === 'id' ? 'date' : options.sort;
    directionSelect.value = options.direction;
    filterSelect.value = options.filter;
    categorySelect.value = options.category;
    updateSortIndicators(options.sort, options.direction);

    resultsTableBody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>'; // Reduced colspan
    errorMessageDiv.textContent = '';
    errorMessageDiv.style.display = 'none'; // Hide error div
    loadingIndicator.style.display = 'inline';
    paginationControls.style.display = 'none';

    try {
        const response = await window.electronAPI.searchNyaa(term, page, options);

        if (response && response.error) {
            errorMessageDiv.textContent = `Search Failed: ${response.error}`;
            errorMessageDiv.style.display = 'block'; // Show error div
            console.error('API/Network error:', response.error);
            resultsTableBody.innerHTML = '<tr><td colspan="9">Error loading results. Check connection or search parameters.</td></tr>'; // Reduced colspan
            renderPaginationControls(currentPage, true);
        } else if (response && Array.isArray(response.results)) {
            const results = response.results;
            lastResultCount = results.length;

            // Render table rows (including formatted date)
            resultsTableBody.innerHTML = '';
            if (results.length === 0) {
                resultsTableBody.innerHTML = `<tr><td colspan="9">No results found on page ${currentPage}.</td></tr>`; // Reduced colspan
            } else {
                results.forEach(result => {
                    const row = resultsTableBody.insertRow();
                    row.dataset.torrentId = result.id;
                    // Don't make row clickable if checkbox is clicked
                    // row.style.cursor = 'pointer';
                    // row.title = "Click to view details";

                    // Category
                    row.insertCell().textContent = categoryMap[result.sub_category] || result.sub_category || 'N/A';

                    // Name
                    const nameCell = row.insertCell(); // Make name cell clickable for details
                    nameCell.classList.add('torrent-name-cell'); // Add class for hover effect
                    nameCell.textContent = result.name || 'N/A';
                    nameCell.style.cursor = 'pointer';
                    nameCell.title = 'Click to view details';
                    nameCell.addEventListener('click', () => showTorrentDetails(result.id));
                    // Check if downloaded and apply glow
                    if (downloadedItems.has(result.id)) {
                        nameCell.classList.add('downloaded-glow');
                    }

                    // Size (Parse and apply class)
                    const sizeCell = row.insertCell();
                    sizeCell.textContent = result.filesize || 'N/A';
                    const sizeMB = parseSizeToMB(result.filesize);
                    const sizeClass = getSizeClass(sizeMB);
                    if (sizeClass) {
                        sizeCell.classList.add(sizeClass);
                    }

                    let formattedDate = 'N/A';
                    if (result.date) {
                        try {
                            const dateObj = new Date(result.date);
                            const year = dateObj.getFullYear();
                            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                            const day = String(dateObj.getDate()).padStart(2, '0');
                            const hours = String(dateObj.getHours()).padStart(2, '0');
                            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                            formattedDate = `${year}-${month}-${day} ${hours}:${minutes}`;
                        } catch (e) {
                            console.error("Error formatting date:", result.date, e);
                            formattedDate = result.date;
                        }
                    }
                    row.insertCell().textContent = formattedDate;

                    const seedersCell = row.insertCell();
                    seedersCell.textContent = result.seeders || 'N/A';
                    seedersCell.classList.add('seeders-cell');

                    const leechersCell = row.insertCell();
                    leechersCell.textContent = result.leechers || 'N/A';
                    leechersCell.classList.add('leechers-cell');

                    row.insertCell().textContent = result.completed || 'N/A';
                    row.insertCell().textContent = result.comments || '0';

                    const linkCell = row.insertCell();
                    // Clear cell content first
                    linkCell.innerHTML = '';

                    // Define SVG icons (could be moved outside loop)
                    const downloadSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 512 512" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>`;
                    const magnetSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 576 512" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M320 64c0-53-43-96-96-96H192c-53 0-96 43-96 96v80c0 8.8 7.2 16 16 16s16-7.2 16-16V64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32v80c0 8.8 7.2 16 16 16s16-7.2 16-16V64zM144 256c-53 0-96 43-96 96v16c0 53 43 96 96 96h32c53 0 96-43 96-96v-16c0-53-43-96-96-96H144zm64 112a48 48 0 1 1 -96 0 48 48 0 1 1 96 0zM432 256c-53 0-96 43-96 96v16c0 53 43 96 96 96h32c53 0 96-43 96-96v-16c0-53-43-96-96-96H432zm64 112a48 48 0 1 1 -96 0 48 48 0 1 1 96 0z"/></svg>`;
                    const downloadLinkHtml = downloadSVG + 'Download'; // Store for data attribute

                    let addedLink = false;
                    // Add Download Link (Modified for IPC)
                    if (result.torrent) {
                        const downloadLink = document.createElement('a');
                        downloadLink.href = '#'; // No direct navigation
                        downloadLink.dataset.downloadUrl = result.torrent; // Store URL in data attribute
                        downloadLink.dataset.torrentName = result.name || 'torrent'; // Store name for filename
                        downloadLink.dataset.originalHtml = downloadLinkHtml; // Store original HTML
                        downloadLink.innerHTML = downloadLinkHtml;
                        downloadLink.title = 'Download .torrent file (Auto)';
                        downloadLink.style.marginRight = '10px'; // Add spacing
                        downloadLink.classList.add('download-torrent-link'); // Add class for potential delegation
                        downloadLink.addEventListener('click', handleDownloadClick); // Attach specific handler
                        linkCell.appendChild(downloadLink);
                        addedLink = true;
                    }

                    // Add Magnet Link
                    if (result.magnet) {
                        const magnetLink = document.createElement('a');
                        magnetLink.href = result.magnet;
                        magnetLink.innerHTML = magnetSVG + 'Magnet';
                        magnetLink.title = 'Magnet Link';
                        // No target needed for magnet usually
                        magnetLink.addEventListener('click', (e) => e.stopPropagation()); // Still stop propagation
                        linkCell.appendChild(magnetLink);
                        addedLink = true;
                    }

                    // Fallback if no links
                    if (!addedLink) {
                        linkCell.textContent = 'N/A';
                    }
                });
            }

            renderPaginationControls(currentPage, lastResultCount === 0);

        } else {
             errorMessageDiv.textContent = 'Error: Invalid data received from search process.';
             errorMessageDiv.style.display = 'block'; // Show error div
             console.error('Invalid response structure:', response);
             resultsTableBody.innerHTML = '<tr><td colspan="9">Error processing results.</td></tr>'; // Reduced colspan
             renderPaginationControls(currentPage, true);
        }
    } catch (error) {
         errorMessageDiv.textContent = `Application Error: ${error.message}`;
         errorMessageDiv.style.display = 'block'; // Show error div
         console.error('IPC/Renderer Error:', error);
         resultsTableBody.innerHTML = '<tr><td colspan="9">Application error occurred.</td></tr>'; // Reduced colspan
         renderPaginationControls(currentPage, true);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// Listener for main search form submission (still useful for pressing Enter)
searchForm.addEventListener('submit', (event) => {
    event.preventDefault(); // Prevent page reload
    // Clear any pending debounce search, as Enter triggers immediate search
    clearTimeout(debounceTimeout);

    const term = searchTermInput.value.trim();
    let sortOption = sortSelect.value;
    let directionOption = directionSelect.value;

    if (sortOption === 'date') {
        sortOption = 'id';
        directionOption = 'desc';
    }

    const options = {
        filter: filterSelect.value,
        category: categorySelect.value,
        sort: sortOption,
        direction: directionOption
    };

    performSearch(term, 1, options);
});

// Listener for real-time search input
searchTermInput.addEventListener('input', () => {
    clearTimeout(debounceTimeout); // Clear previous timeout

    debounceTimeout = setTimeout(() => {
        const term = searchTermInput.value.trim();
        console.log(`Debounced search triggered for term: "${term}"`);

        // Gather CURRENT options from dropdowns for real-time search
        let sortOption = sortSelect.value;
        let directionOption = directionSelect.value;
        if (sortOption === 'date') {
            sortOption = 'id';
            directionOption = 'desc';
        }
        const options = {
            filter: filterSelect.value,
            category: categorySelect.value,
            sort: sortOption,
            direction: directionOption
        };

        // Call performSearch which will save the options
        performSearch(term, 1, options);

    }, 500); // Wait 500ms after last input before searching
});

resultsTableHead.addEventListener('click', (event) => {
    const header = event.target.closest('th.sortable');
    if (!header) return;

    const newSortKey = header.dataset.sort;
    let newDirection = 'desc';

    if (currentSearchOptions.sort === newSortKey) {
        newDirection = currentSearchOptions.direction === 'desc' ? 'asc' : 'desc';
    } else if (newSortKey === 'id') {
        newDirection = 'desc';
    }

    const newOptions = {
        ...currentSearchOptions,
        sort: newSortKey,
        direction: newDirection
    };

    // Call performSearch which will save the options
    if (currentSearchTerm !== null) { // Check if a search has been performed before allowing sort click
        performSearch(currentSearchTerm, 1, newOptions);
    }
});

// Listener for clicks within the results table body (for opening details)
resultsTableBody.addEventListener('click', (event) => {
    const clickedCell = event.target.closest('td');
    const clickedRow = clickedCell?.closest('tr');

    // Check if the click was on a row, has a torrentId, wasn't on a link/button
    if (clickedRow && clickedRow.dataset.torrentId &&
        event.target.tagName !== 'A' && !event.target.closest('a') &&
        event.target.tagName !== 'INPUT') { // Removed checkbox check

         console.log(`Row area clicked, fetching details for ID: ${clickedRow.dataset.torrentId}`);
         showTorrentDetails(clickedRow.dataset.torrentId);
    }
});

// Listener for closing the modal
closeModalButton.addEventListener('click', closeModal);
detailModal.addEventListener('click', (event) => {
    // Close if clicked outside the modal content
    if (event.target === detailModal) {
        closeModal();
    }
});

// Listener for "Clear History" button
clearSearchHistoryButton.addEventListener('click', handleClearSearchHistory);

// Listener for "Clear Downloaded Markers" button
clearDownloadedMarkersButton.addEventListener('click', handleClearDownloadedMarkers);

// Settings Modal Listeners
if (openSettingsButton) {
    openSettingsButton.addEventListener('click', openSettingsModal);
}
if (settingsCloseButton) {
    settingsCloseButton.addEventListener('click', closeSettingsModal);
}
if (settingsSaveButton) {
    settingsSaveButton.addEventListener('click', saveSettings);
}
if (settingsCancelButton) {
    settingsCancelButton.addEventListener('click', closeSettingsModal);
}

// Close modal if clicked outside the content
window.addEventListener('click', (event) => {
    if (event.target == detailModal) {
        closeModal();
    }
    if (event.target == settingsModal) {
        closeSettingsModal();
    }
});

// Initial population of search history display

// -- Initial Load & IPC Listeners --
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");
    loadSettings(); // Load theme and other settings first
    loadDownloadedItems(); // Load previously downloaded items
    loadSearchHistory(); // Load search history
    // Load saved options (or defaults)
    const initialSearchState = loadOptions();
    // Set initial values of UI elements
    searchTermInput.value = initialSearchState.term || ''; // Load saved term if we saved it
    filterSelect.value = initialSearchState.filter;
    categorySelect.value = initialSearchState.category;
    // Handle 'id' vs 'date' for sort dropdown
    sortSelect.value = initialSearchState.sort === 'id' ? 'date' : initialSearchState.sort;
    directionSelect.value = initialSearchState.direction;

    // Initially hide error message and batch/download manager
    errorMessageDiv.textContent = '';
    errorMessageDiv.style.display = 'none'; // Hide completely initially
    downloadManagerDiv.style.display = 'none';

    console.log("Performing initial search with loaded/default state.", initialSearchState);

    // Perform search using the loaded state
    performSearch(initialSearchState.term || '', 1, {
         filter: initialSearchState.filter,
         category: initialSearchState.category,
         sort: initialSearchState.sort,
         direction: initialSearchState.direction
    });

    // Setup IPC listeners and handlers
    setupDownloadPathIPC();

    // Handle potential IPC download completion/error messages if implemented
    if (window.electronAPI && window.electronAPI.onDownloadUpdate) {
        window.electronAPI.onDownloadUpdate((event, update) => {
            console.log('Download update received:', update);
            // itemId here is the DOWNLOAD URL sent back from main.js
            const { success, filename, error, itemId, savePath } = update;

            if (success) {
                updateFeedbackSpan(itemId, '✅ Saved', savePath);
                // If we had the original Nyaa ID, we could mark it here too,
                // but it's already marked optimistically when download starts.
                // Find Nyaa ID based on URL if needed:
                // const button = document.querySelector(`button[data-download-url="${itemId}"]`);
                // if (button) {
                //    const nyaaId = button.closest('.result-item')?.dataset.torrentId;
                //    if (nyaaId) markItemAsDownloaded(nyaaId);
                // }
            } else {
                updateFeedbackSpan(itemId, `❌ ${error || 'Failed'}`);
            }
        });
    }
}); // End of DOMContentLoaded listener

// Optional: Clean up listeners when the window is about to close
window.addEventListener('pagehide', () => {
    if (window.electronAPI && window.electronAPI.removeDownloadListeners) {
        console.log('Removing download listeners on page hide...');
        window.electronAPI.removeDownloadListeners();
    }
});

// --- UI Update Helper ---
function updateFeedbackSpan(downloadUrl, message, savePath = null) {
    // Find the button using the unique download URL
    const downloadButton = document.querySelector(`button.download-button[data-download-url="${downloadUrl}"]`);
    if (downloadButton) {
        const feedbackSpan = downloadButton.nextElementSibling; // Assume feedback span is the next sibling
        if (feedbackSpan && feedbackSpan.classList.contains('download-feedback')) {
            feedbackSpan.textContent = message;
            feedbackSpan.classList.remove('success', 'error'); // Clear previous states
            if (message.includes('✅') || message.includes('⏳') || message.includes('Downloading')) {
                feedbackSpan.classList.add('success');
            } else if (message.includes('❌') || message.includes('Fail')) {
                feedbackSpan.classList.add('error');
            }

            // Add the folder icon if savePath is provided
            // Remove existing folder button first
            const existingFolderButton = downloadButton.parentElement.querySelector('.open-folder-button');
            if (existingFolderButton) {
                existingFolderButton.remove();
            }

            if (savePath && message.includes('✅ Saved')) {
                const openFolderButton = document.createElement('button');
                openFolderButton.textContent = '📁';
                openFolderButton.title = `Open Folder: ${savePath}`;
                openFolderButton.classList.add('control-button', 'open-folder-button');
                openFolderButton.style.marginLeft = '5px'; // Add some space
                openFolderButton.onclick = (e) => {
                    e.stopPropagation();
                    if (window.electronAPI && window.electronAPI.openContainingFolder) {
                        window.electronAPI.openContainingFolder(savePath);
                    }
                };
                // Insert after the feedback span
                feedbackSpan.parentNode.insertBefore(openFolderButton, feedbackSpan.nextSibling);
            }
        } else {
            console.warn('Could not find feedback span next to button for URL:', downloadUrl);
        }
    } else {
        console.warn('Could not find download button for URL:', downloadUrl);
    }
}