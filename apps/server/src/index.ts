import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { createServer } from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { env, validateEnv } from './config/environment.js';
import { LobbyRoom } from './rooms/LobbyRoom.js';
import { GameRoom } from './rooms/GameRoom.js';
import { dictionaryService } from './services/DictionaryService.js';
import './config/auth.js'; // Initialize passport strategies

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  validateEnv();

  const app = express();

  // Middleware
  app.use(express.json());
  app.use(session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: env.nodeEnv === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  // CORS for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', env.clientUrl);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', dictionary: dictionaryService.isLoaded });
  });

  // Auth routes
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${env.clientUrl}/login?error=auth_failed` }),
    (req, res) => {
      res.redirect(`${env.clientUrl}/`);
    }
  );

  app.get('/auth/me', (req, res) => {
    if (req.isAuthenticated() && req.user) {
      res.json({ user: req.user });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  app.post('/auth/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ success: true });
    });
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // Create Colyseus server
  const gameServer = new Server({
    transport: new WebSocketTransport({
      server: httpServer,
    }),
  });

  // Load dictionary before defining rooms
  const dictionaryPath = join(__dirname, '../data/wordlist.txt');
  try {
    await dictionaryService.loadDictionary(dictionaryPath);
  } catch (error) {
    console.warn('Dictionary not found, word validation will be disabled');
  }

  // Define rooms
  gameServer.define('lobby', LobbyRoom);
  gameServer.define('game', GameRoom, { dictionary: dictionaryService });

  // Start server
  httpServer.listen(env.port, () => {
    console.log(`
    🎮 Swipe Server running!

    HTTP:      http://localhost:${env.port}
    WebSocket: ws://localhost:${env.port}
    Health:    http://localhost:${env.port}/health

    Dictionary: ${dictionaryService.isLoaded ? `${dictionaryService.count} words loaded` : 'Not loaded'}
    `);
  });
}

main().catch(console.error);
