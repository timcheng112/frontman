import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { repoRoot } from "./digest-core.ts";

interface FrontmatterData {
  title?: string;
  description?: string;
  pubDate?: string;
}

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.log("Skipping Telegram notification because TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured.");
    return;
  }

  const digestPathValue = process.env.FRONTMAN_DIGEST_PATH;
  const digestUrl = process.env.FRONTMAN_DIGEST_URL;

  if (!digestPathValue) {
    throw new Error("FRONTMAN_DIGEST_PATH is required.");
  }

  if (!digestUrl) {
    throw new Error("FRONTMAN_DIGEST_URL is required.");
  }

  const digestPath = path.isAbsolute(digestPathValue) ? digestPathValue : path.join(repoRoot, digestPathValue);
  const markdown = await readFile(digestPath, "utf8");
  const frontmatter = parseFrontmatter(markdown);
  const title = frontmatter.title ?? path.basename(digestPath, ".md");
  const description = frontmatter.description ?? "A new Frontman digest is live.";
  const pubDate = frontmatter.pubDate ? formatPublicationDate(frontmatter.pubDate) : undefined;

  const message = [
    "<b>Frontman Digest Published</b>",
    "",
    `<b>${escapeHtml(title)}</b>`,
    pubDate ? `<i>${escapeHtml(pubDate)}</i>` : undefined,
    "",
    escapeHtml(description),
    "",
    `<a href="${escapeHtmlAttribute(digestUrl)}">Read the digest</a>`
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: false
    })
  });

  const body = await safeParseJson(response);
  if (!response.ok || body?.ok === false) {
    const descriptionText =
      typeof body?.description === "string" ? body.description : `HTTP ${response.status}`;
    throw new Error(`Telegram Bot API request failed: ${descriptionText}`);
  }

  console.log(`Sent Telegram notification for ${title}`);
}

function parseFrontmatter(markdown: string): FrontmatterData {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
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

function formatPublicationDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

async function safeParseJson(response: Response) {
  try {
    return (await response.json()) as {
      ok?: boolean;
      description?: string;
    };
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Telegram notification failed: ${message}`);
  process.exitCode = 1;
});
