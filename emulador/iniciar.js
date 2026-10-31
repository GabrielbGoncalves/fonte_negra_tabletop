/*
 * Sobe o ambiente local completo com um comando só:
 *   1. confere Node e Java (se não houver Java no PATH, procura o JBR das IDEs JetBrains);
 *   2. inicia os emuladores do Firebase (Auth, Database, Hosting e painel);
 *   3. espera as portas responderem e roda o emulador/seed.js;
 *   4. mostra os endereços e as contas de teste.
 *
 * Os dados ficam em emulador/dados/ entre uma execução e outra (salvos ao encerrar com Ctrl+C).
 *
 * Uso:
 *   node emulador/iniciar.js            # com os dados da última execução
 *   node emulador/iniciar.js --limpo    # banco e contas do zero, sem salvar ao sair
 *   node emulador/iniciar.js --abrir    # também abre o site no navegador
 *
 * Só fala com 127.0.0.1 e com o projeto demo-fonte-negra: produção nunca é tocada.
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DADOS = path.join(__dirname, 'dados');
const PROJETO = 'demo-fonte-negra';
const PORTAS = { site: 5000, painel: 4000, auth: 9099, banco: 9000 };

const args = process.argv.slice(2);
const LIMPO = args.includes('--limpo');
const ABRIR = args.includes('--abrir');

function falhar(msg) {
    console.error(`\n[erro] ${msg}\n`);
    process.exit(1);
}

function log(msg) {
    console.log(`[iniciar] ${msg}`);
}

// ---------- Pré-requisitos ----------

function conferirNode() {
    const maior = parseInt(process.versions.node.split('.')[0], 10);
    if (maior < 18) falhar(`Node ${process.versions.node} é antigo demais. Instale o Node 18 ou mais novo.`);
}

function javaFunciona(env) {
    const r = spawnSync('java', ['-version'], { env, stdio: 'ignore' });
    return r.status === 0;
}

// Pastas bin de Java candidatas: JAVA_HOME e o JBR que vem com as IDEs JetBrains
function candidatosJava() {
    const lista = [];
    if (process.env.JAVA_HOME) lista.push(path.join(process.env.JAVA_HOME, 'bin'));

    const bases = [];
    if (process.platform === 'win32') {
        for (const pf of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
            if (pf) bases.push(path.join(pf, 'JetBrains'));
        }
        if (process.env.LOCALAPPDATA) bases.push(path.join(process.env.LOCALAPPDATA, 'Programs'));
    } else if (process.platform === 'darwin') {
        bases.push('/Applications');
    } else {
        bases.push('/opt', path.join(process.env.HOME || '', '.local/share/JetBrains/Toolbox/apps'));
    }

    for (const base of bases) {
        let itens = [];
        try { itens = fs.readdirSync(base); } catch { continue; }
        // Versões mais novas primeiro
        for (const item of itens.sort().reverse()) {
            const dir = path.join(base, item);
            lista.push(path.join(dir, 'jbr', 'bin'));
            lista.push(path.join(dir, 'Contents', 'jbr', 'Contents', 'Home', 'bin')); // macOS
        }
    }

    const exe = process.platform === 'win32' ? 'java.exe' : 'java';
    return lista.filter(dir => fs.existsSync(path.join(dir, exe)));
}

// Devolve o env a usar nos processos filhos (com o Java no PATH)
function prepararJava() {
    if (javaFunciona(process.env)) return process.env;

    for (const bin of candidatosJava()) {
        const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH };
        if (javaFunciona(env)) {
            log(`Java não está no PATH; usando ${bin}`);
            return env;
        }
    }
    falhar('Java não encontrado. Os emuladores do Firebase precisam do Java 11 ou mais novo no PATH (ou em JAVA_HOME).');
}

// ---------- Portas ----------

function portaOcupada(porta) {
    return new Promise(resolve => {
        const sock = net.connect({ host: '127.0.0.1', port: porta });
        sock.once('connect', () => { sock.destroy(); resolve(true); });
        sock.once('error', () => resolve(false));
    });
}

async function esperarPortas(portas, limiteMs, filho) {
    const fim = Date.now() + limiteMs;
    while (Date.now() < fim) {
        if (filho.exitCode !== null) return false;
        const estados = await Promise.all(portas.map(portaOcupada));
        if (estados.every(Boolean)) return true;
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

// ---------- Execução ----------

function abrirNavegador(url) {
    const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const a = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, a, { stdio: 'ignore', detached: true }).unref();
}

function rodarSeed(env) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], { env, stdio: 'inherit' });
    return r.status === 0;
}

(async () => {
    conferirNode();

    const ocupadas = [];
    for (const [nome, porta] of Object.entries(PORTAS)) {
        if (await portaOcupada(porta)) ocupadas.push(`${porta} (${nome})`);
    }
    if (ocupadas.length) {
        falhar(`Porta(s) em uso: ${ocupadas.join(', ')}.\n` +
            'Os emuladores já devem estar rodando em outro terminal. Encerre-os com Ctrl+C antes, ou use o que já está no ar.');
    }

    const env = prepararJava();

    const argsFirebase = ['-y', 'firebase-tools', 'emulators:start', '--project', PROJETO];
    if (!LIMPO) {
        if (fs.existsSync(DADOS)) argsFirebase.push('--import', DADOS);
        argsFirebase.push(`--export-on-exit=${DADOS}`);
    }

    log(LIMPO ? 'Iniciando os emuladores (do zero, sem salvar)...'
        : `Iniciando os emuladores (dados em ${path.relative(RAIZ, DADOS)})...`);
    log('Na primeira vez o npx baixa o firebase-tools e o emulador do banco; pode demorar.');

    // shell no Windows porque npx é um .cmd; os argumentos são fixos (caminho entre aspas por segurança)
    const ehWindows = process.platform === 'win32';
    const filho = ehWindows
        ? spawn(['npx', ...argsFirebase.map(a => (/\s/.test(a) ? `"${a}"` : a))].join(' '), { cwd: RAIZ, env, stdio: 'inherit', shell: true })
        : spawn('npx', argsFirebase, { cwd: RAIZ, env, stdio: 'inherit' });

    // Ctrl+C chega também ao firebase-tools, que exporta os dados e encerra sozinho.
    // Este processo só espera ele terminar, para o export não ser cortado.
    let encerrando = false;
    const aoSinal = () => {
        if (encerrando) return;
        encerrando = true;
        log('Encerrando os emuladores' + (LIMPO ? '...' : ' e salvando os dados...'));
    };
    process.on('SIGINT', aoSinal);
    process.on('SIGTERM', () => { aoSinal(); filho.kill('SIGTERM'); });

    filho.on('exit', code => process.exit(code ?? 0));
    filho.on('error', err => falhar(`Não consegui iniciar o npx: ${err.message}`));

    const pronto = await esperarPortas([PORTAS.auth, PORTAS.banco, PORTAS.site], 5 * 60 * 1000, filho);
    if (!pronto) {
        if (filho.exitCode === null) {
            console.error('\n[erro] Os emuladores não responderam a tempo. Veja as mensagens acima.');
            filho.kill();
        }
        return;
    }

    log('Emuladores no ar. Criando as contas de teste...');
    if (!rodarSeed(env)) log('O seed falhou (veja acima). Os emuladores continuam rodando.');

    const site = `http://127.0.0.1:${PORTAS.site}`;
    console.log(`
==================================================
  Site:   ${site}
  Painel: http://127.0.0.1:${PORTAS.painel}

  mestre@rpg.com   / mestre123   (Mestre)
  jogador@rpg.com  / jogador123  (Jogador)

  Ctrl+C para encerrar${LIMPO ? '' : ' (os dados são salvos)'}.
==================================================
`);

    if (ABRIR) abrirNavegador(site);
})();
