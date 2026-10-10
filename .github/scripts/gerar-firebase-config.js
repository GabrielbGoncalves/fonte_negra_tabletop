/*
 * Gera js/firebase-config.js no deploy a partir de variáveis de ambiente (secrets do GitHub).
 * Falha o build se faltar algum valor, para nunca publicar um site sem configuração.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CAMPOS = {
    apiKey: 'FIREBASE_API_KEY',
    authDomain: 'FIREBASE_AUTH_DOMAIN',
    databaseURL: 'FIREBASE_DATABASE_URL',
    projectId: 'FIREBASE_PROJECT_ID',
    appId: 'FIREBASE_APP_ID'
};

const config = {};
const faltando = [];
for (const [campo, variavel] of Object.entries(CAMPOS)) {
    const valor = (process.env[variavel] || '').trim();
    if (!valor) faltando.push(variavel);
    config[campo] = valor;
}

if (faltando.length) {
    console.error(`Secrets ausentes: ${faltando.join(', ')}. Configure em Settings > Secrets and variables > Actions (ver docs/DEPLOY.md).`);
    process.exit(1);
}

// JSON.stringify garante que nenhum valor quebre o JavaScript gerado
const conteudo = `// Gerado no deploy por .github/scripts/gerar-firebase-config.js. Não editar.\nwindow.FIREBASE_CONFIG = Object.freeze(${JSON.stringify(config, null, 4)});\n`;
fs.writeFileSync(path.join(__dirname, '..', '..', 'js', 'firebase-config.js'), conteudo);
console.log('js/firebase-config.js gerado para o projeto', config.projectId);
