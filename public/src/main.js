const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },

    render: { pixelArt: true },

    // --- CONFIGURAÇÃO DE INPUT (NOVO) ---
    input: {
        activePointers: 3 // Permite 3 dedos ao mesmo tempo (Joystick + Pulo + Ataque)
    },

    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
plugins: {
        global: [{
            key: 'rexVirtualJoystick',
            plugin: window.rexvirtualjoystickplugin, // Pega do HTML
            start: true
        }]
    },

    // A ORDEM IMPORTA: O Phaser inicia a primeira cena da lista
    scene: [MenuScene, GameScene, UIScene] 
};

const game = new Phaser.Game(config);