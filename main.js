const { app, BrowserWindow, ipcMain, session, dialog, shell } = require('electron/main') // Added session
const path = require('node:path')
const nyaapi = require('nyaapi') // Use the installed local nyaapi package
const crypto = require('crypto'); // For generating unique IDs

let mainWindow; // Make mainWindow accessible outside createWindow
const activeDownloads = new Map(); // To keep track of active download items

function createWindow () {
  mainWindow = new BrowserWindow({ // Assign to the outer variable
    width: 1920, // Initial size (optional, will be overridden by maximize)
    height: 1080,
    show: false, // Don't show the window immediately
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false // Recommended for security
    }
  })

  // --- Download Event Handling ---
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    // Generate a unique ID for this download
    const downloadId = crypto.randomUUID();
    activeDownloads.set(downloadId, item); // Store the item

    // Send initial download info to renderer
    mainWindow.webContents.send('download-started', {
      id: downloadId,
      filename: item.getFilename(),
      totalBytes: item.getTotalBytes(),
      url: item.getURL(),
      startTime: Date.now()
    });

    // Don't set save path - let it save to default Downloads automatically
    // item.setSavePath('/path/to/save/' + item.getFilename());

    item.on('updated', (event, state) => {
      if (!mainWindow || mainWindow.isDestroyed()) return; // Check if window still exists

      if (state === 'interrupted') {
        console.log(`Download ${downloadId} interrupted`);
        mainWindow.webContents.send('download-progress', {
          id: downloadId,
          state: 'interrupted',
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes()
        });
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          console.log(`Download ${downloadId} paused`);
          mainWindow.webContents.send('download-progress', {
            id: downloadId,
            state: 'paused',
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes()
          });
        } else {
          // console.log(`Download ${downloadId} progress: ${item.getReceivedBytes()} / ${item.getTotalBytes()}`);
          mainWindow.webContents.send('download-progress', {
            id: downloadId,
            state: 'progressing',
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes()
          });
        }
      }
    });

    item.once('done', (event, state) => {
      if (!mainWindow || mainWindow.isDestroyed()) return; // Check if window still exists

      console.log(`Download ${downloadId} finished with state: ${state}`);
      activeDownloads.delete(downloadId); // Remove from active downloads

      mainWindow.webContents.send('download-complete', {
        id: downloadId,
        state: state, // 'completed', 'cancelled', 'interrupted'
        filename: item.getFilename(),
        path: state === 'completed' ? item.getSavePath() : null
      });
    });
  });
  // --- End Download Event Handling ---


  mainWindow.loadFile('index.html');

  // Maximize the window before showing
  mainWindow.maximize();
  mainWindow.show();

  // Open the DevTools (optional)
  // mainWindow.webContents.openDevTools()
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // --- Global Download Listener Setup ---
  session.defaultSession.on('will-download', (event, item, webContents) => {
    // Find the window that initiated the download
    const win = BrowserWindow.fromWebContents(webContents);
    if (!win) {
      console.error('Could not find window associated with the download. Cancelling.');
      item.cancel();
      return;
    }

    console.log(`Intercepted download for: ${item.getFilename()} from ${item.getURL()}`);

    // We need the original download info (especially the intended savePath) requested by the renderer.
    // Since we can't easily get it here directly, we'll rely on the renderer to have sent it
    // and potentially store it temporarily if needed, or just proceed with default behavior / save dialog.
    // For now, we will NOT automatically set the save path here, letting Electron prompt the user
    // or use its default download location. The custom path logic needs rethinking.

    // *** TEMPORARY: Disable automatic saving to custom path ***
    // item.setSavePath(savePath); // We don't have 'savePath' readily available here

    const itemId = item.getURL(); // Use URL as identifier

    // Optional: Prompt user for save location if no custom path was intended/possible
    // const userChosenPath = dialog.showSaveDialogSync(win, { defaultPath: item.getFilename() });
    // if (userChosenPath) {
    //     item.setSavePath(userChosenPath);
    // } else {
    //     console.log('User cancelled save dialog. Cancelling download.');
    //     item.cancel();
    //     return;
    // }

    console.log(`Saving download to default location or prompting user: ${item.getSavePath()}`);

    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download is paused');
        } else {
          // console.log(`Received bytes: ${item.getReceivedBytes()}`); // Can be noisy
        }
      } else {
        // console.log(`Download updated, state: ${state}`);
      }
    });

    item.once('done', (event, state) => {
      if (state === 'completed') {
        const finalPath = item.getSavePath();
        console.log(`Download completed successfully: ${finalPath}`);
        win.webContents.send('download-update', { success: true, filename: item.getFilename(), itemId: itemId, savePath: finalPath });
      } else {
        console.error(`Download failed: ${state}`);
        win.webContents.send('download-update', { success: false, error: state, filename: item.getFilename(), itemId: itemId });
      }
    });
  });
});

app.on('window-all-closed', function () {
  // Cancel any ongoing downloads before quitting
  activeDownloads.forEach(item => {
    if (item && typeof item.cancel === 'function') {
      item.cancel();
    }
  });
  activeDownloads.clear();

  if (process.platform !== 'darwin') app.quit()
})

// Example IPC handler to use nyaapi from renderer
// Now accepts page number as argument
ipcMain.handle('search-nyaa', async (event, term, page, options) => {
  console.log(`Main process received search for term: ${term}, page: ${page}`); // Updated log
  console.log('Main process received options:', options);
  try {
    // Ensure options is an object if not provided
    const searchOptions = options || {};
    searchOptions.term = term;

    console.log(`Calling nyaapi.si.searchPage with: term=${term}, page=${page}, options=`, searchOptions);

    // Use searchPage instead of search
    // Pass 'true' for includeMaxPage only when fetching the first page (page === 1)
    const { results, maxPage } = await nyaapi.si.searchPage(term, page, searchOptions, page === 1);

    console.log(`Found ${results.length} results on page ${page}. Max page (if requested): ${maxPage}`);
    // Return both results and maxPage (maxPage will be undefined if page !== 1)
    return { results, maxPage };
  } catch (error) {
    console.error(`Error searching nyaa.si page ${page}:`, error);
    // If 404, just return empty results
    if (error.response && error.response.status === 404) {
      return { results: [] }; // Return empty array, no maxPage
    }
    return { error: error.message || 'Unknown error occurred' };
  }
});

// Handler for initiating a download (now just triggers the download)
ipcMain.handle('download-torrent', async (event, url, filename) => {
  console.log(`Main process received download request for URL: ${url}, Filename: ${filename}`);
  if (!mainWindow) {
    console.error('Main window not available for download.');
    return { success: false, error: 'Main window not found.' };
  }
  try {
    // Trigger the download; events will be handled by 'will-download' listener
    mainWindow.webContents.downloadURL(url);
    console.log('Download triggered via downloadURL.');
    return { success: true }; // Indicate that the trigger was successful
  } catch (error) {
    console.error('Error triggering downloadURL:', error);
    return { success: false, error: error.message || 'Unknown download trigger error' };
  }
});

// Handler to cancel a specific download
ipcMain.handle('cancel-download', (event, downloadId) => {
  const item = activeDownloads.get(downloadId);
  if (item) {
    console.log(`Received request to cancel download ${downloadId}`);
    item.cancel();
    activeDownloads.delete(downloadId); // Remove immediately on cancel request
    return { success: true };
  } else {
    console.warn(`Could not find download item with ID ${downloadId} to cancel.`);
    return { success: false, error: 'Download item not found' };
  }
});

// Handler to get torrent details by ID
ipcMain.handle('get-torrent-details', async (event, torrentId) => {
  console.log(`Main process received request for details for ID: ${torrentId}`);
  try {
    // Call the infoRequest function from the nyaapi library
    const details = await nyaapi.si.infoRequest(torrentId);
    console.log(`Successfully fetched details for ID: ${torrentId}`);
    return details; // Should return { id, info: { ... } }
  } catch (error) {
    console.error(`Error getting details for ID ${torrentId}:`, error);
    return { error: error.message || 'Unknown error occurred' };
  }
});

// Handle 'select-directory' request
ipcMain.handle('select-directory', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    console.log('Directory selection cancelled.');
    return null; // Indicate cancellation or no selection
  } else {
    console.log('Directory selected:', result.filePaths[0]);
    return result.filePaths[0]; // Return the selected path
  }
});

// Handle request to open the folder containing a downloaded file
ipcMain.on('open-containing-folder', (event, filePath) => {
  if (filePath) {
    console.log('Request received to open folder for:', filePath);
    shell.showItemInFolder(filePath);
  } else {
    console.error('Received request to open folder but no filePath was provided.');
  }
});

// Handler for initiating a download (now just triggers the download)
ipcMain.handle('download-file', async (event, downloadInfo) => {
  // Now this handler only *initiates* the download trigger.
  // The actual download management (save path, progress, completion) is handled
  // by the global 'will-download' listener attached to session.defaultSession.
  const { url, filename, savePath } = downloadInfo; // savePath is now informational for potential future use
  const win = BrowserWindow.getFocusedWindow(); // Get the window that initiated the download
  if (!win) {
    console.error('No focused window found for download.');
    return { success: false, error: 'No active window' };
  }

  console.log(`Triggering download for URL: ${url}, suggested filename: ${filename}, custom path requested: ${savePath || 'No'}`);

  try {
    // Trigger the download; events will be handled by 'will-download' listener
    win.webContents.downloadURL(url);
    console.log('Download triggered via downloadURL.');
    return { success: true }; // Indicate that the trigger was successful
  } catch (error) {
    console.error('Error triggering downloadURL:', error);
    return { success: false, error: error.message || 'Unknown download trigger error' };
  }
});
