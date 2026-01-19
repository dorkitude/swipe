import Phaser from 'phaser';
import type { AuthUser } from '@swipe/shared';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  async create() {
    // Show loading text
    const loadingText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      'Loading...',
      { fontSize: '32px', color: '#ffffff' }
    ).setOrigin(0.5);

    // Check if user is authenticated
    try {
      const response = await fetch('/auth/me', { credentials: 'include' });

      if (response.ok) {
        const data = await response.json();
        const user: AuthUser = data.user;

        // Store user in registry for other scenes
        this.registry.set('user', user);

        loadingText.setText(`Welcome back, ${user.handle}!`);

        // Go to lobby after a brief delay
        this.time.delayedCall(1000, () => {
          this.scene.start('LobbyScene');
        });
      } else {
        // Not authenticated, go to login
        this.scene.start('LoginScene');
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
      this.scene.start('LoginScene');
    }
  }
}
