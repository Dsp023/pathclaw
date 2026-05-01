import chalk from "chalk";
import inquirer from "inquirer";
import { execSync, spawn } from "child_process";
import { getConfig } from "../utils/config.js";
import type { AIProvider } from "../ai/provider.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkGeminiCLI(): Promise<boolean> {
  try { execSync("gemini --version", { stdio: "ignore" }); return true; }
  catch { return false; }
}

async function checkGeminiCredentials(): Promise<boolean> {
  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");
  const credPaths = [
    path.join(os.homedir(), ".gemini", "oauth_creds.json"),
    path.join(os.homedir(), "AppData", "Roaming", "gemini", "oauth_creds.json"),
    path.join(os.homedir(), "AppData", "Local", "gemini", "oauth_creds.json"),
  ];
  for (const p of credPaths) {
    try { await fs.access(p); return true; } catch { continue; }
  }
  return false;
}

async function runGeminiLogin(): Promise<boolean> {
  console.log(chalk.gray("\n  Running: gemini auth login\n"));
  await new Promise<void>((resolve) => {
    const proc = spawn("gemini", ["auth", "login"], { stdio: "inherit", shell: true });
    proc.on("close", () => resolve());
  });
  const verified = await checkGeminiCredentials();
  if (verified) {
    console.log(chalk.green("\n  ✅ Logged in successfully!\n"));
  } else {
    console.log(chalk.yellow("\n  ⚠ Could not verify. Try 'gemini auth login' manually.\n"));
  }
  return verified;
}

async function doGeminiOAuthSetup(): Promise<boolean> {
  console.log(chalk.cyan("\n  Setting up Gemini OAuth...\n"));

  // Step 1 — check CLI installed
  const installed = await checkGeminiCLI();
  if (!installed) {
    console.log(chalk.yellow("  Gemini CLI not found. Installing now...\n"));
    const { confirmInstall } = await inquirer.prompt([{
      type: "confirm", name: "confirmInstall",
      message: "Install @google/gemini-cli globally?", default: true,
    }]);
    if (!confirmInstall) {
      console.log(chalk.red("  Cancelled."));
      return false;
    }
    try {
      execSync("npm install -g @google/gemini-cli", { stdio: "inherit" });
      console.log(chalk.green("\n  ✅ Gemini CLI installed!\n"));
    } catch {
      console.log(chalk.red("  ✗ Install failed. Try: npm install -g @google/gemini-cli"));
      return false;
    }
  } else {
    console.log(chalk.green("  ✅ Gemini CLI already installed\n"));
  }

  // Step 2 — check credentials
  const hasCreds = await checkGeminiCredentials();

  if (hasCreds) {
    console.log(chalk.green("  ✅ Already logged in!\n"));
    const { relogin } = await inquirer.prompt([{
      type: "confirm", name: "relogin",
      message: "Re-authenticate with a different account?", default: false,
    }]);
    if (!relogin) return true;
  } else {
    console.log(chalk.yellow("  No credentials found. Let's log in.\n"));
  }

  // Step 3 — login
  await sleep(500);
  const { confirmLogin } = await inquirer.prompt([{
    type: "confirm", name: "confirmLogin",
    message: "Open browser to login with Google?", default: true,
  }]);
  if (!confirmLogin) {
    console.log(chalk.red("  Cancelled. Run 'gemini auth login' manually later."));
    return false;
  }

  return runGeminiLogin();
}

export async function setupCommand() {
  console.log(chalk.cyan("\n⚙️  PathClaw Setup\n"));
  const config = getConfig();

  const existingProvider = config.get("provider") as string | undefined;
  if (existingProvider) {
    console.log(chalk.gray(`  Current provider: ${chalk.cyan(existingProvider)}\n`));
  }

  const { provider } = await inquirer.prompt<{ provider: AIProvider }>([{
    type: "list",
    name: "provider",
    message: "Choose your AI provider:",
    choices: [
      { name: "Gemini OAuth  (free — reuses Gemini CLI login)", value: "gemini-oauth" },
      { name: "Gemini API    (requires API key)",                value: "gemini-api"   },
      { name: "Claude API    (requires Anthropic API key)",      value: "claude"       },
      { name: "Ollama        (local, maximum privacy)",          value: "ollama"       },
      { name: "Groq          (fast inference, free tier)",       value: "groq"         },
    ],
  }]);

  config.set("provider", provider);

  if (provider === "gemini-oauth") {
    const success = await doGeminiOAuthSetup();
    if (!success) {
      console.log(chalk.yellow("  Setup incomplete. Run 'pathclaw setup' again when ready.\n"));
      return;
    }
  }

  if (provider === "gemini-api") {
    console.log(chalk.gray("\n  Get your key: https://aistudio.google.com/app/apikey\n"));
    const { key } = await inquirer.prompt([{
      type: "password", name: "key", message: "Paste Gemini API key:", mask: "*",
      validate: (v: string) => v.length > 10 || "Key looks too short",
    }]);
    config.set("geminiApiKey", key);
    console.log(chalk.green("  ✅ Gemini API key saved\n"));
  }

  if (provider === "claude") {
    console.log(chalk.gray("\n  Get your key: https://console.anthropic.com/\n"));
    const { key } = await inquirer.prompt([{
      type: "password", name: "key", message: "Paste Anthropic API key:", mask: "*",
      validate: (v: string) => v.startsWith("sk-ant-") || "Key should start with sk-ant-",
    }]);
    config.set("anthropicApiKey", key);
    console.log(chalk.green("  ✅ Anthropic API key saved\n"));
  }
if (provider === "groq") {
    console.log(chalk.gray("\n  Get your free key: https://console.groq.com/keys\n"));
    const { key } = await inquirer.prompt([{
      type: "password", name: "key", message: "Paste Groq API key:", mask: "*",
      validate: (v: string) => v.startsWith("gsk_") || "Key should start with gsk_",
    }]);
    config.set("groqApiKey", key);
    console.log(chalk.green("  ✅ Groq API key saved\n"));
  }
  if (provider === "ollama") {
    console.log(chalk.gray("\n  Make sure Ollama is running: https://ollama.com\n"));
    const { base } = await inquirer.prompt([{
      type: "input", name: "base",
      message: "Ollama base URL:", default: "http://localhost:11434",
    }]);
    try {
      const res = await fetch(`${base}/api/tags`);
      const data = await res.json() as { models: Array<{ name: string }> };
      const models = data.models.map((m) => m.name);
      if (models.length > 0) {
        console.log(chalk.gray(`\n  Found ${models.length} model(s):\n`));
        const { model } = await inquirer.prompt([{
          type: "list", name: "model",
          message: "Choose a model:", choices: models,
        }]);
        config.set("ollamaModel", model);
      } else {
        console.log(chalk.yellow("  No models found. Run: ollama pull llama3\n"));
        config.set("ollamaModel", "llama3");
      }
    } catch {
      console.log(chalk.yellow("  Could not reach Ollama.\n"));
      const { model } = await inquirer.prompt([{
        type: "input", name: "model", message: "Model name:", default: "llama3",
      }]);
      config.set("ollamaModel", model);
    }
    config.set("ollamaBase", base);
    console.log(chalk.green("  ✅ Ollama configured\n"));
  }

  console.log(chalk.green.bold(`  ✅ PathClaw ready — provider: ${chalk.cyan(provider)}`));
  console.log(chalk.gray("  Run: pathclaw scan\n"));
}