import express from "express";
import cors from "cors";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { scanDirectory } from "../tools/scanner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // API Endpoints
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

  app.post("/api/scan", async (req, res) => {
    const { targetPath = process.env["USERPROFILE"] || process.env["HOME"] || process.cwd(), deep = false } = req.body;
    try {
      const result = await scanDirectory(targetPath, deep);
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // Serve static UI if available
  // When compiled, api.js is in dist/server/api.js. We want to point to ui/dist.
  const uiPath = path.join(__dirname, "../../ui/dist");
  app.use(express.static(uiPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(uiPath, "index.html"));
  });

  return app;
}
