import { nanoid } from 'nanoid';
import { readFile } from 'fs/promises';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { DictionaryService } from './DictionaryService.js';
import type { Letter } from '@swipe/shared';
import { GAME_CONSTANTS } from '@swipe/shared';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

interface AIConfig {
  minReactionTime: number;
  maxReactionTime: number;
  minWordLength: number;
  maxWordLength: number;
  findChance: number;
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

interface PendingRequest {
  resolve: (word: string | null) => void;
  reject: (err: Error) => void;
}

export class AIPlayerService {
  private dictionary: DictionaryService;
  private worker?: Worker;
  private requestId = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();

  // Vocabulary arrays to send to worker
  private vocabularyByDifficulty: Record<AIDifficulty, string[]> = {
    easy: [],
    medium: [],
    hard: [],
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
      const files: Record<AIDifficulty, string> = {
        easy: 'easy_words.txt',
        medium: 'medium_words.txt',
        hard: 'hard_words.txt',
      };

      for (const [difficulty, filename] of Object.entries(files) as [AIDifficulty, string][]) {
        const content = await readFile(`${dataDir}/${filename}`, 'utf-8');
        const words: string[] = [];
        for (const word of content.split(/\r?\n/)) {
          const cleaned = word.trim().toUpperCase();
          if (cleaned.length >= GAME_CONSTANTS.MIN_WORD_LENGTH) {
            words.push(cleaned);
          }
        }
        this.vocabularyByDifficulty[difficulty] = words;
      }

      this.loaded = true;
      const elapsed = Date.now() - start;
      console.log(`Loaded AI word lists in ${elapsed}ms: easy=${this.vocabularyByDifficulty.easy.length}, medium=${this.vocabularyByDifficulty.medium.length}, hard=${this.vocabularyByDifficulty.hard.length}`);

      // Start the worker thread
      this.startWorker();
    } catch (error) {
      console.error('Failed to load AI word lists:', error);
      throw error;
    }
  }

  private startWorker(): void {
    try {
      // Get the path to the worker
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // Try compiled .js first (works in both prod and dev with tsx)
      const workerPath = join(__dirname, 'aiWorker.js');

      this.worker = new Worker(workerPath);

      this.worker.on('message', (msg: { type: string; id: number; word: string | null }) => {
        if (msg.type === 'wordFound') {
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            pending.resolve(msg.word);
            this.pendingRequests.delete(msg.id);
          }
        }
      });

      this.worker.on('error', (err) => {
        console.error('AI Worker error:', err);
        this.worker = undefined; // Disable worker, fall back to sync
        // Reject all pending requests
        for (const pending of this.pendingRequests.values()) {
          pending.reject(err);
        }
        this.pendingRequests.clear();
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`AI Worker exited with code ${code}`);
          this.worker = undefined; // Disable worker
        }
      });

      console.log('AI Worker thread started');
    } catch (err) {
      console.warn('AI Worker not available, using sync mode:', (err as Error).message);
      this.worker = undefined;
    }
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
   * Find a word the AI can make - runs in worker thread (non-blocking!)
   */
  async findWordAsync(
    availableLetters: Letter[],
    difficulty: AIDifficulty,
    existingWords: Set<string> = new Set()
  ): Promise<string | null> {
    if (!this.worker) {
      // Fallback to sync if worker not available
      return this.findWordSync(availableLetters, difficulty, existingWords);
    }

    const config = DIFFICULTY_CONFIGS[difficulty];
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve(null); // Just return null on timeout, don't crash
      }, 5000);

      this.pendingRequests.set(id, {
        resolve: (word) => {
          clearTimeout(timeout);
          resolve(word);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.worker!.postMessage({
        type: 'findWord',
        id,
        letters: availableLetters.map(l => l.isBlank ? '*' : l.char),
        difficulty,
        existingWords: Array.from(existingWords),
        vocabulary: this.vocabularyByDifficulty[difficulty],
        config: {
          minWordLength: config.minWordLength,
          maxWordLength: config.maxWordLength,
          findChance: config.findChance,
        },
      });
    });
  }

  /**
   * Synchronous fallback (old method) - only used if worker fails
   */
  private findWordSync(
    availableLetters: Letter[],
    difficulty: AIDifficulty,
    existingWords: Set<string> = new Set()
  ): string | null {
    const config = DIFFICULTY_CONFIGS[difficulty];
    const vocabSet = new Set(this.vocabularyByDifficulty[difficulty]);

    if (Math.random() > config.findChance) {
      return null;
    }

    const letterCounts: Record<string, number> = {};
    for (const l of availableLetters) {
      const char = l.isBlank ? '*' : l.char;
      if (char !== '*') {
        letterCounts[char] = (letterCounts[char] || 0) + 1;
      }
    }

    const results: string[] = [];
    let calls = 0;
    const maxCalls = 3000;

    const generate = (available: Record<string, number>, current: string) => {
      if (++calls > maxCalls || results.length >= 10) return;
      if (current.length > config.maxWordLength) return;

      if (current.length >= config.minWordLength) {
        if (vocabSet.has(current) && !existingWords.has(current) && !results.includes(current)) {
          results.push(current);
        }
      }

      for (const [letter, count] of Object.entries(available)) {
        if (count > 0) {
          available[letter] = count - 1;
          generate(available, current + letter);
          available[letter] = count;
        }
      }
    };

    generate({ ...letterCounts }, '');

    if (results.length === 0) return null;
    return results[Math.floor(Math.random() * results.length)] ?? null;
  }

  /**
   * Legacy sync method - prefer findWordAsync
   */
  findWord(
    availableLetters: Letter[],
    difficulty: AIDifficulty,
    existingWords: Set<string> = new Set()
  ): string | null {
    return this.findWordSync(availableLetters, difficulty, existingWords);
  }

  getReactionTime(difficulty: AIDifficulty): number {
    const config = DIFFICULTY_CONFIGS[difficulty];
    return config.minReactionTime +
      Math.random() * (config.maxReactionTime - config.minReactionTime);
  }

  shouldAttemptSteal(difficulty: AIDifficulty): boolean {
    return Math.random() < DIFFICULTY_CONFIGS[difficulty].stealChance;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Clean up worker on shutdown
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = undefined;
    }
  }
}
