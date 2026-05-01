import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "../utils/config.js";

export type AIProvider = "gemini-oauth" | "gemini-api" | "claude" | "ollama" | "groq";
async function callGroq(prompt: string, system: string): Promise<string> {
  const config = getConfig();
  const key = config.get("groqApiKey") as string;
  if (!key) throw new Error("Groq API key not set. Run: pathclaw setup");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user",   content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error: ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "";
}
async function getGeminiOAuthToken(): Promise<string> {
  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");
  const credPaths = [
    path.join(os.homedir(), ".gemini", "oauth_creds.json"),
    path.join(os.homedir(), ".config", "gemini", "oauth_creds.json"),
    path.join(os.homedir(), "AppData", "Roaming", "gemini", "oauth_creds.json"),
    path.join(os.homedir(), "AppData", "Local", "gemini", "oauth_creds.json"),
  ];
  for (const credPath of credPaths) {
    try {
      const raw = await fs.readFile(credPath, "utf-8");
      const creds = JSON.parse(raw);
      const token = creds.access_token || creds.token?.access_token;
      if (token) return token;
    } catch { continue; }
  }
  throw new Error("Gemini CLI credentials not found.\nRun: gemini auth login");
}

async function callGeminiOAuth(prompt: string, system: string): Promise<string> {
  const token = await getGeminiOAuthToken();
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini OAuth API error (${res.status}): ${err}`);
  }

  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return data.candidates[0]?.content?.parts?.[0]?.text ?? "";
}

async function callGeminiAPI(prompt: string, system: string): Promise<string> {
  const config = getConfig();
  const key = config.get("geminiApiKey") as string;
  if (!key) throw new Error("Gemini API key not set. Run: pathclaw setup");

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: system });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function callClaude(prompt: string, system: string): Promise<string> {
  const config = getConfig();
  const key = config.get("anthropicApiKey") as string;
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return (msg.content[0] as { text: string }).text;
}

async function callOllama(prompt: string, system: string): Promise<string> {
  const config = getConfig();
  const model = (config.get("ollamaModel") as string) ?? "llama3";
  const base = (config.get("ollamaBase") as string) ?? "http://localhost:11434";
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: `${system}\n\n${prompt}`, stream: false }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API error (${res.status}): ${err}`);
  }

  const data = await res.json() as { response: string };
  return data.response;
}

export async function callAI(
  prompt: string,
  system = "You are PathClaw, an expert AI file system optimizer. Be concise and practical."
): Promise<{ text: string; provider: AIProvider }> {
  const config = getConfig();
  const provider = (config.get("provider") as AIProvider) ?? "gemini-api";
  let text: string;
  switch (provider) {
    case "gemini-oauth": text = await callGeminiOAuth(prompt, system); break;
    case "gemini-api":   text = await callGeminiAPI(prompt, system); break;
    case "claude":       text = await callClaude(prompt, system); break;		
    case "groq":         text = await callGroq(prompt, system); break;
    case "ollama":       text = await callOllama(prompt, system); break;
    default: throw new Error(`Unknown provider: ${provider}`);
  }
  return { text, provider };
}