class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }
    init(data) { this.myNickname = data.nickname || 'Unknown'; }

    preload() {
        this.load.image('bg_img', 'assets/maps/background.png');
        this.load.tilemapTiledJSON('mapa_arena', 'assets/maps/mapa.json');
        this.load.image('img_tileset', 'assets/maps/tiles.png');
        this.load.spritesheet('ninja_idle', 'assets/sprites/ninja/idle.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('ninja_run', 'assets/sprites/ninja/run.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('ninja_jump', 'assets/sprites/ninja/jump.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('ninja_attack', 'assets/sprites/ninja/attack.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('ninja_dead', 'assets/sprites/ninja/dead.png', { frameWidth: 128, frameHeight: 128 });
        this.load.image('icon_heart', 'assets/sprites/heart.png');
        this.load.image('icon_energy', 'assets/sprites/lightning.png');
        this.load.audio('sfx_jump', 'assets/audio/jump.mp3');
        this.load.audio('sfx_attack', 'assets/audio/attack.mp3');
        this.load.audio('sfx_hit', 'assets/audio/hit.mp3');
        this.load.audio('sfx_dash', 'assets/audio/dash.mp3');
        this.load.audio('sfx_dead', 'assets/audio/dead.mp3');
        this.load.audio('sfx_run', 'assets/audio/corrida.mp3');
        this.load.audio('sfx_collect', 'assets/audio/collect.mp3');
        this.load.audio('bg_music', 'assets/audio/music.mp3');
    }

    create() {
        // Textura Partícula
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0xffffff, 1);
        graphics.fillRect(0, 0, 4, 4);
        graphics.generateTexture('particle_pixel', 4, 4);

        // --- PARALLAX BACKGROUND (NOVO) ---
        // 1. Usamos tileSprite para repetir a imagem e cobrir todo o mapa
        // Largura/Altura = Tamanho do mapa em pixels
        const mapWidth = 2000; // Tamanho estimado ou pegue do mapa.json
        const mapHeight = 1200;
        
        // tileSprite(x, y, largura, altura, chave_imagem)
        // Usamos setScrollFactor(0.2) -> Move-se a 20% da velocidade da câmera (Profundidade)
        this.bg = this.add.tileSprite(0, 0, mapWidth, mapHeight, 'bg_img')
            .setOrigin(0, 0)
            .setScrollFactor(0.2); 

        // Animações
        this.createAnimations();

        // Mapa Tiled
        const map = this.make.tilemap({ key: 'mapa_arena' });
        const tileset = map.addTilesetImage('tileset_nature', 'img_tileset');
        const layer = map.createLayer('Plataformas', tileset, 0, 0);

        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.cameras.main.setZoom(1.2);

        this.createParticleSystems();

        // Som
        let volMusic = parseFloat(localStorage.getItem('bitArena_volMusic')); if(isNaN(volMusic)) volMusic = 0.5;
        let volSFX = parseFloat(localStorage.getItem('bitArena_volSFX')); if(isNaN(volSFX)) volSFX = 0.5;
        if(this.sound.get('bg_music')){ this.bgMusic = this.sound.get('bg_music'); if(!this.bgMusic.isPlaying) this.bgMusic.play(); } else { this.bgMusic = this.sound.add('bg_music', { volume: volMusic, loop: true }); this.bgMusic.play(); }
        this.jumpSound = this.sound.add('sfx_jump', { volume: volSFX }); this.attackSound = this.sound.add('sfx_attack', { volume: volSFX }); this.hitSound = this.sound.add('sfx_hit', { volume: volSFX }); this.dashSound = this.sound.add('sfx_dash', { volume: volSFX }); this.deadSound = this.sound.add('sfx_dead', { volume: volSFX }); this.collectSound = this.sound.add('sfx_collect', { volume: volSFX }); this.runSound = this.sound.add('sfx_run', { volume: volSFX, loop: true, rate: 1.5 });
        this.sfxList = [this.jumpSound, this.attackSound, this.hitSound, this.dashSound, this.deadSound, this.collectSound, this.runSound];
        this.events.on('updateMusicVolume', (vol) => { if(this.bgMusic) this.bgMusic.setVolume(vol); });
        this.events.on('updateSFXVolume', (vol) => { this.sfxList.forEach(s => s.setVolume(vol)); });

        // UI & Input
        this.scene.launch('UIScene');
        this.mobileInput = { left: false, right: false, up: false, down: false, attack: false, dash: false };
        this.events.on('mobileInput', (data) => { this.mobileInput = data; });

        // Rede
        this.socket = io('https://bitarena-game.onrender.com');
        this.otherPlayers = this.add.group();
        this.itemsGroup = this.add.group();

        this.socket.on('connect', () => { this.socket.emit('joinGame', this.myNickname); });
        this.socket.on('currentPlayers', (players) => { Object.keys(players).forEach((id) => { if (players[id].playerId === this.socket.id) this.addMyPlayer(players[id]); else this.addOtherPlayers(players[id]); }); });
        this.socket.on('newPlayer', (info) => this.addOtherPlayers(info));
        this.socket.on('playerDisconnected', (id) => { this.otherPlayers.getChildren().forEach(p => { if (id === p.playerId) { if(p.nameText) p.nameText.destroy(); if(p.healthBarBg) p.healthBarBg.destroy(); if(p.healthBar) p.healthBar.destroy(); p.destroy(); } }); });
        this.socket.on('currentItems', (items) => { this.itemsGroup.clear(true, true); items.forEach(item => { if (item.active) { let texture = (item.type === 'health') ? 'icon_heart' : 'icon_energy'; let img = this.add.image(item.x + item.w/2, item.y + item.h/2, texture); this.itemsGroup.add(img); } }); });
        this.socket.on('itemCollected', () => this.collectSound.play());
        this.socket.on('playerHitEffect', (data) => { this.showHitEffect(data.x, data.y, data.direction); this.hitSound.play(); });

        this.socket.on('playerUpdates', (players) => {
            Object.keys(players).forEach((id) => {
                let sprite = null;
                if (this.myPlayer && id === this.socket.id) sprite = this.myPlayer;
                else { this.otherPlayers.getChildren().forEach(p => { if(id === p.playerId) sprite = p; }); }

                if (sprite) {
                    const wasDead = sprite.isDead || false; sprite.isDead = players[id].isDead; 
                    if (!wasDead && sprite.isDead) this.deadSound.play();
                    sprite.setPosition(players[id].x, players[id].y);
                    this.updateAnimation(sprite, players[id]);
                    this.updatePlayerUI(sprite, players[id]);
                    if (players[id].isDead) { sprite.setAlpha(0.5); sprite.setTint(0x555555); } else { sprite.setAlpha(1); sprite.clearTint(); }
                    if (sprite === this.myPlayer) { this.events.emit('updateHUD', { health: players[id].health, energy: players[id].energy || 0 }); }
                }
            });
        });

        this.socket.on('matchUpdate', (data) => this.events.emit('matchUpdate', data));
        this.socket.on('matchEnded', (leaderboard) => this.events.emit('matchEnded', leaderboard));
        this.socket.on('matchRestarted', () => this.events.emit('matchRestarted'));

        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys({ space: Phaser.Input.Keyboard.KeyCodes.SPACE, k: Phaser.Input.Keyboard.KeyCodes.K, shift: Phaser.Input.Keyboard.KeyCodes.SHIFT });
    }

    update() {
        // --- ATUALIZA O PARALLAX ---
        // Move a textura do fundo baseado na posição da câmera
        // Isso faz o fundo "rolar" suavemente
        this.bg.tilePositionX = this.cameras.main.scrollX * 0.5;
        this.bg.tilePositionY = this.cameras.main.scrollY * 0.5;

        if (!this.myPlayer) return;
        this.socket.emit('playerInput', {
            left: this.cursors.left.isDown || this.mobileInput.left,
            right: this.cursors.right.isDown || this.mobileInput.right,
            up: this.cursors.up.isDown || this.mobileInput.up,
            down: this.cursors.down.isDown || this.mobileInput.down,
            attack: this.keys.space.isDown || this.mobileInput.attack,
            test_die: this.keys.k.isDown,
            dash: this.keys.shift.isDown || this.mobileInput.dash
        });
    }

    createPlayerUI(sprite, nickname) {
        // --- FONTE NOVA NO NOME ---
        sprite.nameText = this.add.text(0, 0, nickname, { 
            fontSize: '10px', // Fonte pixel art costuma ser grande, diminui um pouco
            fontFamily: '"Press Start 2P"', // Nome da fonte (aspas duplas dentro de simples)
            fill: '#ffffff', stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5);
        sprite.healthBarBg = this.add.rectangle(0, 0, 60, 8, 0x000000).setOrigin(0.5);
        sprite.healthBar = this.add.rectangle(0, 0, 58, 6, 0x00ff00).setOrigin(0, 0.5);
    }

    updatePlayerUI(sprite, playerData) {
        if (!sprite.nameText) this.createPlayerUI(sprite, playerData.nickname || 'Unknown');
        if (playerData.nickname && sprite.nameText.text !== playerData.nickname) sprite.nameText.setText(playerData.nickname);
        const uiX = sprite.x; const uiY = sprite.y - 70; 
        sprite.nameText.setPosition(uiX, uiY); sprite.healthBarBg.setPosition(uiX, uiY + 15); sprite.healthBar.setPosition(uiX - 29, uiY + 15);
        const hpPercent = Math.max(0, playerData.health / 100); sprite.healthBar.width = 58 * hpPercent;
        if (hpPercent > 0.5) sprite.healthBar.fillColor = 0x00ff00; else if (hpPercent > 0.25) sprite.healthBar.fillColor = 0xffff00; else sprite.healthBar.fillColor = 0xff0000;
        const isVisible = !playerData.isDead && playerData.nickname !== 'Unknown';
        sprite.nameText.setVisible(isVisible); sprite.healthBarBg.setVisible(isVisible); sprite.healthBar.setVisible(isVisible);
    }

    // (Outras funções de animação/partículas mantêm-se iguais...)
    addMyPlayer(info) { this.myPlayer = this.add.sprite(info.x, info.y, 'ninja_idle'); this.myPlayer.setOrigin(0.5, 0.5); this.myPlayer.play('ninja-idle'); this.cameras.main.startFollow(this.myPlayer); this.createPlayerUI(this.myPlayer, info.nickname); }
    addOtherPlayers(info) { const other = this.add.sprite(info.x, info.y, 'ninja_idle'); other.setOrigin(0.5, 0.5); other.play('ninja-idle'); other.playerId = info.playerId; this.otherPlayers.add(other); this.createPlayerUI(other, info.nickname); }
    createAnimations() { this.anims.create({ key: 'ninja-idle', frames: this.anims.generateFrameNumbers('ninja_idle'), frameRate: 10, repeat: -1 }); this.anims.create({ key: 'ninja-run', frames: this.anims.generateFrameNumbers('ninja_run'), frameRate: 12, repeat: -1 }); this.anims.create({ key: 'ninja-jump', frames: this.anims.generateFrameNumbers('ninja_jump'), frameRate: 10, repeat: 0 }); this.anims.create({ key: 'ninja-attack', frames: this.anims.generateFrameNumbers('ninja_attack'), frameRate: 15, repeat: 0 }); this.anims.create({ key: 'ninja-dead', frames: this.anims.generateFrameNumbers('ninja_dead'), frameRate: 10, repeat: 0 }); }
    createParticleSystems() { this.bloodEmitter = this.add.particles(0, 0, 'particle_pixel', { lifespan: 600, speed: { min: 100, max: 200 }, angle: { min: 0, max: 360 }, gravityY: 400, scale: { start: 2, end: 0 }, quantity: 10, tint: 0xff0000, emitting: false }); this.bloodEmitter.setDepth(10); this.hitEmitter = this.add.particles(0, 0, 'particle_pixel', { lifespan: 100, speed: { min: 50, max: 100 }, scale: { start: 4, end: 0 }, quantity: 5, tint: 0xffff00, blendMode: 'ADD', emitting: false }); this.hitEmitter.setDepth(11); }
    showHitEffect(x, y, direction) { this.hitEmitter.emitParticleAt(x, y, 5); const minAngle = (direction === 1) ? -45 : 135; const maxAngle = (direction === 1) ? 45 : 225; this.bloodEmitter.setConfig({ angle: { min: minAngle, max: maxAngle }, speed: { min: 100, max: 250 }, gravityY: 400, lifespan: 500, scale: { start: 2, end: 0 }, tint: 0xff0000 }); this.bloodEmitter.emitParticleAt(x, y, 15); this.cameras.main.shake(100, 0.01); }
    createGhostEffect(sprite) { if (sprite.nextGhostTime && this.time.now < sprite.nextGhostTime) return; sprite.nextGhostTime = this.time.now + 50; const ghost = this.add.sprite(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name); ghost.setOrigin(0.5, 0.5); ghost.setFlipX(sprite.flipX); ghost.setAlpha(0.6); ghost.setTint(0x00ffff); this.tweens.add({ targets: ghost, alpha: 0, duration: 300, onComplete: () => ghost.destroy() }); }
    updateAnimation(sprite, state) { if (!sprite.anims || !sprite.anims.currentAnim) { sprite.play('ninja-idle'); return; } const isMoving = (state.input.left || state.input.right); if (sprite === this.myPlayer) { if (state.isGrounded && isMoving && !state.isDashing && !state.isDead) { if (!this.runSound.isPlaying) this.runSound.play(); } else { if (this.runSound.isPlaying) this.runSound.stop(); } } if (state.isDashing && !sprite.wasDashing) { this.dashSound.play(); } sprite.wasDashing = state.isDashing; if (state.isDashing) { this.createGhostEffect(sprite); if (sprite.anims.currentAnim.key !== 'ninja-run') sprite.play('ninja-run'); sprite.flipX = (state.facingDirection === -1); return; } if (state.isDead) { if (sprite === this.myPlayer && this.runSound.isPlaying) this.runSound.stop(); if (sprite.anims.currentAnim.key !== 'ninja-dead') sprite.play('ninja-dead'); return; } if (state.isAttacking) { if (sprite.anims.currentAnim.key !== 'ninja-attack') { sprite.play('ninja-attack'); this.attackSound.play(); } sprite.flipX = (state.facingDirection === -1); return; } if (!state.isGrounded) { if (sprite.anims.currentAnim.key !== 'ninja-jump') { sprite.play('ninja-jump'); this.jumpSound.play(); } sprite.flipX = (state.facingDirection === -1); return; } if (state.input.left) { sprite.flipX = true; if (sprite.anims.currentAnim.key !== 'ninja-run') sprite.play('ninja-run'); } else if (state.input.right) { sprite.flipX = false; if (sprite.anims.currentAnim.key !== 'ninja-run') sprite.play('ninja-run'); } else { if (sprite.anims.currentAnim.key !== 'ninja-idle') sprite.play('ninja-idle'); } }
}