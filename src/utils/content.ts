import { getCollection, type CollectionEntry } from "astro:content";

export async function getDigestCollection(): Promise<CollectionEntry<"digests">[]> {
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
