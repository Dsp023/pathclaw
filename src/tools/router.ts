import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  BLACKLISTED_PATHS, BLACKLISTED_PATTERNS,
  SHELL_ALLOWED_CATEGORIES, SHELL_COMMANDS,
  type ShellCategory,
} from "../utils/safety.js";

const execAsync = promisify(exec);

export type FSAction =
  | { type: "delete"; path: string; reason: string }
  | { type: "move"; from: string; to: string; reason: string }
  | { type: "rename"; path: string; newName: string; reason: string };

export type ShellAction = {
  type: "shell";
  category: ShellCategory;
  description: string;
  args?: Record<string, string>;
};

export type Action = FSAction | ShellAction;

export interface ActionPlan {
  summary: string;
  actions: Action[];
  estimatedSpaceFreed?: string;
}

function isBlacklisted(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  for (const blocked of BLACKLISTED_PATHS) {
    if (normalized.startsWith(path.normalize(blocked))) return true;
  }
  for (const pattern of BLACKLISTED_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

export async function presentPlanAndConfirm(plan: ActionPlan): Promise<boolean> {
  const { default: Table } = await import("cli-table3");

  console.log("\n" + chalk.bold.cyan("═══ PathClaw Action Plan ═══"));
  console.log(chalk.gray(plan.summary));
  if (plan.estimatedSpaceFreed) {
    console.log(chalk.green(`  Estimated space freed: ${plan.estimatedSpaceFreed}`));
  }
  console.log();

  const fsActions = plan.actions.filter((a) => a.type !== "shell") as FSAction[];
  const shellActions = plan.actions.filter((a) => a.type === "shell") as ShellAction[];

  if (fsActions.length > 0) {
    console.log(chalk.bold.yellow("File System Operations") + chalk.gray(" (Node fs only — no shell)"));
    const table = new Table({
      head: [chalk.white("Action"), chalk.white("Path"), chalk.white("Reason")],
      colWidths: [10, 48, 36],
      style: { border: ["gray"] },
    });
    for (const action of fsActions) {
      const blocked = isBlacklisted(action.type === "move" ? action.from : action.path ?? "");
      const label = action.type === "delete" ? chalk.red("delete")
        : action.type === "move" ? chalk.blue("move")
        : chalk.yellow("rename");
      const p = action.type === "move"
        ? `${action.from}\n→ ${action.to}`
        : (action as { path: string }).path;
      table.push([blocked ? chalk.bgRed("BLOCKED") : label, p, action.reason]);
    }
    console.log(table.toString());
  }

  if (shellActions.length > 0) {
    console.log("\n" + chalk.bold.magenta("System/Shell Operations") + chalk.gray(" (requires approval)"));
    const table = new Table({
      head: [chalk.white("Category"), chalk.white("Description")],
      colWidths: [22, 72],
      style: { border: ["gray"] },
    });
    for (const action of shellActions) {
      table.push([chalk.magenta(action.category), action.description]);
    }
    console.log(table.toString());
  }

  console.log();
  const { confirm } = await inquirer.prompt([{
    type: "confirm",
    name: "confirm",
    message: chalk.bold("Execute this plan?"),
    default: false,
  }]);
  return confirm;
}

export async function executePlan(plan: ActionPlan): Promise<void> {
  const errors: string[] = [];

  for (const action of plan.actions) {
    if (action.type === "shell") {
      if (!SHELL_ALLOWED_CATEGORIES.includes(action.category)) {
        console.log(chalk.red(`  Blocked shell category: ${action.category}`));
        continue;
      }
      const { confirmShell } = await inquirer.prompt([{
        type: "confirm",
        name: "confirmShell",
        message: `  Run: ${chalk.cyan(action.description)}?`,
        default: false,
      }]);
      if (!confirmShell) { console.log(chalk.gray(`  Skipped.`)); continue; }

      const isWin = process.platform === "win32";
      const template = isWin ? SHELL_COMMANDS[action.category].win : SHELL_COMMANDS[action.category].unix;
      if (!template) { console.log(chalk.yellow(`  No command for this platform.`)); continue; }

      let cmd = template;
      for (const [k, v] of Object.entries(action.args ?? {})) {
        const safe = v.replace(/[^a-zA-Z0-9_\-.]/g, "");
        cmd = cmd.replace(`{${k}}`, safe);
      }

      try {
        const { stdout } = await execAsync(cmd);
        console.log(chalk.green(`  ✓ ${action.description}`));
        if (stdout.trim()) console.log(chalk.gray("    " + stdout.trim()));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.red(`  ✗ Failed: ${msg}`));
        errors.push(msg);
      }
      continue;
    }

    const targetPath = action.type === "move" ? action.from : (action as { path: string }).path;
    if (isBlacklisted(targetPath)) {
      console.log(chalk.bgRed.white(`  BLOCKED: ${targetPath}`));
      continue;
    }

    try {
      if (action.type === "delete") {
        await fs.rm(action.path, { recursive: true, force: true });
        console.log(chalk.red(`  ✓ Deleted: ${action.path}`));
      } else if (action.type === "move") {
        await fs.mkdir(path.dirname(action.to), { recursive: true });
        await fs.rename(action.from, action.to);
        console.log(chalk.blue(`  ✓ Moved: ${action.from} → ${action.to}`));
      } else if (action.type === "rename") {
        const dir = path.dirname(action.path);
        await fs.rename(action.path, path.join(dir, action.newName));
        console.log(chalk.yellow(`  ✓ Renamed: ${action.path} → ${action.newName}`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ Error: ${msg}`));
      errors.push(msg);
    }
  }

  if (errors.length > 0) {
    console.log(chalk.yellow(`\n  ${errors.length} error(s) during execution.`));
  } else {
    console.log(chalk.green.bold("\n  ✅ Done."));
  }
}