const { contextBridge, ipcRenderer, webUtils } = require('electron');
async function call(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
contextBridge.exposeInMainWorld('fsc', {
  state: () => call('state'), choose: kind => call('choose', kind),
  drop: files => call('drop', files.map(file => webUtils.getPathForFile(file))),
  remove: id => call('remove', id), clear: () => call('clear'),
  output: () => call('output'), preview: (id, mode, original) => call('preview', id, mode, original),
  export: mode => call('export', mode), cancel: () => call('cancel'), openOutput: () => call('open-output'),
  onProgress: callback => ipcRenderer.on('progress', (_event, value) => callback(value)),
  onNotice: callback => ipcRenderer.on('notice', (_event, value) => callback(value))
});
