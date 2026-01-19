import { Room, Client } from 'colyseus';
import { GameState, Player, Letter, Word, GAME_CONSTANTS, LETTER_VALUES, buildLetterPool } from '@swipe/shared';
import { nanoid } from 'nanoid';
import type { DictionaryService } from '../services/DictionaryService.js';
import { AIPlayerService, type AIDifficulty, type AIPlayer } from '../services/AIPlayerService.js';

interface JoinOptions {
  odId: string;
  handle: string;
  aiOpponents?: Array<{ difficulty: AIDifficulty }>;
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
  private roundInterval?: ReturnType<typeof setInterval>;
  private letterPool: string[] = [];
  private dictionary?: DictionaryService;
  private aiService?: AIPlayerService;
  private aiStates: Map<string, AIState> = new Map();

  override onCreate(options: { dictionary?: DictionaryService }) {
    this.setState(new GameState());
    this.letterPool = buildLetterPool();
    this.dictionary = options.dictionary;
    this.maxClients = GAME_CONSTANTS.MAX_PLAYERS;

    if (this.dictionary) {
      this.aiService = new AIPlayerService(this.dictionary);
    }

    console.log('Game room created');

    // Handle word submissions
    this.onMessage('submitWord', (client, message: SubmitWordMessage) => {
      this.handleWordSubmission(client.sessionId, message.word, client);
    });

    // Handle steal attempts
    this.onMessage('stealWord', (client, message: { targetWordId: string; newWord: string }) => {
      this.handleStealAttempt(client, message.targetWordId, message.newWord);
    });

    // Handle adding AI opponents
    this.onMessage('addAI', (client, message: { difficulty: AIDifficulty }) => {
      this.addAIPlayer(message.difficulty);
    });

    // Handle starting game (for single player vs AI)
    this.onMessage('startGame', () => {
      if (this.state.phase === 'waiting' && this.state.players.size >= 1) {
        this.startCountdown();
      }
    });
  }

  override onJoin(client: Client, options: JoinOptions) {
    console.log(`Player ${options.handle} joined game`);

    const player = new Player();
    player.sessionId = client.sessionId;
    player.odId = options.odId;
    player.handle = options.handle;
    player.score = 0;
    player.isConnected = true;

    this.state.players.set(client.sessionId, player);

    // Add AI opponents if specified
    if (options.aiOpponents && this.aiService) {
      for (const ai of options.aiOpponents) {
        this.addAIPlayer(ai.difficulty);
      }
    }

    // Auto-start countdown if we have 2+ players (including AI)
    if (this.state.players.size >= GAME_CONSTANTS.MIN_PLAYERS && this.state.phase === 'waiting') {
      this.startCountdown();
    }
  }

  private addAIPlayer(difficulty: AIDifficulty): void {
    if (!this.aiService) {
      console.warn('AI service not available (dictionary not loaded)');
      return;
    }

    if (this.state.players.size >= GAME_CONSTANTS.MAX_PLAYERS) {
      console.log('Room is full, cannot add AI');
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

    console.log(`AI player ${aiPlayer.handle} (${difficulty}) added to game`);

    // Broadcast AI joined
    this.broadcast('playerJoined', {
      sessionId: aiPlayer.id,
      handle: aiPlayer.handle,
      isAI: true,
      difficulty,
    });

    // Auto-start if we now have enough players
    if (this.state.players.size >= GAME_CONSTANTS.MIN_PLAYERS && this.state.phase === 'waiting') {
      this.startCountdown();
    }
  }

  override onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isConnected = false;
      console.log(`Player ${player.handle} disconnected`);

      // Allow reconnection for a period
      if (!consented) {
        this.allowReconnection(client, 30).then(() => {
          player.isConnected = true;
          console.log(`Player ${player.handle} reconnected`);
        }).catch(() => {
          console.log(`Player ${player.handle} failed to reconnect`);
        });
      }
    }
  }

  private startCountdown() {
    this.state.phase = 'countdown';
    this.state.countdownEndTime = Date.now() + GAME_CONSTANTS.LOBBY_COUNTDOWN_MS;

    this.broadcast('countdownStarted', {
      endTime: this.state.countdownEndTime,
    });

    setTimeout(() => {
      this.startRound();
    }, GAME_CONSTANTS.LOBBY_COUNTDOWN_MS);
  }

  private startRound() {
    this.state.phase = 'playing';
    this.state.roundNumber++;
    this.state.roundStartTime = Date.now();
    this.state.roundEndTime = Date.now() + GAME_CONSTANTS.ROUND_DURATION_MS;

    // Add new letters to fill up to 8
    this.fillLetters();

    console.log(`Round ${this.state.roundNumber} started`);

    // Start AI thinking
    this.startAIThinking();

    // Set up round timer
    this.roundInterval = setInterval(() => {
      if (Date.now() >= this.state.roundEndTime) {
        this.endRound();
      }
    }, 1000);
  }

  private endRound() {
    if (this.roundInterval) {
      clearInterval(this.roundInterval);
      this.roundInterval = undefined;
    }

    // Stop AI thinking
    this.stopAIThinking();

    this.state.phase = 'round_end';
    console.log(`Round ${this.state.roundNumber} ended`);

    // Short pause, then start next round
    setTimeout(() => {
      this.startRound();
    }, 3000);
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
      const char = this.drawRandomLetter();
      const letter = new Letter();
      letter.id = nanoid(8);
      letter.char = char;
      letter.value = LETTER_VALUES[char] ?? 0;
      letter.isBlank = char === '*';
      this.state.availableLetters.push(letter);
    }
  }

  private drawRandomLetter(): string {
    // Shuffle and draw from pool, reset if empty
    if (this.letterPool.length === 0) {
      this.letterPool = buildLetterPool();
    }
    const index = Math.floor(Math.random() * this.letterPool.length);
    return this.letterPool.splice(index, 1)[0]!;
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

    // Check if word already claimed
    const alreadyClaimed = this.state.allWords.some(w => w.word === word);
    if (alreadyClaimed) {
      client?.send('wordResult', { success: false, reason: 'Word already claimed' });
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

    // Refill letters
    this.fillLetters();

    client?.send('wordResult', { success: true, wordId: newWord.id });
    this.broadcast('wordClaimed', {
      playerId: sessionId,
      handle: player.handle,
      word: word,
      score: score,
      isAI: this.aiStates.has(sessionId),
    });

    console.log(`${player.handle} claimed "${word}" for ${score} points`);
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

  private handleStealAttempt(client: Client, targetWordId: string, newWordStr: string) {
    // TODO: Implement steal logic with WordStealService
    client.send('stealResult', { success: false, reason: 'Stealing not yet implemented' });
  }

  override onDispose() {
    if (this.roundInterval) {
      clearInterval(this.roundInterval);
    }
    this.stopAIThinking();
    this.aiStates.clear();
    console.log('Game room disposed');
  }
}
