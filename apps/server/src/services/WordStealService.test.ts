import { describe, it, expect } from 'vitest';
import { DictionaryService } from './DictionaryService.js';
import { WordStealService } from './WordStealService.js';
import type { Letter } from '@swipe/shared';

// Create a mock dictionary that accepts our test words
const mockDictionary: DictionaryService = {
  isValidWord: (word: string) => {
    const validWords = ['GEEK', 'GEEKIER', 'CAME', 'CAMERA', 'CAT', 'CATS', 'SCAT'];
    return validWords.includes(word.toUpperCase());
  },
} as DictionaryService;

function createLetter(char: string, id?: string): Letter {
  return {
    id: id || char + Math.random(),
    char: char.toUpperCase(),
    value: 1,
    isBlank: char === '*',
    usedAs: '',
    createdAt: Date.now(),
  } as Letter;
}

describe('WordStealService', () => {
  const service = new WordStealService(mockDictionary);

  describe('GEEK → GEEKIER swipe', () => {
    it('should allow swiping GEEK to GEEKIER with I, E, R from pool', () => {
      const result = service.validateSteal({
        targetWords: [{
          id: 'word1',
          word: 'GEEK',
          letters: [
            createLetter('G'),
            createLetter('E'),
            createLetter('E'),
            createLetter('K'),
          ],
        }],
        newWord: 'GEEKIER',
        availableLetters: [
          createLetter('I'),
          createLetter('E'),
          createLetter('R'),
          createLetter('X'),
          createLetter('Y'),
        ],
      });

      console.log('Result:', result);

      expect(result.success).toBe(true);
      expect(result.lettersFromTargets?.length).toBe(4); // G, E, E, K
      expect(result.lettersFromPool?.length).toBe(3); // I, E, R
    });
  });

  describe('CAME → CAMERA swipe', () => {
    it('should allow swiping CAME to CAMERA with R, A from pool', () => {
      const result = service.validateSteal({
        targetWords: [{
          id: 'word1',
          word: 'CAME',
          letters: [
            createLetter('C'),
            createLetter('A'),
            createLetter('M'),
            createLetter('E'),
          ],
        }],
        newWord: 'CAMERA',
        availableLetters: [
          createLetter('R'),
          createLetter('A'),
          createLetter('X'),
        ],
      });

      console.log('Result:', result);

      expect(result.success).toBe(true);
      expect(result.lettersFromTargets?.length).toBe(4); // C, A, M, E
      expect(result.lettersFromPool?.length).toBe(2); // R, A
    });
  });

  describe('validation rules', () => {
    it('should reject if word not in dictionary', () => {
      const result = service.validateSteal({
        targetWords: [{
          id: 'word1',
          word: 'CAT',
          letters: [createLetter('C'), createLetter('A'), createLetter('T')],
        }],
        newWord: 'CATXYZ', // Not in dictionary
        availableLetters: [createLetter('X'), createLetter('Y'), createLetter('Z')],
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('dictionary');
    });

    it('should reject if no pool letters used', () => {
      // Trying to "swipe" CATS from CAT+S but S is in target, not pool
      const result = service.validateSteal({
        targetWords: [{
          id: 'word1',
          word: 'CAT',
          letters: [createLetter('C'), createLetter('A'), createLetter('T')],
        }],
        newWord: 'CAT', // Same word, no pool letters
        availableLetters: [createLetter('X')],
      });

      expect(result.success).toBe(false);
    });

    it('should reject if not all target letters are used', () => {
      const result = service.validateSteal({
        targetWords: [{
          id: 'word1',
          word: 'CATS',
          letters: [createLetter('C'), createLetter('A'), createLetter('T'), createLetter('S')],
        }],
        newWord: 'CAT', // Doesn't use S
        availableLetters: [createLetter('X')],
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('all letters');
    });
  });
});
