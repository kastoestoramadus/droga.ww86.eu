export interface PublicationFields {
  draft?: boolean;
  date?: Date | string;
}

export interface PublicationFlags {
  drafts?: boolean;
  future?: boolean;
}

// The one rule for "is this entry public": no draft, no future date. Used by the page collections and by
// the tag/category taxonomies, so a draft cannot publish an empty tag page.
export function isPublished(
  data: PublicationFields,
  now: Date,
  flags: PublicationFlags = {},
): boolean {
  if (!flags.drafts && data.draft) return false;
  if (!flags.future && data.date && new Date(data.date) > now) return false;
  return true;
}
