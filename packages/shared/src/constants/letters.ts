// Letter values based on rarity in English (NOT Scrabble scoring)
// Lower frequency = higher value. J is actually rarest in word usage!
export const LETTER_VALUES: Record<string, number> = {
  // Tier 1: Most common (1 point)
  E: 1, T: 1, A: 1, O: 1, I: 1, N: 1,

  // Tier 2: Common (2 points)
  S: 2, R: 2, H: 2, L: 2,

  // Tier 3: Moderately common (3 points)
  D: 3, C: 3, U: 3, M: 3,

  // Tier 4: Less common (4 points)
  F: 4, G: 4, Y: 4, P: 4, W: 4, B: 4,

  // Tier 5: Uncommon (6 points)
  V: 6, K: 6,

  // Tier 6: Rare (8 points)
  X: 8, Z: 8,

  // Tier 7: Very rare (10 points)
  Q: 10,

  // Tier 8: Rarest (12 points)
  J: 12,

  // Blank/Wild (0 points - flexible but no score)
  '*': 0,
};

// Letter distribution for drawing (weighted by frequency)
// Higher number = more likely to appear
export const LETTER_DISTRIBUTION: Record<string, number> = {
  E: 12, T: 9, A: 9, O: 8, I: 9, N: 6,
  S: 4, R: 6, H: 2, L: 4,
  D: 4, C: 2, U: 4, M: 2,
  F: 2, G: 3, Y: 2, P: 2, W: 2, B: 2,
  V: 2, K: 1,
  X: 1, Z: 1,
  Q: 1,
  J: 1,
  '*': 2, // 2 blanks per full set
};

// Build a weighted pool for random selection
export function buildLetterPool(): string[] {
  const pool: string[] = [];
  for (const [letter, count] of Object.entries(LETTER_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      pool.push(letter);
    }
  }
  return pool;
}

export function getLetterValue(letter: string): number {
  return LETTER_VALUES[letter.toUpperCase()] ?? 0;
}
