class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    preload() {
        // --- CARREGAMENTO DO PLUGIN (LOCAL) ---
        // Carrega o arquivo que está na sua pasta assets/plugins
        // O 'true' no final diz para iniciar o plugin imediatamente
        this.load.plugin('rexVirtualJoystick', 'public/assets/plugins/rexvirtualjoystickplugin.min.js', true);

        // Assets do Menu
        this.load.image('bg_menu', 'assets/maps/background.png'); 
        this.load.audio('bg_music', 'assets/audio/music.mp3');
    }

    create() {
        console.log('[MenuScene] Plugin Carregado e Pronto');

        // 1. Background
        const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'bg_menu');
        bg.setOrigin(0.5, 0.5);
        bg.setScale(Math.max(this.scale.width / bg.width, this.scale.height / bg.height));

        // 2. Música
        if (!this.sound.get('bg_music')) {
            this.bgMusic = this.sound.add('bg_music', { volume: 0.5, loop: true });
            if (!this.sound.locked) this.bgMusic.play();
            else this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.bgMusic.play());
        }

        // 3. HTML de Login
        const loginDiv = document.getElementById('loginOverlay');
        const input = document.getElementById('nicknameInput');
        const btn = document.getElementById('playBtn');

        loginDiv.style.display = 'block';
        input.focus();

        btn.onclick = () => {
            const name = input.value.trim() || 'Guerreiro';
            loginDiv.style.display = 'none';
            
            // Passa o objeto { nickname: name }
            this.scene.start('GameScene', { nickname: name });
        };
    }
}