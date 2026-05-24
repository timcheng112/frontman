import { readdir } from "node:fs/promises";
import { getCollection, type CollectionEntry } from "astro:content";

export async function getDigestCollection(): Promise<CollectionEntry<"digests">[]> {
  if (!(await hasDigestMarkdownFiles())) {
    return [];
  }

  try {
    return await getCollection("digests");
  } catch (error) {
    if (isEmptyCollectionError(error)) {
      return [];
    }

    throw error;
  }
}

function isEmptyCollectionError(error: unknown) {
  return error instanceof Error && error.message.includes('The collection "digests" does not exist or is empty.');
}

async function hasDigestMarkdownFiles() {
  const digestsDirectory = new URL("../content/digests/", import.meta.url);

  try {
    const entries = await readdir(digestsDirectory, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith(".md"));
  } catch {
    return false;
  }
}
