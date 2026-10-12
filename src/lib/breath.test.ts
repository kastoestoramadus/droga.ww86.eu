import { expect, test } from 'vitest';
import { boxBreathing, label } from './breath';

test('the cycle starts with a full inhale', () => {
  expect(label(boxBreathing, 0)).toBe('Wdech (4)');
});

test('counts down within a phase and moves to the next one', () => {
  expect(label(boxBreathing, 3)).toBe('Wdech (1)');
  expect(label(boxBreathing, 4)).toBe('Zatrzymaj (4)');
  expect(label(boxBreathing, 8)).toBe('Wydech (4)');
});

test('wraps around after a full cycle', () => {
  expect(label(boxBreathing, 12)).toBe('Wdech (4)');
});
