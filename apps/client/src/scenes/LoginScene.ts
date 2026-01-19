import Phaser from 'phaser';

export class LoginScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoginScene' });
  }

  create() {
    const centerX = this.cameras.main.centerX;
    const centerY = this.cameras.main.centerY;

    // Title
    this.add.text(centerX, centerY - 150, 'SWIPE', {
      fontSize: '96px',
      fontStyle: 'bold',
      color: '#4ecdc4',
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(centerX, centerY - 60, 'The Word Stealing Game', {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Login button
    const buttonBg = this.add.rectangle(centerX, centerY + 50, 300, 60, 0x4285f4, 1)
      .setInteractive({ useHandCursor: true });

    this.add.text(centerX, centerY + 50, '🔑 Sign in with Google', {
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Hover effects
    buttonBg.on('pointerover', () => {
      buttonBg.setFillStyle(0x5a9cf4);
    });

    buttonBg.on('pointerout', () => {
      buttonBg.setFillStyle(0x4285f4);
    });

    // Click handler - redirect to OAuth
    buttonBg.on('pointerdown', () => {
      window.location.href = '/auth/google';
    });

    // Instructions
    this.add.text(centerX, centerY + 150, 'Form words. Steal words. Win!', {
      fontSize: '18px',
      color: '#888888',
    }).setOrigin(0.5);
  }
}
