// --- IMPORTAÇÕES ---
const express = require('express');
const http = require('http');
// CORREÇÃO CRÍTICA 1: Importa a classe Server corretamente
const { Server } = require("socket.io"); 
const path = require('path');
const fs = require('fs');

// --- INICIALIZAÇÃO DO SERVIDOR ---
const app = express();
const server = http.createServer(app);

// CORREÇÃO CRÍTICA 2: Inicializa o Socket com 'new Server' e CORS liberado
const io = new Server(server, {
    cors: {
        origin: "*", // Libera acesso de qualquer origem (Celular, PC, Emulador)
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: false // Necessário quando origin é "*"
    }
});

// Serve a pasta pública
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- CONSTANTES DE FÍSICA ---
const GRAVITY = 0.8;
const JUMP_FORCE = -15;
const MOVE_SPEED = 5;

// --- CONSTANTES DE GAMEPLAY ---
const DASH_SPEED = 15;
const DASH_DURATION = 200;
const DASH_COST = 20;
const DASH_COOLDOWN = 1000;

const ATTACK_COOLDOWN = 500; 
const ATTACK_DURATION = 300; 
const INVULNERABILITY_TIME = 1000;
const RESPAWN_TIME = 5000; // 5 Segundos
const ITEM_RESPAWN_TIME = 60 * 60 * 1000; // 1 Hora

const NINJA_DMG = 15;
const NINJA_RANGE = 70;
const KNOCKBACK_FORCE = 12;

// --- VARIÁVEIS DA PARTIDA ---
const MATCH_DURATION = 300; // 5 minutos
let matchTime = MATCH_DURATION;
let matchEnded = false;

// --- LEITURA DO MAPA (TILED JSON) ---
let mapPlatforms = [];
let mapItems = [];

try {
    const mapPath = path.join(__dirname, 'public', 'assets', 'maps', 'mapa.json');
    // Verifica se o arquivo existe antes de ler para evitar crash
    if (fs.existsSync(mapPath)) {
        const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        const tileWidth = mapData.tilewidth;
        const tileHeight = mapData.tileheight;

        console.log("--- CARREGANDO BIT ARENA ---");

        mapData.layers.forEach(layer => {
            // Plataformas
            if (layer.name === 'Plataformas') {
                layer.data.forEach((tileId, index) => {
                    if (tileId !== 0) {
                        const col = index % layer.width;
                        const row = Math.floor(index / layer.width);
                        mapPlatforms.push({ 
                            x: col * tileWidth, 
                            y: row * tileHeight, 
                            w: tileWidth, 
                            h: tileHeight 
                        });
                    }
                });
                console.log(`[MAPA] Plataformas: ${mapPlatforms.length}`);
            }
            // Itens
            if (layer.type === 'objectgroup') {
                if (layer.name === 'Vidas' || layer.name === 'Speed') {
                    layer.objects.forEach(obj => {
                        let type = (layer.name === 'Vidas') ? 'health' : 'energy';
                        mapItems.push({
                            id: `${type}_${Math.floor(Math.random() * 100000)}`,
                            type: type,
                            x: obj.x, y: obj.y, w: obj.width, h: obj.height,
                            active: true
                        });
                    });
                }
            }
        });
        console.log(`[MAPA] Itens: ${mapItems.length}`);
    } else {
        console.warn("AVISO: mapa.json não encontrado. Usando chão padrão.");
        mapPlatforms.push({ x: 0, y: 600, w: 2000, h: 50 });
    }

} catch (error) {
    console.error("ERRO CRÍTICO NO MAPA:", error.message);
    mapPlatforms.push({ x: 0, y: 600, w: 2000, h: 50 });
}

let players = {};

// --- FUNÇÕES AUXILIARES ---

function checkRectCollision(player, rect) {
    const pLeft = player.x - 20; const pRight = player.x + 20; 
    const pTop = player.y - 40; const pBottom = player.y + 60; 
    const rLeft = rect.x; const rRight = rect.x + rect.w;
    const rTop = rect.y; const rBottom = rect.y + rect.h;
    return (pLeft < rRight && pRight > rLeft && pTop < rBottom && pBottom > rTop);
}

function processCombat(attacker, allPlayers) {
    const now = Date.now();
    if (now < attacker.lastAttackTime + ATTACK_COOLDOWN) return;
    
    attacker.lastAttackTime = now;
    attacker.isAttacking = true;
    setTimeout(() => { 
        if(players[attacker.playerId]) players[attacker.playerId].isAttacking = false; 
    }, ATTACK_DURATION);

    const attackRect = {
        x: (attacker.facingDirection === 1) ? attacker.x + 20 : attacker.x - 20 - NINJA_RANGE,
        y: attacker.y - 40, w: NINJA_RANGE, h: 80
    };

    Object.keys(allPlayers).forEach(id => {
        const victim = allPlayers[id];
        if (victim.playerId === attacker.playerId || victim.isDead) return;
        if (checkRectCollision(victim, attackRect)) applyDamage(victim, attacker);
    });
}

function applyDamage(victim, attacker) {
    const now = Date.now();
    if (now < victim.lastDamageTime + INVULNERABILITY_TIME) return;

    victim.health -= NINJA_DMG;
    victim.lastDamageTime = now;
    
    const pushDir = (attacker.x < victim.x) ? 1 : -1;
    victim.vx = pushDir * KNOCKBACK_FORCE; 
    victim.vy = -5; 

    io.emit('playerHitEffect', { x: victim.x, y: victim.y, direction: pushDir });

    if (victim.health <= 0) handleDeath(victim, attacker);
}

function handleDeath(victim, killer) {
    victim.health = 0;
    victim.isDead = true;
    victim.deaths++;
    if (killer) killer.kills++;

    setTimeout(() => {
        if (players[victim.playerId]) {
            const p = players[victim.playerId];
            p.isDead = false; p.health = 100; p.energy = 100;
            p.x = 200 + Math.random() * 400; p.y = 100;
            p.vx = 0; p.vy = 0;
            p.lastDamageTime = Date.now() + 3000;
        }
    }, RESPAWN_TIME);
}

// --- SISTEMA DE PARTIDA ---
function getLeaderboard() {
    const list = [];
    Object.keys(players).forEach(id => {
        const p = players[id];
        if (p.nickname !== 'Unknown') {
            list.push({ name: p.nickname, kills: p.kills, deaths: p.deaths });
        }
    });
    list.sort((a, b) => b.kills - a.kills);
    return list;
}

function restartMatch() {
    matchTime = MATCH_DURATION;
    matchEnded = false;
    Object.keys(players).forEach(id => {
        players[id].kills = 0; players[id].deaths = 0; players[id].health = 100;
        players[id].isDead = false;
        players[id].x = 200 + Math.random() * 400; players[id].y = 100;
    });
    io.emit('matchRestarted');
    console.log("--- NOVA PARTIDA ---");
}

// LOOP DE 1 SEGUNDO (TIMER)
setInterval(() => {
    if (matchEnded) return;

    if (matchTime > 0) {
        matchTime--;
    } else {
        matchEnded = true;
        const winners = getLeaderboard();
        io.emit('matchEnded', winners.length > 0 ? winners[0] : null);
        setTimeout(restartMatch, 5000);
    }

    io.emit('matchUpdate', {
        time: matchTime,
        leaderboard: getLeaderboard()
    });
}, 1000);

// --- SOCKET.IO EVENTOS ---
io.on('connection', (socket) => {
    console.log(`[+] Conectado: ${socket.id}`);

    players[socket.id] = {
        playerId: socket.id,
        x: 100 + Math.random() * 200, y: 100, vx: 0, vy: 0,
        isGrounded: false, health: 100, energy: 100, isDead: false,
        
        nickname: 'Unknown', isReady: false,
        
        isAttacking: false, lastAttackTime: 0, lastDamageTime: 0,
        kills: 0, deaths: 0,
        isDashing: false, lastDashTime: 0, dashEndTime: 0,
        facingDirection: 1,
        input: { left: false, right: false, up: false, down: false, attack: false, test_die: false, dash: false }
    };

    socket.emit('currentPlayers', players);
    socket.emit('currentItems', mapItems);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerInput', (data) => {
        if (players[socket.id]) players[socket.id].input = data;
    });

    socket.on('joinGame', (name) => {
        if (players[socket.id]) {
            players[socket.id].nickname = name ? name.substring(0, 12) : 'Guerreiro';
            players[socket.id].isReady = true;
            // Atualiza para todos imediatamente
            io.emit('playerUpdates', players);
            io.emit('currentPlayers', players);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Saiu: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// --- GAME LOOP (FÍSICA 60 FPS) ---
// --- GAME LOOP (FÍSICA 60 FPS) ---
setInterval(() => {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;
    const now = Date.now();

    playerIds.forEach((id) => {
        const p = players[id];

        // 1. Morte (Prioridade Total - Morto não mexe)
        if (p.input.test_die && !p.isDead) handleDeath(p, null);
        if (p.isDead) {
            p.vy += GRAVITY; p.y += p.vy;
            if (p.y > 2000) { p.y = 2000; p.vy = 0; } 
            return; 
        }

        // 2. Direção (Sempre atualiza, mesmo atacando)
        if (p.input.left) p.facingDirection = -1;
        if (p.input.right) p.facingDirection = 1;

        // 3. Combate (Processa o hit, mas NÃO para o movimento)
        if (p.input.attack) processCombat(p, players);

        // 4. Dash (Prioridade sobre movimento normal)
        if (p.input.dash && p.energy >= DASH_COST && !p.isDashing && now > p.lastDashTime + DASH_COOLDOWN) {
            p.isDashing = true; p.energy -= DASH_COST;
            p.dashEndTime = now + DASH_DURATION; p.lastDashTime = now;
            p.vx = DASH_SPEED * p.facingDirection; p.vy = 0;
        }

        // 5. Movimento
        if (p.isDashing) {
            // Se estiver no Dash, velocidade é fixa
            p.vx = DASH_SPEED * p.facingDirection; p.vy = 0;
            if (now > p.dashEndTime) { p.isDashing = false; p.vx = 0; }
        } 
        else {
            // --- MOVIMENTO NORMAL (CORRIGIDO PARA RUN & ATTACK) ---
            // Aqui calculamos a velocidade independente se está atacando ou não.
            
            // Define velocidade baseada no input
            if (p.input.left) {
                p.vx = -MOVE_SPEED;
            } else if (p.input.right) {
                p.vx = MOVE_SPEED;
            } else {
                p.vx = 0;
            }

            // (Opcional) Se quiser que ele ande mais devagar enquanto ataca, descomente abaixo:
            // if (p.isAttacking) p.vx *= 0.5; 

            // Fricção do Knockback (Se tomou dano, empurrão desacelera)
            if (now < p.lastDamageTime + 500 && Math.abs(p.vx) > MOVE_SPEED) {
                p.vx *= 0.9; 
            }

            // Pulo
            if (p.input.up && p.isGrounded) { p.vy = JUMP_FORCE; p.isGrounded = false; }
            
            // Gravidade
            p.vy += GRAVITY;
        }

        // 6. Aplica Física
        p.x += p.vx; p.y += p.vy;

        // 7. Colisão Plataforma
        p.isGrounded = false;
        if (p.vy >= 0) {
            const pFeet = p.y + 64;
            for (let i = 0; i < mapPlatforms.length; i++) {
                let plat = mapPlatforms[i];
                if (pFeet >= plat.y && pFeet <= plat.y + 40 && p.x >= plat.x - 20 && p.x <= plat.x + plat.w + 20) {
                    p.y = plat.y - 64; p.vy = 0; p.isGrounded = true; break;
                }
            }
        }

        // 8. Itens e Buraco (Mantidos)
        mapItems.forEach(item => {
            if (item.active && checkRectCollision(p, item)) {
                if (item.type === 'health') p.health = Math.min(p.health + 20, 100);
                else if (item.type === 'energy') p.energy = Math.min(p.energy + 25, 100);
                item.active = false;
                io.emit('currentItems', mapItems);
                io.emit('itemCollected', p.playerId);
                setTimeout(() => { item.active = true; io.emit('currentItems', mapItems); }, ITEM_RESPAWN_TIME);
            }
        });
        if (p.y > 1500) handleDeath(p, null);
    });

    io.emit('playerUpdates', players);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));