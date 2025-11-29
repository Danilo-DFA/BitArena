const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },

    render: {
        pixelArt: true
    },

    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },


    // A ORDEM IMPORTA: O Phaser inicia a primeira cena da lista
    scene: [MenuScene, GameScene, UIScene] 
};

const game = new Phaser.Game(config);