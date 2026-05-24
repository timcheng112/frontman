import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseIsoDate, repoRoot, startOfIsoWeek, formatIsoDate } from "./digest-core.ts";

interface FrontmatterData {
  title?: string;
  description?: string;
  pubDate?: string;
}

const digestsDir = path.join(repoRoot, "src", "content", "digests");

async function main() {
  const entries = (await readdir(digestsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0) {
    console.log("No digest markdown files found in src/content/digests. Empty-state mode is valid.");
    return;
  }

  const seenSlugs = new Set<string>();
  const seenWeeks = new Map<string, string>();

  for (const fileName of entries) {
    const slug = fileName.slice(0, -3);
    if (seenSlugs.has(slug)) {
      throw new Error(`Duplicate digest slug detected: ${slug}`);
    }
    seenSlugs.add(slug);

    const filePath = path.join(digestsDir, fileName);
    const fileDateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})-/);
    if (!fileDateMatch) {
      throw new Error(`Digest filename must start with YYYY-MM-DD: ${fileName}`);
    }

    const markdown = await readFile(filePath, "utf8");
    const frontmatter = parseFrontmatter(markdown);

    if (!frontmatter.title) {
      throw new Error(`Missing title in ${fileName}`);
    }

    if (!frontmatter.description) {
      throw new Error(`Missing description in ${fileName}`);
    }

    if (!frontmatter.pubDate) {
      throw new Error(`Missing pubDate in ${fileName}`);
    }

    if (frontmatter.description.length > 200) {
      throw new Error(`Description is too long in ${fileName}. Keep it under 200 characters.`);
    }

    const fileDate = fileDateMatch[1];
    const pubDate = frontmatter.pubDate;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(pubDate)) {
      throw new Error(`pubDate must use YYYY-MM-DD in ${fileName}`);
    }

    if (fileDate !== pubDate) {
      throw new Error(`Filename date and pubDate do not match in ${fileName}`);
    }

    const parsedDate = parseIsoDate(pubDate);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid pubDate value in ${fileName}`);
    }

    const weekKey = formatIsoDate(startOfIsoWeek(parsedDate));
    const existingWeekFile = seenWeeks.get(weekKey);
    if (existingWeekFile) {
      throw new Error(
        `Duplicate digest week detected for ISO week ${weekKey}: ${existingWeekFile} and ${fileName}`
      );
    }
    seenWeeks.set(weekKey, fileName);

    validateDigestStructure(fileName, markdown);
  }

  console.log(`Validated ${entries.length} digest file(s) in src/content/digests.`);
}

function parseFrontmatter(markdown: string): FrontmatterData {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("Missing YAML frontmatter block.");
  }

  const data: FrontmatterData = {};

  for (const rawLine of match[1].split("\n")) {
    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    let value = rawLine.slice(separatorIndex + 1).trim();

    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
    }

    if (key === "title" || key === "description" || key === "pubDate") {
      data[key] = value;
    }
  }

  return data;
}

function validateDigestStructure(fileName: string, markdown: string) {
  const headings = Array.from(markdown.matchAll(/^##\s+(.+)$/gm)).map((match) => match[1].trim());

  if (headings.length < 4) {
    throw new Error(`Digest body needs at least 4 level-2 sections in ${fileName}`);
  }

  if (headings[0] !== "Opening") {
    throw new Error(`Digest body must start with "## Opening" in ${fileName}`);
  }

  if (headings.at(-1) !== "Closing Notes") {
    throw new Error(`Digest body must end with "## Closing Notes" in ${fileName}`);
  }

  if (!headings.some((heading) => heading.startsWith("News: ") || heading.startsWith("Story: "))) {
    throw new Error(`Digest body must include at least one "## News: ..." section in ${fileName}`);
  }

  if (!headings.some((heading) => heading.startsWith("Pro Tip: "))) {
    throw new Error(`Digest body must include at least one "## Pro Tip: ..." section in ${fileName}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Digest validation failed: ${message}`);
  process.exitCode = 1;
});
