import chalk from "chalk";
import inquirer from "inquirer";
import cron from "node-cron";
import ora from "ora";
import prettyBytes from "pretty-bytes";
import { getConfig } from "../utils/config.js";
import { scanDirectory, formatScanResult } from "../tools/scanner.js";

interface ScheduleConfig {
  expression: string;
  targetPath: string;
  deep: boolean;
  label: string;
}

const PRESETS: { name: string; value: string }[] = [
  { name: "Every day at 9 AM",         value: "0 9 * * *" },
  { name: "Every Monday at 9 AM",      value: "0 9 * * 1" },
  { name: "Every Sunday at midnight",  value: "0 0 * * 0" },
  { name: "Every 6 hours",             value: "0 */6 * * *" },
  { name: "Custom (enter cron expression)", value: "custom" },
];

function getScheduleConfig(): ScheduleConfig | null {
  const config = getConfig();
  const raw = config.get("schedule") as ScheduleConfig | undefined;
  return raw ?? null;
}

function saveScheduleConfig(schedule: ScheduleConfig): void {
  const config = getConfig();
  config.set("schedule", schedule);
}

function clearScheduleConfig(): void {
  const config = getConfig();
  config.delete("schedule");
}

async function appendScanHistory(entry: {
  timestamp: string;
  path: string;
  junkFiles: number;
  duplicates: number;
  largeFiles: number;
  totalSize: string;
  recoverable: string;
}): Promise<void> {
  const config = getConfig();
  const history = (config.get("scanHistory") as unknown[]) ?? [];
  history.push(entry);
  // Keep last 50 entries
  if (history.length > 50) history.splice(0, history.length - 50);
  config.set("scanHistory", history);
}

// ── Subcommands ──

async function scheduleSet(): Promise<void> {
  console.log(chalk.cyan("\n⏰ Configure Scan Schedule\n"));

  const existing = getScheduleConfig();
  if (existing) {
    console.log(chalk.gray(`  Current: "${existing.label}" on ${existing.targetPath}\n`));
  }

  const { preset } = await inquirer.prompt<{ preset: string }>([
    {
      type: "list",
      name: "preset",
      message: "Choose a schedule:",
      choices: PRESETS,
    },
  ]);

  let expression = preset;
  let label = PRESETS.find((p) => p.value === preset)?.name ?? preset;

  if (preset === "custom") {
    const { custom } = await inquirer.prompt<{ custom: string }>([
      {
        type: "input",
        name: "custom",
        message: "Enter cron expression (e.g. '0 9 * * 1'):",
        validate: (v: string) =>
          cron.validate(v) || "Invalid cron expression. Format: minute hour day month weekday",
      },
    ]);
    expression = custom;
    label = `Custom: ${custom}`;
  }

  const { targetPath } = await inquirer.prompt<{ targetPath: string }>([
    {
      type: "input",
      name: "targetPath",
      message: "Directory to scan:",
      default: process.env["USERPROFILE"] ?? process.env["HOME"] ?? process.cwd(),
    },
  ]);

  const { deep } = await inquirer.prompt<{ deep: boolean }>([
    {
      type: "confirm",
      name: "deep",
      message: "Deep scan (include hidden files)?",
      default: false,
    },
  ]);

  const schedule: ScheduleConfig = { expression, targetPath, deep, label };
  saveScheduleConfig(schedule);

  console.log(chalk.green.bold("\n  ✅ Schedule saved!\n"));
  console.log(chalk.gray(`  Schedule:  ${label}`));
  console.log(chalk.gray(`  Target:    ${targetPath}`));
  console.log(chalk.gray(`  Deep scan: ${deep ? "yes" : "no"}`));
  console.log(chalk.cyan("\n  Run: pathclaw schedule run  — to start the daemon\n"));
}

async function scheduleStatus(): Promise<void> {
  console.log(chalk.cyan("\n📋 Schedule Status\n"));

  const schedule = getScheduleConfig();
  if (!schedule) {
    console.log(chalk.yellow("  No schedule configured."));
    console.log(chalk.gray("  Run: pathclaw schedule set\n"));
    return;
  }

  const { default: Table } = await import("cli-table3");
  const table = new Table({ style: { border: ["gray"] } });
  table.push(
    { [chalk.white("Schedule")]: chalk.cyan(schedule.label) },
    { [chalk.white("Cron")]: chalk.gray(schedule.expression) },
    { [chalk.white("Target")]: schedule.targetPath },
    { [chalk.white("Deep scan")]: schedule.deep ? "yes" : "no" }
  );
  console.log(table.toString());

  // Show recent history
  const config = getConfig();
  const history = (config.get("scanHistory") as Array<{
    timestamp: string;
    recoverable: string;
    junkFiles: number;
    duplicates: number;
  }>) ?? [];

  if (history.length > 0) {
    console.log(chalk.bold("\n  Recent scans:"));
    for (const entry of history.slice(-5)) {
      console.log(
        chalk.gray(`    ${entry.timestamp}`) +
        chalk.white(` — ${entry.junkFiles} junk, ${entry.duplicates} dupes, `) +
        chalk.yellow(`${entry.recoverable} recoverable`)
      );
    }
  }
  console.log();
}

async function scheduleClear(): Promise<void> {
  const schedule = getScheduleConfig();
  if (!schedule) {
    console.log(chalk.yellow("\n  No schedule to clear.\n"));
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Remove schedule "${schedule.label}"?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray("  Cancelled."));
    return;
  }

  clearScheduleConfig();
  console.log(chalk.green("\n  ✅ Schedule removed.\n"));
}

async function scheduleRun(): Promise<void> {
  const schedule = getScheduleConfig();
  if (!schedule) {
    console.log(chalk.yellow("\n  No schedule configured."));
    console.log(chalk.gray("  Run: pathclaw schedule set\n"));
    return;
  }

  console.log(chalk.cyan("\n⏰ PathClaw Scheduler Running\n"));
  console.log(chalk.gray(`  Schedule:  ${schedule.label}`));
  console.log(chalk.gray(`  Target:    ${schedule.targetPath}`));
  console.log(chalk.gray(`  Deep scan: ${schedule.deep ? "yes" : "no"}`));
  console.log(chalk.gray("\n  Press Ctrl+C to stop.\n"));

  const task = cron.schedule(schedule.expression, async () => {
    const timestamp = new Date().toLocaleString();
    console.log(chalk.cyan(`\n━━━ Scheduled scan @ ${timestamp} ━━━\n`));

    const spinner = ora("Scanning...").start();
    try {
      const result = await scanDirectory(schedule.targetPath, schedule.deep);
      spinner.succeed("Scan complete");

      console.log(chalk.gray("\n" + formatScanResult(result)));

      // Save to history
      await appendScanHistory({
        timestamp,
        path: schedule.targetPath,
        junkFiles: result.junkFiles.length + result.tempFiles.length,
        duplicates: result.duplicates.length,
        largeFiles: result.largeFiles.length,
        totalSize: prettyBytes(result.totalSize),
        recoverable: prettyBytes(result.totalJunkSize),
      });

      if (result.totalJunkSize > 0) {
        console.log(
          chalk.yellow(`\n  ⚠ ${prettyBytes(result.totalJunkSize)} recoverable.`) +
          chalk.gray(" Run: pathclaw scan")
        );
      } else {
        console.log(chalk.green("\n  ✅ System looks clean!"));
      }
    } catch (err) {
      spinner.fail("Scan failed: " + String(err));
    }

    console.log(chalk.gray(`\n  Next run: ${schedule.label}\n`));
  });

  task.start();

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      task.stop();
      console.log(chalk.gray("\n\n  Scheduler stopped.\n"));
      resolve();
    });
  });
}

// ── Main command ──

export async function scheduleCommand(sub?: string): Promise<void> {
  switch (sub) {
    case "set":
      await scheduleSet();
      break;
    case "status":
      await scheduleStatus();
      break;
    case "clear":
      await scheduleClear();
      break;
    case "run":
      await scheduleRun();
      break;
    default:
      console.log(chalk.cyan("\n⏰ PathClaw Scheduler\n"));
      console.log(chalk.white("  Usage:"));
      console.log(chalk.gray("    pathclaw schedule set      Configure scan schedule"));
      console.log(chalk.gray("    pathclaw schedule status   Show current config & history"));
      console.log(chalk.gray("    pathclaw schedule clear    Remove schedule"));
      console.log(chalk.gray("    pathclaw schedule run      Start scheduler daemon\n"));
      break;
  }
}
