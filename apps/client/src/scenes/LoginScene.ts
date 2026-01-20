import Phaser from 'phaser';
import type { AuthUser } from '@swipe/shared';

export class LoginScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoginScene' });
  }

  create() {
    const centerX = this.cameras.main.centerX;
    const centerY = this.cameras.main.centerY;

    // Title
    this.add.text(centerX, centerY - 180, 'SWIPE', {
      fontSize: '96px',
      fontStyle: 'bold',
      color: '#4ecdc4',
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(centerX, centerY - 90, 'The Word Stealing Game', {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Play as Guest button (primary for dev)
    const guestButton = this.add.rectangle(centerX, centerY + 20, 300, 60, 0x4ecdc4)
      .setInteractive({ useHandCursor: true });

    this.add.text(centerX, centerY + 20, '🎮 Play as Guest', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#1a1a2e',
    }).setOrigin(0.5);

    guestButton.on('pointerover', () => guestButton.setFillStyle(0x6ee7df));
    guestButton.on('pointerout', () => guestButton.setFillStyle(0x4ecdc4));
    guestButton.on('pointerdown', () => this.playAsGuest());

    // Google login button (secondary)
    const googleButton = this.add.rectangle(centerX, centerY + 100, 300, 50, 0x4285f4)
      .setInteractive({ useHandCursor: true });

    this.add.text(centerX, centerY + 100, '🔑 Sign in with Google', {
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);

    googleButton.on('pointerover', () => googleButton.setFillStyle(0x5a9cf4));
    googleButton.on('pointerout', () => googleButton.setFillStyle(0x4285f4));
    googleButton.on('pointerdown', () => {
      window.location.href = '/auth/google';
    });

    // Instructions
    this.add.text(centerX, centerY + 180, 'Form words. Steal words. Win!', {
      fontSize: '18px',
      color: '#888888',
    }).setOrigin(0.5);

    // Dev note
    this.add.text(centerX, centerY + 220, '(Guest mode - no account needed)', {
      fontSize: '12px',
      color: '#666666',
    }).setOrigin(0.5);
  }

  private playAsGuest() {
    // Generate a random guest name
    const adjectives = ['Swift', 'Brave', 'Clever', 'Quick', 'Bright', 'Bold', 'Keen', 'Witty'];
    const nouns = ['Fox', 'Eagle', 'Wolf', 'Hawk', 'Bear', 'Lion', 'Tiger', 'Raven'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);

    const guestUser: AuthUser = {
      id: `guest_${Date.now()}`,
      handle: `${adj}${noun}${num}`,
      email: '',
      name: 'Guest',
      avatarUrl: null,
    };

    // Store guest user in registry
    this.registry.set('user', guestUser);

    // Go to lobby
    this.scene.start('LobbyScene');
  }
}
