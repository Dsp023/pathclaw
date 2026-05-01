import chalk from "chalk";
import * as readline from "readline";
import ora from "ora";
import { callAI } from "../ai/provider.js";
import { presentPlanAndConfirm, executePlan, type ActionPlan } from "../tools/router.js";
import { scanDirectory, formatScanResult } from "../tools/scanner.js";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM = `You are PathClaw, a friendly and intelligent AI file system assistant.
You help users clean, organize, and optimize their Windows PC through natural conversation.

PERSONALITY:
- Conversational, helpful, slightly witty
- Ask clarifying questions when needed
- Give short explanations before suggesting actions
- React to what the user says naturally

TWO MODES:
1. CHAT mode — when user is asking questions, chatting, or needs advice
   → respond with plain conversational text (no JSON)
   → example: "Your Downloads folder likely has old installers and temp files..."

2. ACTION mode — when user wants you to DO something
   → respond with ONLY a JSON action plan, no other text
   → trigger words: clean, delete, organize, move, clear, fix, optimize, remove, free up

ACTION JSON format (only when taking action):
{
  "summary": "what I will do",
  "estimatedSpaceFreed": "X MB",
  "actions": [
    { "type": "delete", "path": "C:\\absolute\\path\\file.tmp", "reason": "why" },
    { "type": "move", "from": "C:\\src\\file.pdf", "to": "C:\\dst\\folder\\file.pdf", "reason": "why" },
    { "type": "shell", "category": "cache_flush", "description": "flush DNS cache", "args": {} },
    { "type": "raw_shell", "command": "ipconfig /flushdns", "description": "Execute raw command to fix network" }
  ]
}

SUPER POWER (GOD MODE):
- You have the ability to run ANY arbitrary shell command using the "raw_shell" action.
- Use this to solve complex tasks, run diagnostics, kill processes, or script solutions.
- The user will be asked to confirm before the command runs.

AUTONOMOUS AGENT LOOP:
- You operate in an autonomous loop.
- When you execute an ACTION JSON plan, the system will execute it and automatically reply with the terminal output (STDOUT/STDERR).
- You must analyze the output and decide what to do next.
- If you need to run another command to achieve the user's goal, output another ACTION JSON plan.
- If you are completely finished with the user's overarching goal, output a plain text conversational message explaining what you did.

SAFETY RULES (always follow):
- NEVER touch: C:\\Windows, Program Files, .git, node_modules, .ssh, .env
- Always explain what you are about to do before the JSON
- Max 20 actions per plan
- If unsure about a path, ask the user first`;

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
}

function ask(rl: readline.Interface): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(chalk.cyan("\nYou › "));
    rl.once("line", (line) => resolve(line.trim()));
  });
}

function typeWriter(text: string): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      process.stdout.write(text[i]);
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        process.stdout.write("\n");
        resolve();
      }
    }, 8);
  });
}

function printResponse(text: string) {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("**") && line.endsWith("**")) {
      console.log(chalk.bold.white(line.replace(/\*\*/g, "")));
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      console.log(chalk.gray("  ") + chalk.white(line));
    } else if (line.match(/^\d+\./)) {
      console.log(chalk.cyan("  " + line));
    } else if (line.trim() === "") {
      console.log();
    } else {
      console.log(chalk.white(line));
    }
  }
}

function extractJSON(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function isActionRequest(text: string): boolean {
  const json = extractJSON(text);
  return json !== null && /"actions"\s*:/.test(json);
}

async function getSystemContext(): Promise<string> {
  const os = await import("os");
  const info = os.userInfo();
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  return `
User: ${info.username}
Platform: Windows
RAM: ${Math.round(freeRam / 1024 / 1024)}MB free of ${Math.round(totalRam / 1024 / 1024)}MB
Common paths:
  Downloads: C:\\Users\\${info.username}\\Downloads
  Desktop:   C:\\Users\\${info.username}\\Desktop
  Documents: C:\\Users\\${info.username}\\Documents
  Temp:      ${process.env["TEMP"] ?? "C:\\Windows\\Temp"}`;
}

async function autoScan(userMessage: string): Promise<string> {
  const os = await import("os");
  const username = os.userInfo().username;

  const pathMap: Record<string, string> = {
    download: `C:\\Users\\${username}\\Downloads`,
    desktop:  `C:\\Users\\${username}\\Desktop`,
    document: `C:\\Users\\${username}\\Documents`,
  };

  let scanPath = "";

  const explicit = userMessage.match(/[A-Z]:\\[^\s,]+/i);
  if (explicit) {
    scanPath = explicit[0];
  } else {
    for (const [keyword, path] of Object.entries(pathMap)) {
      if (userMessage.toLowerCase().includes(keyword)) {
        scanPath = path;
        break;
      }
    }
  }

  if (!scanPath) return "";

  const spinner = ora(chalk.gray(`Scanning ${scanPath}...`)).start();
  try {
    const result = await scanDirectory(scanPath);
    spinner.succeed(chalk.gray(`Scanned ${scanPath}`));
    return `\nSCAN DATA for ${scanPath}:\n${formatScanResult(result)}`;
  } catch {
    spinner.warn(chalk.gray("Could not scan — proceeding without scan data"));
    return "";
  }
}

export async function chatCommand() {
  console.log(chalk.cyan("\n╔════════════════════════════════╗"));
  console.log(chalk.cyan("║   PathClaw AI Assistant        ║"));
  console.log(chalk.cyan("╚════════════════════════════════╝"));
  console.log(chalk.gray("\n  Chat naturally. Ask questions or tell me what to do."));
  console.log(chalk.gray("  Type 'exit' to quit.\n"));

  const sysContext = await getSystemContext();
  const history: Message[] = [];

  // Greeting
  const greeting = "Hey! I'm PathClaw, your AI file system assistant. I can help you clean junk files, organize folders, free up disk space, and optimize your PC. What would you like to do today?";
  console.log(chalk.green.bold("\nPathClaw › "));
  await typeWriter(chalk.white(greeting));
  history.push({ role: "assistant", content: greeting });

  const rl = createRL();

  while (true) {
    const input = await ask(rl);

    if (!input) continue;
    if (["exit", "quit", "bye"].includes(input.toLowerCase())) {
      console.log(chalk.green.bold("\nPathClaw › "));
      await typeWriter(chalk.white("Alright, see you later! Your PC is in good hands."));
      rl.close();
      break;
    }

    // Auto scan if action keywords detected
    const scanContext = await autoScan(input);
    history.push({ role: "user", content: input });

    let stepCount = 0;
    const MAX_STEPS = 10;

    while (stepCount < MAX_STEPS) {
      stepCount++;
      const recentHistory = history.slice(-20);
      const historyText = recentHistory
        .map((m) => `${m.role === "user" ? "User" : "PathClaw"}: ${m.content}`)
        .join("\n");

      const fullPrompt = `SYSTEM CONTEXT:
${sysContext}
${scanContext}

CONVERSATION HISTORY:
${historyText}

PathClaw:`;

      // Call AI
      const spinner = ora("").start();
      spinner.text = chalk.gray(stepCount > 1 ? `thinking (step ${stepCount})...` : "thinking...");

      let responseText = "";
      try {
        const { text } = await callAI(fullPrompt, SYSTEM);
        spinner.stop();
        responseText = text.trim();
      } catch (err) {
        spinner.fail(chalk.red("Error: " + String(err)));
        break; // break out of agent loop
      }

      // Check if it's an action plan (JSON) or chat response
      if (isActionRequest(responseText)) {
        try {
          const jsonStr = extractJSON(responseText);
          if (!jsonStr) throw new Error("No JSON found");

          // Print any text before the JSON as chat
          const beforeJson = responseText.slice(0, responseText.indexOf("{")).trim();
          if (beforeJson) {
            console.log(chalk.green.bold("\nPathClaw › "));
            printResponse(beforeJson);
          }

          const plan = JSON.parse(jsonStr) as ActionPlan;
          history.push({ role: "assistant", content: responseText });

          const approved = await presentPlanAndConfirm(plan);
          if (!approved) {
            const msg = "No problem, I cancelled that. Is there anything else you'd like me to do?";
            console.log(chalk.green.bold("\nPathClaw › "));
            await typeWriter(chalk.white(msg));
            history.push({ role: "assistant", content: msg });
            break;
          }

          console.log(chalk.cyan("\n⚡ Executing...\n"));
          const results = await executePlan(plan);

          const feedback = `EXECUTION RESULTS:\n${results.join("\n")}\n\nAnalyze this output. If your overarching goal is complete, reply with a conversational message explaining the final result. If you need to continue working to achieve the goal, output your next ACTION JSON plan.`;
          history.push({ role: "user", content: feedback });
          
          // Loop continues automatically with feedback!

        } catch {
          // Not valid JSON — treat as chat
          console.log(chalk.green.bold("\nPathClaw › "));
          printResponse(responseText);
          history.push({ role: "assistant", content: responseText });
          break;
        }
      } else {
        // Pure chat response
        console.log(chalk.green.bold("\nPathClaw › "));
        printResponse(responseText);
        history.push({ role: "assistant", content: responseText });
        break; // Goal completed!
      }
    }

    if (stepCount >= MAX_STEPS) {
      const msg = "I've hit my maximum autonomous steps limit (10). Please review the output above.";
      console.log(chalk.yellow(`\n⚠️  ${msg}`));
      history.push({ role: "assistant", content: msg });
    }

    // Keep history manageable
    if (history.length > 40) history.splice(0, 10);
  }
}
