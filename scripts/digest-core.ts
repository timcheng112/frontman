import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, type SourceDefinition } from "./sources.ts";

export interface FeedItem {
  id: string;
  source: SourceDefinition;
  title: string;
  link: string;
  canonicalLink: string;
  publishedAt: Date;
  summary: string;
  normalizedTitle: string;
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

export interface FlattenedFeedItems {
  items: FeedItem[];
  duplicatesRemoved: number;
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
  const allItems = results.flatMap((result) => result.items);
  const dedupedItems = dedupeFeedItems(allItems);

  return {
    items: dedupedItems.items.sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime()),
    duplicatesRemoved: dedupedItems.duplicatesRemoved
  } satisfies FlattenedFeedItems;
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
  const selectedItems = items.slice(0, 5);
  const storyPages = selectedItems
    .map((item) => buildSimpleStoryPage(item))
    .join("\n\n");
  const proTips = buildSimpleProTips(selectedItems);

  const body = `## Opening

Yo! Here's this week's Frontman source-first digest. I pulled ${items.length} recent items from ${new Set(
    items.map((item) => item.source.id)
  ).size} sources, then kept the strongest ${selectedItems.length} for a page-by-page read.

This edition is still generated without LLM synthesis, so the summaries stay close to the source material. The goal is simple: give you enough signal to understand what moved this week, why it matters, and where to look closer if something clicks.

${storyPages}

${proTips}

## Closing Notes

That's the wrap for ${formatLongDate(issueDate)}. The lookback window for this issue was ${lookbackDays} days, and the throughline this week is pretty clear: better systems beat accidental complexity every time.

Stay curious, stay learning! 🧠
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

function buildSimpleStoryPage(item: FeedItem) {
  return `## News: ${escapeMarkdown(item.title)}

[${escapeMarkdown(item.title)}](${item.link}) comes from ${item.source.name} and was published on ${formatLongDate(item.publishedAt)}.

${normalizeSimpleSummary(item.summary)}

Why it matters: ${buildSimpleWhyItMatters(item)}`;
}

function buildSimpleProTips(items: FeedItem[]) {
  const allTags = items.flatMap((item) => item.source.tags);
  const dominantTags = Array.from(new Set(allTags));
  const proTips = [
    buildSimpleProTip(
      "Keep architecture carrying the load",
      "When tooling or frameworks hide too much structure, teams can move fast at first and then lose track of where layout, state, or styling decisions actually belong.",
      dominantTags.includes("frontend")
        ? "Keep components opinionated, document the layout and styling rules you reuse, and make the owning layer of spacing, typography, and interaction obvious."
        : "Write down the system boundaries your team depends on, then make your code structure reflect them instead of relying on accidental conventions.",
      "Clear structure makes future changes easier for both humans and AI tools. Good code + AI = unstoppable."
    ),
    buildSimpleProTip(
      "Optimize the feedback loop, not just the output",
      "A lot of engineering drag comes from workflows that technically work but make iteration slower, noisier, or harder to reason about.",
      dominantTags.includes("ai")
        ? "Favor tools and patterns that shorten the loop between idea, experiment, and validation. Small wins in build speed, readability, and traceability compound fast."
        : "Prefer simpler build steps, clearer defaults, and reusable patterns that reduce the number of moving parts you need to keep in your head.",
      "Performance is not just runtime speed. Developer experience is part of the system too, and better feedback loops help teams level up faster."
    )
  ];

  return proTips.join("\n\n");
}

function buildSimpleProTip(title: string, problem: string, fix: string, why: string) {
  return `## Pro Tip: ${title}

**The Problem** ${problem}

**The Fix** ${fix}

**Why** ${why}`;
}

function normalizeSimpleSummary(summary: string) {
  return summary.replace(/\s+/g, " ").trim();
}

function buildSimpleWhyItMatters(item: FeedItem) {
  if (item.source.tags.includes("frontend")) {
    return "Frontend teams can use this to sharpen how they structure UI systems, styling decisions, or browser-facing workflows instead of treating the platform like a black box.";
  }

  if (item.source.tags.includes("ai")) {
    return "This has direct implications for how engineers ship, evaluate, and operationalize AI-assisted workflows without adding unnecessary complexity.";
  }

  return "The practical win here is leverage: clearer systems, better workflows, and fewer hidden tradeoffs once the implementation work starts.";
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
    .map((block) => {
      const title = getFirstTagValue(block, ["title"]);
      const link = getFirstTagValue(block, ["link"]);
      const publishedRaw = getFirstTagValue(block, ["pubDate", "dc:date"]);
      const summary = getFirstTagValue(block, ["description", "content:encoded"]) ?? "";
      const publishedAt = publishedRaw ? new Date(publishedRaw) : undefined;

      if (!title || !link || !publishedAt || Number.isNaN(publishedAt.getTime())) {
        return undefined;
      }

      return {
        id: buildFeedItemId(source.id, link, title, publishedAt),
        source,
        title: cleanupText(title),
        link: cleanupText(link),
        canonicalLink: canonicalizeLink(link),
        publishedAt,
        summary: toPlainText(summary),
        normalizedTitle: normalizeTitle(title)
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => Boolean(item));
}

function parseAtomFeed(xml: string, source: SourceDefinition) {
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];

  return entryBlocks
    .map((block) => {
      const title = getFirstTagValue(block, ["title"]);
      const link = getAtomLink(block);
      const publishedRaw = getFirstTagValue(block, ["published", "updated"]);
      const summary = getFirstTagValue(block, ["summary", "content"]) ?? "";
      const publishedAt = publishedRaw ? new Date(publishedRaw) : undefined;

      if (!title || !link || !publishedAt || Number.isNaN(publishedAt.getTime())) {
        return undefined;
      }

      return {
        id: buildFeedItemId(source.id, link, title, publishedAt),
        source,
        title: cleanupText(title),
        link,
        canonicalLink: canonicalizeLink(link),
        publishedAt,
        summary: toPlainText(summary),
        normalizedTitle: normalizeTitle(title)
      } satisfies FeedItem;
    })
    .filter((item): item is FeedItem => Boolean(item));
}

function dedupeFeedItems(items: FeedItem[]) {
  const keptItems: FeedItem[] = [];
  const seenCanonicalLinks = new Map<string, FeedItem>();
  const seenTitles = new Map<string, FeedItem>();
  const orderedItems = [...items].sort(compareItemsForRetention);
  let duplicatesRemoved = 0;

  for (const item of orderedItems) {
    const existingByLink = seenCanonicalLinks.get(item.canonicalLink);
    if (existingByLink) {
      duplicatesRemoved += 1;
      continue;
    }

    if (item.normalizedTitle.length >= 24) {
      const existingByTitle = seenTitles.get(item.normalizedTitle);
      if (existingByTitle) {
        duplicatesRemoved += 1;
        continue;
      }
    }

    seenCanonicalLinks.set(item.canonicalLink, item);
    seenTitles.set(item.normalizedTitle, item);
    keptItems.push(item);
  }

  return {
    items: keptItems,
    duplicatesRemoved
  };
}

function compareItemsForRetention(left: FeedItem, right: FeedItem) {
  const priorityDelta = left.source.priority - right.source.priority;
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const summaryDelta = right.summary.length - left.summary.length;
  if (summaryDelta !== 0) {
    return summaryDelta;
  }

  const publishedDelta = right.publishedAt.getTime() - left.publishedAt.getTime();
  if (publishedDelta !== 0) {
    return publishedDelta;
  }

  return left.title.localeCompare(right.title);
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

function canonicalizeLink(value: string) {
  try {
    const url = new URL(cleanupText(value));
    url.hash = "";

    const removableParams = [
      "ref",
      "rss",
      "source",
      "feature",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
      "mkt_tok",
      "utm_campaign",
      "utm_content",
      "utm_id",
      "utm_medium",
      "utm_name",
      "utm_source",
      "utm_term"
    ];

    for (const paramName of removableParams) {
      url.searchParams.delete(paramName);
    }

    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    url.pathname = normalizedPath;
    url.search = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
    return url.toString();
  } catch {
    return cleanupText(value);
  }
}

function normalizeTitle(value: string) {
  return cleanupText(value)
    .toLowerCase()
    .replace(/\s+[-|:]\s+[^-|:]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFeedItemId(sourceId: string, link: string, title: string, publishedAt: Date) {
  const digest = createHash("sha1")
    .update(`${sourceId}|${canonicalizeLink(link)}|${normalizeTitle(title)}|${publishedAt.toISOString()}`)
    .digest("hex")
    .slice(0, 12);

  return `${sourceId}-${digest}`;
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
