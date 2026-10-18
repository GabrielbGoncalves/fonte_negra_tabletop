/*
 * Cria as contas de teste no Firebase Local Emulator Suite e cadastra os papéis.
 * Só fala com 127.0.0.1 (emulador); nunca toca o projeto de produção.
 *
 * Uso (com os emuladores rodando):  node emulador/seed.js
 */
'use strict';

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const DB = 'http://127.0.0.1:9000';
const NS = 'demo-fonte-negra-default-rtdb';
const CHAVE = 'chave-qualquer-no-emulador';

// Credenciais antigas do código, aceitáveis aqui porque só existem no emulador local
const CONTAS = [
    { email: 'mestre@rpg.com', senha: 'mestre123', papel: 'mestres', nome: 'Mestre de Teste' },
    { email: 'jogador@rpg.com', senha: 'jogador123', papel: 'jogadores', nome: 'Jogador de Teste' }
];

async function post(url, corpo) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
    });
    return { ok: res.ok, dados: await res.json() };
}

// Reaproveita a conta se já existir (o seed pode rodar várias vezes)
async function obterUid({ email, senha }) {
    const login = await post(`${AUTH}/accounts:signInWithPassword?key=${CHAVE}`, { email, password: senha, returnSecureToken: true });
    if (login.ok) return { uid: login.dados.localId, criada: false };

    const cadastro = await post(`${AUTH}/accounts:signUp?key=${CHAVE}`, { email, password: senha, returnSecureToken: true });
    if (!cadastro.ok) throw new Error(`Falha ao criar ${email}: ${JSON.stringify(cadastro.dados.error)}`);
    return { uid: cadastro.dados.localId, criada: true };
}

// "Bearer owner" é o acesso de administrador do emulador (ignora as regras, como o console)
async function gravar(caminho, valor) {
    const res = await fetch(`${DB}/${caminho}.json?ns=${NS}`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer owner' },
        body: JSON.stringify(valor)
    });
    if (!res.ok) throw new Error(`Falha ao gravar /${caminho}: ${await res.text()}`);
}

// Papel e perfil (/usuarios/{uid}), no mesmo formato do cadastro feito pelo site
async function gravarPapel({ papel, email, nome }, uid) {
    await gravar(`${papel}/${uid}`, true);
    await gravar(`usuarios/${uid}`, { nome, email, papel: papel === 'mestres' ? 'mestre' : 'jogador' });
}

(async () => {
    try {
        for (const conta of CONTAS) {
            const { uid, criada } = await obterUid(conta);
            await gravarPapel(conta, uid);
            console.log(`${criada ? 'criada ' : 'já existe'}  ${conta.email.padEnd(16)} senha: ${conta.senha.padEnd(11)} /${conta.papel}/${uid}`);
        }
    } catch (err) {
        console.error(err.message);
        console.error('Os emuladores estão rodando? (npx firebase-tools emulators:start)');
        process.exit(1);
    }
})();
