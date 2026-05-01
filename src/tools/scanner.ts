import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createReadStream } from "fs";
import glob from "fast-glob";
import prettyBytes from "pretty-bytes";
import pLimit from "p-limit";

export interface FileEntry {
  path: string;
  size: number;
  ext: string;
  modified: Date;
  hash?: string;
}

export interface ScanResult {
  junkFiles: FileEntry[];
  largeFiles: FileEntry[];
  duplicates: FileEntry[][];
  tempFiles: FileEntry[];
  totalSize: number;
  totalJunkSize: number;
}

const JUNK_PATTERNS = [
  "**/*.tmp", "**/*.temp", "**/*.log",
  "**/*.bak", "**/*.old", "**/*.dmp",
  "**/Thumbs.db", "**/.DS_Store",
  "**/desktop.ini", "**/*.crdownload",
];

const TEMP_DIRS = [
  process.env["TEMP"] ?? "",
  process.env["TMP"] ?? "",
  "C:\\Windows\\Temp",
  "/tmp", "/var/tmp",
].filter(Boolean);

const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function scanDirectory(scanPath: string, deep = false): Promise<ScanResult> {
  const limit = pLimit(8);

  const allFiles = await glob("**/*", {
    cwd: scanPath,
    absolute: true,
    onlyFiles: true,
    dot: deep,
    ignore: [
  "**/node_modules/**",
  "**/.git/**",
  "**/Config.Msi/**",
  "**/System Volume Information/**",
  "**/Recovery/**",
  "**/$RECYCLE.BIN/**",
  "**/Windows/**",
  "**/Program Files/**",
  "**/Program Files (x86)/**",
],
  });

  const entries: FileEntry[] = [];
  await Promise.all(
    allFiles.map((filePath) =>
      limit(async () => {
        try {
          const stat = await fs.stat(filePath);
          entries.push({
            path: filePath,
            size: stat.size,
            ext: path.extname(filePath).toLowerCase(),
            modified: stat.mtime,
          });
        } catch { /* skip unreadable */ }
      })
    )
  );

  // Junk files
  const junkGlobs = await glob(JUNK_PATTERNS, {
    cwd: scanPath,
    absolute: true,
    onlyFiles: true,
    dot: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });
  const junkSet = new Set(junkGlobs);
  const junkFiles = entries.filter((e) => junkSet.has(e.path));

  // Temp files
  const tempFiles = entries.filter((e) =>
    TEMP_DIRS.some((d) => e.path.startsWith(d))
  );

  // Large files
  const largeFiles = entries
    .filter((e) => e.size >= LARGE_FILE_THRESHOLD)
    .sort((a, b) => b.size - a.size)
    .slice(0, 50);

  // Duplicates via SHA-256
  const sizeGroups = new Map<number, FileEntry[]>();
  for (const entry of entries) {
    if (!sizeGroups.has(entry.size)) sizeGroups.set(entry.size, []);
    sizeGroups.get(entry.size)!.push(entry);
  }

  const potentialDupes = [...sizeGroups.values()].filter((g) => g.length > 1);
  const hashGroups = new Map<string, FileEntry[]>();

  await Promise.all(
    potentialDupes.flat().map((entry) =>
      limit(async () => {
        try {
          entry.hash = await hashFile(entry.path);
          if (!hashGroups.has(entry.hash)) hashGroups.set(entry.hash, []);
          hashGroups.get(entry.hash)!.push(entry);
        } catch { /* skip */ }
      })
    )
  );

  const duplicates = [...hashGroups.values()].filter((g) => g.length > 1);

  const totalSize = entries.reduce((s, e) => s + e.size, 0);
  const totalJunkSize =
    [...junkFiles, ...tempFiles].reduce((s, e) => s + e.size, 0) +
    duplicates.reduce((s, group) =>
      s + group.slice(1).reduce((ss, e) => ss + e.size, 0), 0
    );

  return { junkFiles, largeFiles, duplicates, tempFiles, totalSize, totalJunkSize };
}

export function formatScanResult(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`Junk/temp files: ${result.junkFiles.length + result.tempFiles.length}`);
  lines.push(`Duplicate groups: ${result.duplicates.length}`);
  lines.push(`Large files (>100MB): ${result.largeFiles.length}`);
  lines.push(`Total scanned size: ${prettyBytes(result.totalSize)}`);
  lines.push(`Recoverable space: ${prettyBytes(result.totalJunkSize)}`);

  if (result.largeFiles.length > 0) {
    lines.push("\nTop large files:");
    for (const f of result.largeFiles.slice(0, 5)) {
      lines.push(`  ${prettyBytes(f.size)}  ${f.path}`);
    }
  }

  if (result.duplicates.length > 0) {
    lines.push("\nDuplicate groups (first 3):");
    for (const group of result.duplicates.slice(0, 3)) {
      lines.push(`  ${prettyBytes(group[0].size)} x${group.length} copies:`);
      for (const f of group) lines.push(`    ${f.path}`);
    }
  }

  return lines.join("\n");
}