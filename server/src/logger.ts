import log4js from "log4js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logDir = resolve(__dirname, "..", "logs");

// Ensure logs directory exists
try {
  mkdirSync(logDir, { recursive: true });
} catch {
  // directory already exists
}

log4js.configure({
  appenders: {
    console: {
      type: "stdout",
      layout: {
        type: "pattern",
        pattern: "%[[%d{hh:mm:ss.SSS}] [%p] %c -%] %m",
      },
    },
    file: {
      type: "file",
      filename: resolve(logDir, "server.log"),
      maxLogSize: 10 * 1024 * 1024, // 10MB
      backups: 3,
      compress: true,
      layout: {
        type: "pattern",
        pattern: "[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] %c - %m",
      },
    },
  },
  categories: {
    default: {
      appenders: ["console", "file"],
      level: process.env.LOG_LEVEL || "debug",
    },
  },
});

export const logger = log4js.getLogger("MonadEscrow");
export const httpLogger = log4js.getLogger("HTTP");
export const relayerLogger = log4js.getLogger("Relayer");
export const contractLogger = log4js.getLogger("Contract");
export const wsLogger = log4js.getLogger("WebSocket");
