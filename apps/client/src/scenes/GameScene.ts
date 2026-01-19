import Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import type { AuthUser } from '@swipe/shared';
import { GAME_CONSTANTS } from '@swipe/shared';

// Use any for room state since client-side schema decoding differs
type GameRoomState = any;
type Letter = any;
type Player = any;
type Word = any;

type AIDifficulty = 'easy' | 'medium' | 'hard';

interface GameSceneData {
  players?: Array<{ sessionId: string; odId: string; handle: string }>;
  roomId?: string;
  aiOpponents?: Array<{ difficulty: AIDifficulty }>;
}

export class GameScene extends Phaser.Scene {
  private client?: Client;
  private room?: Room<GameRoomState>;
  private user?: AuthUser;
  private sceneData?: GameSceneData;

  // UI elements
  private letterTiles: Phaser.GameObjects.Container[] = [];
  private wordInput: string = '';
  private wordInputText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private scoreTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private wordLists: Map<string, Phaser.GameObjects.Text> = new Map();
  private statusText?: Phaser.GameObjects.Text;
  private feedbackContainer?: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData) {
    this.sceneData = data;
    console.log('Game scene initialized with:', data);
  }

  create() {
    this.user = this.registry.get('user');
    const { width, height } = this.cameras.main;

    // Reset state
    this.letterTiles = [];
    this.scoreTexts.clear();
    this.wordLists.clear();
    this.wordInput = '';

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Title
    this.add.text(width / 2, 30, 'SWIPE', {
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#4ecdc4',
    }).setOrigin(0.5);

    // Timer
    this.timerText = this.add.text(width / 2, 70, '--', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffd93d',
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(width / 2, 110, 'Connecting...', {
      fontSize: '18px',
      color: '#888888',
    }).setOrigin(0.5);

    // Letter area (center)
    this.createLetterArea();

    // Word input display
    this.wordInputText = this.add.text(width / 2, 380, '(type a word)', {
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#666666',
      backgroundColor: '#2a2a4e',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5);

    // Instructions
    this.add.text(width / 2, 430, 'Type a word and press ENTER to submit | ESC to clear', {
      fontSize: '14px',
      color: '#666666',
    }).setOrigin(0.5);

    // Feedback container for floating text
    this.feedbackContainer = this.add.container(width / 2, 500);

    // Back button
    const backButton = this.add.rectangle(80, 30, 100, 30, 0x4a4a6e)
      .setInteractive({ useHandCursor: true });
    this.add.text(80, 30, '← Back', {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);
    backButton.on('pointerdown', () => {
      this.leaveGame();
      this.scene.start('LobbyScene');
    });

    // Keyboard input
    this.input.keyboard?.on('keydown', this.handleKeyInput, this);

    // Connect to game
    this.connectToGame();
  }

  private createLetterArea() {
    const centerX = this.cameras.main.width / 2;
    const startX = centerX - (GAME_CONSTANTS.LETTERS_PER_ROUND * 70) / 2 + 35;

    for (let i = 0; i < GAME_CONSTANTS.LETTERS_PER_ROUND; i++) {
      const x = startX + i * 70;
      const container = this.add.container(x, 250);

      const bg = this.add.rectangle(0, 0, 60, 60, 0x2a2a4e)
        .setStrokeStyle(2, 0x4ecdc4);
      const text = this.add.text(0, 0, '', {
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5);
      const valueText = this.add.text(20, 20, '', {
        fontSize: '12px',
        color: '#4ecdc4',
      }).setOrigin(0.5);

      container.add([bg, text, valueText]);
      this.letterTiles.push(container);
    }
  }

  private async connectToGame() {
    try {
      const wsUrl = import.meta.env.PROD
        ? `wss://${window.location.host}`
        : 'ws://localhost:2567';

      this.client = new Client(wsUrl);

      // Join with AI opponents if specified
      this.room = await this.client.joinOrCreate<GameRoomState>('game', {
        odId: this.user?.id ?? 'guest',
        handle: this.user?.handle ?? 'Guest',
        aiOpponents: this.sceneData?.aiOpponents,
      });

      this.statusText?.setText('Waiting for game to start...');

      // Listen to state changes
      this.room.state.listen('phase', (phase: string) => {
        this.updatePhase(phase);
      });

      this.room.state.listen('roundEndTime', (endTime: number) => {
        if (endTime > 0) {
          this.updateTimer(endTime);
        }
      });

      this.room.state.availableLetters.onAdd(() => {
        this.updateLetterDisplay();
      });

      this.room.state.availableLetters.onRemove(() => {
        this.updateLetterDisplay();
      });

      this.room.state.players.onAdd((player: any, sessionId: string) => {
        this.addPlayerDisplay(player, sessionId);
      });

      // Add existing players
      this.room.state.players.forEach((player: any, sessionId: string) => {
        this.addPlayerDisplay(player, sessionId);
      });

      // Listen for word results
      this.room.onMessage('wordResult', (result: any) => {
        if (result.success) {
          this.wordInput = '';
          this.updateWordInputDisplay();
          this.showFeedback('Word accepted!', '#4ecdc4');
        } else {
          this.showFeedback(result.reason || 'Invalid word', '#ff6b6b');
        }
      });

      this.room.onMessage('wordClaimed', (data: any) => {
        const color = data.isAI ? '#ffd93d' : '#4ecdc4';
        this.showFeedback(`${data.handle}: ${data.word} (+${data.score})`, color);
        this.updateAllPlayerDisplays();
      });

      this.room.onMessage('playerJoined', (data: any) => {
        console.log('Player joined:', data);
      });

      this.room.onMessage('countdownStarted', () => {
        this.statusText?.setText('Game starting...');
      });

    } catch (error) {
      console.error('Failed to connect to game:', error);
      this.statusText?.setText('Connection failed. Click Back to retry.');
    }
  }

  private updatePhase(phase: string) {
    switch (phase) {
      case 'waiting':
        this.statusText?.setText('Waiting for players...');
        break;
      case 'countdown':
        this.statusText?.setText('Get ready!');
        break;
      case 'playing':
        this.statusText?.setText('GO! Type words!');
        break;
      case 'round_end':
        this.statusText?.setText('Round over! Next round starting...');
        break;
      case 'game_end':
        this.statusText?.setText('Game over!');
        break;
    }
  }

  private updateTimer(endTime: number) {
    const updateFn = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      this.timerText?.setText(`${remaining}`);

      if (remaining <= 5) {
        this.timerText?.setColor('#ff6b6b');
      } else {
        this.timerText?.setColor('#ffd93d');
      }
    };

    updateFn();
    const timer = this.time.addEvent({
      delay: 100,
      callback: updateFn,
      loop: true,
    });

    this.time.delayedCall(Math.max(0, endTime - Date.now() + 1000), () => timer.destroy());
  }

  private updateLetterDisplay() {
    const letters = this.room?.state.availableLetters;
    if (!letters) return;

    this.letterTiles.forEach((container, i) => {
      const letterData = letters[i];
      const textObj = container.getAt(1) as Phaser.GameObjects.Text;
      const valueObj = container.getAt(2) as Phaser.GameObjects.Text;
      const bgObj = container.getAt(0) as Phaser.GameObjects.Rectangle;

      if (letterData) {
        const displayChar = letterData.isBlank ? '★' : letterData.char;
        textObj.setText(displayChar);
        valueObj.setText(`${letterData.value}`);
        bgObj.setFillStyle(letterData.isBlank ? 0x4a4a6e : 0x2a2a4e);
      } else {
        textObj.setText('');
        valueObj.setText('');
        bgObj.setFillStyle(0x2a2a4e);
      }
    });
  }

  private addPlayerDisplay(player: Player, sessionId: string) {
    const isMe = sessionId === this.room?.sessionId;
    const playerArray = Array.from(this.room?.state.players.keys() ?? []);
    const index = playerArray.indexOf(sessionId);

    // Position players in corners
    const positions = [
      { x: 150, y: 550 },   // Bottom left
      { x: 1130, y: 550 },  // Bottom right
      { x: 150, y: 180 },   // Top left
      { x: 1130, y: 180 },  // Top right
    ];

    const pos = positions[index % 4] ?? positions[0];

    // Handle - color differently for AI vs human
    const isAI = sessionId.startsWith('ai_');
    let color = '#ffffff';
    if (isMe) color = '#4ecdc4';
    else if (isAI) color = '#ffd93d';

    const handleText = this.add.text(pos.x, pos.y, player.handle + (isAI ? ' 🤖' : ''), {
      fontSize: '16px',
      fontStyle: 'bold',
      color,
    }).setOrigin(0.5);

    // Score
    const scoreText = this.add.text(pos.x, pos.y + 22, `Score: ${player.score}`, {
      fontSize: '14px',
      color: '#ffd93d',
    }).setOrigin(0.5);
    this.scoreTexts.set(sessionId, scoreText);

    // Listen for score changes
    player.listen('score', (score: number) => {
      scoreText.setText(`Score: ${score}`);
    });

    // Word list
    const wordListText = this.add.text(pos.x, pos.y + 45, '', {
      fontSize: '11px',
      color: '#888888',
      align: 'center',
      wordWrap: { width: 180 },
    }).setOrigin(0.5, 0);
    this.wordLists.set(sessionId, wordListText);

    player.words.onAdd(() => {
      this.updateWordList(sessionId);
    });
  }

  private updateAllPlayerDisplays() {
    this.room?.state.players.forEach((_: any, sessionId: string) => {
      this.updateWordList(sessionId);
      const player = this.room?.state.players.get(sessionId);
      const scoreText = this.scoreTexts.get(sessionId);
      if (player && scoreText) {
        scoreText.setText(`Score: ${player.score}`);
      }
    });
  }

  private updateWordList(sessionId: string) {
    const player = this.room?.state.players.get(sessionId);
    const textObj = this.wordLists.get(sessionId);
    if (!player || !textObj) return;

    const words = Array.from(player.words).map((w: any) => w.word).join(', ');
    textObj.setText(words);
  }

  private handleKeyInput(event: KeyboardEvent) {
    if (this.room?.state.phase !== 'playing') return;

    if (event.key === 'Enter') {
      this.submitWord();
    } else if (event.key === 'Backspace') {
      this.wordInput = this.wordInput.slice(0, -1);
      this.updateWordInputDisplay();
    } else if (event.key === 'Escape') {
      this.wordInput = '';
      this.updateWordInputDisplay();
    } else if (/^[a-zA-Z]$/.test(event.key)) {
      this.wordInput += event.key.toUpperCase();
      this.updateWordInputDisplay();
    }
  }

  private updateWordInputDisplay() {
    this.wordInputText?.setText(this.wordInput || '(type a word)');
    this.wordInputText?.setColor(this.wordInput ? '#ffffff' : '#666666');
  }

  private submitWord() {
    if (this.wordInput.length < GAME_CONSTANTS.MIN_WORD_LENGTH) {
      this.showFeedback(`Word must be at least ${GAME_CONSTANTS.MIN_WORD_LENGTH} letters`, '#ff6b6b');
      return;
    }

    this.room?.send('submitWord', { word: this.wordInput });
  }

  private showFeedback(message: string, color: string) {
    const feedback = this.add.text(0, 0, message, {
      fontSize: '20px',
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.feedbackContainer?.add(feedback);

    this.tweens.add({
      targets: feedback,
      alpha: 0,
      y: -50,
      duration: 2000,
      onComplete: () => {
        feedback.destroy();
      },
    });
  }

  private leaveGame() {
    this.input.keyboard?.off('keydown', this.handleKeyInput, this);
    if (this.room) {
      this.room.leave();
      this.room = undefined;
    }
  }

  shutdown() {
    this.leaveGame();
  }
}
