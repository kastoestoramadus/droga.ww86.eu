export interface PostRef {
  readonly language: string;
  readonly file: string;
  readonly translationKey: string | undefined;
}

/**
 * Everything wrong with the pairing of post versions: a post without a key, a key used twice in one language,
 * a key missing in some language. An empty list means every post exists in every language.
 */
export function translationProblems(posts: readonly PostRef[], languages: readonly string[]): string[] {
  const problems: string[] = [];
  const byKey = new Map<string, PostRef[]>();

  for (const post of posts) {
    if (!post.translationKey) {
      problems.push(`${post.language}/${post.file} has no translationKey`);
      continue;
    }
    byKey.set(post.translationKey, [...(byKey.get(post.translationKey) ?? []), post]);
  }

  for (const [key, versions] of byKey) {
    for (const language of languages) {
      const inLanguage = versions.filter((v) => v.language === language);
      if (inLanguage.length === 0) problems.push(`"${key}" has no version in "${language}"`);
      if (inLanguage.length > 1)
        problems.push(`"${key}" is used twice in "${language}": ${inLanguage.map((v) => v.file).join(", ")}`);
    }
  }
  return problems;
}
