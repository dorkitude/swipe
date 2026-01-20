import { nanoid } from 'nanoid';
import { readFile } from 'fs/promises';
import type { DictionaryService } from './DictionaryService.js';
import type { Letter } from '@swipe/shared';
import { GAME_CONSTANTS } from '@swipe/shared';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

interface AIConfig {
  // Reaction time range in ms
  minReactionTime: number;
  maxReactionTime: number;
  // Word length preferences
  minWordLength: number;
  maxWordLength: number;
  // Chance to find a word each "think" cycle (0-1)
  findChance: number;
  // How often to attempt stealing (0-1)
  stealChance: number;
}

const DIFFICULTY_CONFIGS: Record<AIDifficulty, AIConfig> = {
  easy: {
    minReactionTime: 8000,
    maxReactionTime: 15000,
    minWordLength: 4,
    maxWordLength: 5,
    findChance: 0.3,
    stealChance: 0.1,
  },
  medium: {
    minReactionTime: 4000,
    maxReactionTime: 10000,
    minWordLength: 4,
    maxWordLength: 7,
    findChance: 0.5,
    stealChance: 0.3,
  },
  hard: {
    minReactionTime: 3000,
    maxReactionTime: 6000,
    minWordLength: 4,
    maxWordLength: 15,
    findChance: 0.8,
    stealChance: 0.5,
  },
};

const AI_NAMES: Record<AIDifficulty, string[]> = {
  easy: ['Rookie', 'Newbie', 'Learner', 'Beginner', 'Junior'],
  medium: ['Challenger', 'Competitor', 'Contender', 'Rival', 'Player'],
  hard: ['Mastermind', 'Genius', 'Wizard', 'Champion', 'Expert'],
};

export interface AIPlayer {
  id: string;
  handle: string;
  difficulty: AIDifficulty;
  isAI: true;
}

export class AIPlayerService {
  private dictionary: DictionaryService;
  private wordCache: Map<string, string[]> = new Map();

  // Tiered word sets - AI can only use words from their difficulty level
  private wordsByDifficulty: Record<AIDifficulty, Set<string>> = {
    easy: new Set(),
    medium: new Set(),
    hard: new Set(),
  };
  private loaded: boolean = false;

  constructor(dictionary: DictionaryService) {
    this.dictionary = dictionary;
  }

  /**
   * Load tiered word lists for AI vocabulary
   */
  async loadWordLists(dataDir: string): Promise<void> {
    if (this.loaded) return;

    console.log('Loading AI word lists...');
    const start = Date.now();

    try {
      // Load all three difficulty word lists
      const files: Record<AIDifficulty, string> = {
        easy: 'easy_words.txt',
        medium: 'medium_words.txt',
        hard: 'hard_words.txt',
      };

      for (const [difficulty, filename] of Object.entries(files) as [AIDifficulty, string][]) {
        const content = await readFile(`${dataDir}/${filename}`, 'utf-8');
        for (const word of content.split(/\r?\n/)) {
          const cleaned = word.trim().toUpperCase();
          if (cleaned.length >= GAME_CONSTANTS.MIN_WORD_LENGTH) {
            this.wordsByDifficulty[difficulty].add(cleaned);
          }
        }
      }

      this.loaded = true;
      const elapsed = Date.now() - start;
      console.log(`Loaded AI word lists in ${elapsed}ms: easy=${this.wordsByDifficulty.easy.size}, medium=${this.wordsByDifficulty.medium.size}, hard=${this.wordsByDifficulty.hard.size}`);
    } catch (error) {
      console.error('Failed to load AI word lists:', error);
      throw error;
    }
  }

  /**
   * Check if a word is in the AI's vocabulary for a given difficulty
   */
  private isInVocabulary(word: string, difficulty: AIDifficulty): boolean {
    return this.wordsByDifficulty[difficulty].has(word);
  }

  createAIPlayer(difficulty: AIDifficulty): AIPlayer {
    const names = AI_NAMES[difficulty];
    const name = names[Math.floor(Math.random() * names.length)];
    const suffix = Math.floor(Math.random() * 1000);

    return {
      id: `ai_${nanoid(8)}`,
      handle: `${name}Bot${suffix}`,
      difficulty,
      isAI: true,
    };
  }

  getConfig(difficulty: AIDifficulty): AIConfig {
    return DIFFICULTY_CONFIGS[difficulty];
  }

  /**
   * Find a word the AI can make from available letters
   */
  findWord(
    availableLetters: Letter[],
    difficulty: AIDifficulty,
    existingWords: Set<string> = new Set()
  ): string | null {
    const config = DIFFICULTY_CONFIGS[difficulty];

    // Random chance to "fail" finding a word (simulates human imperfection)
    if (Math.random() > config.findChance) {
      return null;
    }

    // Get letter characters (handle blanks as wildcards)
    const letterChars = availableLetters.map(l => l.isBlank ? '*' : l.char);
    const cacheKey = `${difficulty}:${letterChars.sort().join('')}`;

    // Check cache first
    let possibleWords = this.wordCache.get(cacheKey);
    if (!possibleWords) {
      possibleWords = this.findAllPossibleWords(letterChars, difficulty);
      this.wordCache.set(cacheKey, possibleWords);

      // Limit cache size
      if (this.wordCache.size > 1000) {
        const firstKey = this.wordCache.keys().next().value;
        if (firstKey) this.wordCache.delete(firstKey);
      }
    }

    // Filter by difficulty constraints and existing words
    const validWords = possibleWords.filter(word => {
      if (existingWords.has(word)) return false;
      if (word.length < config.minWordLength) return false;
      if (word.length > config.maxWordLength) return false;
      return true;
    });

    if (validWords.length === 0) return null;

    // Weighted random selection - prefer longer words for harder difficulties
    if (difficulty === 'hard') {
      // Sort by length descending, pick from top third
      validWords.sort((a, b) => b.length - a.length);
      const topThird = Math.max(1, Math.floor(validWords.length / 3));
      return validWords[Math.floor(Math.random() * topThird)] ?? null;
    } else if (difficulty === 'medium') {
      // Random from all valid
      return validWords[Math.floor(Math.random() * validWords.length)] ?? null;
    } else {
      // Easy: prefer shorter words
      validWords.sort((a, b) => a.length - b.length);
      const bottomHalf = Math.max(1, Math.floor(validWords.length / 2));
      return validWords[Math.floor(Math.random() * bottomHalf)] ?? null;
    }
  }

  /**
   * Find all valid words that can be made from given letters
   */
  private findAllPossibleWords(letters: string[], difficulty: AIDifficulty): string[] {
    const results: string[] = [];
    const letterCounts = this.getLetterCounts(letters);
    const blankCount = letterCounts['*'] || 0;
    delete letterCounts['*'];

    // Generate all permutations and check against difficulty-appropriate vocabulary
    this.generateWords(letterCounts, blankCount, '', results, difficulty);

    return results;
  }

  private generateWords(
    available: Record<string, number>,
    blanks: number,
    current: string,
    results: string[],
    difficulty: AIDifficulty,
    maxLength: number = 10
  ): void {
    // Check if current is a valid word in AI's vocabulary
    if (current.length >= GAME_CONSTANTS.MIN_WORD_LENGTH) {
      if (this.isInVocabulary(current, difficulty) && !results.includes(current)) {
        results.push(current);
      }
    }

    // Stop if too long or too many results
    if (current.length >= maxLength || results.length >= 100) {
      return;
    }

    // Try adding each available letter
    for (const [letter, count] of Object.entries(available)) {
      if (count > 0) {
        available[letter] = count - 1;
        this.generateWords(available, blanks, current + letter, results, difficulty, maxLength);
        available[letter] = count;
      }
    }

    // Try using a blank as each letter A-Z
    if (blanks > 0) {
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        this.generateWords(available, blanks - 1, current + letter, results, difficulty, maxLength);
      }
    }
  }

  private getLetterCounts(letters: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const letter of letters) {
      counts[letter] = (counts[letter] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get random reaction time for AI based on difficulty
   */
  getReactionTime(difficulty: AIDifficulty): number {
    const config = DIFFICULTY_CONFIGS[difficulty];
    return config.minReactionTime +
      Math.random() * (config.maxReactionTime - config.minReactionTime);
  }

  /**
   * Check if AI should attempt to steal this turn
   */
  shouldAttemptSteal(difficulty: AIDifficulty): boolean {
    return Math.random() < DIFFICULTY_CONFIGS[difficulty].stealChance;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }
}
