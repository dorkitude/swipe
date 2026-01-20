import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import styles from './Lobby.module.css';

type AIDifficulty = 'easy' | 'medium' | 'hard';

const difficulties: Array<{ label: string; difficulty: AIDifficulty; description: string }> = [
  { label: 'Easy', difficulty: 'easy', description: 'Slow, simple words' },
  { label: 'Medium', difficulty: 'medium', description: 'Balanced challenge' },
  { label: 'Hard', difficulty: 'hard', description: 'Fast, complex words' },
];

export function Lobby() {
  const navigate = useNavigate();
  const { user, logout } = useUser();

  const startGameWithAI = (difficulty: AIDifficulty, count: number = 1) => {
    navigate('/game', { state: { aiOpponents: Array(count).fill({ difficulty }) } });
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
          <h2 className={styles.sectionTitle}>Multiplayer Lobby</h2>
          <p className={styles.comingSoon}>Coming soon...</p>
        </section>
      </main>
    </div>
  );
}
