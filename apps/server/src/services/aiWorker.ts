/**
 * AI Word Finding Worker - runs in separate thread to avoid blocking main event loop
 */
import { parentPort, workerData } from 'worker_threads';

interface WorkerMessage {
  type: 'findWord';
  id: number;
  letters: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  existingWords: string[];
  vocabulary: string[];
  config: {
    minWordLength: number;
    maxWordLength: number;
    findChance: number;
  };
}

interface WorkerResponse {
  type: 'wordFound';
  id: number;
  word: string | null;
}

// Process messages from main thread
parentPort?.on('message', (msg: WorkerMessage) => {
  if (msg.type === 'findWord') {
    const word = findWord(msg);
    const response: WorkerResponse = {
      type: 'wordFound',
      id: msg.id,
      word,
    };
    parentPort?.postMessage(response);
  }
});

function findWord(msg: WorkerMessage): string | null {
  const { letters, difficulty, existingWords, vocabulary, config } = msg;

  // Random chance to "fail" (simulates human imperfection)
  if (Math.random() > config.findChance) {
    return null;
  }

  // Build vocabulary set for fast lookup
  const vocabSet = new Set(vocabulary);
  const existingSet = new Set(existingWords);

  // Get letter counts (handle blanks)
  const letterCounts: Record<string, number> = {};
  let blankCount = 0;
  for (const letter of letters) {
    if (letter === '*') {
      blankCount++;
    } else {
      letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }
  }

  // Find all possible words
  const results: string[] = [];
  let callCount = 0;
  const maxCalls = 10000;

  function generate(available: Record<string, number>, blanks: number, current: string) {
    callCount++;
    if (callCount > maxCalls) return;
    if (results.length >= 50) return;
    if (current.length > config.maxWordLength) return;

    // Check if current is valid
    if (current.length >= 3) {
      if (vocabSet.has(current) && !existingSet.has(current) && !results.includes(current)) {
        if (current.length >= config.minWordLength && current.length <= config.maxWordLength) {
          results.push(current);
        }
      }
    }

    // Try each available letter
    for (const [letter, count] of Object.entries(available)) {
      if (count > 0) {
        available[letter] = count - 1;
        generate(available, blanks, current + letter);
        available[letter] = count;
      }
    }

    // Try blanks as common letters only (not all 26)
    if (blanks > 0) {
      const commonLetters = ['E', 'T', 'A', 'O', 'I', 'N', 'S', 'R'];
      for (const letter of commonLetters) {
        generate(available, blanks - 1, current + letter);
      }
    }
  }

  generate({ ...letterCounts }, blankCount, '');

  if (results.length === 0) return null;

  // Select word based on difficulty
  if (difficulty === 'hard') {
    // Prefer longer words
    results.sort((a, b) => b.length - a.length);
    const topThird = Math.max(1, Math.floor(results.length / 3));
    return results[Math.floor(Math.random() * topThird)] ?? null;
  } else if (difficulty === 'medium') {
    return results[Math.floor(Math.random() * results.length)] ?? null;
  } else {
    // Easy: prefer shorter words
    results.sort((a, b) => a.length - b.length);
    const bottomHalf = Math.max(1, Math.floor(results.length / 2));
    return results[Math.floor(Math.random() * bottomHalf)] ?? null;
  }
}
