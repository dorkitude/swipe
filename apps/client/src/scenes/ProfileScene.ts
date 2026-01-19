import Phaser from 'phaser';
import type { AuthUser } from '@swipe/shared';

export class ProfileScene extends Phaser.Scene {
  private user?: AuthUser;
  private handleInput?: HTMLInputElement;

  constructor() {
    super({ key: 'ProfileScene' });
  }

  create() {
    this.user = this.registry.get('user');
    const centerX = this.cameras.main.centerX;
    const centerY = this.cameras.main.centerY;

    // Title
    this.add.text(centerX, 80, 'Your Profile', {
      fontSize: '48px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Current handle
    this.add.text(centerX, centerY - 80, 'Your Handle:', {
      fontSize: '20px',
      color: '#888888',
    }).setOrigin(0.5);

    this.add.text(centerX, centerY - 40, this.user?.handle ?? 'Unknown', {
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#4ecdc4',
    }).setOrigin(0.5);

    // Email
    this.add.text(centerX, centerY + 20, this.user?.email ?? '', {
      fontSize: '16px',
      color: '#666666',
    }).setOrigin(0.5);

    // Edit handle (placeholder for DOM input)
    this.add.text(centerX, centerY + 80, 'Handle can be changed in settings', {
      fontSize: '14px',
      color: '#666666',
    }).setOrigin(0.5);

    // Back to lobby button
    const backButton = this.add.rectangle(centerX, centerY + 160, 200, 50, 0x4ecdc4)
      .setInteractive({ useHandCursor: true });

    this.add.text(centerX, centerY + 160, 'Back to Lobby', {
      fontSize: '18px',
      color: '#1a1a2e',
    }).setOrigin(0.5);

    backButton.on('pointerover', () => backButton.setFillStyle(0x6ee7df));
    backButton.on('pointerout', () => backButton.setFillStyle(0x4ecdc4));
    backButton.on('pointerdown', () => this.scene.start('LobbyScene'));

    // Logout button
    const logoutButton = this.add.rectangle(centerX, centerY + 230, 150, 40, 0xff6b6b)
      .setInteractive({ useHandCursor: true });

    this.add.text(centerX, centerY + 230, 'Logout', {
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5);

    logoutButton.on('pointerover', () => logoutButton.setFillStyle(0xff8585));
    logoutButton.on('pointerout', () => logoutButton.setFillStyle(0xff6b6b));
    logoutButton.on('pointerdown', () => this.handleLogout());
  }

  private async handleLogout() {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      this.registry.remove('user');
      this.scene.start('LoginScene');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }
}
