import { Room, Client } from 'colyseus';
import { GameState, Player, Letter, Word, GAME_CONSTANTS, LETTER_VALUES, buildLetterPool } from '@swipe/shared';
import { nanoid } from 'nanoid';
import type { DictionaryService } from '../services/DictionaryService.js';
import { AIPlayerService, type AIDifficulty, type AIPlayer } from '../services/AIPlayerService.js';
import { WordStealService } from '../services/WordStealService.js';
import { env } from '../config/environment.js';

interface JoinOptions {
  odId: string;
  handle: string;
  aiOpponents?: Array<{ difficulty: AIDifficulty }>;
  testLetters?: string; // For testing: predetermined letters like "GEEKIER"
}

interface SubmitWordMessage {
  word: string;
}

interface AIState {
  player: AIPlayer;
  thinkTimeout?: ReturnType<typeof setTimeout>;
  claimedWords: Set<string>;
}

export class GameRoom extends Room<GameState> {
  private letterPool: string[] = [];
  private dictionary?: DictionaryService;
  private stealService?: WordStealService;
  private aiService?: AIPlayerService;
  private aiStates: Map<string, AIState> = new Map();
  private refillTimeout?: ReturnType<typeof setTimeout>;
  private letterExpirationInterval?: ReturnType<typeof setInterval>;
  private testLetterQueue: string[] = []; // For deterministic testing

  /** Log with room name prefix */
  private log(message: string) {
    console.log(`[${this.state.roomName}] ${message}`);
  }

  private warn(message: string) {
    console.warn(`[${this.state.roomName}] ${message}`);
  }

  override onCreate(options: { dictionary?: DictionaryService; aiService?: AIPlayerService }) {
    this.setState(new GameState());
    this.state.roomName = this.generateRoomName();
    this.letterPool = buildLetterPool();
    this.dictionary = options.dictionary;
    this.aiService = options.aiService;
    this.maxClients = GAME_CONSTANTS.MAX_PLAYERS;

    if (this.dictionary) {
      this.stealService = new WordStealService(this.dictionary);
    }

    this.log('Room created');

    // Handle word submissions - auto-detects pool vs swipe
    this.onMessage('makeWord', (client, message: { word: string }) => {
      this.handleMakeWord(client, message.word);
    });

    // Legacy handlers (keep for compatibility)
    this.onMessage('submitWord', (client, message: SubmitWordMessage) => {
      this.handleWordSubmission(client.sessionId, message.word, client);
    });

    this.onMessage('stealWord', (client, message: { targetWordIds: string[]; newWord: string }) => {
      this.handleStealAttempt(client, message.targetWordIds, message.newWord);
    });

    // Handle adding AI opponents
    this.onMessage('addAI', (client, message: { difficulty: AIDifficulty }) => {
      this.addAIPlayer(message.difficulty);
    });

    // Handle starting game (for single player vs AI)
    this.onMessage('startGame', () => {
      if (this.state.phase === 'waiting' && this.state.players.size >= 1) {
        this.startGame();
      }
    });
  }

  override onJoin(client: Client, options: JoinOptions) {
    this.log(`Player ${options.handle} joined`);

    // Check if this player already exists (reconnecting with same odId)
    let foundPlayer: Player | undefined;
    let foundSessionId: string | undefined;
    this.state.players.forEach((p, sid) => {
      if (p.odId === options.odId) {
        foundPlayer = p;
        foundSessionId = sid;
      }
    });

    let isReconnect = false;
    if (foundPlayer && foundSessionId) {
      // Player reconnecting - update their session ID
      const existingPlayer = foundPlayer;
      const existingSessionId = foundSessionId;
      this.log(`Player ${options.handle} reconnecting (was ${existingSessionId}, now ${client.sessionId})`);
      this.state.players.delete(existingSessionId);
      existingPlayer.sessionId = client.sessionId;
      existingPlayer.isConnected = true;
      this.state.players.set(client.sessionId, existingPlayer);

      // Update word ownership references
      this.state.allWords.forEach((word) => {
        if (word.ownerId === existingSessionId) {
          word.ownerId = client.sessionId;
        }
      });
      isReconnect = true;
    }

    if (!isReconnect) {
      // New player joining
      const player = new Player();
      player.sessionId = client.sessionId;
      player.odId = options.odId;
      player.handle = options.handle;
      player.score = 0;
      player.isConnected = true;

      this.state.players.set(client.sessionId, player);
    }

    // Add test letters to queue if specified (for deterministic testing)
    if (options.testLetters) {
      const letters = options.testLetters.toUpperCase().split('');
      this.testLetterQueue.push(...letters);
      this.log(`Test letters queued: ${options.testLetters}`);
    }

    // Add AI opponents if specified (and not already present from a previous session)
    if (options.aiOpponents && this.aiService && this.aiStates.size === 0) {
      for (const ai of options.aiOpponents) {
        this.addAIPlayer(ai.difficulty);
      }
    }

    // Auto-start countdown if we have 2+ players (including AI)
    if (this.state.players.size >= GAME_CONSTANTS.MIN_PLAYERS && this.state.phase === 'waiting') {
      this.startGame();
    }
  }

  private addAIPlayer(difficulty: AIDifficulty): void {
    if (!this.aiService) {
      this.warn('AI service not available (dictionary not loaded)');
      return;
    }

    if (this.state.players.size >= GAME_CONSTANTS.MAX_PLAYERS) {
      this.log('Room is full, cannot add AI');
      return;
    }

    const aiPlayer = this.aiService.createAIPlayer(difficulty);

    const player = new Player();
    player.sessionId = aiPlayer.id;
    player.odId = aiPlayer.id;
    player.handle = aiPlayer.handle;
    player.score = 0;
    player.isConnected = true;

    this.state.players.set(aiPlayer.id, player);

    this.aiStates.set(aiPlayer.id, {
      player: aiPlayer,
      claimedWords: new Set(),
    });

    this.log(`AI player ${aiPlayer.handle} (${difficulty}) added`);

    // Broadcast AI joined
    this.broadcast('playerJoined', {
      sessionId: aiPlayer.id,
      handle: aiPlayer.handle,
      isAI: true,
      difficulty,
    });

    // If game is already playing, start this AI thinking immediately
    if (this.state.phase === 'playing') {
      const aiState = this.aiStates.get(aiPlayer.id)!;
      this.scheduleAIThink(aiPlayer.id, aiState);
    }

    // Auto-start if we now have enough players
    if (this.state.players.size >= GAME_CONSTANTS.MIN_PLAYERS && this.state.phase === 'waiting') {
      this.startGame();
    }
  }

  override onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isConnected = false;
      this.log(`Player ${player.handle} disconnected`);

      // Allow reconnection for a period
      if (!consented) {
        this.allowReconnection(client, 30).then(() => {
          player.isConnected = true;
          this.log(`Player ${player.handle} reconnected`);
        }).catch(() => {
          this.log(`Player ${player.handle} failed to reconnect`);
        });
      }
    }
  }

  private startGame() {
    if (this.state.phase === 'playing') return; // Already started

    this.state.phase = 'playing';
    this.state.lastPoolActivity = Date.now(); // Initialize stagnation timer
    this.fillLetters();
    this.startAIThinking();
    this.startLetterExpiration();

    this.log('Game started!');
  }

  private startLetterExpiration() {
    // Check every second for stagnant pool
    this.letterExpirationInterval = setInterval(() => {
      if (this.state.phase !== 'playing') return;
      if (this.state.availableLetters.length === 0) return;

      const now = Date.now();
      const stagnationTime = now - this.state.lastPoolActivity;

      // Only act if pool has been stagnant for LETTER_FADE_START_MS (10s)
      if (stagnationTime < GAME_CONSTANTS.LETTER_FADE_START_MS) return;

      // After 15s total stagnation, remove the oldest 5 letters
      if (stagnationTime >= GAME_CONSTANTS.LETTER_EXPIRE_MS) {
        // Sort by createdAt to find oldest
        const sorted = [...this.state.availableLetters].sort((a, b) => a.createdAt - b.createdAt);
        const toRemove = sorted.slice(0, 5);

        for (const letter of toRemove) {
          const idx = this.state.availableLetters.findIndex(l => l.id === letter.id);
          if (idx !== -1) {
            this.state.availableLetters.splice(idx, 1);
            this.log(`Letter ${letter.char} expired (pool stagnant)`);
          }
        }

        // Reset stagnation timer after removing letters
        this.state.lastPoolActivity = now;
        this.scheduleLetterRefill();
      }
    }, 1000);
  }

  private startAIThinking() {
    if (!this.aiService) return;

    for (const [aiId, aiState] of this.aiStates) {
      this.scheduleAIThink(aiId, aiState);
    }
  }

  private stopAIThinking() {
    for (const aiState of this.aiStates.values()) {
      if (aiState.thinkTimeout) {
        clearTimeout(aiState.thinkTimeout);
        aiState.thinkTimeout = undefined;
      }
    }
  }

  private scheduleAIThink(aiId: string, aiState: AIState) {
    if (this.state.phase !== 'playing' || !this.aiService) return;

    const reactionTime = this.aiService.getReactionTime(aiState.player.difficulty);

    aiState.thinkTimeout = setTimeout(() => {
      this.aiThink(aiId, aiState);
    }, reactionTime);
  }

  private aiThink(aiId: string, aiState: AIState) {
    if (this.state.phase !== 'playing' || !this.aiService) return;

    // Get all words currently claimed in this game
    const existingWords = new Set<string>();
    for (const word of this.state.allWords) {
      existingWords.add(word.word);
    }
    aiState.claimedWords.forEach(w => existingWords.add(w));

    // Try to find a word
    const availableLetters = Array.from(this.state.availableLetters);
    const word = this.aiService.findWord(
      availableLetters,
      aiState.player.difficulty,
      existingWords
    );

    if (word) {
      // Submit the word
      const success = this.handleWordSubmission(aiId, word);
      if (success) {
        aiState.claimedWords.add(word);
      }
    }

    // Schedule next think
    this.scheduleAIThink(aiId, aiState);
  }

  private fillLetters() {
    // Add letters until we have LETTERS_PER_ROUND
    while (this.state.availableLetters.length < GAME_CONSTANTS.LETTERS_PER_ROUND) {
      // Use test letters first if available, otherwise random
      const char = this.testLetterQueue.length > 0
        ? this.testLetterQueue.shift()!
        : this.drawRandomLetter();

      const letter = new Letter();
      letter.id = nanoid(8);
      letter.char = char;
      letter.value = LETTER_VALUES[char] ?? 0;
      letter.isBlank = char === '*';
      letter.createdAt = Date.now();
      this.state.availableLetters.push(letter);
    }
  }

  private scheduleLetterRefill() {
    // Clear any pending refill timer
    if (this.refillTimeout) {
      clearTimeout(this.refillTimeout);
    }

    // Schedule refill after delay
    this.refillTimeout = setTimeout(() => {
      if (this.state.phase === 'playing') {
        this.fillLetters();
        this.log(`Letters refilled to ${this.state.availableLetters.length}`);
      }
      this.refillTimeout = undefined;
    }, GAME_CONSTANTS.LETTER_REFILL_DELAY_MS);
  }

  private drawRandomLetter(): string {
    // Shuffle and draw from pool, reset if empty
    if (this.letterPool.length === 0) {
      this.letterPool = buildLetterPool();
    }
    const index = Math.floor(Math.random() * this.letterPool.length);
    return this.letterPool.splice(index, 1)[0]!;
  }

  /**
   * Smart word handler - figures out if word can be made from pool or via swipe
   */
  private handleMakeWord(client: Client, wordStr: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.phase !== 'playing') {
      client.send('wordResult', { success: false, reason: 'Cannot submit word now' });
      return;
    }

    const word = wordStr.toUpperCase().trim();

    // Validate word length
    if (word.length < GAME_CONSTANTS.MIN_WORD_LENGTH) {
      client.send('wordResult', { success: false, reason: `Word must be at least ${GAME_CONSTANTS.MIN_WORD_LENGTH} letters` });
      return;
    }

    // Validate against dictionary
    if (this.dictionary && !this.dictionary.isValidWord(word)) {
      client.send('wordResult', { success: false, reason: 'Word not in dictionary' });
      return;
    }

    // Try 1: Make from pool letters only
    const poolUsage = this.findLetterUsage(word);
    if (poolUsage) {
      // Can make from pool - do regular submission
      this.executeWordFromPool(client, player, word, poolUsage);
      return;
    }

    // Try 2: Find swipe combination (existing words + pool letters)
    const swipeCombo = this.findSwipeCombination(word);
    if (swipeCombo) {
      // Found a swipe - execute it
      this.executeSwipe(client, player, word, swipeCombo);
      return;
    }

    // Couldn't find any way to make this word
    client.send('wordResult', { success: false, reason: 'Cannot make this word from available letters' });
  }

  /**
   * Find a combination of existing words + pool letters that can make the target word
   * Returns the word IDs to steal and which pool letters to use
   */
  private findSwipeCombination(targetWord: string): { wordIds: string[]; poolLetters: Letter[] } | null {
    if (!this.stealService) return null;

    const allWords = Array.from(this.state.allWords);

    // Try single-word swipes first (most common)
    for (const existingWord of allWords) {
      const result = this.stealService.validateSteal({
        targetWords: [{
          id: existingWord.id,
          word: existingWord.word,
          letters: Array.from(existingWord.letters),
        }],
        newWord: targetWord,
        availableLetters: Array.from(this.state.availableLetters),
      });

      if (result.success) {
        return {
          wordIds: [existingWord.id],
          poolLetters: result.lettersFromPool!,
        };
      }
    }

    // Try two-word combinations
    for (let i = 0; i < allWords.length; i++) {
      for (let j = i + 1; j < allWords.length; j++) {
        const result = this.stealService.validateSteal({
          targetWords: [
            { id: allWords[i].id, word: allWords[i].word, letters: Array.from(allWords[i].letters) },
            { id: allWords[j].id, word: allWords[j].word, letters: Array.from(allWords[j].letters) },
          ],
          newWord: targetWord,
          availableLetters: Array.from(this.state.availableLetters),
        });

        if (result.success) {
          return {
            wordIds: [allWords[i].id, allWords[j].id],
            poolLetters: result.lettersFromPool!,
          };
        }
      }
    }

    // Could extend to 3+ word combinations but that's rare
    return null;
  }

  /**
   * Execute a word creation from pool letters only
   */
  private executeWordFromPool(client: Client, player: Player, wordStr: string, letters: Letter[]) {
    const newWord = new Word();
    newWord.id = nanoid(8);
    newWord.word = wordStr;
    newWord.ownerId = client.sessionId;
    newWord.createdAt = Date.now();

    let score = 0;
    for (const letter of letters) {
      newWord.letters.push(letter);
      score += letter.value;
      const idx = this.state.availableLetters.findIndex(l => l.id === letter.id);
      if (idx !== -1) {
        this.state.availableLetters.splice(idx, 1);
      }
    }
    newWord.score = score;

    player.words.push(newWord);
    player.score += score;
    this.state.allWords.push(newWord);

    this.state.lastPoolActivity = Date.now(); // Reset stagnation timer
    this.scheduleLetterRefill();

    client.send('wordResult', { success: true, wordId: newWord.id });
    this.broadcast('wordClaimed', {
      playerId: client.sessionId,
      handle: player.handle,
      word: wordStr,
      score: score,
      isAI: false,
    });

    this.log(`${player.handle} claimed "${wordStr}" for ${score} points`);
  }

  /**
   * Execute a swipe (steal words and create new one)
   */
  private executeSwipe(client: Client, player: Player, wordStr: string, combo: { wordIds: string[]; poolLetters: Letter[] }) {
    // Gather all target words
    const targetWords: Array<{ id: string; word: string; letters: Letter[]; ownerId: string; score: number }> = [];
    for (const wordId of combo.wordIds) {
      const word = this.state.allWords.find(w => w.id === wordId)!;
      targetWords.push({
        id: word.id,
        word: word.word,
        letters: Array.from(word.letters),
        ownerId: word.ownerId,
        score: word.score,
      });
    }

    // Create the new word
    const newWord = new Word();
    newWord.id = nanoid(8);
    newWord.word = wordStr;
    newWord.ownerId = client.sessionId;
    newWord.createdAt = Date.now();
    newWord.stolenFrom = targetWords.map(t => t.ownerId).join(',');

    // Add all letters (from targets + pool)
    let score = 0;
    for (const target of targetWords) {
      for (const letter of target.letters) {
        newWord.letters.push(letter);
        score += letter.value;
      }
    }
    for (const letter of combo.poolLetters) {
      newWord.letters.push(letter);
      score += letter.value;
      const idx = this.state.availableLetters.findIndex(l => l.id === letter.id);
      if (idx !== -1) {
        this.state.availableLetters.splice(idx, 1);
      }
    }
    newWord.score = score;

    // Remove stolen words from original owners
    for (const target of targetWords) {
      const wordIdx = this.state.allWords.findIndex(w => w.id === target.id);
      if (wordIdx !== -1) {
        this.state.allWords.splice(wordIdx, 1);
      }

      const owner = this.state.players.get(target.ownerId);
      if (owner) {
        const ownerWordIdx = owner.words.findIndex(w => w.id === target.id);
        if (ownerWordIdx !== -1) {
          owner.score -= owner.words[ownerWordIdx].score;
          owner.words.splice(ownerWordIdx, 1);
        }
      }
    }

    // Add new word to player
    player.words.push(newWord);
    player.score += score;
    this.state.allWords.push(newWord);

    this.state.lastPoolActivity = Date.now(); // Reset stagnation timer
    this.scheduleLetterRefill();

    const stolenWordsList = targetWords.map(t => t.word).join(' + ');
    client.send('wordResult', { success: true, wordId: newWord.id, wasSwipe: true });
    this.broadcast('wordStolen', {
      stealerId: client.sessionId,
      stealerHandle: player.handle,
      newWord: wordStr,
      stolenWords: targetWords.map(t => ({ word: t.word, ownerId: t.ownerId, score: t.score })),
      score: score,
    });

    this.log(`${player.handle} swiped ${stolenWordsList} -> ${wordStr} for ${score} points`);
  }

  private handleWordSubmission(sessionId: string, wordStr: string, client?: Client): boolean {
    const player = this.state.players.get(sessionId);
    if (!player || this.state.phase !== 'playing') {
      client?.send('wordResult', { success: false, reason: 'Cannot submit word now' });
      return false;
    }

    const word = wordStr.toUpperCase().trim();

    // Validate word length
    if (word.length < GAME_CONSTANTS.MIN_WORD_LENGTH) {
      client?.send('wordResult', { success: false, reason: `Word must be at least ${GAME_CONSTANTS.MIN_WORD_LENGTH} letters` });
      return false;
    }

    // Validate against dictionary
    if (this.dictionary && !this.dictionary.isValidWord(word)) {
      client?.send('wordResult', { success: false, reason: 'Word not in dictionary' });
      return false;
    }

    // Check if letters are available
    const letterUsage = this.findLetterUsage(word);
    if (!letterUsage) {
      client?.send('wordResult', { success: false, reason: 'Letters not available' });
      return false;
    }

    // Create the word
    const newWord = new Word();
    newWord.id = nanoid(8);
    newWord.word = word;
    newWord.ownerId = sessionId;
    newWord.createdAt = Date.now();

    // Calculate score and consume letters
    let score = 0;
    for (const letter of letterUsage) {
      newWord.letters.push(letter);
      score += letter.value;
      // Remove from available
      const idx = this.state.availableLetters.findIndex(l => l.id === letter.id);
      if (idx !== -1) {
        this.state.availableLetters.splice(idx, 1);
      }
    }
    newWord.score = score;

    // Add to player and game
    player.words.push(newWord);
    player.score += score;
    this.state.allWords.push(newWord);

    // Schedule letter refill after delay (reset timer if already pending)
    this.scheduleLetterRefill();

    client?.send('wordResult', { success: true, wordId: newWord.id });
    this.broadcast('wordClaimed', {
      playerId: sessionId,
      handle: player.handle,
      word: word,
      score: score,
      isAI: this.aiStates.has(sessionId),
    });

    this.log(`${player.handle} claimed "${word}" for ${score} points`);
    return true;
  }

  private findLetterUsage(word: string): Letter[] | null {
    const needed = this.getLetterCounts(word);
    const result: Letter[] = [];
    const availableCopy = [...this.state.availableLetters];

    // First pass: exact matches
    for (const [char, count] of Object.entries(needed)) {
      for (let i = 0; i < count; i++) {
        const idx = availableCopy.findIndex(l => l.char === char && !l.isBlank);
        if (idx !== -1) {
          result.push(availableCopy.splice(idx, 1)[0]!);
          needed[char]!--;
        }
      }
    }

    // Second pass: use blanks for remaining
    for (const [char, count] of Object.entries(needed)) {
      for (let i = 0; i < count; i++) {
        const idx = availableCopy.findIndex(l => l.isBlank);
        if (idx !== -1) {
          const blank = availableCopy.splice(idx, 1)[0]!;
          blank.usedAs = char;
          result.push(blank);
        } else {
          return null; // Not enough letters
        }
      }
    }

    return result;
  }

  private getLetterCounts(word: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const char of word) {
      counts[char] = (counts[char] || 0) + 1;
    }
    return counts;
  }

  private handleStealAttempt(client: Client, targetWordIds: string[], newWordStr: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.phase !== 'playing') {
      client.send('stealResult', { success: false, reason: 'Cannot steal now' });
      return;
    }

    if (!this.stealService) {
      client.send('stealResult', { success: false, reason: 'Steal service not available' });
      return;
    }

    if (targetWordIds.length === 0) {
      client.send('stealResult', { success: false, reason: 'No target words selected' });
      return;
    }

    // Find target words and their owners
    const targetWords: Array<{ id: string; word: string; letters: Letter[]; ownerId: string; score: number }> = [];
    for (const wordId of targetWordIds) {
      const word = this.state.allWords.find(w => w.id === wordId);
      if (!word) {
        client.send('stealResult', { success: false, reason: `Word not found: ${wordId}` });
        return;
      }
      targetWords.push({
        id: word.id,
        word: word.word,
        letters: Array.from(word.letters),
        ownerId: word.ownerId,
        score: word.score,
      });
    }

    // Validate the steal
    const result = this.stealService.validateSteal({
      targetWords,
      newWord: newWordStr,
      availableLetters: Array.from(this.state.availableLetters),
    });

    if (!result.success) {
      client.send('stealResult', { success: false, reason: result.reason });
      return;
    }

    // Execute the steal!
    const newWord = new Word();
    newWord.id = nanoid(8);
    newWord.word = newWordStr.toUpperCase();
    newWord.ownerId = client.sessionId;
    newWord.createdAt = Date.now();
    newWord.score = result.totalScore!;
    newWord.stolenFrom = targetWords.map(t => t.ownerId).join(',');

    // Add letters to the new word
    for (const letter of [...result.lettersFromTargets!, ...result.lettersFromPool!]) {
      newWord.letters.push(letter);
    }

    // Remove letters from available pool
    for (const letter of result.lettersFromPool!) {
      const idx = this.state.availableLetters.findIndex(l => l.id === letter.id);
      if (idx !== -1) {
        this.state.availableLetters.splice(idx, 1);
      }
    }

    // Remove stolen words from original owners and the allWords list
    const affectedOwners = new Map<string, number>(); // ownerId -> score lost
    for (const target of targetWords) {
      // Remove from allWords
      const wordIdx = this.state.allWords.findIndex(w => w.id === target.id);
      if (wordIdx !== -1) {
        this.state.allWords.splice(wordIdx, 1);
      }

      // Remove from owner's words and update score
      const owner = this.state.players.get(target.ownerId);
      if (owner) {
        const ownerWordIdx = owner.words.findIndex(w => w.id === target.id);
        if (ownerWordIdx !== -1) {
          const removedWord = owner.words[ownerWordIdx];
          owner.score -= removedWord.score;
          owner.words.splice(ownerWordIdx, 1);
          affectedOwners.set(target.ownerId, (affectedOwners.get(target.ownerId) || 0) + removedWord.score);
        }
      }
    }

    // Add new word to stealer
    player.words.push(newWord);
    player.score += newWord.score;
    this.state.allWords.push(newWord);

    // Schedule letter refill
    this.scheduleLetterRefill();

    // Notify everyone
    const stolenWordsList = targetWords.map(t => t.word).join(' + ');
    client.send('stealResult', { success: true, wordId: newWord.id });
    this.broadcast('wordStolen', {
      stealerId: client.sessionId,
      stealerHandle: player.handle,
      newWord: newWord.word,
      stolenWords: targetWords.map(t => ({ word: t.word, ownerId: t.ownerId, score: t.score })),
      score: newWord.score,
    });

    this.log(`${player.handle} stole ${stolenWordsList} -> ${newWord.word} for ${newWord.score} points`);
  }

  private generateRoomName(): string {
    const adjectives = [
      'Cosmic', 'Neon', 'Velvet', 'Crystal', 'Thunder', 'Mystic', 'Golden', 'Silver',
      'Electric', 'Midnight', 'Crimson', 'Azure', 'Emerald', 'Phantom', 'Radiant',
      'Wild', 'Swift', 'Bold', 'Fierce', 'Zen', 'Epic', 'Lucky', 'Royal', 'Turbo'
    ];
    const nouns = [
      'Dragons', 'Phoenix', 'Wolves', 'Ravens', 'Tigers', 'Sharks', 'Eagles', 'Lions',
      'Ninjas', 'Pirates', 'Wizards', 'Knights', 'Pandas', 'Foxes', 'Owls', 'Hawks',
      'Vipers', 'Falcons', 'Cobras', 'Jaguars', 'Otters', 'Badgers', 'Crows', 'Lynx'
    ];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
  }

  override onDispose() {
    if (this.refillTimeout) {
      clearTimeout(this.refillTimeout);
    }
    if (this.letterExpirationInterval) {
      clearInterval(this.letterExpirationInterval);
    }
    this.stopAIThinking();
    this.aiStates.clear();
    this.log('Room disposed');
  }
}
