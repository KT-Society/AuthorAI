/**
 * Cover file lifecycle: releases a generated cover only when nothing references
 * it anymore. Seed/example covers are shared by every profile and are protected
 * so deleting an example book never breaks other profiles.
 */

import { BOOKS } from "@/data/author";
import { loadBooks } from "@/lib/persistence";
import { loadProfiles } from "@/lib/profile";
import { deleteCover } from "@/services/cover";

const SEED_COVERS = new Set(
  BOOKS.map((book) => book.coverUrl).filter((url): url is string => Boolean(url)),
);

export interface ReleaseCoverOptions {
  /** Ignore this profile entirely when counting references (profile deletion). */
  ignoreProfile?: string;
  /** Ignore one specific stored book when counting references (delete / cover swap). */
  ignoreRef?: { profileId: string; bookId: string };
}

export async function releaseCoverImage(
  url: string | undefined,
  options: ReleaseCoverOptions = {},
): Promise<void> {
  if (!url || !url.startsWith("/covers/")) return;
  if (SEED_COVERS.has(url)) return;

  for (const profile of loadProfiles()) {
    if (profile.id === options.ignoreProfile) continue;
    const books = loadBooks(profile.id) ?? [];
    for (const book of books) {
      if (
        options.ignoreRef &&
        profile.id === options.ignoreRef.profileId &&
        book.id === options.ignoreRef.bookId
      ) {
        continue;
      }
      if (book.coverUrl === url) return; // still in use somewhere
    }
  }

  await deleteCover(url);
}
