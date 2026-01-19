import { readFile } from 'fs/promises';
import { GAME_CONSTANTS } from '@swipe/shared';

class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEndOfWord: boolean = false;
}

export class DictionaryService {
  private root: TrieNode = new TrieNode();
  private wordCount: number = 0;
  private loaded: boolean = false;

  async loadDictionary(filePath: string): Promise<void> {
    if (this.loaded) return;

    console.log(`Loading dictionary from ${filePath}...`);
    const start = Date.now();

    try {
      const content = await readFile(filePath, 'utf-8');
      const words = content.split(/\r?\n/);

      for (const word of words) {
        const cleaned = word.trim().toUpperCase();
        if (cleaned.length >= GAME_CONSTANTS.MIN_WORD_LENGTH && /^[A-Z]+$/.test(cleaned)) {
          this.addWord(cleaned);
        }
      }

      this.loaded = true;
      const elapsed = Date.now() - start;
      console.log(`Loaded ${this.wordCount} words into dictionary in ${elapsed}ms`);
    } catch (error) {
      console.error('Failed to load dictionary:', error);
      throw error;
    }
  }

  private addWord(word: string): void {
    let node = this.root;
    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
    }
    if (!node.isEndOfWord) {
      node.isEndOfWord = true;
      this.wordCount++;
    }
  }

  isValidWord(word: string): boolean {
    if (!this.loaded) {
      console.warn('Dictionary not loaded, allowing all words');
      return true;
    }

    const cleaned = word.toUpperCase();
    let node = this.root;

    for (const char of cleaned) {
      if (!node.children.has(char)) {
        return false;
      }
      node = node.children.get(char)!;
    }

    return node.isEndOfWord;
  }

  // Check if a prefix exists (useful for autocomplete)
  hasPrefix(prefix: string): boolean {
    const cleaned = prefix.toUpperCase();
    let node = this.root;

    for (const char of cleaned) {
      if (!node.children.has(char)) {
        return false;
      }
      node = node.children.get(char)!;
    }

    return true;
  }

  // Find words with a given prefix (for autocomplete, limited results)
  findWordsWithPrefix(prefix: string, limit: number = 10): string[] {
    const cleaned = prefix.toUpperCase();
    let node = this.root;

    for (const char of cleaned) {
      if (!node.children.has(char)) {
        return [];
      }
      node = node.children.get(char)!;
    }

    const results: string[] = [];
    this.collectWords(node, cleaned, results, limit);
    return results;
  }

  private collectWords(
    node: TrieNode,
    prefix: string,
    results: string[],
    limit: number,
  ): void {
    if (results.length >= limit) return;

    if (node.isEndOfWord) {
      results.push(prefix);
    }

    for (const [char, child] of node.children) {
      this.collectWords(child, prefix + char, results, limit);
    }
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get count(): number {
    return this.wordCount;
  }
}

// Singleton instance
export const dictionaryService = new DictionaryService();
