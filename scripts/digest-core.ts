import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, type SourceDefinition } from "./sources.ts";

export interface FeedItem {
  id: string;
  source: SourceDefinition;
  title: string;
  link: string;
  publishedAt: Date;
  summary: string;
}

export interface BaseCliOptions {
  issueDate: Date;
  lookbackDays: number;
  force: boolean;
  skipIfExists: boolean;
}

export interface SourceFetchResult {
  source: SourceDefinition;
  items: FeedItem[];
  error?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..");
export const outputDir = path.join(repoRoot, "src", "content", "digests");

export function parseBaseCliOptions(args: string[]): BaseCliOptions {
  const issueDateValue = getOptionValue(args, "--date");
  const lookbackDaysValue = getOptionValue(args, "--lookback-days");
  const issueDate = issueDateValue ? parseIsoDate(issueDateValue) : stripTime(new Date());
  const lookbackDays = lookbackDaysValue ? Number.parseInt(lookbackDaysValue, 10) : 7;

  if (Number.isNaN(issueDate.getTime())) {
    throw new Error("Invalid --date value. Use YYYY-MM-DD.");
  }

  if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
    throw new Error("Invalid --lookback-days value. Use a positive integer.");
  }

  return {
    issueDate,
    lookbackDays,
    force: args.includes("--force"),
    skipIfExists: args.includes("--skip-if-exists")
  };
}

export function getOptionValue(args: string[], optionName: string) {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex === -1) {
    return undefined;
  }

  const value = args[optionIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}.`);
  }

  return value;
}

export function parseIsoDate(value: string) {
  return stripTime(new Date(`${value}T00:00:00Z`));
}

export function stripTime(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export function startOfIsoWeek(date: Date) {
  const normalized = stripTime(date);
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() - day + 1);
  return normalized;
}

export async function ensureDigestSlot(issueDate: Date, force: boolean, skipIfExists = false) {
  const weekKey = formatIsoDate(startOfIsoWeek(issueDate));
  const existingFile = await findExistingDigestForWeek(weekKey);

  if (existingFile && !force) {
    if (skipIfExists) {
      return existingFile;
    }

    throw new Error(
      `A digest already exists for ISO week ${weekKey}: ${path.relative(repoRoot, existingFile)}. ` +
        "Re-run with --force to intentionally create another file for the same week."
    );
  }

  return undefined;
}

export async function fetchRecentSourceItems(options: BaseCliOptions) {
  const cutoffDate = stripTime(addDays(options.issueDate, -options.lookbackDays));
  const issueDateEnd = endOfDay(options.issueDate);

  return Promise.all(
    SOURCES.map(async (source) => {
      try {
        const items = await fetchSourceItems(source, cutoffDate, issueDateEnd);
        return {
          source,
          items
        } satisfies SourceFetchResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          source,
          items: [],
          error: message
        } satisfies SourceFetchResult;
      }
    })
  );
}

export function flattenRecentItems(results: SourceFetchResult[]) {
  return results
    .flatMap((result) => result.items)
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());
}

export function buildDigestSlug(issueDate: Date) {
  return `${formatIsoDate(issueDate)}-frontend-ai-digest`;
}

export function buildDigestOutputPath(issueDate: Date) {
  return path.join(outputDir, `${buildDigestSlug(issueDate)}.md`);
}

export async function writeDigestFile(issueDate: Date, markdown: string) {
  const outputPath = buildDigestOutputPath(issueDate);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return outputPath;
}

export function buildSimpleDigestMarkdown(items: FeedItem[], issueDate: Date, lookbackDays: number) {
  const uniqueTags = Array.from(new Set(items.flatMap((item) => item.source.tags))).slice(0, 6);
  const sections = SOURCES.map((source) => ({
    source,
    items: items.filter((item) => item.source.id === source.id)
  })).filter((section) => section.items.length > 0);

  const quickScan = items
    .slice(0, 5)
    .map(
      (item) =>
        `- [${escapeMarkdown(item.title)}](${item.link}) — ${item.source.name} (${formatLongDate(item.publishedAt, {
          year: false
        })})`
    )
    .join("\n");

  const sourceSections = sections
    .map(
      ({ source, items: sourceItems }) => `### ${source.name}

${sourceItems
  .map(
    (item) => `- [${escapeMarkdown(item.title)}](${item.link}) — ${formatLongDate(item.publishedAt)}
  ${item.summary}`
  )
  .join("\n\n")}`
    )
    .join("\n\n");

  const body = `## This week at a glance

This MVP digest was generated from ${items.length} recent feed items across ${sections.length} sources.
It is a source-first draft without LLM ranking or rewriting, so the structure is intentionally simple and easy to edit.

## Quick scan

${quickScan}

## Source roundup

${sourceSections}

## Notes

- Generated on ${formatLongDate(issueDate)}.
- Current lookback window: ${lookbackDays} days.
- Phase 4 can replace the simple grouping above with ranking, synthesis, and editorial writing.
`;

  const description = `A generated roundup of frontend and AI updates for ${formatLongDate(issueDate)}.`;
  const title = `Frontend & AI Digest — ${formatLongDate(issueDate)}`;
  const readTime = estimateReadTime(body);

  return buildMarkdownDocument({
    title,
    description,
    pubDate: issueDate,
    readTime,
    tags: uniqueTags,
    body
  });
}

export function buildMarkdownDocument(input: {
  title: string;
  description: string;
  pubDate: Date;
  readTime: string;
  tags: string[];
  body: string;
}) {
  return `---
title: "${escapeFrontmatterString(input.title)}"
description: "${escapeFrontmatterString(input.description)}"
pubDate: ${formatIsoDate(input.pubDate)}
readTime: "${escapeFrontmatterString(input.readTime)}"
tags: [${input.tags.map((tag) => `"${escapeFrontmatterString(tag)}"`).join(", ")}]
---

${input.body.trim()}
`;
}

export function estimateReadTime(content: string) {
  const words = content.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min`;
}

export function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatLongDate(
  date: Date,
  options: {
    year?: boolean;
  } = {}
) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "long",
    year: options.year === false ? undefined : "numeric",
    timeZone: "UTC"
  }).format(date);
}

async function findExistingDigestForWeek(weekKey: string) {
  try {
    const entries = await readdir(outputDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      const match = entry.name.match(/^(\d{4}-\d{2}-\d{2})-/);
      if (!match) {
        continue;
      }

      const fileWeekKey = formatIsoDate(startOfIsoWeek(parseIsoDate(match[1])));
      if (fileWeekKey === weekKey) {
        return path.join(outputDir, entry.name);
      }
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }

  return undefined;
}

async function fetchSourceItems(source: SourceDefinition, cutoffDate: Date, issueDate: Date) {
  const response = await fetch(source.feedUrl, {
    headers: {
      "user-agent": "frontman-digest-generator/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xml = await response.text();
  const items = parseFeed(xml, source)
    .filter((item) => item.publishedAt >= cutoffDate && item.publishedAt <= issueDate)
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime())
    .slice(0, source.maxItems);

  return items;
}

function parseFeed(xml: string, source: SourceDefinition) {
  if (/<feed[\s>]/i.test(xml)) {
    return parseAtomFeed(xml, source);
  }

  return parseRssFeed(xml, source);
}

function parseRssFeed(xml: string, source: SourceDefinition) {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  return itemBlocks
    .map((block, index) => {
      const title = getFirstTagValue(block, ["title"]);
      const link = getFirstTagValue(block, ["link"]);
      const publishedRaw = getFirstTagValue(block, ["pubDate", "dc:date"]);
      const summary = getFirstTagValue(block, ["description", "content:encoded"]) ?? "";
      const publishedAt = publishedRaw ? new Date(publishedRaw) : undefined;

      if (!title || !link || !publishedAt || Number.isNaN(publishedAt.getTime())) {
        return undefined;
      }

      return {
        id: `${source.id}-${index + 1}`,
        source,
        title: cleanupText(title),
        link: cleanupText(link),
        publishedAt,
        summary: toPlainText(summary)
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => Boolean(item));
}

function parseAtomFeed(xml: string, source: SourceDefinition) {
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];

  return entryBlocks
    .map((block, index) => {
      const title = getFirstTagValue(block, ["title"]);
      const link = getAtomLink(block);
      const publishedRaw = getFirstTagValue(block, ["published", "updated"]);
      const summary = getFirstTagValue(block, ["summary", "content"]) ?? "";
      const publishedAt = publishedRaw ? new Date(publishedRaw) : undefined;

      if (!title || !link || !publishedAt || Number.isNaN(publishedAt.getTime())) {
        return undefined;
      }

      return {
        id: `${source.id}-${index + 1}`,
        source,
        title: cleanupText(title),
        link,
        publishedAt,
        summary: toPlainText(summary)
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => Boolean(item));
}

function getFirstTagValue(xmlBlock: string, tagNames: string[]) {
  for (const tagName of tagNames) {
    const pattern = new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, "i");
    const match = xmlBlock.match(pattern);
    if (match?.[1]) {
      return stripCdata(match[1]);
    }
  }

  return undefined;
}

function getAtomLink(xmlBlock: string) {
  const alternateMatch = xmlBlock.match(/<link\b[^>]*href="([^"]+)"[^>]*rel="alternate"[^>]*\/?>/i);
  if (alternateMatch?.[1]) {
    return cleanupText(alternateMatch[1]);
  }

  const simpleMatch = xmlBlock.match(/<link\b[^>]*href="([^"]+)"[^>]*\/?>/i);
  if (simpleMatch?.[1]) {
    return cleanupText(simpleMatch[1]);
  }

  const tagValue = getFirstTagValue(xmlBlock, ["link"]);
  return tagValue ? cleanupText(tagValue) : undefined;
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function toPlainText(value: string) {
  const withoutTags = decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutTags) {
    return "No summary provided by the source.";
  }

  return withoutTags.length > 220 ? `${withoutTags.slice(0, 217).trimEnd()}...` : withoutTags;
}

function cleanupText(value: string) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeMarkdown(value: string) {
  return value.replace(/([\[\]])/g, "\\$1");
}

function escapeFrontmatterString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
