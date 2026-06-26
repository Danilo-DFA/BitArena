// ============================================================================
// ARQUIVO: script.js
// VERSÃO: 2.2 - Correção da Rota de Resgate de PIX (Aba Pendentes)
// ============================================================================

// Variáveis globais de controle do estado da aplicação
let usuarioAtual = null;
let conexaoSupabase;
let subAbaAtiva = 'andamento';
let subAbaMinhasApostasAtiva = 'pagar';
let valorApostaGlobal = 5.00;

document.addEventListener('DOMContentLoaded', async () => {

    // --- CAPTURA DOS ELEMENTOS DA INTERFACE (DOM) ---
    const btnAbrirLogin = document.getElementById('btn-abrir-login');
    const modalLogin = document.getElementById('modal-login');
    const btnFecharModal = document.getElementById('fechar-modal');
    const msgErroAuth = document.getElementById('msg-erro-auth');

    // Elementos do Centro de Comando do Usuário Logado
    const areaLogado = document.getElementById('area-logado');
    const msgUsuario = document.getElementById('msg-usuario');
    const btnSair = document.getElementById('btn-sair');

    // Inputs e Botões da tela de Login
    const telaLogin = document.getElementById('tela-login');
    const loginEmail = document.getElementById('login-email');
    const loginSenha = document.getElementById('login-senha');
    const btnEntrar = document.getElementById('btn-entrar');
    const linkAbrirCadastro = document.getElementById('link-abrir-cadastro');

    // Inputs e Botões da tela de Cadastro
    const telaCadastro = document.getElementById('tela-cadastro');
    const cadNome = document.getElementById('cad-nome');
    const cadTelefone = document.getElementById('cad-telefone');
    const cadEmail = document.getElementById('cad-email');
    const cadSenha = document.getElementById('cad-senha');
    const cadConfirmaSenha = document.getElementById('cad-confirma-senha');
    const btnCadastrar = document.getElementById('btn-cadastrar');
    const linkVoltarLogin = document.getElementById('link-voltar-login');

    // Botões de Navegação entre as Abas Principais
    const abaPendentesBtn = document.getElementById('aba-pendentes');
    const abaMinhasApostasBtn = document.getElementById('aba-minhas-apostas');
    const abaFinalizadosBtn = document.getElementById('aba-finalizados');

    // Containers onde os cards de jogos serão desenhados
    const containerPendentes = document.getElementById('container-pendentes');
    const containerMinhasApostas = document.getElementById('container-minhas-apostas');
    const containerFinalizados = document.getElementById('container-finalizados');

    // Elementos da Barra Flutuante da Sacola/Carrinho
    const barraFlutuante = document.getElementById('barra-flutuante-apostas');
    const contadorApostas = document.getElementById('contador-apostas');
    const valorBarraApostas = document.getElementById('valor-barra-apostas');
    const btnAdicionarCarrinho = document.getElementById('btn-revisar-apostas');

    // --- CONTROLE DE FECHAMENTO DE MODAIS ---
    if (btnFecharModal) btnFecharModal.addEventListener('click', () => { modalLogin.style.display = 'none'; });
    if (modalLogin) {
        modalLogin.querySelectorAll('*').forEach(elemento => {
            if (elemento.textContent === '❌' || elemento.classList.contains('fechar') || elemento.id === 'fechar-modal') {
                elemento.addEventListener('click', () => { modalLogin.style.display = 'none'; msgErroAuth.textContent = ""; });
            }
        });
    }

    // --- INICIALIZAÇÃO DO BANCO SUPABASE E VERIFICAÇÃO DE SESSÃO ---
    try {
        // Busca o valor padrão configurado para cada bilhete de aposta
        const valRes = await fetch('/api/valor-aposta');
        const valData = await valRes.json();
        valorApostaGlobal = parseFloat(valData.valor_aposta) || 5.00;

        // Carrega as credenciais seguras do Supabase enviadas pelo backend local
        const configRes = await fetch('/api/config?t=' + Date.now());
        const config = await configRes.json();
        conexaoSupabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

        // Verifica se o usuário já possui uma sessão ativa salva no navegador
        const { data } = await conexaoSupabase.auth.getSession();
        if (data.session) {
            usuarioAtual = data.session.user;
            // Executa a busca assíncrona do nome na tabela usuarios
            await atualizarTelaParaLogado(usuarioAtual);
        }
    } catch (err) { console.error(err); }

    // --- MÁSCARA VISUAL E COMPORTAMENTO DO WHATSAPP NO CADASTRO ---
    cadTelefone.addEventListener('input', function (e) {
        let numero = e.target.value.replace(/\D/g, ''); if (numero.length === 0) { e.target.value = ''; return; }
        if (!numero.startsWith('55')) { numero = '55' + numero; }
        let formatado = '+55 ';
        if (numero.length > 2) formatado += '(' + numero.substring(2, 4); if (numero.length > 4) formatado += ') ' + numero.substring(4, 9); if (numero.length > 9) formatado += '-' + numero.substring(9, 13);
        e.target.value = formatado;
    });

    // Função interna para alternar o ícone de olho e revelar/esconder senhas
    function alternarVisibilidadeSenha(inputId, btnId) {
        const input = document.getElementById(inputId); const btn = document.getElementById(btnId); if (!input || !btn) return;
        btn.addEventListener('click', () => { if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; } else { input.type = 'password'; btn.textContent = '👁️'; } });
    }
    alternarVisibilidadeSenha('login-senha', 'toggle-login-senha'); alternarVisibilidadeSenha('cad-senha', 'toggle-cad-senha'); alternarVisibilidadeSenha('cad-confirma-senha', 'toggle-cad-confirma-senha');

    // --- SISTEMA DE NAVEGAÇÃO DE ABAS PRINCIPAIS ---
    abaPendentesBtn.addEventListener('click', () => {
        abaPendentesBtn.classList.add('ativa'); abaMinhasApostasBtn.classList.remove('ativa'); abaFinalizadosBtn.classList.remove('ativa');
        containerPendentes.classList.add('ativo'); containerMinhasApostas.classList.remove('ativo'); containerFinalizados.classList.remove('ativo');
        verificarEAtualizarCarrinho();
    });

    abaMinhasApostasBtn.addEventListener('click', () => {
        abaPendentesBtn.classList.remove('ativa'); abaMinhasApostasBtn.classList.add('ativa'); abaFinalizadosBtn.classList.remove('ativa');
        containerPendentes.classList.remove('ativo'); containerMinhasApostas.classList.add('ativo'); containerFinalizados.classList.remove('ativo');
        barraFlutuante.style.display = 'none'; carregarMinhasApostas();
    });

    abaFinalizadosBtn.addEventListener('click', () => {
        abaPendentesBtn.classList.remove('ativa'); abaMinhasApostasBtn.classList.remove('ativa'); abaFinalizadosBtn.classList.add('ativa');
        containerPendentes.classList.remove('ativo'); containerMinhasApostas.classList.remove('ativo'); containerFinalizados.classList.add('ativo');
        barraFlutuante.style.display = 'none';
    });

    // --- CONTROLE EM TEMPO REAL DA BARRA DO CARRINHO ---
    function verificarEAtualizarCarrinho() {
        if (!abaPendentesBtn.classList.contains('ativa')) { barraFlutuante.style.display = 'none'; return; }
        const cards = containerPendentes.querySelectorAll('.jogo-card');
        let totalPreenchido = 0;
        cards.forEach(card => { const inputs = card.querySelectorAll('.input-gol'); if (inputs[0].value !== '' || inputs[1].value !== '') totalPreenchido++; });
        if (totalPreenchido > 0) {
            contadorApostas.textContent = `${totalPreenchido} aposta(s)`;
            const valorCalculado = totalPreenchido * valorApostaGlobal;
            valorBarraApostas.textContent = `R$ ${valorCalculado.toFixed(2).replace('.', ',')}`;
            barraFlutuante.style.display = 'block';
        } else { barraFlutuante.style.display = 'none'; }
    }

    if (btnAdicionarCarrinho) {
        btnAdicionarCarrinho.addEventListener('click', async () => {
            if (!usuarioAtual) { modalLogin.style.display = 'block'; telaLogin.style.display = 'block'; telaCadastro.style.display = 'none'; msgErroAuth.style.color = '#ff3366'; msgErroAuth.textContent = "Faça Login para salvar suas apostas no carrinho."; return; }
            btnAdicionarCarrinho.textContent = "Adicionando...";
            const cards = containerPendentes.querySelectorAll('.jogo-card');
            const carrinhoTemporario = [];

            cards.forEach(card => {
                const inputs = card.querySelectorAll('.input-gol');
                if (inputs[0].value !== '' || inputs[1].value !== '') {
                    carrinhoTemporario.push({ jogo_id: card.dataset.id, gols_a: parseInt(inputs[0].value || 0), gols_b: parseInt(inputs[1].value || 0) });
                }
            });

            try {
                const reply = await fetch('/api/apostas/adicionar-carrinho', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apostas: carrinhoTemporario, user_id: usuarioAtual.id }) });
                if (reply.ok) {
                    cards.forEach(card => card.querySelectorAll('.input-gol').forEach(i => i.value = ''));
                    btnAdicionarCarrinho.innerHTML = 'Adicionar ao Carrinho 🛒';
                    barraFlutuante.style.display = 'none';

                    // O POP-UP DE PÓS-APOSTA (OPÇÃO 2) COM GATILHO EMOCIONAL
                    Swal.fire({
                        title: '🎉 Palpites na Sacola!',
                        html: '<p style="color: #8b9bb4; font-size: 14px; margin-top: 10px;">Mas espere... Seu prêmio pode ficar <strong>GIGANTE!</strong><br><br>Compartilhe no seu grupo de futebol e traga a galera pra aumentar o dinheiro da rodada antes de você pagar!</p>',
                        icon: 'success',
                        showCancelButton: true,
                        confirmButtonColor: '#25D366',
                        cancelButtonColor: '#2a3248',
                        confirmButtonText: '📲 Compartilhar e Aumentar Prêmio',
                        cancelButtonText: 'Ir para a Sacola 🛒',
                        background: '#1a1f2e',
                        color: '#ffffff'
                    }).then((result) => {
                        // Se ele clicou no botão verde de compartilhar, dispara a API
                        if (result.isConfirmed) {
                            window.compartilharBolao();
                        }
                        // Independentemente se compartilhou ou não, nós mandamos ele para a área de pagar
                        subAbaMinhasApostasAtiva = 'pagar';
                        abaMinhasApostasBtn.click();
                        carregarJogos();
                    });
                }
            } catch (err) {
                Swal.fire({ title: 'Ops!', text: 'Erro ao adicionar ao carrinho.', icon: 'error', background: '#1a1f2e', color: '#ffffff', confirmButtonColor: '#ff3366' });
                btnAdicionarCarrinho.innerHTML = 'Adicionar ao Carrinho 🛒';
            }
        });
    }

    // --- MODAL DINÂMICO DE CHECKOUT PIX ---
    function abrirModalCheckoutPix(dadosPix) {
        const modalAntigo = document.getElementById('modal-checkout-pix-banca');
        if (modalAntigo) modalAntigo.remove();

        const modalContainer = document.createElement('div');
        modalContainer.id = 'modal-checkout-pix-banca';
        modalContainer.style = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.9); display: flex; justify-content: center; align-items: center; z-index: 10000; padding: 20px;";

        modalContainer.innerHTML = `
            <div style="background: #1a1f2e; border: 2px solid #ffd700; border-radius: 12px; padding: 25px; width: 100%; max-width: 380px; position: relative; text-align: center; box-shadow: 0 4px 25px rgba(255, 215, 0, 0.2); color: white;">
                <div id="fechar-modal-checkout-pix" style="position: absolute; top: 15px; right: 15px; cursor: pointer; font-size: 22px; color: #ff3366; font-weight: bold;">❌</div>
                <h3 style="color: #ffd700; text-transform: uppercase; margin-bottom: 10px; font-size: 18px; font-weight: 800;">⚽ Pagamento do Bilhete</h3>
                <p style="color: #8b9bb4; font-size: 12px; margin-bottom: 20px;">Transfira o valor de <strong style="color: #00ff88; font-size: 15px;">R$ ${dadosPix.total.toFixed(2).replace('.', ',')}</strong> para validar seus palpites.</p>
                <img src="${dadosPix.qrcode_base64}" style="width: 170px; height: 170px; border-radius: 8px; border: 4px solid white; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
                <button id="btn-copia-cola-modal" style="background-color: #ffd700; color: #0b0e14; font-weight: 800; text-transform: uppercase; padding: 12px; border: none; width: 100%; border-radius: 8px; cursor: pointer; font-size: 12px; transition: 0.2s;">📋 Copiar Código Pix</button>
            </div>
        `;
        document.body.appendChild(modalContainer);

        document.getElementById('fechar-modal-checkout-pix').addEventListener('click', () => modalContainer.remove());
        document.getElementById('btn-copia-cola-modal').addEventListener('click', function () {
            navigator.clipboard.writeText(dadosPix.pix_copia_cola);
            const textoOriginal = this.textContent; this.textContent = "✅ Código Copiado!"; this.style.backgroundColor = "#00ff88";
            setTimeout(() => { this.textContent = textoOriginal; this.style.backgroundColor = "#ffd700"; }, 2000);
        });
    }

    // --- CARREGAR HISTÓRICO DE PALPITES DO CLIENTE ---
    // --- CARREGAR HISTÓRICO DE PALPITES DO CLIENTE (COM GREEN / RED) ---
    // --- CARREGAR HISTÓRICO DE PALPITES DO CLIENTE (COM GREEN / RED E OCULTAÇÃO) ---
    async function carregarMinhasApostas() {
        if (!usuarioAtual) return;
        const container = document.getElementById('container-minhas-apostas');
        container.innerHTML = '<div class="loading">Carregando seus palpites...</div>';
        
        // 1. ENRIQUECIMENTO DE BUSCA: Pedimos o status e o placar real da partida
        const { data: apostas, error } = await conexaoSupabase.from('apostas')
            .select(`id, gols_a, gols_b, status_pagamento, matches ( time_a, time_b, data_jogo, status, placar_real_a, placar_real_b )`)
            .eq('user_id', usuarioAtual.id);
            
        if (error) { container.innerHTML = '<div class="loading" style="color: #ff3366">Erro ao carregar dados.</div>'; return; }

        // Desenha os sub-menus de navegação da Sacola
        container.innerHTML = `
            <div class="sub-abas-navegacao" style="display: flex; gap: 5px; margin-bottom: 20px;">
                <button id="btn-sub-pagar" class="sub-aba-btn" style="flex: 1; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; font-size: 11px; text-transform: uppercase; background: ${subAbaMinhasApostasAtiva === 'pagar' ? '#ffd700' : '#1a1f2e'}; color: ${subAbaMinhasApostasAtiva === 'pagar' ? '#000' : '#8b9bb4'}">🛒 Pagar</button>
                <button id="btn-sub-pendentes" class="sub-aba-btn" style="flex: 1; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; font-size: 11px; text-transform: uppercase; background: ${subAbaMinhasApostasAtiva === 'pendentes' ? '#ff9900' : '#1a1f2e'}; color: ${subAbaMinhasApostasAtiva === 'pendentes' ? '#000' : '#8b9bb4'}">⏳ Pendentes</button>
                <button id="btn-sub-confirmadas" class="sub-aba-btn" style="flex: 1; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; font-size: 11px; text-transform: uppercase; background: ${subAbaMinhasApostasAtiva === 'confirmadas' ? '#00ff88' : '#1a1f2e'}; color: ${subAbaMinhasApostasAtiva === 'confirmadas' ? '#000' : '#8b9bb4'}">✅ Confirmadas</button>
            </div>
            <div id="sub-cont-pagar" style="display: ${subAbaMinhasApostasAtiva === 'pagar' ? 'block' : 'none'};"></div>
            <div id="sub-cont-pendentes" style="display: ${subAbaMinhasApostasAtiva === 'pendentes' ? 'block' : 'none'};"></div>
            <div id="sub-cont-confirmadas" style="display: ${subAbaMinhasApostasAtiva === 'confirmadas' ? 'block' : 'none'};"></div>
        `;

        // Ativa os cliques das sub-abas
        document.getElementById('btn-sub-pagar').addEventListener('click', () => { subAbaMinhasApostasAtiva = 'pagar'; carregarMinhasApostas(); });
        document.getElementById('btn-sub-pendentes').addEventListener('click', () => { subAbaMinhasApostasAtiva = 'pendentes'; carregarMinhasApostas(); });
        document.getElementById('btn-sub-confirmadas').addEventListener('click', () => { subAbaMinhasApostasAtiva = 'confirmadas'; carregarMinhasApostas(); });

        const contPagar = document.getElementById('sub-cont-pagar');
        const contPendentes = document.getElementById('sub-cont-pendentes');
        const contConfirmadas = document.getElementById('sub-cont-confirmadas');

        // Variáveis matemáticas para controlar os totais
        let totalPagar = 0; let countPagar = 0;
        let countPendentes = 0; let countConfirmadas = 0;
        let countPendentesValidos = 0; let totalPendentesValidos = 0;

        // Se não houver nenhuma aposta, exibe a mensagem de vazio
        if (!apostas || apostas.length === 0) {
            contPagar.innerHTML = '<div class="loading">Seu carrinho está vazio.</div>';
            contPendentes.innerHTML = '<div class="loading">Nenhum palpite aguardando aprovação.</div>';
            contConfirmadas.innerHTML = '<div class="loading">Você ainda não tem apostas pagas.</div>';
            return;
        }

        const formatPreco = valorApostaGlobal.toFixed(2).replace('.', ',');

        // LÊ A LISTA DE IDs OCULTOS DA MEMÓRIA DO NAVEGADOR
        const apostasOcultas = JSON.parse(localStorage.getItem('betcup_reds_ocultos')) || [];

        // 2. PROCESSAMENTO INDIVIDUAL DE CADA APOSTA
        apostas.forEach(aposta => {
            
            // O FILTRO VIRTUAL: Se o ID dessa aposta estiver na lista negra, pula o desenho do card!
            if (apostasOcultas.includes(aposta.id)) return;

            let textoConfronto = "Jogo Não Encontrado"; 
            if (aposta.matches) textoConfronto = `${aposta.matches.time_a} X ${aposta.matches.time_b}`;
            
            const htmlBaseCard = `
                <div class="detalhes-aposta">
                    <span class="confronto">${textoConfronto}</span>
                    <span class="palpite">Seu Palpite: <span>${aposta.gols_a} x ${aposta.gols_b}</span></span>
                </div>
            `;

            const divCard = document.createElement('div'); 
            divCard.className = 'card-minha-aposta';

            // Categoria 1: Carrinho (Ainda não processado)
            if (aposta.status_pagamento === 'pendente') {
                totalPagar += valorApostaGlobal; countPagar++;
                divCard.innerHTML = htmlBaseCard + `
                    <div class="status-area">
                        <span style="font-size: 11px; color: #8b9bb4;">R$ ${formatPreco}</span>
                        <button onclick="window.excluirAposta(${aposta.id}, 'carrinho')" style="background: transparent; border: 1px solid #ff3366; color: #ff3366; border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 10px; font-weight: bold;">🗑️</button>
                    </div>`;
                contPagar.appendChild(divCard);
            } 
            // Categoria 2: Pix Gerado (Aguardando Pagamento)
            else if (aposta.status_pagamento === 'pendente_pagamento') {
                countPendentes++;
                const agora = new Date().getTime(); const dataJogo = new Date(aposta.matches.data_jogo).getTime();
                const tempoEstourado = (dataJogo - agora) < (20 * 60 * 1000); // 20 min de trava

                if (tempoEstourado) {
                    divCard.innerHTML = htmlBaseCard + `<div class="status-area"><span style="font-size: 10px; color: #ff3366; border: 1px solid #ff3366; padding: 3px 6px; border-radius: 4px;">❌ Expirado</span><button onclick="window.excluirAposta(${aposta.id}, 'expirada')" style="background: transparent; border: 1px solid #ff3366; color: #ff3366; border-radius: 4px; padding: 3px 6px; cursor: pointer; font-size: 10px;">🗑️</button></div>`;
                } else {
                    countPendentesValidos++; totalPendentesValidos += valorApostaGlobal;
                    divCard.innerHTML = htmlBaseCard + `<div class="status-area"><span style="font-size: 10px; color: #ff9900; border: 1px solid #ff9900; padding: 3px 6px; border-radius: 4px;">⏳ Aguardando</span><button onclick="window.excluirAposta(${aposta.id}, 'pendente')" style="background: transparent; border: 1px solid #ff3366; color: #ff3366; border-radius: 4px; padding: 3px 6px; cursor: pointer; font-size: 10px;">🗑️</button></div>`;
                }
                contPendentes.appendChild(divCard);
            } 
            // Categoria 3: Bilhete Pago (Confirmada)
            else if (aposta.status_pagamento === 'pago') {
                countConfirmadas++;
                
                // Variável que checa se o admin já encerrou o jogo no banco de dados
                const isFinalizado = aposta.matches && aposta.matches.status === 'finalizado';
                
                if (isFinalizado) {
                    // Matemática de Acerto: O palpite foi EXATAMENTE igual ao placar real?
                    const acertou = (aposta.gols_a === aposta.matches.placar_real_a) && (aposta.gols_b === aposta.matches.placar_real_b);
                    const placarOficial = `${aposta.matches.placar_real_a} x ${aposta.matches.placar_real_b}`;
                    
                    if (acertou) {
                        // VISUAL: VENCEDOR (GREEN)
                        divCard.style.borderColor = '#ffd700'; 
                        divCard.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.2)';
                        divCard.innerHTML = `
                            <div class="detalhes-aposta">
                                <span class="confronto">${textoConfronto}</span>
                                <span class="palpite">Seu Palpite: <span style="color: #ffd700;">${aposta.gols_a} x ${aposta.gols_b}</span></span>
                                <span style="font-size: 10px; color: #00ff88; margin-top: 4px; font-weight: bold;">🎯 Oficial: ${placarOficial}</span>
                            </div>
                            <div class="status-area">
                                <span style="font-size: 10px; font-weight: 900; color: #0b0e14; background-color: #ffd700; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; box-shadow: 0 0 10px rgba(255,215,0,0.5);">🏆 Green</span>
                            </div>
                        `;
                    } else {
                        // VISUAL: PERDEDOR (RED) COM LIXEIRA PARA OCULTAR O HISTÓRICO
                        divCard.style.opacity = '0.7'; // Deixa o card um pouco apagado
                        divCard.style.borderColor = '#ff3366'; 
                        divCard.innerHTML = `
                            <div class="detalhes-aposta">
                                <span class="confronto">${textoConfronto}</span>
                                <span class="palpite" style="text-decoration: line-through;">Seu Palpite: ${aposta.gols_a} x ${aposta.gols_b}</span>
                                <span style="font-size: 10px; color: #ff3366; margin-top: 4px; font-weight: bold;">⚽ Oficial: ${placarOficial}</span>
                            </div>
                            <div class="status-area">
                                <span style="font-size: 10px; font-weight: 800; color: #ff3366; border: 1px solid #ff3366; padding: 4px 8px; border-radius: 6px; background-color: rgba(255, 51, 102, 0.05); text-transform: uppercase;">❌ Red</span>
                                <button onclick="window.ocultarApostaRed(${aposta.id})" style="background: transparent; border: 1px solid #ff3366; color: #ff3366; border-radius: 5px; padding: 4px 8px; cursor: pointer; font-size: 10px; font-weight: bold; margin-left: 5px;" title="Limpar da tela">🗑️</button>
                            </div>
                        `;
                    }
                } else {
                    // Se o jogo NÃO foi finalizado ainda, mostra apenas a tag verde de confirmada
                    divCard.innerHTML = htmlBaseCard + `<div class="status-area"><span class="badge-status pago">✅ Confirmada</span></div>`;
                }
                
                contConfirmadas.appendChild(divCard);
            }
        });

        // 3. RODAPÉ DE PAGAMENTO DO CARRINHO (Botão Gerar PIX)
        if (subAbaMinhasApostasAtiva === 'pagar' && countPagar > 0) {
            const rodapeCarrinho = document.createElement('div');
            rodapeCarrinho.style = "margin-top: 20px; padding: 15px; background: #1a1f2e; border-radius: 8px; border: 1px dashed #2a3248; text-align: center;";
            rodapeCarrinho.innerHTML = `
                <h4 style="color: #ffffff; margin-bottom: 5px; font-size: 16px;">Total do Carrinho: <span style="color: #00ff88;">R$ ${totalPagar.toFixed(2).replace('.', ',')}</span></h4>
                <button id="btn-fazer-mais" style="width: 100%; padding: 12px; background: transparent; color: #ffd700; border: 1px solid #ffd700; border-radius: 8px; font-weight: 800; cursor: pointer; text-transform: uppercase; margin-bottom: 10px; margin-top: 15px;">➕ Fazer Mais Apostas</button>
                <button id="btn-gerar-pix-carrinho" style="width: 100%; padding: 12px; background: #00ff88; color: #0b0e14; border: none; border-radius: 8px; font-weight: 800; cursor: pointer; text-transform: uppercase;">💳 Pagar Carrinho</button>
            `;
            contPagar.appendChild(rodapeCarrinho);
            document.getElementById('btn-fazer-mais').addEventListener('click', () => { abaPendentesBtn.click(); });
            
            document.getElementById('btn-gerar-pix-carrinho').addEventListener('click', async function() {
                this.textContent = "Processando..."; this.disabled = true;
                try {
                    const reply = await fetch('/api/pagamento/gerar-pix-carrinho', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: usuarioAtual.id }) });
                    const dados = await reply.json();
                    if(dados.sucesso) { abrirModalCheckoutPix(dados); carregarMinhasApostas(); carregarJogos(); }
                } catch(err) { Swal.fire({ title: 'Ops!', text: 'Erro ao gerar Pix.', icon: 'error', background: '#1a1f2e', color: '#ffffff' }); }
            });
        }

        // 4. RODAPÉ DE RESGATE DA ABA PENDENTES (Botão Abrir PIX Novamente)
        if (subAbaMinhasApostasAtiva === 'pendentes' && countPendentesValidos > 0) {
            const rodapePendentes = document.createElement('div');
            rodapePendentes.style = "margin-top: 20px; padding: 15px; background: #1a1f2e; border-radius: 8px; border: 1px dashed #ff9900; text-align: center;";
            rodapePendentes.innerHTML = `
                <h4 style="color: #ffffff; margin-bottom: 5px; font-size: 16px;">Aguardando Pagamento: <span style="color: #ff9900;">R$ ${totalPendentesValidos.toFixed(2).replace('.', ',')}</span></h4>
                <p style="color: #8b9bb4; font-size: 11px; margin-bottom: 15px;">Você possui palpites aguardando a confirmação do PIX.</p>
                <button id="btn-resgatar-pix" style="width: 100%; padding: 12px; background: #ff9900; color: #0b0e14; border: none; border-radius: 8px; font-weight: 900; cursor: pointer; text-transform: uppercase;">💳 Abrir PIX Novamente</button>
            `;
            contPendentes.appendChild(rodapePendentes);
            
            // CORREÇÃO APLICADA AQUI: Apontando para a rota correta do index.js
            document.getElementById('btn-resgatar-pix').addEventListener('click', async function() {
                this.textContent = "Processando..."; this.disabled = true;
                try {
                    const reply = await fetch('/api/pagamento/gerar-pix-pendentes', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ user_id: usuarioAtual.id }) 
                    });
                    
                    const dados = await reply.json();
                    
                    if(dados.sucesso) { 
                        abrirModalCheckoutPix(dados); 
                        carregarMinhasApostas(); 
                        carregarJogos(); 
                    } else {
                        Swal.fire({ title: 'Aviso', text: dados.erro || 'Erro ao resgatar Pix.', icon: 'warning', background: '#1a1f2e', color: '#ffffff', confirmButtonColor: '#ff9900' });
                        this.textContent = "💳 Abrir PIX Novamente"; 
                        this.disabled = false;
                        carregarMinhasApostas();
                    }
                } catch(err) { 
                    Swal.fire({ title: 'Ops!', text: 'Erro de comunicação com o servidor.', icon: 'error', background: '#1a1f2e', color: '#ffffff', confirmButtonColor: '#ff3366' }); 
                    this.textContent = "💳 Abrir PIX Novamente"; 
                    this.disabled = false;
                }
            });
        }
    }

    // --- LIXEIRA INTELIGENTE CONVERSACIONAL ---
    window.excluirAposta = async function (aposta_id, tipoDeAba) {
        let confirmacao = await Swal.fire({ title: 'Remover Palpite?', text: 'Tem certeza que quer remover da sacola?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ff3366', background: '#1a1f2e', color: '#ffffff' });
        if (!confirmacao.isConfirmed) return;
        try {
            const reply = await fetch('/api/apostas/excluir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aposta_id: aposta_id, user_id: usuarioAtual.id }) });
            if (reply.ok) { carregarMinhasApostas(); carregarJogos(); Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Removido', showConfirmButton: false, timer: 1500, background: '#1a1f2e', color: '#00ff88' }); }
        } catch (err) { console.error(err); }
    }

    // ========================================================================
    // ENGENHARIA DE USER ENRICHMENT (BUSCA DE NOME NA TABELA 'USUARIOS')
    // ========================================================================

    // Transforma a função em async (assíncrona) para poder consultar o Supabase
    async function atualizarTelaParaLogado(usuario) {
        const btnAbrirLogin = document.getElementById('btn-abrir-login');
        const areaLogado = document.getElementById('area-logado');
        const msgUsuario = document.getElementById('msg-usuario');

        // Configuração do "Plano B": Caso o usuário não exista na tabela, corta o e-mail
        let nomeFinalDoApostador = usuario.email.split('@')[0];

        try {
            // SOLUÇÃO PRO RLS E ERRO 406: Usamos .maybeSingle() em vez de .single()
            // Isso previne que o código quebre caso a linha venha protegida ou vazia
            const { data, error } = await conexaoSupabase
                .from('usuarios')
                .select('nome')
                .eq('id', usuario.id)
                .maybeSingle();

            // Se a busca ocorreu perfeitamente e o nome existe, ativamos o "Plano A"
            if (data && data.nome) {
                nomeFinalDoApostador = data.nome;
            }
        } catch (erroBuscaBanco) {
            console.error("Erro controlado ao ler a tabela 'usuarios':", erroBuscaBanco);
        }

        // Divide a string por espaços e captura apenas a primeira palavra (Primeiro Nome)
        let primeiroNome = nomeFinalDoApostador.trim().split(' ')[0];

        // Formatação estética: Força a primeira letra em Maiúscula e o resto em minúscula
        primeiroNome = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();

        // Atualiza os estados visuais do cabeçalho
        btnAbrirLogin.style.display = 'none';
        areaLogado.style.display = 'flex'; // Torna visível os botões Sair e Suporte VIP
        msgUsuario.textContent = `Olá, ${primeiroNome}`;
    }

    // --- EXECUÇÃO VISUAL DE ABAS DE ACESSO ---
    btnAbrirLogin.addEventListener('click', () => { modalLogin.style.display = 'block'; telaLogin.style.display = 'block'; telaCadastro.style.display = 'none'; msgErroAuth.textContent = ""; });
    if (linkAbrirCadastro) linkAbrirCadastro.addEventListener('click', (e) => { e.preventDefault(); telaLogin.style.display = 'none'; telaCadastro.style.display = 'block'; });
    if (linkVoltarLogin) linkVoltarLogin.addEventListener('click', (e) => { e.preventDefault(); telaCadastro.style.display = 'none'; telaLogin.style.display = 'block'; });

    btnSair.addEventListener('click', async () => {
        await conexaoSupabase.auth.signOut();
        usuarioAtual = null;
        document.getElementById('btn-abrir-login').style.display = 'inline-block';
        document.getElementById('area-logado').style.display = 'none';
        barraFlutuante.style.display = 'none';
        containerMinhasApostas.innerHTML = '<div class="loading">Login necessário.</div>';
        await carregarJogos();
    });

    // --- ATALHO PRO: ENVIAR FORMULÁRIO COM A TECLA ENTER ---
    function capturarTeclaEnterParaLogin(evento) {
        if (evento.key === 'Enter') {
            evento.preventDefault(); // Impede comportamento padrão de reenvio de página
            btnEntrar.click();       // Dispara o clique lógico no botão "Entrar" virtualmente
        }
    }
    // Vincula o gatilho aos campos de entrada de dados do modal de login
    loginEmail.addEventListener('keypress', capturarTeclaEnterParaLogin);
    loginSenha.addEventListener('keypress', capturarTeclaEnterParaLogin);

    btnEntrar.addEventListener('click', async () => {
        msgErroAuth.textContent = "Verificando..."; msgErroAuth.style.color = '#8b9bb4';

        // 1. O Porteiro (Auth) confere email e senha criptografados
        const { data, error } = await conexaoSupabase.auth.signInWithPassword({
            email: loginEmail.value,
            password: loginSenha.value
        });

        if (error) {
            msgErroAuth.textContent = "Dados incorretos."; msgErroAuth.style.color = '#ff3366';
        } else {
            usuarioAtual = data.user;
            modalLogin.style.display = 'none';

            // 2. Chama o enriquecimento de dados buscando o nome real na tabela
            await atualizarTelaParaLogado(usuarioAtual);

            await carregarJogos();
            if (abaMinhasApostasBtn.classList.contains('ativa')) carregarMinhasApostas();
        }
    });

    // ========================================================================
    // CARREGAMENTO DA VITRINE (ORDENAÇÃO TRÍPLICE COROA E PRÊMIO DINÂMICO)
    // ========================================================================
    // ============================================================================
// FUNÇÃO AUXILIAR: NORMALIZAÇÃO DE STRINGS
// Elimina acentos e força letras minúsculas para evitar erros de digitação
// ============================================================================
function normalizarNome(nome) {
    return nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// ============================================================================
// FUNÇÃO PRINCIPAL: VITRINE DE JOGOS (CARREGAMENTO, ORDENAÇÃO E PRÊMIO DINÂMICO)
// ============================================================================
async function carregarJogos() {
    try {
        // 1. Exibe a mensagem visual de carregamento enquanto o servidor responde
        containerPendentes.innerHTML = '<div class="loading">Carregando jogos...</div>';
        
        // 2. Faz a requisição para a nossa API local buscando a lista de partidas
        const reply = await fetch('/api/jogos'); 
        let jogos = await reply.json();
        
        // 3. Busca o histórico de bilhetes do usuário logado para desenhar os selos informativos
        let apostasDoUsuario = [];
        if (usuarioAtual && conexaoSupabase) { 
            const { data } = await conexaoSupabase.from('apostas')
                .select('jogo_id, status_pagamento')
                .eq('user_id', usuarioAtual.id); 
            if (data) apostasDoUsuario = data; 
        }

        // ====================================================================
        // MOTOR DE FILTRO TRÍPLICE COROA: Brasil > Popularidade > Data
        // ====================================================================
        jogos.sort((a, b) => {
            const aIsBrasil = normalizarNome(a.time_a).includes('brasil') || normalizarNome(a.time_b).includes('brasil');
            const bIsBrasil = normalizarNome(b.time_a).includes('brasil') || normalizarNome(b.time_b).includes('brasil');

            // Regra 1: Jogos que envolvem o "Brasil" ficam fixados no topo absoluto
            if (aIsBrasil && !bIsBrasil) return -1; 
            if (!aIsBrasil && bIsBrasil) return 1;  

            // Regra 2: Popularidade baseada em volume de bilhetes já pagos no sistema
            const apostasA = a.qtd_apostas_pagas || 0;
            const apostasB = b.qtd_apostas_pagas || 0;
            if (apostasA !== apostasB) {
                return apostasB - apostasA; // Ordem decrescente (Maior volume primeiro)
            }

            // Regra 3: Desempate por ordem cronológica (Partidas mais próximas primeiro)
            return new Date(a.data_jogo) - new Date(b.data_jogo);
        });

        // 4. Limpa a vitrine antiga e desenha a estrutura de sub-abas da tela de resultados
        containerPendentes.innerHTML = ''; 
        
        containerFinalizados.innerHTML = `
            <div class="sub-abas-navegacao" style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button id="btn-sub-andamento" class="sub-aba-btn" style="flex: 1; padding: 10px; background-color: ${subAbaAtiva === 'andamento' ? 'rgba(255, 153, 0, 0.15)' : '#1a1f2e'}; color: ${subAbaAtiva === 'andamento' ? '#ff9900' : '#8b9bb4'}; border: 2px solid ${subAbaAtiva === 'andamento' ? '#ff9900' : '#2a3248'}; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; text-transform: uppercase;">🎮 Em Andamento</button>
                <button id="btn-sub-finais" class="sub-aba-btn" style="flex: 1; padding: 10px; background-color: ${subAbaAtiva === 'finais' ? 'rgba(0, 255, 136, 0.15)' : '#1a1f2e'}; color: ${subAbaAtiva === 'finais' ? '#00ff88' : '#8b9bb4'}; border: 2px solid ${subAbaAtiva === 'finais' ? '#00ff88' : '#2a3248'}; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; text-transform: uppercase;">✅ Resultados</button>
            </div>
            <div id="sub-container-andamento" style="display: ${subAbaAtiva === 'andamento' ? 'block' : 'none'};"></div>
            <div id="sub-container-finais" style="display: ${subAbaAtiva === 'finais' ? 'block' : 'none'};"></div>
        `;
        
        // Elementos de controle de visualização das partidas encerradas
        const btnSubAndamento = document.getElementById('btn-sub-andamento'); 
        const btnSubFinais = document.getElementById('btn-sub-finais'); 
        const subContainerAndamento = document.getElementById('sub-container-andamento'); 
        const subContainerFinais = document.getElementById('sub-container-finais');
        
        // Listeners para gerenciar as trocas visuais das sub-abas de resultados
        btnSubAndamento.addEventListener('click', () => { subAbaAtiva = 'andamento'; btnSubAndamento.style.backgroundColor = 'rgba(255, 153, 0, 0.15)'; btnSubAndamento.style.color = '#ff9900'; btnSubAndamento.style.borderColor = '#ff9900'; btnSubFinais.style.backgroundColor = '#1a1f2e'; btnSubFinais.style.color = '#8b9bb4'; btnSubFinais.style.borderColor = '#2a3248'; subContainerAndamento.style.display = 'block'; subContainerFinais.style.display = 'none'; });
        btnSubFinais.addEventListener('click', () => { subAbaAtiva = 'finais'; btnSubAndamento.style.backgroundColor = '#1a1f2e'; btnSubAndamento.style.color = '#8b9bb4'; btnSubAndamento.style.borderColor = '#2a3248'; btnSubFinais.style.backgroundColor = 'rgba(0, 255, 136, 0.15)'; btnSubFinais.style.color = '#00ff88'; btnSubFinais.style.borderColor = '#00ff88'; subContainerAndamento.style.display = 'none'; subContainerFinais.style.display = 'block'; });

        // ====================================================================
        // RENDERIZAÇÃO DOS CARDS DE CADA CONFRONTOS
        // ====================================================================
        jogos.forEach(jogo => {
            const agora = new Date(); 
            const dataJogo = new Date(jogo.data_jogo); 
            const vinteMinutosEmMs = 20 * 60 * 1000; // Tempo limite de segurança
            
            // Formatações estéticas de calendário nacionais
            const dataFormatada = dataJogo.toLocaleDateString('pt-BR'); 
            const horaFormatada = dataJogo.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            // Gatilhos de bloqueio de segurança baseados no tempo cronológico
            const tempoEstourado = (dataJogo - agora) < vinteMinutosEmMs; 
            const isFinalizado = jogo.status === 'finalizado';

            // ----------------------------------------------------------------
            // MOTOR DE CÁLCULO DE PRÊMIO DINÂMICO PROTEGIDO (EFÍ 1.19% + BANCA 8%)
            // ----------------------------------------------------------------
            const qtdPagas = jogo.qtd_apostas_pagas || 0; 
            let textoPremioDinamico = "Seja o primeiro a apostar! 🚀";
            
            if (qtdPagas > 0) {
                // A. Descobre a arrecadação bruta gerada pelo confronto
                const valorArrecadadoBruto = qtdPagas * valorApostaGlobal; 
                
                // B. Subtrai a taxa de intermediação cobrada pela API da Efí (1.19%)
                const taxaEfiPercentual = 0.0119;
                const valorLiquidoAposBanco = valorArrecadadoBruto * (1 - taxaEfiPercentual);
                
                // C. Retém a comissão ajustada da banca (8%). O prêmio recebe os 92% líquidos restantes
                const comissaoBancaPercentual = 0.08;
                const premioRealFinal = valorLiquidoAposBanco * (1 - comissaoBancaPercentual); 
                
                // D. Monta a string em HTML formatada para exibição em Real (R$)
                textoPremioDinamico = `Prêmio Acumulado: <span>R$ ${premioRealFinal.toFixed(2).replace('.', ',')}</span> <br><small style="color: #8b9bb4; font-size: 9px; margin-top: 3px; display: inline-block;">🔥 ${qtdPagas} apostador(es) na disputa</small>`; 
            }

            // 5. Instancia a estrutura do card HTML no documento
            const divCard = document.createElement('div'); 
            divCard.className = 'jogo-card'; 
            divCard.dataset.id = jogo.id; 
            
            // 6. Varre a lista de bilhetes para colocar avisos específicos para o apostador
            const bilhetesDesteJogo = apostasDoUsuario.filter(ap => ap.jogo_id === jogo.id);
            let textoBilhetes = ''; 
            if (bilhetesDesteJogo.length > 0) { 
                const pagos = bilhetesDesteJogo.filter(b => b.status_pagamento === 'pago').length; 
                const pendentes = bilhetesDesteJogo.filter(b => b.status_pagamento === 'pendente_pagamento' || b.status_pagamento === 'pendente').length; 
                textoBilhetes = `🎫 Seus palpites: ${pagos > 0 ? `${pagos} Pago(s)` : ''} ${pagos > 0 && pendentes > 0 ? '|' : ''} ${pendentes > 0 ? `${pendentes} Pendente(s)` : ''}`; 
            }

            // 7. Define qual selo de status vai ilustrar o topo do card
            let htmlAvisoBilhetes = '';
            if (isFinalizado) htmlAvisoBilhetes = `<div class="selo-apostas-jogo" style="color: #00ff88; border-color: #00ff88; background-color: rgba(0, 255, 136, 0.05);">🏁 Partida Encerrada${textoBilhetes ? `<br><small style="color: #8b9bb4;">${textoBilhetes}</small>` : ''}</div>`;
            else if (tempoEstourado) htmlAvisoBilhetes = `<div class="selo-apostas-jogo" style="color: #ff9900; border-color: #ff9900; background-color: rgba(255, 153, 0, 0.05);">🔒 Apostas Fechadas${textoBilhetes ? `<br><small style="color: #8b9bb4;">${textoBilhetes}</small>` : ''}</div>`;
            else if (textoBilhetes) htmlAvisoBilhetes = `<div class="selo-apostas-jogo">${textoBilhetes}</div>`;

            // 8. Trata os caminhos de escudos e imagens de bandeiras para evitar quebras visuais
            const htmlBandeiraA = jogo.bandeira_a ? `<img src="${jogo.bandeira_a}" class="bandeira">` : `<div class="bandeira-placeholder">?</div>`; 
            const htmlBandeiraB = jogo.bandeira_b ? `<img src="${jogo.bandeira_b}" class="bandeira">` : `<div class="bandeira-placeholder">?</div>`;
            
            // Se o jogo não tiver placar oficial lançado (placar nulo), o input fica limpo
            const valorPlacarA = jogo.placar_real_a !== null ? jogo.placar_real_a : ''; 
            const valorPlacarB = jogo.placar_real_b !== null ? jogo.placar_real_b : '';
            
            // Trava as caixas de digitação de gols se a partida acabou ou se o tempo esgotou
            const travaInput = (isFinalizado || tempoEstourado) ? 'disabled' : '';

            // 9. Monta a arquitetura de layout Flexbox Horizontal Compacta do Card
            divCard.innerHTML = `
                <div class="data-jogo">📅 ${dataFormatada} - ⏰ ${horaFormatada}</div>
                ${htmlAvisoBilhetes}
                <div class="confronto-area">
                    <div class="time-bloco">
                        ${htmlBandeiraA}
                        <span class="nome-time">${jogo.time_a}</span>
                    </div>
                    <div class="placar-area">
                        <input type="number" class="input-gol" min="0" placeholder="0" value="${valorPlacarA}" ${travaInput}>
                        <span class="vs">X</span>
                        <input type="number" class="input-gol" min="0" placeholder="0" value="${valorPlacarB}" ${travaInput}>
                    </div>
                    <div class="time-bloco direita">
                        ${htmlBandeiraB}
                        <span class="nome-time">${jogo.time_b}</span>
                    </div>
                </div>
                <div class="info-premio">
                    ${textoPremioDinamico}
                </div>
            `;

            // 10. Vincula o gatilho de digitação para atualizar e inflar a sacola flutuante instantaneamente
            divCard.querySelectorAll('.input-gol').forEach(input => input.addEventListener('input', verificarEAtualizarCarrinho));
            
            // 11. Distribui os cards ordenados em suas abas de destino corretas
            if (isFinalizado) {
                subContainerFinais.prepend(divCard); 
            } else if (tempoEstourado) {
                subContainerAndamento.prepend(divCard); 
            } else {
                containerPendentes.appendChild(divCard);
            }
        });
        
        // Mensagem de segurança caso o banco retorne um array vazio de partidas abertas
        if (containerPendentes.innerHTML === '') {
            containerPendentes.innerHTML = '<div class="loading">Nenhum jogo aberto no momento.</div>';
        }
    } catch (err) { 
        console.error("Erro crítico no carregamento da vitrine de jogos:", err); 
    }
}
    await carregarJogos();
    // ========================================================================
    // LIXEIRA VIRTUAL (OCULTAÇÃO DE REDS VIA LOCALSTORAGE)
    // ========================================================================
    window.ocultarApostaRed = async function(aposta_id) {
        let confirmacao = await Swal.fire({ 
            title: 'Limpar Histórico?', 
            text: 'Este palpite sairá da sua tela, mas continuará registrado no sistema para auditoria.', 
            icon: 'question', 
            showCancelButton: true, 
            confirmButtonColor: '#2a3248', 
            cancelButtonColor: '#ff3366', 
            confirmButtonText: 'Sim, limpar',
            cancelButtonText: 'Cancelar',
            background: '#1a1f2e', 
            color: '#ffffff' 
        });
        
        if (confirmacao.isConfirmed) {
            // 1. Puxa a lista de IDs ocultos da memória do celular/PC ou cria uma nova
            let ocultas = JSON.parse(localStorage.getItem('betcup_reds_ocultos')) || [];
            
            // 2. Adiciona o ID da aposta atual na lista negra
            ocultas.push(aposta_id);
            
            // 3. Salva a lista atualizada de volta no navegador
            localStorage.setItem('betcup_reds_ocultos', JSON.stringify(ocultas));
            
            // 4. Recarrega a tela para a mágica visual acontecer instantaneamente
            carregarMinhasApostas(); 
            
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Palpite ocultado!', showConfirmButton: false, timer: 1500, background: '#1a1f2e', color: '#00ff88' });
        }
    }
    // ========================================================================
    // MOTOR DE VIRALIDADE (WEB SHARE API E WHATSAPP WEB)
    // ========================================================================
    window.compartilharBolao = async function () {
        // Texto altamente empolgante, focado no ego e no dinheiro
        const textoMensagem = "🏆 Rapaziada, montei meus palpites aqui no BetCup! O prêmio aumenta a cada nova aposta. Quem entende de futebol de verdade aí? Entra pelo link e bora ver quem acerta mais!";

        // Ele pega automaticamente o endereço do seu site (localhost agora, betcup.com no futuro)
        const urlSite = window.location.origin;

        if (navigator.share) {
            // Se estiver no Celular, abre a janelinha nativa linda do sistema
            try {
                await navigator.share({
                    title: 'BetCup - O Bolão da Galera',
                    text: textoMensagem,
                    url: urlSite
                });
            } catch (err) {
                console.log('O usuário fechou a janela de compartilhamento.');
            }
        } else {
            // Se estiver no Computador (Fallback), abre o WhatsApp Web com o texto pronto
            const linkWhatsApp = `https://wa.me/?text=${encodeURIComponent(textoMensagem + " " + urlSite)}`;
            window.open(linkWhatsApp, '_blank');
        }
    };
});