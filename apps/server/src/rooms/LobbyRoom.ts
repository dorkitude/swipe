import { Room, Client } from 'colyseus';
import { LobbyState, LobbyPlayer } from '@swipe/shared';
import { GAME_CONSTANTS } from '@swipe/shared';
import { nanoid } from 'nanoid';

interface JoinOptions {
  odId: string;
  handle: string;
}

export class LobbyRoom extends Room<LobbyState> {
  private countdownInterval?: ReturnType<typeof setInterval>;

  override onCreate() {
    this.setState(new LobbyState());
    this.state.lobbyId = nanoid(8);
    this.state.minPlayers = GAME_CONSTANTS.MIN_PLAYERS;
    this.state.maxPlayers = GAME_CONSTANTS.MAX_PLAYERS;

    console.log(`Lobby ${this.state.lobbyId} created`);

    // Handle ready toggle
    this.onMessage('setReady', (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isReady = ready;
        this.checkStartConditions();
      }
    });
  }

  override onJoin(client: Client, options: JoinOptions) {
    console.log(`Player ${options.handle} joined lobby ${this.state.lobbyId}`);

    const player = new LobbyPlayer();
    player.sessionId = client.sessionId;
    player.odId = options.odId;
    player.handle = options.handle;
    player.joinedAt = Date.now();
    player.isReady = false;

    this.state.players.set(client.sessionId, player);
    this.checkStartConditions();
  }

  override onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      console.log(`Player ${player.handle} left lobby ${this.state.lobbyId}`);
    }

    this.state.players.delete(client.sessionId);
    this.checkStartConditions();
  }

  private checkStartConditions() {
    const playerCount = this.state.players.size;

    // Cancel countdown if not enough players
    if (playerCount < this.state.minPlayers) {
      this.cancelCountdown();
      this.state.status = 'waiting';
      return;
    }

    // Start countdown if we have enough players and not already counting
    if (playerCount >= this.state.minPlayers && this.state.status === 'waiting') {
      this.startCountdown();
    }
  }

  private startCountdown() {
    this.state.status = 'countdown';
    this.state.countdownEndTime = Date.now() + GAME_CONSTANTS.LOBBY_COUNTDOWN_MS;

    console.log(`Lobby ${this.state.lobbyId} starting countdown`);

    this.countdownInterval = setInterval(() => {
      const remaining = this.state.countdownEndTime - Date.now();

      if (remaining <= 0) {
        this.startGame();
      }
    }, 1000);
  }

  private cancelCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
    }
    this.state.countdownEndTime = 0;
  }

  private async startGame() {
    this.cancelCountdown();
    this.state.status = 'starting';

    console.log(`Lobby ${this.state.lobbyId} starting game with ${this.state.players.size} players`);

    // Collect player data to pass to game room
    const playerData = Array.from(this.state.players.values()).map(p => ({
      sessionId: p.sessionId,
      odId: p.odId,
      handle: p.handle,
    }));

    // Create game room and transfer players
    // TODO: Implement game room creation and player transfer
    this.broadcast('gameStart', {
      message: 'Game starting!',
      players: playerData,
    });

    // Lock the room
    await this.lock();
  }

  override onDispose() {
    this.cancelCountdown();
    console.log(`Lobby ${this.state.lobbyId} disposed`);
  }
}
