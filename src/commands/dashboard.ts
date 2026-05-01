import chalk from "chalk";
import ora from "ora";
import { createServer } from "../server/api.js";

export async function dashboardCommand() {
  console.log(chalk.cyan("\n🚀 Starting PathClaw Dashboard...\n"));

  const PORT = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3000;
  const app = createServer();

  app.listen(PORT, async () => {
    console.log(chalk.green(`  ✅ Dashboard running at `) + chalk.cyan.underline(`http://localhost:${PORT}`));
    console.log(chalk.gray(`  Press Ctrl+C to stop.\n`));

    // Try to open the browser automatically
    try {
      const { default: open } = await import("open");
      await open(`http://localhost:${PORT}`);
    } catch (err) {
      // Ignore if open fails
    }
  });
}
