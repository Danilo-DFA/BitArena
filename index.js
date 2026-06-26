// ============================================================================
// ARQUIVO: index.js
// DESCRIÇÃO: Servidor Backend Completo - Carrinho e Recuperação de PIX
// ============================================================================

const express = require('express'); 
require('dotenv').config(); 
const { createClient } = require('@supabase/supabase-js'); 
const axios = require('axios'); 
const path = require('path'); 
const cron = require('node-cron'); 
const QRCode = require('qrcode'); 

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; 
const porta = process.env.PORT || 3000; 

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// FUNÇÕES AUXILIARES DO PIX
// ============================================================================
function completouTamanho(id, valor) { return id + String(valor.length).padStart(2, '0') + valor; }

function calcularCRC16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        let byte = payload.charCodeAt(i);
        for (let b = 0; b < 8; b++) {
            let bit = ((byte >> (7 - b)) & 1) === 1;
            let c15 = ((crc >> 15) & 1) === 1;
            crc <<= 1;
            if (c15 ^ bit) crc ^= 0x1021;
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function gerarPayloadPix(chave, nome, cidade, valor, txid = "BOLAO") {
    nome = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().substring(0, 25);
    cidade = cidade.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().substring(0, 15);
    let formatadoValor = parseFloat(valor).toFixed(2);
    
    let merchantAccount = completouTamanho('00', 'br.gov.bcb.pix') + completouTamanho('01', chave);
    let additionalData = completouTamanho('05', txid);
    
    let payload = completouTamanho('00', '01') + completouTamanho('26', merchantAccount) + completouTamanho('52', '0000') + completouTamanho('53', '986') + completouTamanho('54', formatadoValor) + completouTamanho('58', 'BR') + completouTamanho('59', nome) + completouTamanho('60', cidade) + completouTamanho('62', additionalData) + '6304';
        
    return payload + calcularCRC16(payload);
}

// ============================================================================
// ROTAS DO CLIENTE
// ============================================================================

app.get('/api/config', (req, res) => { res.json({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY }); });

app.get('/api/valor-aposta', async (req, res) => {
    try {
        const { data, error } = await supabase.from('config_banca').select('*').eq('id', 1).single();
        if (error) throw error; res.json(data);
    } catch (err) { res.json({ valor_aposta: 5.00 }); }
});

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const { nome, telefone, email, senha } = req.body;
        if (!nome || !telefone || !email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios.' });
        const { data: userAuth, error: authError } = await supabase.auth.signUp({ email: email, password: senha, options: { data: { nome: nome, telefone: telefone } } });
        if (authError) throw authError;
        res.status(201).json({ sucesso: true, user: userAuth.user });
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

// PASSO 1: Salva na sacola
app.post('/api/apostas/adicionar-carrinho', async (req, res) => {
    try {
        const { apostas, user_id } = req.body;
        if (!apostas || apostas.length === 0) return res.status(400).json({ erro: 'Carrinho vazio.' });
        const apostasParaInserir = apostas.map(ap => ({ user_id: user_id, jogo_id: ap.jogo_id, gols_a: ap.gols_a, gols_b: ap.gols_b, status_pagamento: 'pendente' }));
        const { error } = await supabase.from('apostas').insert(apostasParaInserir);
        if (error) throw error; res.json({ sucesso: true });
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

// LIXEIRA MELHORADA: Permite excluir apostas do carrinho e apostas pendentes expiradas (desde que não estejam pagas)
app.post('/api/apostas/excluir', async (req, res) => {
    try {
        const { aposta_id, user_id } = req.body;
        const { error } = await supabase.from('apostas').delete().eq('id', aposta_id).eq('user_id', user_id).neq('status_pagamento', 'pago');
        if (error) throw error; res.json({ sucesso: true });
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

// PASSO 2: Gera PIX da Sacola (Aba Pagar)
app.post('/api/pagamento/gerar-pix-carrinho', async (req, res) => {
    try {
        const { user_id } = req.body;
        const { data: config } = await supabase.from('config_banca').select('*').eq('id', 1).single();
        const precoAposta = config ? parseFloat(config.valor_aposta) : 5.00;

        const { data: pendentes, error } = await supabase.from('apostas').select('id').eq('user_id', user_id).eq('status_pagamento', 'pendente');
        if (error) throw error;
        if (!pendentes || pendentes.length === 0) return res.status(400).json({ erro: 'Nenhuma aposta na sacola.' });

        const ids = pendentes.map(p => p.id);
        await supabase.from('apostas').update({ status_pagamento: 'pendente_pagamento' }).in('id', ids);

        const totalDinheiro = pendentes.length * precoAposta;
        const chave = config?.chave_pix || 'seu-email@banca.com'; const nome = config?.nome_titular || 'DONO DA BANCA'; const cidade = config?.cidade_titular || 'GOIANIA';
        const codigoCopiaCola = gerarPayloadPix(chave, nome, cidade, totalDinheiro);
        const imagemQrCodeBase64 = await QRCode.toDataURL(codigoCopiaCola);

        res.json({ sucesso: true, total: totalDinheiro, pix_copia_cola: codigoCopiaCola, qrcode_base64: imagemQrCodeBase64 });
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

// NOVA ROTA: Recuperar PIX (Aba Pendentes) validando os 20 minutos
app.post('/api/pagamento/gerar-pix-pendentes', async (req, res) => {
    try {
        const { user_id } = req.body;
        const { data: config } = await supabase.from('config_banca').select('*').eq('id', 1).single();
        const precoAposta = config ? parseFloat(config.valor_aposta) : 5.00;

        const { data: pendentes, error } = await supabase.from('apostas').select('id, matches(data_jogo)').eq('user_id', user_id).eq('status_pagamento', 'pendente_pagamento');
        if (error) throw error;
        if (!pendentes || pendentes.length === 0) return res.status(400).json({ erro: 'Nenhuma aposta pendente.' });

        // A Matemática do Bloqueio: Verifica se faltam mais de 20 minutos
        const agora = new Date().getTime();
        const vinteMinutosEmMs = 20 * 60 * 1000;
        const apostasValidas = pendentes.filter(p => {
            const dataJogo = new Date(p.matches.data_jogo).getTime();
            return (dataJogo - agora) >= vinteMinutosEmMs;
        });

        if (apostasValidas.length === 0) return res.status(400).json({ erro: 'O tempo limite para pagamento destas apostas expirou.' });

        const totalDinheiro = apostasValidas.length * precoAposta;
        const chave = config?.chave_pix || 'seu-email@banca.com'; const nome = config?.nome_titular || 'DONO DA BANCA'; const cidade = config?.cidade_titular || 'GOIANIA';
        const codigoCopiaCola = gerarPayloadPix(chave, nome, cidade, totalDinheiro);
        const imagemQrCodeBase64 = await QRCode.toDataURL(codigoCopiaCola);

        res.json({ sucesso: true, total: totalDinheiro, pix_copia_cola: codigoCopiaCola, qrcode_base64: imagemQrCodeBase64 });
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});


// ============================================================================
// ROBÔ E ROTAS DO ADMIN (MANTIDAS)
// ============================================================================
async function sincronizarComApiExterna() {
    try {
        const apiKey = process.env.FOOTBALL_DATA_KEY;
        const configuracaoApi = { method: 'GET', url: 'https://api.football-data.org/v4/competitions/WC/matches', headers: { 'X-Auth-Token': apiKey } };
        const respostaApi = await axios.request(configuracaoApi);
        const jogosDaApi = respostaApi.data.matches;
        if (!jogosDaApi || jogosDaApi.length === 0) return;
        for (const jogo of jogosDaApi) {
            const timeA = jogo.homeTeam?.name || 'A definir'; const timeB = jogo.awayTeam?.name || 'A definir'; const dataJogo = jogo.utcDate; const jogoFinalizado = jogo.status === 'FINISHED'; const golsA = jogo.score?.fullTime?.home ?? null; const golsB = jogo.score?.fullTime?.away ?? null; const bandeiraA = jogo.homeTeam?.crest || null; const bandeiraB = jogo.awayTeam?.crest || null;
            const { data: jogoExistente } = await supabase.from('matches').select('*').eq('time_a', timeA).eq('time_b', timeB).eq('data_jogo', dataJogo).maybeSingle(); 
            if (!jogoExistente) { await supabase.from('matches').insert([{ time_a: timeA, time_b: timeB, data_jogo: dataJogo, placar_real_a: golsA, placar_real_b: golsB, status: jogoFinalizado ? 'finalizado' : 'pendente', bandeira_a: bandeiraA, bandeira_b: bandeiraB }]); } 
            else if (jogoExistente.status === 'pendente' && jogoFinalizado) { await supabase.from('matches').update({ placar_real_a: golsA, placar_real_b: golsB, status: 'finalizado' }).eq('id', jogoExistente.id); }
        }
    } catch (erro) { console.error(erro.message); }
}
cron.schedule('*/15 * * * *', () => { sincronizarComApiExterna(); });

app.get('/api/jogos', async (req, res) => {
    try {
        const { data: jogos } = await supabase.from('matches').select('*').order('data_jogo', { ascending: true });
        const { data: apostasPagas } = await supabase.from('apostas').select('jogo_id').eq('status_pagamento', 'pago');
        const jogosComPremio = jogos.map(jogo => {
            const quantidadePagas = apostasPagas ? apostasPagas.filter(a => a.jogo_id === jogo.id).length : 0;
            return { ...jogo, qtd_apostas_pagas: quantidadePagas };
        });
        res.json(jogosComPremio);
    } catch (err) { res.status(500).json({ erro: 'Erro.' }); }
});

async function verificarPermissaoAdmin(req, res, next) {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) return res.status(401).json({ erro: 'Acesso Negado.' });
    const token = tokenHeader.split(' ')[1]; 
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Sessão inválida.');
        const { data: adminVIP } = await supabase.from('administradores').select('email').eq('email', user.email).maybeSingle();
        if (!adminVIP) return res.status(403).json({ erro: 'Acesso restrito.' });
        next();
    } catch (erro) { return res.status(401).json({ erro: erro.message }); }
}

app.post('/api/admin/valor-aposta', verificarPermissaoAdmin, async (req, res) => {
    try {
        const { novo_valor, chave_pix, nome_titular, cidade_titular } = req.body;
        const { error } = await supabase.from('config_banca').upsert({ id: 1, valor_aposta: parseFloat(novo_valor), chave_pix: chave_pix, nome_titular: nome_titular, cidade_titular: cidade_titular });
        if (error) throw error; res.json({ sucesso: true });
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.get('/api/admin/apostas-pendentes', verificarPermissaoAdmin, async (req, res) => {
    try {
        const { data: apostas } = await supabase.from('apostas').select('id, user_id, gols_a, gols_b, matches(time_a, time_b, data_jogo)').eq('status_pagamento', 'pendente_pagamento');
        const { data: userData } = await supabase.auth.admin.listUsers();
        const resultado = apostas.map(aposta => {
            const user = userData.users.find(u => u.id === aposta.user_id);
            return { id: aposta.id, confronto: `${aposta.matches.time_a} x ${aposta.matches.time_b}`, palpite: `${aposta.gols_a} x ${aposta.gols_b}`, nome: user?.user_metadata?.nome || 'Desconhecido', telefone: user?.user_metadata?.telefone || 'Sem telefone' };
        });
        res.json(resultado);
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.post('/api/admin/aprovar-pagamento', verificarPermissaoAdmin, async (req, res) => {
    try {
        const { aposta_id } = req.body;
        await supabase.from('apostas').update({ status_pagamento: 'pago' }).eq('id', aposta_id);
        res.json({ sucesso: true });
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.get('/api/admin/ganhadores', verificarPermissaoAdmin, async (req, res) => {
    try {
        const { data: matches } = await supabase.from('matches').select('*').eq('status', 'finalizado');
        if (!matches || matches.length === 0) return res.json([]);
        const matchIds = matches.map(m => m.id);
        const { data: apostas } = await supabase.from('apostas').select('id, user_id, jogo_id, gols_a, gols_b').eq('status_pagamento', 'pago').in('jogo_id', matchIds);
        const { data: userData } = await supabase.auth.admin.listUsers();
        const ganhadores = [];
        matches.forEach(match => {
            const apostasDoJogo = apostas.filter(a => a.jogo_id === match.id);
            const vencedores = apostasDoJogo.filter(a => a.gols_a === match.placar_real_a && a.gols_b === match.placar_real_b);
            vencedores.forEach(vencedor => {
                const user = userData.users.find(u => u.id === vencedor.user_id);
                ganhadores.push({ confronto: `${match.time_a} ${match.placar_real_a} x ${match.placar_real_b} ${match.time_b}`, nome: user?.user_metadata?.nome || 'Desconhecido', telefone: user?.user_metadata?.telefone || 'Sem telefone', palpite: `${vencedor.gols_a} x ${vencedor.gols_b}` });
            });
        });
        res.json(ganhadores);
    } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

app.listen(porta, () => { console.log(`🚀 Servidor rodando na porta ${porta}`); });