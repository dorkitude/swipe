import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AuthUser } from '@swipe/shared';

interface UserContextType {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  loginAsGuest: () => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | null>(null);
const USER_STORAGE_KEY = 'swipe_user';

const ADJECTIVES = ['Swift', 'Brave', 'Clever', 'Quick', 'Bright', 'Bold', 'Keen', 'Witty'];
const NOUNS = ['Fox', 'Eagle', 'Wolf', 'Hawk', 'Bear', 'Lion', 'Tiger', 'Raven'];

function generateGuestHandle(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

function loadUserFromStorage(): AuthUser | null {
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as AuthUser;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(loadUserFromStorage);

  // Wrapper to persist to localStorage
  const setUser = useCallback((newUser: AuthUser | null) => {
    setUserState(newUser);
    if (newUser) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }, []);

  const loginAsGuest = useCallback(() => {
    const guestUser: AuthUser = {
      id: `guest_${Date.now()}`,
      handle: generateGuestHandle(),
      email: '',
      name: 'Guest',
      avatarUrl: null,
    };
    setUser(guestUser);
  }, [setUser]);

  const logout = useCallback(() => {
    setUser(null);
  }, [setUser]);

  return (
    <UserContext.Provider value={{ user, setUser, loginAsGuest, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
