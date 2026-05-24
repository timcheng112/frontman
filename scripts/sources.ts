export type SourceCategory = "frontend" | "ai";

export interface SourceDefinition {
  id: string;
  name: string;
  feedUrl: string;
  category: SourceCategory;
  tags: string[];
  maxItems: number;
  priority: number;
}

export const SOURCES: SourceDefinition[] = [
  {
    id: "web-dev",
    name: "web.dev",
    feedUrl: "https://web.dev/feed.xml",
    category: "frontend",
    tags: ["frontend", "web-platform"],
    maxItems: 3,
    priority: 10
  },
  {
    id: "mdn-blog",
    name: "MDN Blog",
    feedUrl: "https://developer.mozilla.org/en-US/blog/rss.xml",
    category: "frontend",
    tags: ["frontend", "browser"],
    maxItems: 3,
    priority: 10
  },
  {
    id: "react-blog",
    name: "React Blog",
    feedUrl: "https://react.dev/blog/rss.xml",
    category: "frontend",
    tags: ["frontend", "react"],
    maxItems: 3,
    priority: 10
  },
  {
    id: "frontend-masters-blog",
    name: "Frontend Masters Blog",
    feedUrl: "https://frontendmasters.com/blog/feed/",
    category: "frontend",
    tags: ["frontend", "engineering"],
    maxItems: 3,
    priority: 20
  },
  {
    id: "github-changelog",
    name: "GitHub Changelog",
    feedUrl: "https://github.blog/changelog/feed/",
    category: "frontend",
    tags: ["tooling", "developer-tools"],
    maxItems: 3,
    priority: 20
  },
  {
    id: "github-engineering",
    name: "GitHub Engineering",
    feedUrl: "https://github.blog/engineering/feed/",
    category: "frontend",
    tags: ["engineering", "developer-tools"],
    maxItems: 2,
    priority: 20
  },
  {
    id: "duolingo-blog",
    name: "Duolingo Blog",
    feedUrl: "https://blog.duolingo.com/rss/",
    category: "frontend",
    tags: ["engineering", "mobile"],
    maxItems: 1,
    priority: 50
  },
  {
    id: "netflix-techblog",
    name: "Netflix TechBlog",
    feedUrl: "https://netflixtechblog.medium.com/feed",
    category: "frontend",
    tags: ["engineering", "infrastructure"],
    maxItems: 1,
    priority: 45
  },
  {
    id: "meta-engineering",
    name: "Meta Engineering",
    feedUrl: "https://engineering.fb.com/feed/",
    category: "frontend",
    tags: ["engineering", "infrastructure"],
    maxItems: 1,
    priority: 35
  },
  {
    id: "cloudflare-blog",
    name: "Cloudflare Blog",
    feedUrl: "https://blog.cloudflare.com/rss/",
    category: "frontend",
    tags: ["engineering", "infrastructure"],
    maxItems: 1,
    priority: 30
  },
  {
    id: "spotify-engineering",
    name: "Spotify Engineering",
    feedUrl: "https://engineering.atspotify.com/feed/",
    category: "frontend",
    tags: ["engineering", "developer-experience"],
    maxItems: 1,
    priority: 40
  },
  {
    id: "frontend-focus",
    name: "Frontend Focus",
    feedUrl: "https://frontendfoc.us/rss/",
    category: "frontend",
    tags: ["frontend", "curated"],
    maxItems: 2,
    priority: 80
  },
  {
    id: "hacker-news-web",
    name: "Hacker News (Web)",
    feedUrl: "https://hnrss.org/newest?q=frontend%20OR%20react%20OR%20css%20OR%20typescript%20OR%20webdev%20OR%20browser",
    category: "frontend",
    tags: ["frontend", "community"],
    maxItems: 2,
    priority: 90
  },
  {
    id: "openai-news",
    name: "OpenAI News",
    feedUrl: "https://openai.com/news/rss.xml",
    category: "ai",
    tags: ["ai", "llm"],
    maxItems: 3,
    priority: 10
  }
];
