import { defineCollection, z } from "astro:content";

const digests = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    readTime: z.string().optional(),
    tags: z.array(z.string()).default([])
  })
});

export const collections = { digests };
