import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  buildMarkdownDocument,
  ensureDigestSlot,
  estimateReadTime,
  fetchRecentSourceItems,
  flattenRecentItems,
  formatIsoDate,
  formatLongDate,
  getOptionValue,
  parseBaseCliOptions,
  repoRoot,
  type FeedItem,
  writeDigestFile
} from "./digest-core.ts";
import {
  createStructuredResponse,
  createTextResponse,
  DEFAULT_FRONTMAN_MODEL,
  type ReasoningEffort
} from "./openai.ts";

interface LlmCliOptions {
  issueDate: Date;
  lookbackDays: number;
  force: boolean;
  skipIfExists: boolean;
  model: string;
  reasoningEffort: ReasoningEffort;
  maxItems: number;
}

interface RankingPlan {
  title: string;
  description: string;
  summary: string;
  tags: string[];
  selectedItemIds: string[];
  sections: Array<{
    title: string;
    angle: string;
    itemIds: string[];
  }>;
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const existingFile = await ensureDigestSlot(options.issueDate, options.force, options.skipIfExists);

  if (existingFile) {
    console.log(`Skipping digest generation because a file already exists: ${path.relative(repoRoot, existingFile)}`);
    return;
  }

  console.log(
    `Generating LLM digest for ${formatIsoDate(options.issueDate)} with model ${options.model} ` +
      `and a ${options.lookbackDays}-day lookback window.`
  );

  const prompt = await loadPromptFile();
  const results = await fetchRecentSourceItems(options);

  for (const result of results) {
    if (result.error) {
      console.warn(`- ${result.source.name}: skipped (${result.error})`);
      continue;
    }

    console.log(`- ${result.source.name}: ${result.items.length} recent item(s)`);
  }

  const { items, duplicatesRemoved } = flattenRecentItems(results);
  if (duplicatesRemoved > 0) {
    console.log(`- Deduped ${duplicatesRemoved} overlapping item(s) across sources`);
  }

  if (items.length === 0) {
    throw new Error("No recent feed items were found. Try increasing --lookback-days or review the source feeds.");
  }

  const plan = await rankDigestItems({
    prompt,
    items,
    options
  });

  const normalizedPlan = normalizeRankingPlan(plan, items, options.maxItems, options.issueDate);
  const markdownBody = sanitizeMarkdownBody(
    await writeDigestBody({
      prompt,
      items,
      plan: normalizedPlan,
      options
    })
  );

  const markdown = buildMarkdownDocument({
    title: normalizedPlan.title,
    description: normalizedPlan.description,
    pubDate: options.issueDate,
    readTime: estimateReadTime(markdownBody),
    tags: normalizedPlan.tags,
    body: markdownBody
  });

  const outputPath = await writeDigestFile(options.issueDate, markdown);
  console.log(`Created ${path.relative(repoRoot, outputPath)}`);
}

function parseCliOptions(args: string[]): LlmCliOptions {
  const baseOptions = parseBaseCliOptions(args);
  const model = getOptionValue(args, "--model") ?? DEFAULT_FRONTMAN_MODEL;
  const reasoningEffort = (getOptionValue(args, "--reasoning-effort") ?? "low") as ReasoningEffort;
  const maxItemsValue = getOptionValue(args, "--max-items");
  const maxItems = maxItemsValue ? Number.parseInt(maxItemsValue, 10) : 5;

  const allowedEfforts = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);
  if (!allowedEfforts.has(reasoningEffort)) {
    throw new Error("Invalid --reasoning-effort value. Use none, minimal, low, medium, high, or xhigh.");
  }

  if (!Number.isFinite(maxItems) || maxItems < 3) {
    throw new Error("Invalid --max-items value. Use an integer of 3 or greater.");
  }

  return {
    ...baseOptions,
    model,
    reasoningEffort,
    maxItems
  };
}

async function loadPromptFile() {
  const promptPath = path.join(repoRoot, "prompts", "frontman.md");
  return readFile(promptPath, "utf8");
}

async function rankDigestItems(input: {
  prompt: string;
  items: FeedItem[];
  options: LlmCliOptions;
}) {
  const rankingInput = JSON.stringify(
    {
      issue_date: formatIsoDate(input.options.issueDate),
      lookback_days: input.options.lookbackDays,
      max_selected_items: input.options.maxItems,
      items: input.items.map(serializeFeedItem)
    },
    null,
    2
  );

  return createStructuredResponse<RankingPlan>({
    model: input.options.model,
    reasoningEffort: input.options.reasoningEffort,
    instructions: `${input.prompt}

Task: Rank the available digest items and return a structured editorial plan.

Return JSON that:
- picks the strongest stories for this issue
- proposes a digest title and description
- selects concise tags
- groups the selected stories into 2 to 4 sections
- keeps the selected item ids grounded in the provided list`,
    input: rankingInput,
    maxOutputTokens: 3500,
    textFormat: {
      type: "json_schema",
      name: "frontman_digest_ranking",
      description: "Structured ranking and story selection for a weekly Frontman issue.",
      strict: true,
      schema: buildRankingSchema(input.options.maxItems)
    }
  });
}

async function writeDigestBody(input: {
  prompt: string;
  items: FeedItem[];
  plan: RankingPlan;
  options: LlmCliOptions;
}) {
  const itemMap = new Map(input.items.map((item) => [item.id, item]));
  const selectedItems = input.plan.selectedItemIds
    .map((itemId) => itemMap.get(itemId))
    .filter((item): item is FeedItem => Boolean(item));
  const writerInput = JSON.stringify(
    {
      issue_date: formatIsoDate(input.options.issueDate),
      title: input.plan.title,
      description: input.plan.description,
      summary: input.plan.summary,
      tags: input.plan.tags,
      sections: input.plan.sections,
      selected_items: selectedItems.map(serializeFeedItem)
    },
    null,
    2
  );

  return createTextResponse({
    model: input.options.model,
    reasoningEffort: input.options.reasoningEffort,
    instructions: `${input.prompt}

Task: Write the final Frontman article body in markdown only.

Requirements:
- Do not include YAML frontmatter.
- Start with a level-2 heading: "## Opening".
- After the opening, write one level-2 section per selected story using this format: "## News: <short title>".
- After the story pages, write 2 level-2 pro tip sections using this format: "## Pro Tip: <title>".
- End with a final level-2 heading: "## Closing Notes".
- Mention only the selected items from the input.
- Keep each story title linked in markdown.
- Each story summary should explain the core idea, the important details, and why it matters in practical engineering terms.
- Each story summary should usually be detailed enough that a reader can skip the source article unless they want the full original context.
- Each pro tip should include these bold labels in order: "**The Problem**", "**The Fix**", and "**Why**".
- Ground pro tips in themes that genuinely emerge from the selected stories and Frontman's engineering worldview.
- Keep the opening and closing short, warm, and energetic.
- Do not mention the model, prompt, or that the article was AI-generated.`,
    input: writerInput,
    maxOutputTokens: 5000
  });
}

function normalizeRankingPlan(plan: RankingPlan, items: FeedItem[], maxItems: number, issueDate: Date): RankingPlan {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const selectedItemIds = Array.from(new Set(plan.selectedItemIds)).filter((itemId) => itemMap.has(itemId)).slice(0, maxItems);

  if (selectedItemIds.length < 3) {
    const fallbackIds = items.slice(0, maxItems).map((item) => item.id);
    selectedItemIds.splice(0, selectedItemIds.length, ...fallbackIds);
  }

  const sections = plan.sections
    .map((section) => ({
      title: cleanText(section.title, "Top stories"),
      angle: cleanText(section.angle, "Why these items matter this week."),
      itemIds: Array.from(new Set(section.itemIds)).filter((itemId) => selectedItemIds.includes(itemId))
    }))
    .filter((section) => section.itemIds.length > 0)
    .slice(0, 4);

  const normalizedSections =
    sections.length > 0
      ? sections
      : buildFallbackSections(selectedItemIds);

  const tags = Array.from(
    new Set([
      ...plan.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      ...selectedItemIds.flatMap((itemId) => itemMap.get(itemId)?.source.tags ?? [])
    ])
  ).slice(0, 6);

  return {
    title: cleanText(plan.title, `Frontend & AI Digest — ${formatLongDate(issueDate)}`),
    description: clampText(
      cleanText(plan.description, `A weekly Frontman digest for ${formatLongDate(issueDate)}.`),
      200
    ),
    summary: cleanText(plan.summary, "A practical roundup of frontend and AI engineering updates."),
    tags: tags.length > 0 ? tags : ["frontend", "ai"],
    selectedItemIds,
    sections: normalizedSections
  };
}

function buildFallbackSections(selectedItemIds: string[]) {
  const midpoint = Math.ceil(selectedItemIds.length / 2);
  const primaryIds = selectedItemIds.slice(0, midpoint);
  const secondaryIds = selectedItemIds.slice(midpoint);

  if (secondaryIds.length === 0) {
    return [
      {
        title: "Top stories",
        angle: "The most relevant updates from this week's sources.",
        itemIds: primaryIds
      },
      {
        title: "Why it matters",
        angle: "The practical engineering implications behind the week's stories.",
        itemIds: primaryIds.slice(0, Math.min(2, primaryIds.length))
      }
    ];
  }

  return [
    {
      title: "Top stories",
      angle: "The most relevant updates from this week's sources.",
      itemIds: primaryIds
    },
    {
      title: "What else stood out",
      angle: "Secondary stories that still matter for engineering teams to track.",
      itemIds: secondaryIds
    }
  ];
}

function buildRankingSchema(maxItems: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "description", "summary", "tags", "selectedItemIds", "sections"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      summary: { type: "string" },
      tags: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: { type: "string" }
      },
      selectedItemIds: {
        type: "array",
        minItems: 3,
        maxItems,
        items: { type: "string" }
      },
      sections: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "angle", "itemIds"],
          properties: {
            title: { type: "string" },
            angle: { type: "string" },
            itemIds: {
              type: "array",
              minItems: 1,
              maxItems,
              items: { type: "string" }
            }
          }
        }
      }
    }
  };
}

function serializeFeedItem(item: FeedItem) {
  return {
    id: item.id,
    title: item.title,
    link: item.link,
    summary: item.summary,
    published_at: item.publishedAt.toISOString(),
    source: {
      id: item.source.id,
      name: item.source.name,
      category: item.source.category,
      tags: item.source.tags
    }
  };
}

function sanitizeMarkdownBody(markdown: string) {
  const unwrapped = markdown
    .replace(/^```(?:markdown)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (!unwrapped.startsWith("---")) {
    return unwrapped;
  }

  const closingIndex = unwrapped.indexOf("\n---", 3);
  if (closingIndex === -1) {
    return unwrapped;
  }

  return unwrapped.slice(closingIndex + 4).trim();
}

function cleanText(value: string | undefined, fallback: string) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text && text.length > 0 ? text : fallback;
}

function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`LLM digest generation failed: ${message}`);
  process.exitCode = 1;
});
