/*
 * Sessão e Firebase compartilhados por todas as páginas.
 *
 * A configuração do Firebase NÃO fica no repositório:
 *   - Em produção ela vem de js/firebase-config.js, gerado no deploy pelo GitHub
 *     Actions a partir dos secrets do repositório (ver docs/DEPLOY.md).
 *   - Em localhost são usados os emuladores (projeto demo, sem chave real).
 * Mesmo assim, a configuração web do Firebase chega ao navegador de quem abre o
 * site; quem protege os dados são as Regras do Realtime Database
 * (database.rules.json): só /mestres escreve, só /mestres e /jogadores leem.
 * Exceção: no auto-cadastro, a própria conta pode se gravar como Jogador.
 *
 * O "modo" (mestre/jogador) guardado no localStorage é apenas um cache para a
 * interface; ele é sempre conferido contra o banco depois do login.
 *
 * Uso nas páginas internas:
 *   <script src="js/firebase-config.js"></script>
 *   <script src="js/sessao.js" data-exigir-login></script>
 *   const db = RPG.db;   // mesmo formato de firebase.database(), mas aguarda o login
 */
(function () {
    'use strict';

    // Impede que o site seja carregado dentro de um <iframe> de terceiros (clickjacking).
    if (window.top !== window.self) {
        document.documentElement.style.display = 'none';
        throw new Error('Carregamento em iframe bloqueado.');
    }

    // Em localhost usa o Firebase Local Emulator Suite (ver firebase.json); produção nunca é tocada.
    const usarEmulador = ['localhost', '127.0.0.1'].includes(location.hostname);
    const CONFIG_EMULADOR = {
        apiKey: 'emulador-local',
        authDomain: 'localhost',
        databaseURL: 'https://demo-fonte-negra-default-rtdb.firebaseio.com',
        projectId: 'demo-fonte-negra'
    };
    const FIREBASE_CONFIG = usarEmulador ? CONFIG_EMULADOR : window.FIREBASE_CONFIG;
    const CHAVE_MODO = 'rpg_modo_sessao';

    if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.insertAdjacentHTML('afterbegin',
                '<p style="background:#b91c1c;color:#fff;padding:12px;font:14px sans-serif;text-align:center">' +
                'Configuração do Firebase ausente: o site precisa ser publicado pelo workflow de deploy (docs/DEPLOY.md).</p>');
        });
        throw new Error('js/firebase-config.js sem configuração do Firebase.');
    }

    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
    const auth = firebase.auth();
    const database = firebase.database();

    if (usarEmulador) {
        auth.useEmulator('http://127.0.0.1:9099');
        database.useEmulator('127.0.0.1', 9000);
    }
    const exigeLogin = !!(document.currentScript && document.currentScript.hasAttribute('data-exigir-login'));

    function lerCache() {
        try { return localStorage.getItem(CHAVE_MODO); } catch (e) { return null; }
    }

    function gravarCache(modo) {
        try {
            if (modo) localStorage.setItem(CHAVE_MODO, modo);
            else localStorage.removeItem(CHAVE_MODO);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Evita que a interface fique presa esperando para sempre se o banco não responder
    function comPrazo(promessa, ms, codigo) {
        let timer;
        const prazo = new Promise((_, rejeitar) => {
            timer = setTimeout(() => rejeitar(Object.assign(new Error(codigo), { code: codigo })), ms);
        });
        return Promise.race([promessa, prazo]).finally(() => clearTimeout(timer));
    }

    // O papel vem do banco (/mestres/{uid} ou /jogadores/{uid} = true), nunca do navegador.
    async function descobrirModo(user) {
        const [mestre, jogador] = await comPrazo(Promise.all([
            database.ref('mestres/' + user.uid).once('value'),
            database.ref('jogadores/' + user.uid).once('value')
        ]), 10000, 'banco-indisponivel');
        if (mestre.val() === true) return 'mestre';
        if (jogador.val() === true) return 'jogador';
        return null;
    }

    // Resolve com { user, modo } se houver sessão válida, ou null.
    const sessao = new Promise((resolve) => {
        const parar = auth.onAuthStateChanged(async (user) => {
            parar();
            if (!user) {
                resolve(null);
                return;
            }
            try {
                const modo = await descobrirModo(user);
                if (!modo) await auth.signOut();
                resolve(modo ? { user, modo } : null);
            } catch (err) {
                console.error('Erro ao verificar sessão:', err);
                resolve(null);
            }
        });
    });

    // Nas páginas internas, só libera o acesso ao banco depois de confirmar a sessão.
    const pronto = sessao.then((s) => {
        const nuncaResolve = new Promise(() => {});
        if (!s) {
            gravarCache(null);
            if (exigeLogin) {
                location.replace('index.html');
                return nuncaResolve;
            }
            return null;
        }
        if (lerCache() !== s.modo && gravarCache(s.modo) && exigeLogin) {
            // A página foi montada com um modo diferente do real: recarrega com o correto.
            location.reload();
            return nuncaResolve;
        }
        return s;
    });

    function registrarErro(err) {
        console.error('Firebase:', err);
    }

    function refAdiada(caminho) {
        const real = () => database.ref(caminho);
        return {
            on: (...args) => { pronto.then(() => real().on(...args)); },
            once: (...args) => pronto.then(() => real().once(...args)),
            set: (valor) => pronto.then(() => real().set(valor)).catch(registrarErro),
            remove: () => pronto.then(() => real().remove()).catch(registrarErro)
        };
    }

    async function entrar(email, senha) {
        const cred = await comPrazo(auth.signInWithEmailAndPassword(email, senha), 15000, 'auth-indisponivel');
        let modo;
        try {
            modo = await descobrirModo(cred.user);
        } catch (err) {
            await auth.signOut();
            throw err;
        }
        if (!modo) {
            await auth.signOut();
            throw new Error('sem-permissao');
        }
        gravarCache(modo);
        return modo;
    }

    async function sair() {
        gravarCache(null);
        await auth.signOut();
    }

    // Dados para o cabeçalho (js/topo.js): nome de /usuarios/{uid}, que as Regras deixam a
    // própria conta ler. O papel exibido vem do cache, já conferido contra o banco pela sessão.
    async function perfil() {
        const user = auth.currentUser;
        if (!user) return null;
        let nome = null;
        try {
            const snap = await comPrazo(database.ref('usuarios/' + user.uid + '/nome').once('value'), 10000, 'banco-indisponivel');
            nome = snap.val();
        } catch (err) {
            registrarErro(err);
        }
        if (typeof nome !== 'string' || !nome.trim()) {
            nome = user.displayName || String(user.email || '').split('@')[0] || 'Sem nome';
        }
        return { nome: nome.trim(), email: user.email || '', modo: lerCache() };
    }

    // Cria uma conta (Auth) e grava o papel no banco. Só funciona para Mestres: as Regras
    // recusam a gravação em /usuarios, /mestres e /jogadores vinda de outra conta.
    // A conta nova é criada numa instância separada do Firebase, para o Mestre não perder a sessão.
    async function cadastrarUsuario({ nome, email, senha, papel }) {
        if (papel !== 'mestre' && papel !== 'jogador') throw new Error('papel-invalido');
        const s = await pronto;
        if (!s || s.modo !== 'mestre') throw new Error('sem-permissao');

        const app = firebase.initializeApp(FIREBASE_CONFIG, 'cadastro-' + Date.now());
        try {
            const authCadastro = app.auth();
            if (usarEmulador) authCadastro.useEmulator('http://127.0.0.1:9099');
            await authCadastro.setPersistence(firebase.auth.Auth.Persistence.NONE);

            const cred = await comPrazo(authCadastro.createUserWithEmailAndPassword(email, senha), 15000, 'auth-indisponivel');
            const uid = cred.user.uid;
            try {
                await comPrazo(database.ref().update({
                    ['usuarios/' + uid]: { nome, email, papel },
                    [(papel === 'mestre' ? 'mestres/' : 'jogadores/') + uid]: true
                }), 10000, 'banco-indisponivel');
            } catch (err) {
                // Sem papel no banco a conta não serve para nada: desfaz a criação
                await cred.user.delete().catch(registrarErro);
                throw err;
            }
            return uid;
        } finally {
            await app.delete().catch(registrarErro);
        }
    }

    // Auto-cadastro aberto (cadastro_jogador.html): cria a conta já logada e grava o papel de Jogador.
    // As Regras só aceitam que a própria conta se grave em /jogadores e /usuarios com papel 'jogador'.
    async function cadastrarJogador({ nome, email, senha }) {
        if (await pronto) throw new Error('ja-logado');

        const cred = await comPrazo(auth.createUserWithEmailAndPassword(email, senha), 15000, 'auth-indisponivel');
        const uid = cred.user.uid;
        try {
            await comPrazo(database.ref().update({
                // O e-mail gravado é o do Auth, que as Regras conferem com auth.token.email
                ['usuarios/' + uid]: { nome, email: cred.user.email, papel: 'jogador' },
                ['jogadores/' + uid]: true
            }), 10000, 'banco-indisponivel');
        } catch (err) {
            // Sem papel no banco a conta não serve para nada: desfaz a criação
            await cred.user.delete().catch(registrarErro);
            await auth.signOut().catch(registrarErro);
            throw err;
        }
        gravarCache('jogador');
        return uid;
    }

    // Escapa texto para inserir com segurança em innerHTML (conteúdo ou atributo entre aspas).
    function escaparHtml(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    window.RPG = Object.freeze({
        db: Object.freeze({ ref: refAdiada }),
        sessao: pronto,
        entrar,
        sair,
        perfil,
        cadastrarUsuario,
        cadastrarJogador,
        escaparHtml
    });
})();
