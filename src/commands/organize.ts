import chalk from "chalk";
import ora from "ora";
import fs from "fs/promises";
import { callAI } from "../ai/provider.js";
import { presentPlanAndConfirm, executePlan, type ActionPlan } from "../tools/router.js";

interface OrganizeOptions { dryRun?: boolean; rules?: string; }

export async function organizeCommand(targetPath = process.cwd(), options: OrganizeOptions = {}) {
  console.log(chalk.cyan(`\n📂 Organizing: ${targetPath}\n`));

  const spinner = ora("Reading directory...").start();
  let files: string[] = [];
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    files = entries.filter((e) => e.isFile()).map((e) => e.name);
    spinner.succeed(`Found ${files.length} files`);
  } catch (err) {
    spinner.fail("Failed: " + String(err));
    return;
  }

  const aiSpinner = ora("Building organization plan...").start();
  const prompt = `
You are PathClaw. Organize these files into semantic folders.
${options.rules ? `User rules: ${options.rules}` : ""}

Directory: ${targetPath}
Files:
${files.map((f) => `  ${f}`).join("\n")}

Group by meaning (Finance, Work, Media, Code, etc) not just extension.
Return ONLY valid JSON:
{
  "summary": "...",
  "estimatedSpaceFreed": "0 MB",
  "actions": [
    { "type": "move", "from": "${targetPath}\\filename.ext", "to": "${targetPath}\\FolderName\\filename.ext", "reason": "why" }
  ]
}`;

  try {
    const { text } = await callAI(prompt);
    aiSpinner.succeed("Plan ready");
    const clean = text.replace(/```json|```/g, "").trim();
    const plan = JSON.parse(clean) as ActionPlan;

    if (options.dryRun) {
      console.log(chalk.yellow("\n  DRY RUN — no files will be moved\n"));
      await presentPlanAndConfirm(plan);
      return;
    }

    const approved = await presentPlanAndConfirm(plan);
    if (!approved) { console.log(chalk.gray("\n  Aborted.")); return; }
    await executePlan(plan);
  } catch (err) {
    aiSpinner.fail("Failed: " + String(err));
  }
}