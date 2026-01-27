import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import styles from './Lobby.module.css';

type AIDifficulty = 'easy' | 'medium' | 'hard';
const API_URL = import.meta.env.VITE_API_URL || '';

const difficulties: Array<{ label: string; difficulty: AIDifficulty; description: string }> = [
  { label: 'Easy', difficulty: 'easy', description: 'Slow, simple words' },
  { label: 'Medium', difficulty: 'medium', description: 'Balanced challenge' },
  { label: 'Hard', difficulty: 'hard', description: 'Fast, complex words' },
];

export function Lobby() {
  const navigate = useNavigate();
  const { user, logout } = useUser();
  const [roomCode, setRoomCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const startGameWithAI = (difficulty: AIDifficulty, count: number = 1) => {
    navigate('/game', { state: { aiOpponents: Array(count).fill({ difficulty }) } });
  };

  const createPrivateRoom = () => {
    navigate('/game', { state: { createPrivate: true } });
  };

  const joinByCode = async () => {
    if (roomCode.length < 6) return;

    setJoinError(null);
    setIsJoining(true);

    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomCode.toUpperCase()}`);
      if (!res.ok) {
        setJoinError('Room not found');
        setIsJoining(false);
        return;
      }
      const { roomId } = await res.json();
      navigate(`/game?roomId=${roomId}`);
    } catch {
      setJoinError('Failed to find room');
      setIsJoining(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logo}>SWIPE</h1>
        <div className={styles.userInfo}>
          <span>Playing as: <strong>{user?.handle}</strong></span>
          <button className="btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Play vs AI</h2>

          <div className={styles.difficultyGrid}>
            {difficulties.map((diff) => (
              <button
                key={diff.difficulty}
                className={`${styles.difficultyCard} ${styles[diff.difficulty]}`}
                onClick={() => startGameWithAI(diff.difficulty)}
              >
                <span className={styles.difficultyLabel}>{diff.label}</span>
                <span className={styles.difficultyDesc}>{diff.description}</span>
              </button>
            ))}
          </div>

          <div className={styles.multiAI}>
            <p>Or play against multiple AIs:</p>
            <button
              className="btn-secondary"
              onClick={() => startGameWithAI('hard', 3)}
            >
              3 Hard AIs
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Multiplayer</h2>

          <div className={styles.multiplayerOptions}>
            <button className="btn-primary" onClick={createPrivateRoom}>
              Create Room
            </button>

            <div className={styles.divider}>or join with code</div>

            <div className={styles.joinForm}>
              <input
                type="text"
                placeholder="ABC123"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                maxLength={6}
                className={styles.codeInput}
                onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
              />
              <button
                className="btn-secondary"
                onClick={joinByCode}
                disabled={roomCode.length < 6 || isJoining}
              >
                {isJoining ? '...' : 'Join'}
              </button>
            </div>
            {joinError && <p className={styles.error}>{joinError}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
