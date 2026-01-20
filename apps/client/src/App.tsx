import { Routes, Route, Navigate } from 'react-router-dom';
import { useUser } from './context/UserContext';
import { Login } from './pages/Login';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/lobby"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game"
        element={
          <ProtectedRoute>
            <Game />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
