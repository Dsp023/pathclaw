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
import { dashboardCommand } from "./commands/dashboard.js";

const VERSION = "1.1.0";

function showHelp() {
  console.log(chalk.cyan(figlet.textSync("PathClaw", { font: "Small" })));
  console.log(chalk.gray(`  AI-powered file system optimizer  ${chalk.cyan(`v${VERSION}`)}\n`));

  console.log(chalk.bold.white("  USAGE\n"));
  console.log(chalk.gray("    $ pathclaw <command> [options]\n"));

  console.log(chalk.bold.white("  GETTING STARTED\n"));
  console.log(`    ${chalk.cyan("dashboard")}        ${chalk.gray("Launch the beautiful Web UI dashboard")}`);
  console.log(`    ${chalk.cyan("setup")}            ${chalk.gray("Configure AI provider (Gemini, Claude, Ollama, Groq)")}`);
  console.log(`    ${chalk.cyan("status")}           ${chalk.gray("Show disk, RAM, CPU, and system health")}\n`);

  console.log(chalk.bold.white("  SCAN & CLEAN\n"));
  console.log(`    ${chalk.cyan("scan")}   ${chalk.gray("[path]")}     ${chalk.gray("Scan for junk, temp files, duplicates, large files")}`);
  console.log(`      ${chalk.gray("--deep")}           ${chalk.gray("Include hidden files")}`);
  console.log(`      ${chalk.gray("--no-ai")}          ${chalk.gray("Skip AI analysis")}`);
  console.log(`    ${chalk.cyan("clear")}            ${chalk.gray("Clear junk, temp, and cache files")}`);
  console.log(`      ${chalk.gray("--temp")}           ${chalk.gray("Temp files only")}`);
  console.log(`      ${chalk.gray("--cache")}          ${chalk.gray("Cache only")}`);
  console.log(`      ${chalk.gray("--force")}          ${chalk.gray("Skip confirmation")}\n`);

  console.log(chalk.bold.white("  ORGANIZE\n"));
  console.log(`    ${chalk.cyan("organize")} ${chalk.gray("[path]")}  ${chalk.gray("AI semantic folder organization")}`);
  console.log(`      ${chalk.gray("--dry-run")}        ${chalk.gray("Preview without moving")}`);
  console.log(`      ${chalk.gray("--rules <r>")}      ${chalk.gray('Custom rules (e.g. "group by project")')}\n`);

  console.log(chalk.bold.white("  DUPLICATES\n"));
  console.log(`    ${chalk.cyan("dupes")}  ${chalk.gray("[path]")}    ${chalk.gray("Interactive duplicate file reviewer")}`);
  console.log(`      ${chalk.gray("--deep")}           ${chalk.gray("Include hidden files")}`);
  console.log(`      ${chalk.gray("--dry-run")}        ${chalk.gray("Preview without deleting")}\n`);

  console.log(chalk.bold.white("  SCHEDULER\n"));
  console.log(`    ${chalk.cyan("schedule set")}     ${chalk.gray("Configure auto-scan schedule (daily/weekly/custom)")}`);
  console.log(`    ${chalk.cyan("schedule status")}  ${chalk.gray("Show current config & scan history")}`);
  console.log(`    ${chalk.cyan("schedule run")}     ${chalk.gray("Start scheduler daemon")}`);
  console.log(`    ${chalk.cyan("schedule clear")}   ${chalk.gray("Remove schedule")}\n`);

  console.log(chalk.bold.white("  OPTIMIZE\n"));
  console.log(`    ${chalk.cyan("optimize")}         ${chalk.gray("Full system optimization")}`);
  console.log(`      ${chalk.gray("--ram")}            ${chalk.gray("Clear RAM cache")}`);
  console.log(`      ${chalk.gray("--startup")}        ${chalk.gray("Analyze startup programs")}\n`);

  console.log(chalk.bold.white("  AI CHAT\n"));
  console.log(`    ${chalk.cyan("chat")}             ${chalk.gray("Natural language mode — just tell PathClaw what to do")}\n`);

  console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
  console.log(chalk.gray(`  ${chalk.white("pathclaw <command> --help")}    Show help for a specific command`));
  console.log(chalk.gray(`  ${chalk.white("pathclaw --version")}          Show version number\n`));
}

// Show custom help when no args
if (process.argv.length <= 2) {
  showHelp();
  process.exit(0);
}

// Banner for subcommands
console.log(chalk.cyan(figlet.textSync("PathClaw", { font: "Small" })));
console.log(chalk.gray("  AI-powered file system optimizer\n"));

program
  .name("pathclaw")
  .description("AI agent that scans, organizes, and optimizes your file system")
  .version(VERSION);

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

program.command("dashboard")
  .description("Launch the PathClaw Web UI dashboard")
  .action(dashboardCommand);

program.command("optimize")
  .description("Full system optimization")
  .option("-r, --ram", "Clear RAM cache")
  .option("-s, --startup", "Analyze startup programs")
  .action(optimizeCommand);

program.parse();