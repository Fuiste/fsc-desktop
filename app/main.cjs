const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');

let win, engine, busy = false, importing = false, cancel = false, outputDir = '';
const photos = new Map();
const entry = path.join(__dirname, 'ui', 'index.html');
const entryUrl = pathToFileURL(entry).href;
const publicPhoto = item => { const { path: ignored, ...rest } = item; return rest; };
const state = () => ({ photos: [...photos.values()].map(publicPhoto), outputDir, busy });
const emit = (channel, data) => { if (win && !win.isDestroyed()) win.webContents.send(channel, data); };
async function addPaths(paths) {
  if (busy || importing) throw new Error('please wait for the current operation');
  importing = true;
  const errors = [];
  try {
    for (const file of await engine.discover(paths)) {
      if ([...photos.values()].some(item => item.path.toLowerCase() === file.toLowerCase())) continue;
      try {
        const item = { id: randomUUID(), path: file, ...await engine.inspect(file) };
        photos.set(item.id, item);
        if (!outputDir) outputDir = path.join(path.dirname(file), 'matted');
      } catch (error) { errors.push(`${path.basename(file)}: ${error.message}`); }
    }
    return { ...state(), errors };
  } finally { importing = false; }
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame?.url !== entryUrl) throw new Error('untrusted request');
    try { return { ok: true, value: await fn(...args) }; }
    catch (error) { return { ok: false, error: error.message || 'operation failed' }; }
  });
}
app.setAppUserModelId('com.fuiste.fsc');
app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  engine = await import('./engine.mjs');
  win = new BrowserWindow({
    width: 1320, height: 940, minWidth: 980, minHeight: 730,
    title: 'fsc', backgroundColor: '#202326', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.on('close', event => {
    if (busy) {
      event.preventDefault();
      cancel = true;
      emit('notice', 'stopping after the current photo; close the window once export finishes');
    }
  });
  handle('state', state);
  handle('choose', async kind => {
    if (busy || importing) throw new Error('please wait for the current operation');
    const choice = await dialog.showOpenDialog(win, kind === 'folder'
      ? { properties: ['openDirectory'] }
      : { properties: ['openFile', 'multiSelections'], filters: [{ name: 'jpeg photos', extensions: ['jpg', 'jpeg'] }] });
    return choice.canceled ? { ...state(), errors: [] } : addPaths(choice.filePaths);
  });
  handle('drop', paths => {
    if (!Array.isArray(paths) || paths.some(value => typeof value !== 'string') || paths.length > 10000) throw new Error('invalid selection');
    return addPaths(paths);
  });
  handle('remove', id => { if (busy || importing) throw new Error('please wait'); photos.delete(id); return state(); });
  handle('clear', () => { if (busy || importing) throw new Error('please wait'); photos.clear(); return state(); });
  handle('output', async () => {
    if (busy) throw new Error('please wait for export to finish');
    const choice = await dialog.showOpenDialog(win, { defaultPath: outputDir || app.getPath('pictures'), properties: ['openDirectory', 'createDirectory'] });
    if (!choice.canceled) outputDir = choice.filePaths[0];
    return outputDir;
  });
  handle('preview', async (id, mode, original) => {
    if (busy) throw new Error('preview is paused during export');
    const photo = photos.get(id);
    if (!photo) throw new Error('select a photo first');
    return engine.preview(photo.path, mode, Boolean(original));
  });
  handle('export', async mode => {
    if (busy || importing) throw new Error('please wait for the current operation');
    if (!photos.size || !outputDir) throw new Error('add photos and choose an output folder first');
    busy = true; cancel = false;
    try { return await engine.exportBatch([...photos.values()], outputDir, mode, data => emit('progress', data), () => cancel); }
    finally { busy = false; }
  });
  handle('cancel', () => { cancel = true; });
  handle('open-output', async () => {
    if (!outputDir) throw new Error('choose an output folder first');
    const error = await shell.openPath(outputDir);
    if (error) throw new Error('output folder is not available yet — export photos first');
  });
  // Optional JPEG or folder arguments also work from a Windows shortcut or terminal.
  const inputs = process.argv.slice(app.isPackaged ? 1 : 2).filter(value => !value.startsWith('-'));
  let startupErrors = [];
  if (inputs.length) { try { startupErrors = (await addPaths(inputs)).errors; } catch (error) { startupErrors = [error.message]; } }
  await win.loadFile(entry);
  if (startupErrors.length) emit('notice', startupErrors.join('\n'));
});
app.on('window-all-closed', () => app.quit());
