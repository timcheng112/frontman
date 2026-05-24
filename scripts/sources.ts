export type SourceCategory = "frontend" | "ai";

export interface SourceDefinition {
  id: string;
  name: string;
  feedUrl: string;
  category: SourceCategory;
  tags: string[];
  maxItems: number;
}

export const SOURCES: SourceDefinition[] = [
  {
    id: "web-dev",
    name: "web.dev",
    feedUrl: "https://web.dev/feed.xml",
    category: "frontend",
    tags: ["frontend", "web-platform"],
    maxItems: 3
  },
  {
    id: "mdn-blog",
    name: "MDN Blog",
    feedUrl: "https://developer.mozilla.org/en-US/blog/rss.xml",
    category: "frontend",
    tags: ["frontend", "browser"],
    maxItems: 3
  },
  {
    id: "github-changelog",
    name: "GitHub Changelog",
    feedUrl: "https://github.blog/changelog/feed/",
    category: "frontend",
    tags: ["tooling", "developer-tools"],
    maxItems: 3
  },
  {
    id: "openai-news",
    name: "OpenAI News",
    feedUrl: "https://openai.com/news/rss.xml",
    category: "ai",
    tags: ["ai", "llm"],
    maxItems: 3
  }
];
