export interface Phase {
  readonly name: string;
  readonly seconds: number;
}

export const boxBreathing: readonly Phase[] = [
  { name: 'Wdech', seconds: 4 },
  { name: 'Zatrzymaj', seconds: 4 },
  { name: 'Wydech', seconds: 4 },
];

/** Label shown `second` seconds after the start, e.g. "Wdech (3)". */
export function label(phases: readonly Phase[], second: number): string {
  const labels = phases.flatMap(({ name, seconds }) =>
    Array.from({ length: seconds }, (_, i) => `${name} (${seconds - i})`),
  );
  return labels[second % labels.length]!;
}
