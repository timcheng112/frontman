import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const digests = defineCollection({
  loader: glob({ base: "./src/content/digests", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    readTime: z.string().optional(),
    tags: z.array(z.string()).default([])
  })
});

export const collections = { digests };
