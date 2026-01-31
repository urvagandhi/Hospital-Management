/**
 * Persistent Logger
 * Logs to both console and localStorage to survive page reloads
 */

const LOG_STORAGE_KEY = "APP_DEBUG_LOGS";
const MAX_LOGS = 100;

interface LogEntry {
  timestamp: string;
  level: "log" | "error" | "warn" | "info";
  tag: string;
  message: string;
  data?: any;
}

function getLogs(): LogEntry[] {
  try {
    const stored = localStorage.getItem(LOG_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addLog(entry: LogEntry) {
  try {
    const logs = getLogs();
    logs.push(entry);
    if (logs.length > MAX_LOGS) {
      logs.shift();
    }
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
  } catch (err) {
    console.error("Failed to store log:", err);
  }
}

export const persistentLogger = {
  log: (tag: string, message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "log",
      tag,
      message,
      data,
    };
    addLog(entry);
    console.log(`[${tag}] ${message}`, data);
  },

  error: (tag: string, message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      tag,
      message,
      data,
    };
    addLog(entry);
    console.error(`[${tag}] ${message}`, data);
  },

  warn: (tag: string, message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "warn",
      tag,
      message,
      data,
    };
    addLog(entry);
    console.warn(`[${tag}] ${message}`, data);
  },

  getLogs,

  clearLogs: () => {
    localStorage.removeItem(LOG_STORAGE_KEY);
    console.log("[PersistentLogger] Logs cleared");
  },

  printLogs: () => {
    const logs = getLogs();
    console.log("========== PERSISTENT LOGS ==========");
    logs.forEach((log) => {
      console.log(`[${log.timestamp}] [${log.tag}] [${log.level}] ${log.message}`, log.data || "");
    });
    console.log("====================================");
  },
};

export default persistentLogger;
