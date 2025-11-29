class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    preload() {
        // Carrega apenas o necessário para o menu (Background e Música)
        this.load.image('bg_menu', 'assets/maps/background.png'); 
        this.load.audio('bg_music', 'assets/audio/music.mp3');
    }

    create() {
        console.log('[MenuScene] Tela de Login');

        // 1. Background (Para não ficar tela preta)
        const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'bg_menu');
        bg.setOrigin(0.5, 0.5);
        // Cobre a tela toda
        const scale = Math.max(this.scale.width / bg.width, this.scale.height / bg.height);
        bg.setScale(scale);

        // 2. Música (Já começa tocando aqui)
        // Se já estiver tocando (de um reload), não reinicia
        if (!this.sound.get('bg_music')) {
            this.bgMusic = this.sound.add('bg_music', { volume: 0.5, loop: true });
            if (!this.sound.locked) this.bgMusic.play();
            else this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.bgMusic.play());
        }

        // 3. Mostra o HTML de Login
        const loginDiv = document.getElementById('loginOverlay');
        const input = document.getElementById('nicknameInput');
        const btn = document.getElementById('playBtn');

        loginDiv.style.display = 'block'; // Mostra a div
        input.focus();

        // 4. Lógica do Botão JOGAR
        btn.onclick = () => {
            const name = input.value.trim() || 'Guerreiro'; // Garante um nome padrão
            loginDiv.style.display = 'none';
            
            // Passa o objeto { nickname: name }
            this.scene.start('GameScene', { nickname: name });
        };

        // Permite apertar Enter também
        input.onkeydown = (e) => {
            if (e.key === 'Enter') btn.click();
        };
    }
}