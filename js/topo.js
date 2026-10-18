/*
 * Componente de usuário do cabeçalho: nome, papel (Mestre/Jogador) e botão de sair.
 * Preenche o elemento <div class="usuario" data-usuario hidden></div> do .topo
 * (estilos em assets/css/layout.css). Incluir depois de js/sessao.js:
 *   <script src="js/topo.js" defer></script>
 * O hub chama Topo.atualizar() depois do login, porque lá a sessão começa vazia.
 */
(function () {
    'use strict';

    const PAPEIS = { mestre: 'Mestre', jogador: 'Jogador' };

    function elemento(tag, classe, texto) {
        const el = document.createElement(tag);
        el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    async function sair(botao) {
        botao.disabled = true;
        try {
            await window.RPG.sair();
        } finally {
            location.href = 'index.html';
        }
    }

    async function atualizar() {
        const alvo = document.querySelector('[data-usuario]');
        if (!alvo || !window.RPG) return;

        const perfil = await window.RPG.perfil();
        if (!perfil) {
            alvo.hidden = true;
            alvo.replaceChildren();
            return;
        }

        const dados = elemento('div', 'usuario-dados');
        const nome = elemento('span', 'usuario-nome', perfil.nome);
        nome.title = perfil.email;
        const papel = elemento('span', 'usuario-papel' + (perfil.modo === 'mestre' ? ' mestre' : ''), PAPEIS[perfil.modo] || 'Jogador');
        dados.append(nome, papel);

        const botao = elemento('button', 'usuario-sair', 'Sair');
        botao.type = 'button';
        botao.title = 'Encerrar a sessão';
        botao.addEventListener('click', () => sair(botao));

        alvo.replaceChildren(dados, botao);
        alvo.setAttribute('aria-label', 'Usuário conectado');
        alvo.hidden = false;
    }

    window.Topo = Object.freeze({ atualizar });

    if (window.RPG) window.RPG.sessao.then((s) => { if (s) atualizar(); });
})();
