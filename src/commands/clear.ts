import chalk from "chalk";
import ora from "ora";
import os from "os";
import inquirer from "inquirer";
import { callAI } from "../ai/provider.js";
import { presentPlanAndConfirm, executePlan, type ActionPlan } from "../tools/router.js";

interface ClearOptions { force?: boolean; temp?: boolean; cache?: boolean; }
interface OptimizeOptions { ram?: boolean; startup?: boolean; }

export async function clearCommand(options: ClearOptions = {}) {
  console.log(chalk.cyan("\n🧹 PathClaw Clear\n"));

  if (!options.force) {
    const { confirm } = await inquirer.prompt([{
      type: "confirm", name: "confirm",
      message: "This will delete junk/temp files. Continue?",
      default: false,
    }]);
    if (!confirm) { console.log(chalk.gray("  Aborted.")); return; }
  }

  const actions: ActionPlan["actions"] = [];
  if (options.temp || (!options.cache)) {
    actions.push({ type: "shell", category: "temp_flush_system", description: "Flush system temp directories", args: {} });
  }
  if (options.cache || (!options.temp)) {
    actions.push({ type: "shell", category: "cache_flush", description: "Flush DNS and system caches", args: {} });
  }

  const plan: ActionPlan = {
    summary: "Clear junk files and system caches",
    estimatedSpaceFreed: "varies",
    actions,
  };

  const approved = await presentPlanAndConfirm(plan);
  if (!approved) { console.log(chalk.gray("\n  Aborted.")); return; }
  await executePlan(plan);
}

export async function optimizeCommand(options: OptimizeOptions = {}) {
  console.log(chalk.cyan("\n⚡ PathClaw Optimize\n"));

  const spinner = ora("Analyzing system...").start();
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const usedRamPct = Math.round(((totalRam - freeRam) / totalRam) * 100);
  spinner.succeed(`RAM: ${usedRamPct}% used`);

  const aiSpinner = ora("Building optimization plan...").start();
  const prompt = `
You are PathClaw. Suggest system optimizations.
Platform: ${process.platform}
RAM: ${usedRamPct}% used (${Math.round(freeRam / 1024 / 1024)}MB free of ${Math.round(totalRam / 1024 / 1024)}MB)
Requested: ${options.ram ? "RAM clear" : ""} ${options.startup ? "startup analysis" : ""}

Return ONLY valid JSON:
{
  "summary": "...",
  "estimatedSpaceFreed": "X MB RAM freed",
  "actions": [
    { "type": "shell", "category": "ram_clear", "description": "Free RAM cache", "args": {} }
  ]
}
Only use shell categories: ram_clear, process_kill, cache_flush, temp_flush_system, startup_disable`;

  try {
    const { text } = await callAI(prompt);
    aiSpinner.succeed("Plan ready");
    const clean = text.replace(/```json|```/g, "").trim();
    const plan = JSON.parse(clean) as ActionPlan;
    const approved = await presentPlanAndConfirm(plan);
    if (!approved) { console.log(chalk.gray("\n  Aborted.")); return; }
    await executePlan(plan);
  } catch (err) {
    aiSpinner.fail("Failed: " + String(err));
  }
}