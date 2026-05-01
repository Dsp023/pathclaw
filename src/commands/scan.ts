import chalk from "chalk";
import ora from "ora";
import prettyBytes from "pretty-bytes";
import { scanDirectory, formatScanResult } from "../tools/scanner.js";
import { callAI } from "../ai/provider.js";
import { presentPlanAndConfirm, executePlan, type ActionPlan } from "../tools/router.js";

interface ScanOptions { deep?: boolean; ai?: boolean; }

export async function scanCommand(scanPath = process.cwd(), options: ScanOptions = {}) {
  console.log(chalk.cyan(`\n🔍 Scanning: ${scanPath}\n`));

  const spinner = ora("Indexing files...").start();
  let result;
  try {
    result = await scanDirectory(scanPath, options.deep);
    spinner.succeed(`Scan complete — ${prettyBytes(result.totalJunkSize)} recoverable`);
  } catch (err) {
    spinner.fail("Scan failed: " + String(err));
    return;
  }

  const summary = formatScanResult(result);
  console.log("\n" + chalk.gray(summary));

  if (options.ai === false) return;

  const aiSpinner = ora("Building AI action plan...").start();

  const prompt = `
You are PathClaw. Analyze this scan and return a strict JSON action plan.

SCAN RESULT:
${summary}

RULES:
- File ops: use type "delete", "move", or "rename"
- System ops: use type "shell" with category from: ram_clear, cache_flush, temp_flush_system
- NEVER touch: system paths, node_modules, .git, .ssh, .env files
- Max 20 actions, highest impact first

Return ONLY valid JSON:
{
  "summary": "one line summary",
  "estimatedSpaceFreed": "X MB",
  "actions": [
    { "type": "delete", "path": "/absolute/path/file.tmp", "reason": "temp file" },
    { "type": "shell", "category": "temp_flush_system", "description": "Flush temp dirs", "args": {} }
  ]
}`;

  let plan: ActionPlan;
  try {
    const { text } = await callAI(prompt);
    aiSpinner.succeed("AI plan ready");
    const clean = text.replace(/```json|```/g, "").trim();
    plan = JSON.parse(clean) as ActionPlan;
  } catch (err) {
    aiSpinner.fail("AI failed: " + String(err));
    return;
  }

  const approved = await presentPlanAndConfirm(plan);
  if (!approved) { console.log(chalk.gray("\n  Aborted. No changes made.")); return; }

  console.log(chalk.cyan("\n⚡ Executing...\n"));
  await executePlan(plan);
}