import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { eq } from 'drizzle-orm';
import { env } from './environment.js';
import { db } from './database.js';
import { users, handles, userStats } from '../db/schema.js';
import { handleService } from '../services/HandleService.js';
import type { AuthUser } from '@swipe/shared';

// Only configure Google strategy if credentials are available
if (env.googleClientId && env.googleClientSecret) {
  passport.use(new GoogleStrategy({
    clientID: env.googleClientId,
    clientSecret: env.googleClientSecret,
    callbackURL: env.googleCallbackUrl,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value ?? '';
      const name = profile.displayName;
      const avatarUrl = profile.photos?.[0]?.value ?? null;

      // Find or create user
      let user = await db.query.users.findFirst({
        where: eq(users.googleId, googleId),
        with: { handle: true },
      });

      if (!user) {
        // Create new user
        const [newUser] = await db.insert(users).values({
          googleId,
          email,
          name,
          avatarUrl,
        }).returning();

        if (!newUser) {
          return done(new Error('Failed to create user'));
        }

        // Generate and create default handle
        const defaultHandle = await handleService.generateDefaultHandle();
        await handleService.createHandle(newUser.id, defaultHandle);

        // Initialize user stats
        await db.insert(userStats).values({
          userId: newUser.id,
        });

        user = await db.query.users.findFirst({
          where: eq(users.id, newUser.id),
          with: { handle: true },
        });
      }

      if (!user) {
        return done(new Error('User not found after creation'));
      }

      const authUser: AuthUser = {
        id: user.id,
        handle: user.handle?.handle ?? 'Unknown',
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      };

      done(null, authUser);
    } catch (error) {
      done(error as Error);
    }
  }));
} else {
  console.warn('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, (user as AuthUser).id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: { handle: true },
    });

    if (!user) {
      return done(null, false);
    }

    const authUser: AuthUser = {
      id: user.id,
      handle: user.handle?.handle ?? 'Unknown',
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };

    done(null, authUser);
  } catch (error) {
    done(error);
  }
});
