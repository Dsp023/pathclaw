# 🦅 PathClaw

**AI-powered file system optimizer CLI agent**

PathClaw scans, organizes, and optimizes your file system using AI. It detects junk files, finds duplicates, organizes folders semantically, and clears caches — all from the terminal with a conversational AI interface.

## Features

- **🔍 Smart Scanning** — Detects junk files, temp files, duplicates (SHA-256), and large files
- **📂 AI Organization** — Semantically groups files into meaningful folders (not just by extension)
- **🧹 Safe Cleanup** — Clears temp files, caches, and DNS with safety guardrails
- **⚡ System Optimization** — RAM clearing, startup analysis, and system health checks
- **💬 Natural Language Chat** — Just tell PathClaw what to do in plain English
- **🔒 Safety First** — Blacklisted system paths, confirmation prompts, and shell command allowlists

## Installation

```bash
npm install -g pathclaw
```

## Quick Start

```bash
# 1. Configure your AI provider
pathclaw setup

# 2. Check system health
pathclaw status

# 3. Scan for junk files
pathclaw scan ~/Downloads

# 4. Chat with PathClaw
pathclaw chat
```

## Commands

| Command | Description |
|---------|-------------|
| `pathclaw setup` | Configure AI provider and preferences |
| `pathclaw status` | Show disk, RAM, and system health |
| `pathclaw scan [path]` | Scan for junk, temp files, duplicates, large files |
| `pathclaw organize [path]` | AI semantic folder organization |
| `pathclaw clear` | Clear junk, temp, and cache files |
| `pathclaw optimize` | Full system optimization |
| `pathclaw chat` | Natural language mode |

## AI Providers

PathClaw supports multiple AI backends:

| Provider | Setup | Cost |
|----------|-------|------|
| **Gemini OAuth** | Reuses Gemini CLI login | Free |
| **Gemini API** | Requires API key | Free tier available |
| **Claude** | Requires Anthropic API key | Paid |
| **Groq** | Requires Groq API key | Free tier |
| **Ollama** | Local models | Free (runs locally) |

Run `pathclaw setup` to configure your preferred provider.

## Command Options

### Scan
```bash
pathclaw scan ~/Downloads        # Scan a directory
pathclaw scan . --deep           # Deep scan including hidden files
pathclaw scan . --no-ai          # Skip AI analysis
```

### Organize
```bash
pathclaw organize ~/Desktop                     # AI-organize a folder
pathclaw organize ~/Documents --dry-run         # Preview without moving
pathclaw organize . --rules "group by project"  # Custom rules
```

### Clear
```bash
pathclaw clear           # Clear junk + cache
pathclaw clear --temp    # Temp files only
pathclaw clear --cache   # Cache only
pathclaw clear --force   # Skip confirmation
```

### Optimize
```bash
pathclaw optimize            # Full optimization
pathclaw optimize --ram      # Clear RAM cache
pathclaw optimize --startup  # Analyze startup programs
```

## Safety

PathClaw never touches:
- `C:\Windows`, `Program Files`, system directories
- `.git`, `node_modules`, `.ssh`, `.aws`, `.kube`
- `.env`, `.pem`, `.key`, private key files

Every destructive action shows a preview table and requires explicit confirmation. Shell commands are restricted to an allowlist and require a second confirmation.

## License

ISC
