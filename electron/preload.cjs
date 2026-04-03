const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("gnpdv", {
  platform: process.platform,
});
