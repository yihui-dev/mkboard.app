import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const docs = defineCollection({
  loader: glob({ base: "./src/content/docs", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    locale: z.enum(["zh", "en"]).default("en"),
    eyebrow: z.string().optional(),
    ctaLabel: z.string().optional(),
    ctaHref: z.string().optional()
  })
});

export const collections = { docs };
