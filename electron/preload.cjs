const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("timetableDesktop", {
  saveTextFile: (payload) => ipcRenderer.invoke("save-text-file", payload),
  openJsonFile: () => ipcRenderer.invoke("open-json-file"),
  exportExcelFiles: (payload) => ipcRenderer.invoke("export-excel-files", payload),
  selectFetCl: () => ipcRenderer.invoke("select-fet-cl"),
  locateFetCl: () => ipcRenderer.invoke("locate-fet-cl"),
  runFetCl: (payload) => ipcRenderer.invoke("run-fet-cl", payload)
});
