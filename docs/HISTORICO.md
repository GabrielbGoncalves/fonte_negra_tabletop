# Histórico do desenvolvimento

Registro do trabalho feito em 10/10/2026 para tornar seguro o site publicado no GitHub Pages, com o que foi encontrado, o que mudou e por quê. Para instruções de uso, veja o [README](../README.md); para publicar, [DEPLOY.md](DEPLOY.md); para regras de desenvolvimento, [AGENTS.md](../AGENTS.md).

## 1. Auditoria de segurança

Ponto de partida: commit `15ab72a`. Páginas HTML estáticas que usam o Firebase Realtime Database.

| Gravidade | Problema encontrado |
|---|---|
| Crítica | **Banco aberto.** Um GET anônimo em `/.json?shallow=true` listou os dados (`grid_map`, `loja`, `teste_grid`). Qualquer pessoa na internet podia ler e, provavelmente, escrever. |
| Crítica | **Login falso.** O "login de Mestre" era só um teste no navegador: qualquer usuário contendo "mestre", ou as senhas `mestre123`/`admin` escritas no código. Também bastava `localStorage.setItem('rpg_modo_sessao','mestre')`. |
| Alta | **XSS persistente.** Dados do banco iam direto para `innerHTML` e para atributos `onclick="f('${id}')"` (map_total, sistema_de_confidentes, combat_traker, velvet_room). Quem escrevesse no banco aberto executava código no navegador de todos. |
| Média | Scripts de CDN sem SRI, sem CSP e sem proteção contra clickjacking. Um XML com dimensões gigantes podia travar o navegador dos jogadores (grid_map). |
| Funcional | As páginas internas chamavam `firebase.database()` esperando uma configuração no `localStorage` (`rpg_firebase_config`) que nunca era gravada. O script quebrava na primeira linha: "Modo: a carregar..." para sempre, e botões sem efeito. É o estado do site publicado até este trabalho. |

## 2. Correções de segurança

- **`js/sessao.js` (novo):** concentra a inicialização do Firebase, o login (Firebase Authentication com e-mail e senha), a descoberta do papel e os utilitários compartilhados (`window.RPG`).
  - O papel (Mestre ou Jogador) vem do banco, em `/mestres/{uid}` ou `/jogadores/{uid}`, e não do navegador.
  - `RPG.db` só libera o acesso ao banco depois que a sessão é confirmada.
  - As páginas internas sem sessão voltam para o hub.
- **`database.rules.json` (novo):** a raiz nega tudo. Cada nó da mesa permite leitura a mestres e jogadores e escrita só a mestres. `/mestres` e `/jogadores` são editáveis só pelo console.
- **`index.html`:** um único formulário de login, sem senhas fixas e sem modo convidado.
- **XSS:** todo dado do banco passa por `RPG.escaparHtml`. Os `onclick` com interpolação foram trocados por `data-*` e `addEventListener` ou delegação de eventos.
- **Navegador:**
  - CSP via `<meta>` em todas as páginas;
  - SRI nos scripts do Firebase e no Font Awesome;
  - Tailwind fixado na versão 3.4.17;
  - bloqueio de carregamento em iframe;
  - URLs de imagem só `https://`;
  - dimensões do mapa limitadas a 100;
  - `confirm()` antes de resetar o mapa.

## 3. Ambiente local com emuladores

O Firebase Authentication nunca tinha sido ativado no projeto real (a API respondia `CONFIGURATION_NOT_FOUND`). Por isso, os testes passaram a usar o **Firebase Local Emulator Suite**:
- **`firebase.json` e `.firebaserc`:** emuladores de Auth (9099), Database (9000) e Hosting (5000), no projeto `demo-fonte-negra`. Um projeto `demo-*` nunca acessa serviços reais.
- **`emulador/seed.js`:** cria `mestre@rpg.com`/`mestre123` e `jogador@rpg.com`/`jogador123`, só no emulador, e grava os papéis.
- Em `localhost`/`127.0.0.1`, o `sessao.js` usa os emuladores automaticamente.

## 4. Bugs antigos revelados pelos testes

Com o banco funcionando de verdade nas páginas internas, apareceram defeitos que existiam antes:

| Página | Defeito | Correção |
|---|---|---|
| map_total | Travava com `undefined.includes`: o Firebase não guarda arrays vazios (`weatherBlocked: []`) | Valores padrão em `isAvailableNow` |
| sistema_de_confidentes | Mesmo risco com um jogador sem confidentes | `normalizarEstado()` ao carregar o estado |
| sistema_de_confidentes, map_total | Templates com `\${...}` geravam texto literal: os botões de excluir confidente, excluir nota e marcar rank não funcionavam | Interpolação correta, via `data-*` |
| combat_traker | Linhas iniciais criadas em dobro (4 em vez de 2) | Só cria se a tabela estiver vazia |
| grid_map | O mapa do Editor (`teste_grid`) nunca chegava aos jogadores: são nós diferentes | Botão "Usar mapa do Editor" para o Mestre |
| grid_map | "A aguardar sincronização..." nunca mudava para o jogador | Status "Mapa sincronizado com o Mestre." |
| grid_map | O token voltava ao início na tela do Mestre a cada movimento | As posições gravadas no banco valem para todos, e a seleção é mantida |

## 5. Login travado e o long-polling

**Sintoma:** o login era aceito, mas o modal não fechava, sem nenhuma mensagem.

**Causa:** depois de uma falha de WebSocket, o SDK do Firebase grava `firebase:previous_websocket_failure` no `localStorage` e passa a usar long-polling, que carrega scripts JSONP e um iframe do servidor do banco. A CSP liberava o emulador só em `connect-src`, então a consulta do papel ficava esperando para sempre.

**Correções:**
- `127.0.0.1:9000` foi liberado em `script-src` e `frame-src`;
- o login ganhou prazo (10 s para o banco, 15 s para a autenticação) e mensagens de erro claras ("Login aceito, mas o banco de dados não respondeu"), além do registro `Falha no login:` no console.

## 6. Configuração do Firebase fora do repositório

- `js/firebase-config.js` é versionado como **placeholder** (`window.FIREBASE_CONFIG = null`).
- **`.github/workflows/deploy-pages.yml`** publica no GitHub Pages pelo Actions. Antes de publicar, **`.github/scripts/gerar-firebase-config.js`** gera o arquivo real a partir dos secrets do repositório, e o build falha se faltar algum.
- Sem configuração, o site mostra a faixa "Configuração do Firebase ausente" em vez de falhar em silêncio.
- A CSP passou a usar `https://*.firebaseapp.com`, e nenhum HTML ou JS cita mais o ID do projeto real.
- **Limite:** a configuração web continua visível no navegador de quem abre o site, e a chave antiga permanece no histórico do Git. Por isso, o [DEPLOY.md](DEPLOY.md) manda restringir a chave ao domínio e trocá-la.

## 7. Documentação

- `AGENTS.md`, com `CLAUDE.md` importando-o: guia para agentes, com arquitetura, regras de segurança obrigatórias, como criar páginas e como testar.
- `README.md`, `docs/DEPLOY.md` e este histórico.

## 8. Como foi testado

Tudo nos emuladores e com o Chrome headless via DevTools Protocol:
- **Regras:** 7 casos (Mestre escreve; Jogador lê; Jogador não escreve nem se promove; anônimo e conta não cadastrada não leem; nó desconhecido bloqueado).
- **Páginas:** as 8 páginas internas como Mestre e como Jogador, sem exceções nem violações de CSP. Sem login, todas redirecionam para o hub.
- **Dois navegadores simultâneos:** o Mestre carrega o mapa do Editor e o Jogador recebe em tempo real, com os tokens na mesma posição depois de mover.
- **Login pelo formulário:** login, troca de conta, recarregar com a sessão ativa, e o modo long-polling forçado.
- **Caminho de produção:**
  - com o placeholder, aparece a faixa de aviso;
  - com o arquivo gerado pelo script do deploy, conecta ao banco real, e o Auth responde `configuration-not-found`, que é esperado até a etapa 1 do DEPLOY.

## 9. Pendências

- Configurar o Firebase, a chave e o GitHub conforme o [DEPLOY.md](DEPLOY.md). **Até as regras serem publicadas, o banco real continua aberto.**
- `loja.html` está quebrado desde `15ab72a` (sobrou só um trecho de JS). A última versão completa está em `eb37f4d`. Se for restaurado, precisa das mesmas proteções e de regras de compra para jogadores.
- A CSP ainda tem `'unsafe-inline'`, e o Tailwind vem do Play CDN. Resolver os dois exige um passo de build.
- App Check ainda não implementado.
