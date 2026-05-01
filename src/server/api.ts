import express from "express";
import cors from "cors";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { scanDirectory } from "../tools/scanner.js";
import { callAI } from "../ai/provider.js";
import { SHELL_COMMANDS } from "../utils/safety.js";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // System Status
  app.get("/api/status", (req, res) => {
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    res.json({
      platform: process.platform,
      hostname: os.hostname(),
      ram: {
        total: totalRam,
        free: freeRam,
        used: totalRam - freeRam,
        usedPct: Math.round(((totalRam - freeRam) / totalRam) * 100),
      },
      cpu: os.cpus()[0]?.model || "Unknown CPU",
    });
  });

  // Scan Directory
  app.post("/api/scan", async (req, res) => {
    const { targetPath = process.env["USERPROFILE"] || process.env["HOME"] || process.cwd(), deep = false } = req.body;
    try {
      const result = await scanDirectory(targetPath, deep);
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // Delete Files (for duplicates UI)
  app.post("/api/delete", async (req, res) => {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths)) return res.status(400).json({ success: false, error: "Invalid paths" });
    
    try {
      let freed = 0;
      for (const p of paths) {
        try {
          const stat = await fs.stat(p);
          await fs.rm(p, { force: true, recursive: true });
          freed += stat.size;
        } catch { /* skip missing */ }
      }
      res.json({ success: true, freed });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // Optimize (RAM, Cache, Temp)
  app.post("/api/optimize", async (req, res) => {
    const { action } = req.body;
    try {
      const isWin = process.platform === "win32";
      let cmd = "";
      
      if (action === "ram" && isWin) {
        const tmpPath = path.join(os.tmpdir(), "pathclaw_ram_clear.ps1");
        const ps1 = `
$source = @"
using System;
using System.Runtime.InteropServices;
public class RAMClear {
    [DllImport("advapi32.dll", SetLastError = true)]
    internal static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);
    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern IntPtr GetCurrentProcess();
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    internal static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out LUID lpLuid);
    [DllImport("advapi32.dll", SetLastError = true)]
    internal static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges, ref TOKEN_PRIVILEGES NewState, uint BufferLength, IntPtr PreviousState, IntPtr ReturnLength);
    [DllImport("ntdll.dll")]
    internal static extern uint NtSetSystemInformation(int InfoClass, IntPtr Info, int Length);
    [StructLayout(LayoutKind.Sequential)]
    internal struct LUID { public uint LowPart; public int HighPart; }
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    internal struct TOKEN_PRIVILEGES { public int PrivilegeCount; public LUID Luid; public uint Attributes; }
    public static void Clear() {
        IntPtr token;
        OpenProcessToken(GetCurrentProcess(), 0x0020 | 0x0008, out token);
        TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
        tp.PrivilegeCount = 1; tp.Attributes = 0x00000002;
        LookupPrivilegeValue(null, "SeProfileSingleProcessPrivilege", out tp.Luid);
        AdjustTokenPrivileges(token, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
        int[] cacheInfo = new int[] { 1 };
        GCHandle handle = GCHandle.Alloc(cacheInfo, GCHandleType.Pinned);
        NtSetSystemInformation(0x50, handle.AddrOfPinnedObject(), 4);
        handle.Free();
    }
}
"@
Add-Type -TypeDefinition $source
[RAMClear]::Clear()
`;
        await fs.writeFile(tmpPath, ps1);
        cmd = `powershell -Command "Start-Process powershell -WindowStyle Hidden -Wait -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File \\"${tmpPath}\\"'"`;
      } else {
        const category = action === "ram" ? "ram_clear" : action === "temp" ? "temp_flush_system" : "cache_flush";
        cmd = (isWin ? SHELL_COMMANDS[category]?.win : SHELL_COMMANDS[category]?.unix) || "";
      }

      if (!cmd) throw new Error(`Action not supported on ${process.platform}`);
      
      await execAsync(cmd);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // AI Chat
  app.post("/api/chat", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: "Prompt required" });
    try {
      const { text } = await callAI(prompt);
      res.json({ success: true, response: text });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // Serve Static UI
  const uiPath = path.join(__dirname, "../../ui/dist");
  app.use(express.static(uiPath));

  app.use((req, res) => {
    res.sendFile(path.join(uiPath, "index.html"));
  });

  return app;
}
