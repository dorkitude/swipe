import type { Letter } from '@swipe/shared';
import type { DictionaryService } from './DictionaryService.js';

export interface StealAttempt {
  targetWords: Array<{ id: string; word: string; letters: Letter[] }>;
  newWord: string;
  availableLetters: Letter[];
}

export interface StealResult {
  success: boolean;
  reason?: string;
  lettersFromTargets?: Letter[];
  lettersFromPool?: Letter[];
  totalScore?: number;
}

interface LetterCount {
  [char: string]: number;
}

export class WordStealService {
  constructor(private dictionary: DictionaryService) {}

  private verbose = false; // Set to true for debugging

  private log(message: string, ...args: any[]) {
    if (!this.verbose) return;
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] [Swipe]`, message, ...args);
  }

  private logResult(message: string) {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] [Swipe]`, message);
  }

  /**
   * Validate a steal attempt where player combines one or more existing words
   * with letters from the pool to form a new word.
   *
   * Rules:
   * 1. New word must be in dictionary
   * 2. ALL letters from ALL target words must be used
   * 3. At least ONE letter from the available pool must be used
   * 4. For single-word steals, letters must be rearranged (not just appended/prepended)
   */
  validateSteal(attempt: StealAttempt): StealResult {
    const newWord = attempt.newWord.toUpperCase().trim();

    this.log(`Validating: ${attempt.targetWords.map(w => w.word).join(' + ')} → ${newWord}`);

    // Check dictionary
    if (!this.dictionary.isValidWord(newWord)) {
      this.log(`FAIL: "${newWord}" not in dictionary`);
      return { success: false, reason: 'Word not in dictionary' };
    }

    // Collect all letters from target words
    const targetLetters: Letter[] = [];
    for (const target of attempt.targetWords) {
      this.log(`Target word "${target.word}" has ${target.letters.length} letters:`,
        target.letters.map(l => l.char || '?').join(','));
      for (const letter of target.letters) {
        targetLetters.push(letter);
      }
    }

    if (targetLetters.length === 0) {
      this.log(`FAIL: No letters in target words`);
      return { success: false, reason: 'No target words selected' };
    }

    // Count what letters we need for the new word
    const needed = this.getLetterCounts(newWord);
    this.log(`Need letters:`, needed);
    this.log(`Have from targets:`, targetLetters.map(l => l.isBlank ? '*' : l.char).join(','));
    this.log(`Pool has:`, attempt.availableLetters.map(l => l.isBlank ? '*' : l.char).join(','));

    // Try to fulfill the new word using target letters first, then pool letters
    const usedFromTargets: Letter[] = [];
    const usedFromPool: Letter[] = [];
    const remainingTargetLetters = [...targetLetters];
    const remainingPoolLetters = [...attempt.availableLetters];

    // First pass: use exact matches from target words
    for (const char of Object.keys(needed)) {
      while ((needed[char] ?? 0) > 0) {
        // Try to find exact match in target letters (non-blank)
        const targetIdx = remainingTargetLetters.findIndex(
          l => !l.isBlank && (l.char === char || l.usedAs === char)
        );

        if (targetIdx !== -1) {
          const letter = remainingTargetLetters.splice(targetIdx, 1)[0]!;
          usedFromTargets.push(letter);
          needed[char]!--;
        } else {
          break;
        }
      }
    }

    // Second pass: use blanks from target letters
    for (const char of Object.keys(needed)) {
      while ((needed[char] ?? 0) > 0) {
        const blankIdx = remainingTargetLetters.findIndex(l => l.isBlank);

        if (blankIdx !== -1) {
          const letter = remainingTargetLetters.splice(blankIdx, 1)[0]!;
          letter.usedAs = char; // Reassign blank
          usedFromTargets.push(letter);
          needed[char]!--;
        } else {
          break;
        }
      }
    }

    // Third pass: use exact matches from pool
    for (const char of Object.keys(needed)) {
      while ((needed[char] ?? 0) > 0) {
        const poolIdx = remainingPoolLetters.findIndex(
          l => !l.isBlank && l.char === char
        );

        if (poolIdx !== -1) {
          const letter = remainingPoolLetters.splice(poolIdx, 1)[0]!;
          usedFromPool.push(letter);
          needed[char]!--;
        } else {
          break;
        }
      }
    }

    // Fourth pass: use blanks from pool
    for (const char of Object.keys(needed)) {
      while ((needed[char] ?? 0) > 0) {
        const blankIdx = remainingPoolLetters.findIndex(l => l.isBlank);

        if (blankIdx !== -1) {
          const letter = remainingPoolLetters.splice(blankIdx, 1)[0]!;
          letter.usedAs = char;
          usedFromPool.push(letter);
          needed[char]!--;
        } else {
          break;
        }
      }
    }

    // Check if we could form the word
    const stillNeeded = Object.values(needed).reduce((a, b) => a + b, 0);
    if (stillNeeded > 0) {
      this.log(`FAIL: Still need ${stillNeeded} letters:`, needed);
      return { success: false, reason: 'Not enough letters available' };
    }

    // CRITICAL: ALL target letters must be used
    if (remainingTargetLetters.length > 0) {
      this.log(`FAIL: Unused target letters:`, remainingTargetLetters.map(l => l.char).join(','));
      return {
        success: false,
        reason: `Must use all letters from target word(s). Unused: ${remainingTargetLetters.map(l => l.isBlank ? '*' : l.char).join(', ')}`
      };
    }

    // CRITICAL: At least ONE letter from pool must be used
    if (usedFromPool.length === 0) {
      this.log(`FAIL: No letters used from pool`);
      return { success: false, reason: 'Must add at least one letter from the pool' };
    }

    this.logResult(`SUCCESS: ${attempt.targetWords.map(w => w.word).join(' + ')} → ${newWord}`);

    // Note: We removed the "simple extension" check - CAME → CAMERA is valid!
    // The rule requiring rearrangement was too strict.

    // Calculate score (sum of all letter values)
    const allUsedLetters = [...usedFromTargets, ...usedFromPool];
    const totalScore = allUsedLetters.reduce((sum, l) => sum + l.value, 0);

    return {
      success: true,
      lettersFromTargets: usedFromTargets,
      lettersFromPool: usedFromPool,
      totalScore,
    };
  }

  /**
   * Check if newWord is just the original word with letters added at start/end
   * without rearrangement. E.g., "CAT" -> "CATS" or "SCAT" is not allowed,
   * but "CAT" -> "ACT" + S = "ACTS" would be okay.
   */
  private isSimpleExtension(original: string, newWord: string): boolean {
    // Check if original appears as a substring at start or end
    if (newWord.startsWith(original) || newWord.endsWith(original)) {
      return true;
    }

    // Also check reverse (e.g., TAC -> TACK where original is CAT)
    // This is actually fine since letters ARE rearranged

    return false;
  }

  private getLetterCounts(word: string): LetterCount {
    const counts: LetterCount = {};
    for (const char of word) {
      counts[char] = (counts[char] || 0) + 1;
    }
    return counts;
  }
}
