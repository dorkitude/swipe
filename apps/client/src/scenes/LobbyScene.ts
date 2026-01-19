import Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import type { AuthUser } from '@swipe/shared';

// Use any for room state since client-side schema decoding differs
type LobbyRoomState = any;
type AIDifficulty = 'easy' | 'medium' | 'hard';

export class LobbyScene extends Phaser.Scene {
  private client?: Client;
  private room?: Room<LobbyRoomState>;
  private user?: AuthUser;
  private playerListText?: Phaser.GameObjects.Text;
  private countdownText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create() {
    this.user = this.registry.get('user');
    const centerX = this.cameras.main.centerX;

    // Title
    this.add.text(centerX, 50, 'SWIPE', {
      fontSize: '48px',
      fontStyle: 'bold',
      color: '#4ecdc4',
    }).setOrigin(0.5);

    // User info
    this.add.text(centerX, 100, `Playing as: ${this.user?.handle ?? 'Guest'}`, {
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // ===== Play vs AI Section =====
    this.add.text(centerX, 170, '— Play vs AI —', {
      fontSize: '20px',
      color: '#888888',
    }).setOrigin(0.5);

    // AI difficulty buttons
    const difficulties: Array<{ label: string; difficulty: AIDifficulty; color: number; desc: string }> = [
      { label: 'Easy', difficulty: 'easy', color: 0x4ecdc4, desc: 'Slow, simple words' },
      { label: 'Medium', difficulty: 'medium', color: 0xffd93d, desc: 'Balanced challenge' },
      { label: 'Hard', difficulty: 'hard', color: 0xff6b6b, desc: 'Fast, complex words' },
    ];

    difficulties.forEach((diff, i) => {
      const x = centerX - 200 + i * 200;
      const y = 240;

      const btn = this.add.rectangle(x, y, 150, 60, diff.color)
        .setInteractive({ useHandCursor: true });

      this.add.text(x, y - 8, `🤖 ${diff.label}`, {
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#1a1a2e',
      }).setOrigin(0.5);

      this.add.text(x, y + 15, diff.desc, {
        fontSize: '11px',
        color: '#1a1a2e',
      }).setOrigin(0.5);

      btn.on('pointerover', () => btn.setAlpha(0.8));
      btn.on('pointerout', () => btn.setAlpha(1));
      btn.on('pointerdown', () => {
        this.startGameWithAI(diff.difficulty);
      });
    });

    // Multi-AI option
    this.add.text(centerX, 310, 'Or play against multiple AIs:', {
      fontSize: '14px',
      color: '#666666',
    }).setOrigin(0.5);

    const multiAIBtn = this.add.rectangle(centerX, 350, 200, 40, 0x4a4a6e)
      .setInteractive({ useHandCursor: true });
    this.add.text(centerX, 350, '🤖🤖🤖 3 Hard AIs', {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);
    multiAIBtn.on('pointerover', () => multiAIBtn.setAlpha(0.8));
    multiAIBtn.on('pointerout', () => multiAIBtn.setAlpha(1));
    multiAIBtn.on('pointerdown', () => {
      this.startGameWithAI('hard', 3);
    });

    // ===== Multiplayer Section =====
    this.add.text(centerX, 430, '— Multiplayer Lobby —', {
      fontSize: '20px',
      color: '#888888',
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(centerX, 470, 'Click "Join Lobby" to find other players', {
      fontSize: '16px',
      color: '#ffd93d',
    }).setOrigin(0.5);

    // Join lobby button
    const joinBtn = this.add.rectangle(centerX, 520, 200, 50, 0x4285f4)
      .setInteractive({ useHandCursor: true });
    this.add.text(centerX, 520, 'Join Lobby', {
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);
    joinBtn.on('pointerover', () => joinBtn.setAlpha(0.8));
    joinBtn.on('pointerout', () => joinBtn.setAlpha(1));
    joinBtn.on('pointerdown', () => {
      this.connectToLobby();
    });

    // Player list
    this.playerListText = this.add.text(centerX, 580, '', {
      fontSize: '14px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);

    // Countdown
    this.countdownText = this.add.text(centerX, 640, '', {
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#ff6b6b',
    }).setOrigin(0.5);

    // Profile button
    const profileButton = this.add.rectangle(1180, 40, 100, 35, 0x4ecdc4)
      .setInteractive({ useHandCursor: true });
    this.add.text(1180, 40, 'Profile', {
      fontSize: '14px',
      color: '#1a1a2e',
    }).setOrigin(0.5);
    profileButton.on('pointerdown', () => {
      this.leaveRoom();
      this.scene.start('ProfileScene');
    });
  }

  private startGameWithAI(difficulty: AIDifficulty, count: number = 1) {
    const aiOpponents = Array(count).fill({ difficulty });
    this.scene.start('GameScene', { aiOpponents });
  }

  private async connectToLobby() {
    if (this.room) {
      this.statusText?.setText('Already connected to lobby');
      return;
    }

    this.statusText?.setText('Connecting...');

    try {
      const wsUrl = import.meta.env.PROD
        ? `wss://${window.location.host}`
        : 'ws://localhost:2567';

      this.client = new Client(wsUrl);

      this.room = await this.client.joinOrCreate<LobbyRoomState>('lobby', {
        odId: this.user?.id ?? 'guest',
        handle: this.user?.handle ?? 'Guest',
      });

      this.statusText?.setText('Waiting for players...');

      // Listen to state changes
      this.room.state.players.onAdd((player: any, sessionId: string) => {
        this.updatePlayerList();
      });

      this.room.state.players.onRemove((player: any, sessionId: string) => {
        this.updatePlayerList();
      });

      this.room.state.listen('status', (status: string) => {
        this.updateStatus(status);
      });

      this.room.state.listen('countdownEndTime', (endTime: number) => {
        if (endTime > 0) {
          this.startCountdown(endTime);
        } else {
          this.countdownText?.setText('');
        }
      });

      // Listen for game start
      this.room.onMessage('gameStart', (data: any) => {
        console.log('Game starting!', data);
        this.scene.start('GameScene', {
          players: data.players,
          roomId: (this.room as any)?.roomId,
        });
      });

      this.updatePlayerList();

    } catch (error) {
      console.error('Failed to connect to lobby:', error);
      this.statusText?.setText('Failed to connect. Try again.');
      this.room = undefined;
    }
  }

  private updatePlayerList() {
    if (!this.room?.state.players) return;

    const players = Array.from(this.room.state.players.values());
    const playerNames = players.map((p: any) => `• ${p.handle}`).join('\n');
    this.playerListText?.setText(playerNames || '');

    const count = players.length;
    if (count < 2) {
      this.statusText?.setText(`Waiting for players... (${count}/2 minimum)`);
    } else {
      this.statusText?.setText(`${count} players in lobby`);
    }
  }

  private updateStatus(status: string) {
    switch (status) {
      case 'waiting':
        this.statusText?.setText('Waiting for players...');
        break;
      case 'countdown':
        this.statusText?.setText('Game starting soon!');
        break;
      case 'starting':
        this.statusText?.setText('Starting game...');
        break;
    }
  }

  private startCountdown(endTime: number) {
    const updateCountdown = () => {
      const remaining = Math.ceil((endTime - Date.now()) / 1000);
      if (remaining > 0) {
        this.countdownText?.setText(`${remaining}`);
      } else {
        this.countdownText?.setText('GO!');
      }
    };

    updateCountdown();
    const timer = this.time.addEvent({
      delay: 100,
      callback: updateCountdown,
      loop: true,
    });

    // Clean up timer when leaving scene
    this.events.once('shutdown', () => timer.destroy());
  }

  private leaveRoom() {
    if (this.room) {
      this.room.leave();
      this.room = undefined;
    }
  }

  shutdown() {
    this.leaveRoom();
  }
}
