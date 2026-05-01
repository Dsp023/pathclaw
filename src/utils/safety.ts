import path from "path";
import os from "os";

export const BLACKLISTED_PATHS: string[] = [
  "C:\\Windows",
  "C:\\Windows\\System32",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
  "/bin", "/sbin", "/usr/bin", "/etc",
  "/sys", "/proc", "/dev", "/boot",
  "/System", "/private",
  path.join(os.homedir(), ".ssh"),
  path.join(os.homedir(), ".aws"),
  path.join(os.homedir(), ".kube"),
];

export const BLACKLISTED_PATTERNS: RegExp[] = [
  /node_modules/,
  /\.git$/,
  /^\.env/,
  /\.pem$/, /\.key$/, /\.p12$/,
  /id_rsa/, /id_ed25519/,
];

export const SHELL_ALLOWED_CATEGORIES = [
  "ram_clear",
  "process_kill",
  "cache_flush",
  "startup_disable",
  "temp_flush_system",
] as const;

export type ShellCategory = typeof SHELL_ALLOWED_CATEGORIES[number];

export const SHELL_COMMANDS: Record<ShellCategory, { win?: string; unix?: string; description: string }> = {
  ram_clear: {
    win: `powershell -Command "& {[System.GC]::Collect()}"`,
    unix: "sync && echo 3 | sudo tee /proc/sys/vm/drop_caches",
    description: "Flush RAM standby/cache list",
  },
  process_kill: {
    win: "taskkill /F /PID {pid}",
    unix: "kill -9 {pid}",
    description: "Kill a specific process by PID",
  },
  cache_flush: {
    win: "ipconfig /flushdns",
    unix: "sudo dscacheutil -flushcache",
    description: "Flush DNS and system caches",
  },
  startup_disable: {
    win: `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "{name}" /f`,
    unix: "systemctl --user disable {name}",
    description: "Disable a startup program",
  },
  temp_flush_system: {
    win: "del /s /f /q %TEMP%\\*",
    unix: "rm -rf /tmp/* /var/tmp/*",
    description: "Flush system temp directories",
  },
};