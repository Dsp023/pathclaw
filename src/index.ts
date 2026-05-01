#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import figlet from "figlet";
import { setupCommand } from "./commands/setup.js";
import { statusCommand } from "./commands/status.js";
import { scanCommand } from "./commands/scan.js";
import { organizeCommand } from "./commands/organize.js";
import { clearCommand, optimizeCommand } from "./commands/clear.js";
import { chatCommand } from "./commands/chat.js";
import { dupesCommand } from "./commands/dupes.js";
import { scheduleCommand } from "./commands/schedule.js";

console.log(chalk.cyan(figlet.textSync("PathClaw", { font: "Small" })));
console.log(chalk.gray("  AI-powered file system optimizer\n"));

program
  .name("pathclaw")
  .description("AI agent that scans, organizes, and optimizes your file system")
  .version("1.1.0");

program.command("setup")
  .description("Configure AI provider and preferences")
  .action(setupCommand);

program.command("status")
  .description("Show disk, RAM, and system health")
  .action(statusCommand);

program.command("scan [path]")
  .description("Scan for junk, temp files, duplicates, large files")
  .option("-d, --deep", "Deep scan including hidden files")
  .option("--no-ai", "Skip AI analysis")
  .action(scanCommand);

program.command("organize [path]")
  .description("AI semantic folder organization")
  .option("-d, --dry-run", "Preview without moving files")
  .option("-r, --rules <rules>", "Custom organization rules")
  .action(organizeCommand);

program.command("clear")
  .description("Clear junk, temp, and cache files")
  .option("-f, --force", "Skip confirmation")
  .option("--temp", "Temp files only")
  .option("--cache", "Cache only")
  .action(clearCommand);

program.command("chat")
  .description("Natural language mode — just tell PathClaw what to do")
  .action(chatCommand);

program.command("dupes [path]")
  .description("Interactive duplicate file reviewer")
  .option("-d, --deep", "Deep scan including hidden files")
  .option("--dry-run", "Preview without deleting")
  .action(dupesCommand);

program.command("schedule [action]")
  .description("Auto-schedule scans (set | status | clear | run)")
  .action(scheduleCommand);

program.command("optimize")
  .description("Full system optimization")
  .option("-r, --ram", "Clear RAM cache")
  .option("-s, --startup", "Analyze startup programs")
  .action(optimizeCommand);

program.parse();