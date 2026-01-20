import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Client, Room } from 'colyseus.js';
import { useUser } from '../context/UserContext';
import { GAME_CONSTANTS } from '@swipe/shared';
import { reportError } from '../utils/errorReporter';
import styles from './Game.module.css';

type AIDifficulty = 'easy' | 'medium' | 'hard';

interface LocationState {
  aiOpponents?: Array<{ difficulty: AIDifficulty }>;
}

interface Letter {
  id: string;
  char: string;
  value: number;
  isBlank: boolean;
  createdAt: number;
}

interface Word {
  id: string;
  word: string;
  score: number;
  ownerId: string;
}

interface Player {
  sessionId: string;
  handle: string;
  score: number;
  words: Word[];
}

interface FeedbackMessage {
  id: number;
  text: string;
  color: string;
}

interface MoveLogEntry {
  id: number;
  time: number;
  type: 'claim' | 'swipe';
  handle: string;
  word: string;
  score: number;
  isAI: boolean;
  stolenWords?: string[];
}

export function Game() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useUser();
  const state = location.state as LocationState | null;
  const roomIdFromUrl = searchParams.get('roomId');
  const testLetters = searchParams.get('testLetters'); // For deterministic testing
  const aiDifficulty = searchParams.get('ai') as AIDifficulty | null; // e.g., ?ai=easy

  const [room, setRoom] = useState<Room | null>(null);
  const [phase, setPhase] = useState<string>('connecting');
  const [roomName, setRoomName] = useState<string>('');
  const [letters, setLetters] = useState<Letter[]>([]);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [wordInput, setWordInput] = useState('');
  const [feedback, setFeedback] = useState<FeedbackMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [moveLog, setMoveLog] = useState<MoveLogEntry[]>([]);
  const [lastPoolActivity, setLastPoolActivity] = useState<number>(Date.now());

  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackIdRef = useRef(0);
  const moveLogIdRef = useRef(0);
  const clientRef = useRef<Client | null>(null);
  const connectingRef = useRef(false);
  const moveLogRef = useRef<HTMLDivElement>(null);

  const showFeedback = useCallback((text: string, color: string) => {
    const id = ++feedbackIdRef.current;
    setFeedback((prev) => [...prev, { id, text, color }]);
    setTimeout(() => {
      setFeedback((prev) => prev.filter((f) => f.id !== id));
    }, 3000);
  }, []);

  // Connect to game room
  useEffect(() => {
    if (!user) return;
    if (connectingRef.current) return; // Prevent double connection (React StrictMode)
    connectingRef.current = true;

    const connect = async () => {
      try {
        console.log('Connecting with testLetters:', testLetters, 'aiDifficulty:', aiDifficulty);

        const wsUrl = import.meta.env.PROD
          ? `wss://${window.location.host}`
          : 'ws://localhost:2567';

        const client = new Client(wsUrl);
        clientRef.current = client;

        let gameRoom: Room;

        const aiOpponents = aiDifficulty ? [{ difficulty: aiDifficulty }] : state?.aiOpponents;

        if (roomIdFromUrl) {
          // Rejoin existing room by ID
          try {
            gameRoom = await client.joinById(roomIdFromUrl, {
              odId: user.id,
              handle: user.handle,
              aiOpponents,
              testLetters: testLetters || undefined,
            });
            console.log('Rejoined room:', roomIdFromUrl);
          } catch (e) {
            // Room doesn't exist anymore, create new one
            console.log('Room not found, creating new one');
            gameRoom = await client.joinOrCreate('game', {
              odId: user.id,
              handle: user.handle,
              aiOpponents,
              testLetters: testLetters || undefined,
            });
          }
        } else {
          // Create or join new room
          gameRoom = await client.joinOrCreate('game', {
            odId: user.id,
            handle: user.handle,
            aiOpponents,
            testLetters: testLetters || undefined,
          });
        }

        // Update URL with roomId for sharing/rejoining (preserve other params)
        if (gameRoom.roomId && gameRoom.roomId !== roomIdFromUrl) {
          const newParams = new URLSearchParams(searchParams);
          newParams.set('roomId', gameRoom.roomId);
          setSearchParams(newParams, { replace: true });
        }

        setRoom(gameRoom);
        setPhase('waiting');

        // Listen to state changes via onStateChange
        let lastPhase = '';

        gameRoom.onStateChange((state) => {
          // Update phase
          if (state.phase !== lastPhase) {
            lastPhase = state.phase;
            console.log('Phase changed:', state.phase);
            setPhase(state.phase);
          }

          // Update room name
          if (state.roomName) {
            setRoomName(state.roomName);
          }

          // Sync letters from state
          if (state.availableLetters) {
            const letterArray: Letter[] = [];
            state.availableLetters.forEach((letter: any) => {
              letterArray.push({
                id: letter.id,
                char: letter.char,
                value: letter.value,
                isBlank: letter.isBlank,
                createdAt: letter.createdAt,
              });
            });
            setLetters(letterArray);
          }

          // Sync players from state
          if (state.players) {
            const playerMap = new Map<string, Player>();
            state.players.forEach((player: any, sessionId: string) => {
              playerMap.set(sessionId, {
                sessionId,
                handle: player.handle,
                score: player.score,
                words: Array.from(player.words || []).map((w: any) => ({
                  id: w.id,
                  word: w.word,
                  score: w.score,
                  ownerId: w.ownerId,
                })),
              });
            });
            setPlayers(playerMap);
          }

          // Sync lastPoolActivity for stagnation detection
          if (state.lastPoolActivity) {
            setLastPoolActivity(state.lastPoolActivity);
          }
        });

        // Listen to messages
        gameRoom.onMessage('wordResult', (result: any) => {
          if (result.success) {
            setWordInput('');
            showFeedback('Word accepted!', 'var(--accent-primary)');
          } else {
            showFeedback(result.reason || 'Invalid word', 'var(--accent-danger)');
          }
        });

        gameRoom.onMessage('wordClaimed', (data: any) => {
          const color = data.isAI ? 'var(--accent-secondary)' : 'var(--accent-primary)';
          showFeedback(`${data.handle}: ${data.word} (+${data.score})`, color);
          // Add to move log
          setMoveLog((prev) => [...prev, {
            id: ++moveLogIdRef.current,
            time: Date.now(),
            type: 'claim',
            handle: data.handle,
            word: data.word,
            score: data.score,
            isAI: data.isAI,
          }]);
        });

        gameRoom.onMessage('wordStolen', (data: any) => {
          const stolenList = data.stolenWords.map((w: any) => w.word).join(' + ');
          showFeedback(`${data.stealerHandle} swiped ${stolenList} → ${data.newWord}! 🔥`, 'var(--accent-warning)');
          // Add to move log
          setMoveLog((prev) => [...prev, {
            id: ++moveLogIdRef.current,
            time: Date.now(),
            type: 'swipe',
            handle: data.stealerHandle,
            word: data.newWord,
            score: data.score,
            isAI: data.stealerHandle.includes('Bot'),
            stolenWords: data.stolenWords.map((w: any) => w.word),
          }]);
        });

      } catch (err) {
        reportError(err, 'Game.connect');
        setError('Failed to connect to game server');
      }
    };

    connect();

    return () => {
      if (clientRef.current) {
        room?.leave();
      }
    };
  }, [user, state?.aiOpponents, showFeedback, roomIdFromUrl, setSearchParams]);

  // Focus input when playing
  useEffect(() => {
    if (phase === 'playing' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase]);

  // Update time for letter age calculations
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [phase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || phase !== 'playing') return;

    if (wordInput.length < GAME_CONSTANTS.MIN_WORD_LENGTH) {
      showFeedback(`Word must be at least ${GAME_CONSTANTS.MIN_WORD_LENGTH} letters`, 'var(--accent-danger)');
      return;
    }

    // Server will figure out if this is a new word or a swipe
    room.send('makeWord', { word: wordInput.toUpperCase() });
  };

  const handleBack = () => {
    room?.leave();
    navigate('/lobby');
  };

  const handleNewGame = () => {
    room?.leave();
    // Keep AI difficulty if present, but drop the roomId to force new room
    const params = new URLSearchParams();
    if (aiDifficulty) {
      params.set('ai', aiDifficulty);
    }
    // Navigate to same page but without roomId - forces new room creation
    navigate(`/game${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
    // Force page reload to reset all state cleanly
    window.location.reload();
  };

  const mySessionId = room?.sessionId;
  // Sort players: current user first, then by score descending
  const sortedPlayers = Array.from(players.values()).sort((a, b) => {
    // Current user always first
    if (a.sessionId === mySessionId) return -1;
    if (b.sessionId === mySessionId) return 1;
    // Then sort by score
    return b.score - a.score;
  });

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button className="btn-primary" onClick={handleBack}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerButtons}>
          <button className="btn-secondary" onClick={handleBack}>
            Back
          </button>
          <button className="btn-secondary" onClick={handleNewGame}>
            New Game
          </button>
        </div>
        <h1 className={styles.logo}>SWIPE</h1>
        <div className={styles.roomNameHeader}>{roomName}</div>
      </header>

      {phase !== 'playing' && (
        <div className={styles.status}>
          {phase === 'connecting' && 'Connecting...'}
          {phase === 'waiting' && 'Waiting for players...'}
        </div>
      )}

      <main className={styles.main}>
        <section className={styles.gameArea}>
          {/* 1. Input form */}
          <form className={styles.inputForm} onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={wordInput}
              onChange={(e) => setWordInput(e.target.value.toUpperCase())}
              placeholder="Type a word..."
              disabled={phase !== 'playing'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={phase !== 'playing' || wordInput.length < GAME_CONSTANTS.MIN_WORD_LENGTH}
            >
              Submit
            </button>
          </form>

          {/* 2. Available letters pool */}
          <div className={styles.letters}>
            {(() => {
              // Check if pool is stagnant
              const stagnationTime = now - lastPoolActivity;
              const isPoolStagnant = stagnationTime >= GAME_CONSTANTS.LETTER_FADE_START_MS;
              const isPoolExpiring = stagnationTime >= GAME_CONSTANTS.LETTER_EXPIRE_MS - 2000;

              // Find the 5 oldest letters (only relevant when stagnant)
              const sortedByAge = [...letters].sort((a, b) => a.createdAt - b.createdAt);
              const oldestFiveIds = new Set(sortedByAge.slice(0, 5).map(l => l.id));

              return letters.map((letter) => {
                const isInOldestFive = oldestFiveIds.has(letter.id);
                const isFading = isPoolStagnant && isInOldestFive;
                const isExpiring = isPoolExpiring && isInOldestFive;

                return (
                  <div
                    key={letter.id}
                    className={`${styles.letterTile} ${letter.isBlank ? styles.blank : ''} ${isFading ? styles.fading : ''} ${isExpiring ? styles.expiring : ''}`}
                  >
                    <span className={styles.letterChar}>
                      {letter.isBlank ? '★' : letter.char}
                    </span>
                    <span className={styles.letterValue}>{letter.value}</span>
                  </div>
                );
              });
            })()}
          </div>

          {/* 3. Players with word tiles */}
          <div className={styles.playersWords}>
            {sortedPlayers.map((player) => (
              <div
                key={player.sessionId}
                className={`${styles.playerWordSection} ${player.sessionId === mySessionId ? styles.me : ''} ${player.sessionId.startsWith('ai_') ? styles.ai : ''}`}
              >
                <div className={styles.playerLabel}>
                  <span className={styles.playerName}>
                    {player.handle}
                    {player.sessionId.startsWith('ai_') && ' 🤖'}
                    {player.sessionId === mySessionId && ' (You)'}
                  </span>
                  <span className={styles.playerScore}>{player.score} pts</span>
                </div>
                <div className={styles.wordsList}>
                  {player.words.slice().reverse().map((word) => (
                    <div key={word.id} className={styles.wordWithTiles}>
                      <div className={styles.wordTiles}>
                        {word.word.split('').map((char, i) => (
                          <div key={i} className={styles.miniTile}>
                            <span className={styles.miniChar}>{char}</span>
                          </div>
                        ))}
                      </div>
                      <span className={styles.wordScore}>+{word.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Move log sidebar */}
        <aside className={styles.moveLog} ref={moveLogRef}>
          <h3 className={styles.logTitle}>Move Log</h3>
          <div className={styles.logEntries}>
            {moveLog.slice().reverse().map((entry) => (
              <div
                key={entry.id}
                className={`${styles.logEntry} ${entry.type === 'swipe' ? styles.swipeEntry : ''} ${entry.isAI ? styles.aiEntry : ''}`}
              >
                <span className={styles.logHandle}>{entry.handle}</span>
                {entry.type === 'swipe' && entry.stolenWords && (
                  <span className={styles.logSwipeFrom}>
                    {entry.stolenWords.join(' + ')} →
                  </span>
                )}
                <span className={styles.logWord}>{entry.word}</span>
                <span className={styles.logScore}>+{entry.score}</span>
              </div>
            ))}
            {moveLog.length === 0 && (
              <p className={styles.logEmpty}>No moves yet...</p>
            )}
          </div>
        </aside>
      </main>

      <div className={styles.feedbackContainer}>
        {feedback.map((msg) => (
          <div
            key={msg.id}
            className={styles.feedbackMessage}
            style={{ color: msg.color }}
          >
            {msg.text}
          </div>
        ))}
      </div>

    </div>
  );
}
