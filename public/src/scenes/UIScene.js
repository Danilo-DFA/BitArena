class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        console.log('[UIScene] Interface Iniciada');

        // 1. CARREGA PREFS
        try {
            const savedVolume = parseFloat(localStorage.getItem('bitArena_volume'));
            if (!isNaN(savedVolume)) this.sound.volume = savedVolume;
            this.buttonScale = parseFloat(localStorage.getItem('bitArena_btnScale'));
            if (isNaN(this.buttonScale)) this.buttonScale = 1.0;
        } catch (e) { this.buttonScale = 1.0; }

        // 2. HUD
        this.add.rectangle(20, 20, 200, 20, 0x000000).setOrigin(0, 0);
        this.hpBar = this.add.rectangle(20, 20, 200, 20, 0xff0000).setOrigin(0, 0);
        this.add.rectangle(20, 50, 200, 20, 0x000000).setOrigin(0, 0);
        this.energyBar = this.add.rectangle(20, 50, 0, 20, 0x00ffff).setOrigin(0, 0);
        this.add.text(25, 24, 'HP', { fontSize: '10px', fontFamily: '"Press Start 2P"', fill: '#ffffff' });
        this.add.text(25, 54, 'MP', { fontSize: '10px', fontFamily: '"Press Start 2P"', fill: '#ffffff' });

        this.timerText = this.add.text(this.scale.width / 2, 30, '00:00', {
            fontSize: '20px', fontFamily: '"Press Start 2P"', fill: '#ffffff', stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        // 3. BOTÕES UI
        this.btnScore = this.add.text(this.scale.width - 100, 20, '🏆', { fontSize: '30px' })
            .setInteractive().setScrollFactor(0).setDepth(100);
        this.btnScore.on('pointerdown', () => {
            if (this.scoreboardVisible) this.hideScoreboard(); else this.showScoreboard();
        });

        this.btnConfig = this.add.text(this.scale.width - 50, 20, '⚙️', { fontSize: '30px' })
            .setInteractive().setScrollFactor(0).setDepth(100);
        
        this.btnConfig.on('pointerdown', () => {
            if (this.settingsContainer) this.closeSettings();
            else this.openSettings();
        });

        this.createScoreboardUI();

        // 4. CONEXÃO
        const gameScene = this.scene.get('GameScene');
        gameScene.events.on('updateHUD', (data) => this.updateBars(data));
        gameScene.events.on('matchUpdate', (data) => {
            this.updateTimer(data.time);
            this.leaderboardData = data.leaderboard;
            if (this.scoreboardVisible) this.refreshScoreboard();
        });
        gameScene.events.on('matchEnded', (w) => this.showVictoryScreen(w));
        gameScene.events.on('matchRestarted', () => {
            if (this.victoryContainer) { this.victoryContainer.destroy(); this.victoryContainer = null; }
            this.hideScoreboard();
        });

        // 5. CONTROLES
        this.mobileInput = { left: false, right: false, up: false, down: false, attack: false, dash: false };
        this.isEditMode = false;
        
        try {
            if (this.plugins.get('rexVirtualJoystick')) {
                this.createMobileControls();
            }
        } catch (e) { console.error("Erro Joystick:", e); }
    }

    // --- FUNÇÃO NOVA: RESET DE CONTROLES (CORREÇÃO DO TRAVAMENTO) ---
    resetControls() {
        // Zera todas as variáveis
        this.mobileInput = { left: false, right: false, up: false, down: false, attack: false, dash: false };
        
        // Zera o estado visual dos botões
        if(this.containerJump) this.containerJump.isDown = false;
        if(this.containerAttack) this.containerAttack.isDown = false;
        if(this.containerDash) this.containerDash.isDown = false;

        // Avisa a GameScene IMEDIATAMENTE para parar o boneco
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
            gameScene.events.emit('mobileInput', this.mobileInput);
        }
    }

    updateBars(data) {
        if (this.hpBar && data.health !== undefined) this.hpBar.width = (data.health / 100) * 200;
        if (this.energyBar && data.energy !== undefined) this.energyBar.width = (data.energy / 100) * 200;
    }

    updateTimer(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const timeString = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        if(this.timerText) {
            this.timerText.setText(timeString);
            this.timerText.setColor(seconds < 30 ? '#ff0000' : '#ffffff');
        }
    }

    createMobileControls() {
        const savedLayout = JSON.parse(localStorage.getItem('bitArena_layout')) || {
            joyX: 120, joyY: this.scale.height - 120,
            jumpX: this.scale.width - 100, jumpY: this.scale.height - 100,
            atkX: this.scale.width - 200, atkY: this.scale.height - 80,
            dashX: this.scale.width - 80, dashY: this.scale.height - 220
        };

        this.joyStick = this.plugins.get('rexVirtualJoystick').add(this, {
            x: savedLayout.joyX, y: savedLayout.joyY, radius: 60,
            base: this.add.circle(0, 0, 60, 0x888888).setAlpha(0.25).setStrokeStyle(3, 0xffffff),
            thumb: this.add.circle(0, 0, 30, 0xcccccc).setAlpha(0.8),
            dir: '8dir', forceMin: 16
        });

        this.containerJump = this.createButton(savedLayout.jumpX, savedLayout.jumpY, 0x00ff00, '⬆️', 'up');
        this.containerAttack = this.createButton(savedLayout.atkX, savedLayout.atkY, 0xff0000, '⚔️', 'attack');
        this.containerDash = this.createButton(savedLayout.dashX, savedLayout.dashY, 0x0000ff, '💨', 'dash');

        this.updateButtonScale(this.buttonScale);

        this.events.on('update', () => {
            if (this.isEditMode) return; // Se estiver editando, não atualiza input

            this.mobileInput.left = this.joyStick.left;
            this.mobileInput.right = this.joyStick.right;
            this.mobileInput.down = this.joyStick.down;
            this.mobileInput.up = this.joyStick.up || this.containerJump.isDown;
            this.mobileInput.attack = this.containerAttack.isDown;
            this.mobileInput.dash = this.containerDash.isDown;

            this.scene.get('GameScene').events.emit('mobileInput', this.mobileInput);
        });
    }

    createButton(x, y, color, iconStr, keyMap) {
        const container = this.add.container(x, y);
        const radius = 45;
        const base = this.add.circle(0, 0, radius, color).setAlpha(0.3);
        const ring = this.add.circle(0, 0, radius).setStrokeStyle(3, 0xffffff).setAlpha(0.8);
        const icon = this.add.text(0, 0, iconStr, { fontSize: '40px', align: 'center' }).setOrigin(0.5);

        container.add([base, ring, icon]);
        
        const hitArea = new Phaser.Geom.Circle(0, 0, radius);
        container.setInteractive(hitArea, Phaser.Geom.Circle.Contains);
        this.input.setDraggable(container);
        container.isDown = false; 

        container.on('pointerdown', () => {
            if (this.isEditMode) return;
            container.isDown = true;
            base.setAlpha(0.7); 
            this.tweens.add({ targets: container, scale: this.buttonScale * 0.9, duration: 50 });
        });

        const release = () => {
            if (this.isEditMode) return;
            container.isDown = false;
            base.setAlpha(0.3);
            this.tweens.add({ targets: container, scale: this.buttonScale, duration: 50 });
        };

        container.on('pointerup', release);
        container.on('pointerout', release);

        container.on('drag', (pointer, dragX, dragY) => {
            if (this.isEditMode) { container.x = dragX; container.y = dragY; }
        });

        return container;
    }

    updateButtonScale(scale) {
        this.buttonScale = scale;
        localStorage.setItem('bitArena_btnScale', scale);
        if(this.containerJump) this.containerJump.setScale(scale);
        if(this.containerAttack) this.containerAttack.setScale(scale);
        if(this.containerDash) this.containerDash.setScale(scale);
        if(this.joyStick) { this.joyStick.base.setScale(scale); this.joyStick.thumb.setScale(scale); }
    }

    // --- MENUS ---

    openSettings() {
        this.resetControls(); // PARAR O BONECO AO ABRIR CONFIG

        this.input.topOnly = true; 
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        this.settingsContainer = this.add.container(cx, cy).setDepth(200);

        const bg = this.add.rectangle(0, 0, 450, 320, 0x000000, 0.95).setStrokeStyle(2, 0xffffff).setInteractive();
        const title = this.add.text(0, -130, 'CONFIGURAÇÕES', { fontSize: '20px', fontStyle: 'bold', fontFamily: 'Arial', color: '#ffff00' }).setOrigin(0.5);

        const volMusic = parseFloat(localStorage.getItem('bitArena_volMusic')) || 0.5;
        const volSFX = parseFloat(localStorage.getItem('bitArena_volSFX')) || 0.5;
        const sizePercent = (this.buttonScale - 0.5);

        const sMusic = this.createSlider(20, -80, 'Música', volMusic, (v) => { localStorage.setItem('bitArena_volMusic', v); this.scene.get('GameScene').events.emit('updateMusicVolume', v); });
        const sSFX = this.createSlider(20, -30, 'Efeitos', volSFX, (v) => { localStorage.setItem('bitArena_volSFX', v); this.scene.get('GameScene').events.emit('updateSFXVolume', v); });
        const sSize = this.createSlider(20, 20, 'Botões', sizePercent, (v) => { this.updateButtonScale(0.5 + (v * 1.0)); });

        const btnEdit = this.add.text(0, 90, 'MOVER BOTÕES', { fontSize: '18px', backgroundColor: '#333', padding: { x: 15, y: 8 }, fontFamily: 'Arial' }).setOrigin(0.5).setInteractive();
        btnEdit.on('pointerdown', () => { this.closeSettings(); this.startEditMode(); });

        const btnClose = this.add.text(200, -140, 'X', { fontSize: '26px', color: '#ff0000', fontStyle: 'bold', fontFamily: 'Arial' }).setOrigin(0.5).setInteractive();
        btnClose.on('pointerdown', () => { this.closeSettings(); });

        this.settingsContainer.add([bg, title, btnEdit, btnClose, ...sMusic, ...sSFX, ...sSize]);
    }

    createSlider(x, y, labelText, initialValue, callback) {
        const label = this.add.text(x - 120, y, labelText, { fontSize: '16px', fontFamily: 'Arial' }).setOrigin(1, 0.5);
        const sliderWidth = 180;
        const sliderLeft = x - 100;
        const line = this.add.rectangle(sliderLeft + (sliderWidth/2), y, sliderWidth, 4, 0x666666);
        let safeValue = Phaser.Math.Clamp(initialValue, 0, 1);
        const thumbX = sliderLeft + (safeValue * sliderWidth);
        const thumb = this.add.circle(thumbX, y, 14, 0x00ff00).setInteractive({ draggable: true });

        thumb.on('drag', (p, dragX, dragY) => {
            let newX = Phaser.Math.Clamp(dragX, sliderLeft, sliderLeft + sliderWidth);
            thumb.x = newX;
            const percent = (newX - sliderLeft) / sliderWidth;
            if (callback) callback(percent);
        });
        return [label, line, thumb];
    }

    closeSettings() {
        this.resetControls(); // GARANTE QUE ESTÁ ZERADO AO SAIR
        if (this.settingsContainer) { this.settingsContainer.destroy(); this.settingsContainer = null; }
    }

    startEditMode() {
        this.resetControls(); // PARAR O BONECO AO ENTRAR NO MODO EDIÇÃO

        this.isEditMode = true;
        this.btnConfig.setVisible(false);
        this.joyStick.base.setInteractive({ draggable: true });
        this.joyStick.base.on('drag', (p, x, y) => { this.joyStick.x = x; this.joyStick.y = y; this.joyStick.base.x = x; this.joyStick.base.y = y; this.joyStick.thumb.x = x; this.joyStick.thumb.y = y; });

        this.saveBtn = this.add.text(this.scale.width / 2, this.scale.height - 50, '💾 SALVAR & SAIR', {
            fontSize: '24px', backgroundColor: '#00aa00', padding: { x: 20, y: 10 }, fontFamily: 'Arial'
        }).setOrigin(0.5).setInteractive().setDepth(200);

        this.saveBtn.on('pointerdown', () => this.saveEditMode());
        this.editHelp = this.add.text(this.scale.width / 2, 50, 'ARRASTE OS BOTÕES', { fontSize: '24px', backgroundColor: '#00000088', fontFamily: 'Arial' }).setOrigin(0.5).setDepth(200);
    }

    saveEditMode() {
        this.isEditMode = false;
        this.resetControls(); // GARANTIA EXTRA AO SALVAR

        this.btnConfig.setVisible(true);
        this.saveBtn.destroy();
        this.editHelp.destroy();
        this.joyStick.base.disableInteractive();

        const layout = { joyX: this.joyStick.x, joyY: this.joyStick.y, jumpX: this.containerJump.x, jumpY: this.containerJump.y, atkX: this.containerAttack.x, atkY: this.containerAttack.y, dashX: this.containerDash.x, dashY: this.containerDash.y };
        localStorage.setItem('bitArena_layout', JSON.stringify(layout));
    }

    createScoreboardUI() {
        const cx = this.scale.width/2; const cy = this.scale.height/2;
        this.scoreboardContainer = this.add.container(cx, cy).setVisible(false).setDepth(200);
        const bg = this.add.rectangle(0,0,500,400,0x000000,0.9).setStrokeStyle(4,0xffff00);
        const t = this.add.text(0,-160,'RANKING',{fontSize:'24px',fontFamily:'"Press Start 2P"',color:'#ffff00'}).setOrigin(0.5);
        this.scoreListText = this.add.text(0,-120,'...',{fontSize:'12px',fontFamily:'"Press Start 2P"',align:'left',lineSpacing:15}).setOrigin(0.5,0);
        const close = this.add.text(220,-180,'X',{fontSize:'20px',fontFamily:'"Press Start 2P"',color:'#f00'}).setOrigin(0.5).setInteractive();
        close.on('pointerdown',()=>this.hideScoreboard()); this.scoreboardContainer.add([bg,t,this.scoreListText,close]);
    }
    showScoreboard() { this.scoreboardVisible = true; this.scoreboardContainer.setVisible(true); this.refreshScoreboard(); }
    hideScoreboard() { this.scoreboardVisible = false; this.scoreboardContainer.setVisible(false); }
    refreshScoreboard() {
        let text = "POS  NOME         K / D\n-----------------------\n";
        this.leaderboardData.slice(0, 8).forEach((p, i) => { text += `${i+1}.  ${p.name.padEnd(10,' ').substring(0,10)}   ${p.kills}/${p.deaths}\n`; });
        this.scoreListText.setText(text);
    }
    showVictoryScreen(w) {
        this.hideScoreboard(); if(this.settingsContainer) this.closeSettings();
        const cx = this.scale.width/2; const cy = this.scale.height/2;
        this.victoryContainer = this.add.container(cx, cy).setDepth(300);
        const bg = this.add.rectangle(0,0,600,300,0x000000,0.95).setStrokeStyle(6,0xffff00);
        const t = this.add.text(0,-60,'FIM DE JOGO!',{fontSize:'30px',fontFamily:'"Press Start 2P"',color:'#fff'}).setOrigin(0.5);
        const wTxt = this.add.text(0,40,`VENCEDOR:\n${w?w.name:'NINGUÉM'}`,{fontSize:'35px',fontFamily:'"Press Start 2P"',color:'#ff0',align:'center'}).setOrigin(0.5);
        this.victoryContainer.add([bg,t,wTxt]);
    }
}