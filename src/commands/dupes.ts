import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import prettyBytes from "pretty-bytes";
import { scanDirectory, type FileEntry } from "../tools/scanner.js";

interface DupesOptions {
  deep?: boolean;
  dryRun?: boolean;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function reviewGroup(
  group: FileEntry[],
  groupIndex: number,
  totalGroups: number,
  dryRun: boolean
): Promise<number> {
  const { default: Table } = await import("cli-table3");

  console.log(
    chalk.cyan(`\n══ Duplicate Group ${groupIndex + 1}/${totalGroups} ══`) +
    chalk.gray(` — ${prettyBytes(group[0].size)} each, ${group.length} copies`)
  );

  // Side-by-side table
  const table = new Table({
    head: [
      chalk.white("#"),
      chalk.white("File Path"),
      chalk.white("Size"),
      chalk.white("Modified"),
    ],
    colWidths: [5, 55, 12, 22],
    style: { border: ["gray"] },
  });

  for (let i = 0; i < group.length; i++) {
    const f = group[i];
    table.push([
      chalk.yellow(String(i + 1)),
      f.path.length > 52 ? "..." + f.path.slice(-49) : f.path,
      prettyBytes(f.size),
      formatDate(f.modified),
    ]);
  }
  console.log(table.toString());

  // Ask which to keep
  const choices = group.map((f, i) => ({
    name: `${i + 1}. ${f.path.length > 60 ? "..." + f.path.slice(-57) : f.path}`,
    value: i,
    checked: i === 0, // default: keep the first one
  }));

  const { toKeep } = await inquirer.prompt<{ toKeep: number[] }>([
    {
      type: "checkbox",
      name: "toKeep",
      message: chalk.bold("Select files to KEEP (unchecked = delete):"),
      choices,
      validate: (answer: number[]) =>
        answer.length > 0 || "You must keep at least one file!",
    },
  ]);

  const toDelete = group.filter((_, i) => !toKeep.includes(i));

  if (toDelete.length === 0) {
    console.log(chalk.gray("  Keeping all — skipping."));
    return 0;
  }

  // Show what will be deleted
  console.log(chalk.red.bold(`\n  Will delete ${toDelete.length} file(s):`));
  for (const f of toDelete) {
    console.log(chalk.red(`    ✗ ${f.path}`));
  }

  if (dryRun) {
    console.log(chalk.yellow("  (dry run — no files deleted)"));
    return toDelete.reduce((s, f) => s + f.size, 0);
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Delete these files?",
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray("  Skipped."));
    return 0;
  }

  // Delete
  const fs = await import("fs/promises");
  let freed = 0;
  for (const f of toDelete) {
    try {
      await fs.rm(f.path, { force: true });
      console.log(chalk.red(`  ✓ Deleted: ${f.path}`));
      freed += f.size;
    } catch (err) {
      console.log(chalk.red(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
  return freed;
}

export async function dupesCommand(
  scanPath = process.cwd(),
  options: DupesOptions = {}
) {
  console.log(chalk.cyan(`\n🔍 PathClaw — Duplicate Finder\n`));

  if (options.dryRun) {
    console.log(chalk.yellow("  DRY RUN mode — no files will be deleted\n"));
  }

  const spinner = ora("Scanning for duplicates...").start();
  let duplicates: FileEntry[][];

  try {
    const result = await scanDirectory(scanPath, options.deep);
    duplicates = result.duplicates;
    spinner.succeed(
      `Found ${duplicates.length} duplicate group(s)`
    );
  } catch (err) {
    spinner.fail("Scan failed: " + String(err));
    return;
  }

  if (duplicates.length === 0) {
    console.log(chalk.green("\n  ✅ No duplicates found! Your files are clean.\n"));
    return;
  }

  // Summary
  const totalDupeSize = duplicates.reduce(
    (s, group) => s + group.slice(1).reduce((ss, f) => ss + f.size, 0),
    0
  );
  console.log(
    chalk.gray(`  ${duplicates.length} groups · `) +
    chalk.yellow(`${prettyBytes(totalDupeSize)} recoverable\n`)
  );

  // Navigation options
  const { mode } = await inquirer.prompt<{ mode: string }>([
    {
      type: "list",
      name: "mode",
      message: "How would you like to review?",
      choices: [
        { name: "Review each group one by one", value: "one-by-one" },
        { name: "Auto-keep oldest, delete rest (with confirmation)", value: "auto-oldest" },
        { name: "Auto-keep newest, delete rest (with confirmation)", value: "auto-newest" },
        { name: "Cancel", value: "cancel" },
      ],
    },
  ]);

  if (mode === "cancel") {
    console.log(chalk.gray("\n  Cancelled.\n"));
    return;
  }

  let totalFreed = 0;

  if (mode === "one-by-one") {
    for (let i = 0; i < duplicates.length; i++) {
      const freed = await reviewGroup(
        duplicates[i],
        i,
        duplicates.length,
        options.dryRun ?? false
      );
      totalFreed += freed;
    }
  } else {
    // Auto mode — keep oldest or newest
    const keepNewest = mode === "auto-newest";
    const { default: Table } = await import("cli-table3");

    const allToDelete: FileEntry[] = [];

    for (const group of duplicates) {
      const sorted = [...group].sort(
        (a, b) => a.modified.getTime() - b.modified.getTime()
      );
      const keep = keepNewest ? sorted[sorted.length - 1] : sorted[0];
      const remove = group.filter((f) => f.path !== keep.path);
      allToDelete.push(...remove);
    }

    console.log(
      chalk.red.bold(`\n  Will delete ${allToDelete.length} file(s):`)
    );

    const table = new Table({
      head: [chalk.white("File"), chalk.white("Size")],
      colWidths: [70, 14],
      style: { border: ["gray"] },
    });

    for (const f of allToDelete.slice(0, 30)) {
      table.push([
        f.path.length > 67 ? "..." + f.path.slice(-64) : f.path,
        prettyBytes(f.size),
      ]);
    }
    if (allToDelete.length > 30) {
      table.push([chalk.gray(`... and ${allToDelete.length - 30} more`), ""]);
    }
    console.log(table.toString());

    const autoFreed = allToDelete.reduce((s, f) => s + f.size, 0);
    console.log(chalk.yellow(`\n  Space to free: ${prettyBytes(autoFreed)}`));

    if (options.dryRun) {
      console.log(chalk.yellow("  (dry run — no files deleted)\n"));
      totalFreed = autoFreed;
    } else {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: chalk.bold(`Delete all ${allToDelete.length} duplicate files?`),
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray("\n  Cancelled.\n"));
        return;
      }

      const fs = await import("fs/promises");
      const deleteSpinner = ora("Deleting duplicates...").start();

      for (const f of allToDelete) {
        try {
          await fs.rm(f.path, { force: true });
          totalFreed += f.size;
        } catch { /* skip */ }
      }

      deleteSpinner.succeed("Done");
    }
  }

  // Final summary
  console.log(chalk.green.bold(`\n  ✅ Freed: ${prettyBytes(totalFreed)}`));
  console.log(chalk.gray("  Run 'pathclaw scan' for a full health check.\n"));
}
