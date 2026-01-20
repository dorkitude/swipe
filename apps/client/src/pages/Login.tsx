import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import styles from './Login.module.css';

export function Login() {
  const navigate = useNavigate();
  const { user, loginAsGuest } = useUser();

  useEffect(() => {
    if (user) {
      navigate('/lobby');
    }
  }, [user, navigate]);

  const handleGuestLogin = () => {
    loginAsGuest();
  };

  const handleGoogleLogin = () => {
    window.location.href = '/auth/google';
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>SWIPE</h1>
        <p className={styles.subtitle}>The Word Stealing Game</p>

        <div className={styles.buttons}>
          <button className="btn-primary" onClick={handleGuestLogin}>
            Play as Guest
          </button>

          <button className="btn-google" onClick={handleGoogleLogin}>
            Sign in with Google
          </button>
        </div>

        <p className={styles.tagline}>Form words. Steal words. Win!</p>
        <p className={styles.note}>(Guest mode - no account needed)</p>
      </div>
    </div>
  );
}
