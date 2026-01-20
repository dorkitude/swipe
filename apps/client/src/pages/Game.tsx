import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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

export function Game() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  const state = location.state as LocationState | null;

  const [room, setRoom] = useState<Room | null>(null);
  const [phase, setPhase] = useState<string>('connecting');
  const [letters, setLetters] = useState<Letter[]>([]);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [wordInput, setWordInput] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackIdRef = useRef(0);
  const clientRef = useRef<Client | null>(null);

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

    const connect = async () => {
      try {
        const wsUrl = import.meta.env.PROD
          ? `wss://${window.location.host}`
          : 'ws://localhost:2567';

        const client = new Client(wsUrl);
        clientRef.current = client;

        const gameRoom = await client.joinOrCreate('game', {
          odId: user.id,
          handle: user.handle,
          aiOpponents: state?.aiOpponents,
        });

        setRoom(gameRoom);
        setPhase('waiting');

        // Listen to state changes via onStateChange
        let lastPhase = '';
        let timerInterval: ReturnType<typeof setInterval> | null = null;

        gameRoom.onStateChange((state) => {
          // Update phase
          if (state.phase !== lastPhase) {
            lastPhase = state.phase;
            console.log('Phase changed:', state.phase);
            setPhase(state.phase);
          }

          // Update timer
          if (state.roundEndTime > 0) {
            if (timerInterval) clearInterval(timerInterval);
            const updateTimer = () => {
              const remaining = Math.max(0, Math.ceil((state.roundEndTime - Date.now()) / 1000));
              setTimeLeft(remaining);
            };
            updateTimer();
            timerInterval = setInterval(updateTimer, 100);
          }

          // Update all player scores
          setPlayers((prev) => {
            const newMap = new Map(prev);
            state.players.forEach((player: any, sessionId: string) => {
              const existing = newMap.get(sessionId);
              if (existing && existing.score !== player.score) {
                newMap.set(sessionId, {
                  ...existing,
                  score: player.score,
                  words: Array.from(player.words || []).map((w: any) => ({
                    id: w.id,
                    word: w.word,
                    score: w.score,
                    ownerId: w.ownerId,
                  })),
                });
              }
            });
            return newMap;
          });
        });

        // Listen to letters (with null check)
        gameRoom.state.availableLetters?.onAdd((letter: any) => {
          setLetters((prev) => [...prev, {
            id: letter.id,
            char: letter.char,
            value: letter.value,
            isBlank: letter.isBlank,
          }]);
        });

        gameRoom.state.availableLetters?.onRemove((letter: any) => {
          setLetters((prev) => prev.filter((l) => l.id !== letter.id));
        });

        // Listen to players (with null check)
        gameRoom.state.players?.onAdd((player: any, sessionId: string) => {
          const updatePlayer = () => {
            setPlayers((prev) => {
              const newMap = new Map(prev);
              newMap.set(sessionId, {
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
              return newMap;
            });
          };

          updatePlayer();
          // Update player when words change
          player.words?.onAdd(updatePlayer);
          player.words?.onRemove(updatePlayer);
        });

        gameRoom.state.players?.onRemove((_: any, sessionId: string) => {
          setPlayers((prev) => {
            const newMap = new Map(prev);
            newMap.delete(sessionId);
            return newMap;
          });
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
  }, [user, state?.aiOpponents, showFeedback]);

  // Focus input when playing
  useEffect(() => {
    if (phase === 'playing' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || phase !== 'playing') return;

    if (wordInput.length < GAME_CONSTANTS.MIN_WORD_LENGTH) {
      showFeedback(`Word must be at least ${GAME_CONSTANTS.MIN_WORD_LENGTH} letters`, 'var(--accent-danger)');
      return;
    }

    room.send('submitWord', { word: wordInput.toUpperCase() });
  };

  const handleBack = () => {
    room?.leave();
    navigate('/lobby');
  };

  const mySessionId = room?.sessionId;
  const sortedPlayers = Array.from(players.values()).sort((a, b) => b.score - a.score);

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
        <button className="btn-secondary" onClick={handleBack}>
          Back
        </button>
        <h1 className={styles.logo}>SWIPE</h1>
        <div className={styles.timer}>
          {timeLeft !== null && (
            <span className={timeLeft <= 5 ? styles.timerWarning : ''}>
              {timeLeft}
            </span>
          )}
        </div>
      </header>

      <div className={styles.status}>
        {phase === 'connecting' && 'Connecting...'}
        {phase === 'waiting' && 'Waiting for game to start...'}
        {phase === 'countdown' && 'Get ready!'}
        {phase === 'playing' && 'GO! Type words!'}
        {phase === 'round_end' && 'Round over! Next round starting...'}
        {phase === 'game_end' && 'Game over!'}
      </div>

      <main className={styles.main}>
        <section className={styles.lettersSection}>
          <div className={styles.letters}>
            {letters.map((letter) => (
              <div
                key={letter.id}
                className={`${styles.letterTile} ${letter.isBlank ? styles.blank : ''}`}
              >
                <span className={styles.letterChar}>
                  {letter.isBlank ? '★' : letter.char}
                </span>
                <span className={styles.letterValue}>{letter.value}</span>
              </div>
            ))}
          </div>

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

          <p className={styles.hint}>
            Type a word (min {GAME_CONSTANTS.MIN_WORD_LENGTH} letters) and press Enter
          </p>
        </section>

        <section className={styles.playersSection}>
          <h2>Players</h2>
          <div className={styles.playersList}>
            {sortedPlayers.map((player) => (
              <div
                key={player.sessionId}
                className={`${styles.playerCard} ${player.sessionId === mySessionId ? styles.me : ''} ${player.sessionId.startsWith('ai_') ? styles.ai : ''}`}
              >
                <div className={styles.playerHeader}>
                  <span className={styles.playerName}>
                    {player.handle}
                    {player.sessionId.startsWith('ai_') && ' 🤖'}
                    {player.sessionId === mySessionId && ' (You)'}
                  </span>
                  <span className={styles.playerScore}>{player.score}</span>
                </div>
                <div className={styles.playerWords}>
                  {player.words.map((word) => (
                    <span key={word.id} className={styles.wordTag}>
                      {word.word}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
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
