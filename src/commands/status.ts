import chalk from "chalk";
import os from "os";
import { execSync } from "child_process";
import prettyBytes from "pretty-bytes";
import { getConfig } from "../utils/config.js";

function getDiskUsage() {
  try {
    if (process.platform === "win32") {
      const out = execSync("wmic logicaldisk get size,freespace,caption").toString();
      const lines = out.trim().split("\n").slice(1);
      let used = 0, free = 0, total = 0;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const f = parseInt(parts[1]);
          const t = parseInt(parts[2]);
          if (!isNaN(f) && !isNaN(t)) { free += f; total += t; used += t - f; }
        }
      }
      return { used, free, total };
    } else {
      const out = execSync("df -k /").toString();
      const parts = out.trim().split("\n")[1].trim().split(/\s+/);
      return {
        total: parseInt(parts[1]) * 1024,
        used: parseInt(parts[2]) * 1024,
        free: parseInt(parts[3]) * 1024,
      };
    }
  } catch { return null; }
}

function bar(used: number, total: number, width = 28): string {
  const pct = Math.round((used / total) * width);
  const filled = "█".repeat(Math.max(0, pct));
  const empty = "░".repeat(Math.max(0, width - pct));
  const ratio = pct / width;
  const color = ratio > 0.8 ? chalk.red : ratio > 0.6 ? chalk.yellow : chalk.green;
  return color(filled) + chalk.gray(empty);
}

export async function statusCommand() {
  const config = getConfig();
  const provider = config.get("provider") ?? "not configured";

  console.log(chalk.cyan("\n📊 PathClaw — System Status\n"));

  // RAM
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const usedRam = totalRam - freeRam;
  const ramPct = Math.round((usedRam / totalRam) * 100);
  console.log(chalk.bold("  RAM"));
  console.log(`  ${bar(usedRam, totalRam)}  ${ramPct}%`);
  console.log(`  ${prettyBytes(usedRam)} used / ${prettyBytes(totalRam)} total\n`);

  // Disk
  const disk = getDiskUsage();
  if (disk && disk.total > 0) {
    const diskPct = Math.round((disk.used / disk.total) * 100);
    console.log(chalk.bold("  Disk"));
    console.log(`  ${bar(disk.used, disk.total)}  ${diskPct}%`);
    console.log(`  ${prettyBytes(disk.used)} used / ${prettyBytes(disk.total)} total  (${prettyBytes(disk.free)} free)\n`);
  }

  // CPU
  const cpus = os.cpus();
  console.log(chalk.bold("  CPU"));
  console.log(`  ${cpus.length} cores — ${cpus[0]?.model.trim()}\n`);

  // Provider
  console.log(chalk.bold("  AI Provider"));
  console.log(`  ${chalk.cyan(String(provider))}\n`);

  // Suggestions
  const suggestions: string[] = [];
  if ((usedRam / totalRam) > 0.85) suggestions.push("RAM usage high → run: pathclaw optimize --ram");
  if (disk && disk.total > 0 && (disk.used / disk.total) > 0.8) suggestions.push("Disk >80% full → run: pathclaw scan");
  if (provider === "not configured") suggestions.push("AI not configured → run: pathclaw setup");

  if (suggestions.length > 0) {
    console.log(chalk.yellow("  ⚠ Suggestions:"));
    for (const s of suggestions) console.log(`  → ${s}`);
    console.log();
  }
}