import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { ProfileScene } from './scenes/ProfileScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, LoginScene, ProfileScene, LobbyScene, GameScene],
};

new Phaser.Game(config);
