import { isPublished, type PublicationFields, type PublicationFlags } from "./publication";

export interface HomePostEntry {
  id: string;
  data: PublicationFields;
}

export interface HomePostsResult<T extends HomePostEntry> {
  posts: T[];
  showAll: boolean;
}

/** The newest published posts for the homepage, and whether more exist behind /blog. */
export function selectHomePosts<T extends HomePostEntry>(
  posts: readonly T[],
  limit: number,
  now: Date,
  flags: PublicationFlags = {},
): HomePostsResult<T> {
  const published = posts.filter((post) => isPublished(post.data, now, flags));
  const sorted = [...published].sort(
    (a, b) =>
      new Date(b.data.date ?? 0).valueOf() -
      new Date(a.data.date ?? 0).valueOf(),
  );
  return { posts: sorted.slice(0, limit), showAll: sorted.length > limit };
}
