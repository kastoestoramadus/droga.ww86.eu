/** Whether the taxonomy sidebar should show its categories box. */
export function shouldShowCategories(categories: readonly string[]): boolean {
  return new Set(categories).size >= 2;
}
