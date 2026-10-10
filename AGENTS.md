# Guia para agentes — fonte_negra_tabletop

Ferramentas web para uma mesa de RPG (tema Persona 5). São **páginas HTML estáticas, sem build**, publicadas no GitHub Pages
(`https://gabrielbgoncalves.github.io/fonte_negra_tabletop/`) e sincronizadas em tempo real pelo **Firebase Realtime Database**.

Documentação complementar: [`docs/DEPLOY.md`](docs/DEPLOY.md) (publicação e configuração do Firebase) e [`docs/HISTORICO.md`](docs/HISTORICO.md) (o que já foi feito e por quê).

Idioma: código, comentários, textos de interface e mensagens de commit em **português**.

## Estrutura

| Arquivo | Função | Nó no banco |
|---|---|---|
| `index.html` | Hub e tela de login | — |
| `combat_traker.html` | Iniciativa e combate | `combat_tracker` |
| `conversor.html` | Conversor de fichas | `conversor` |
| `grid_map.html` | Mapa tático (jogador) | `grid_map` |
| `teste_grid.html` | Editor de grid (Mestre), exporta XML | `teste_grid` |
| `grim_rio_do_cora_o.html` | Progresso das dungeons | `grimorio_state` |
| `map_total.html` | Mapa da cidade, calendário e notas | `map_total` |
| `sistema_de_confidentes.html` | Confidentes por jogador | `sistema_de_confidentes` |
| `velvet_room.html` | Calculadora de fusão | `velvet_room` |
| `loja.html` | **Quebrado**: é só um trecho de JS (ver "Problemas conhecidos") | `loja` |
| `js/sessao.js` | Firebase, login, papel do usuário e helpers compartilhados | `mestres`, `jogadores` |
| `js/firebase-config.js` | **Placeholder** (`null`). No deploy, o workflow sobrescreve com a configuração real a partir dos secrets | — |
| `.github/workflows/deploy-pages.yml` | Deploy no GitHub Pages; gera o `firebase-config.js` com `.github/scripts/gerar-firebase-config.js` | — |
| `database.rules.json` | Regras do Realtime Database (a proteção real dos dados) | — |
| `firebase.json`, `.firebaserc` | Emuladores locais (projeto `demo-fonte-negra`) e caminho das regras para o CLI | — |
| `emulador/seed.js` | Cria as contas de teste no emulador | `mestres`, `jogadores` |

O Editor (`teste_grid`) e o Grid Map (`grid_map`) usam nós separados: o mapa do editor só chega aos jogadores quando o Mestre o carrega no Grid Map (colando o XML ou usando "Usar mapa do Editor"). No `grid_map`, as posições dos tokens gravadas no banco têm precedência sobre as do XML.

Cada página tem o CSS e o JS embutidos (`<style>` e `<script>` no próprio arquivo). As dependências vêm de CDN: Firebase compat 10.8.0, Tailwind Play CDN 3.4.17 em algumas páginas, Google Fonts e Font Awesome. Não existe `package.json` nem bundler. Não adicione um sem combinar com o usuário.

## Arquitetura de sessão e acesso

- `js/sessao.js` inicializa o Firebase e expõe `window.RPG`:
  - `RPG.db.ref(caminho)` aceita `.on`, `.once`, `.set` e `.remove`, com a mesma assinatura do Firebase. As chamadas **esperam o login ser confirmado** antes de chegar ao banco. Use sempre `RPG.db`, nunca `firebase.database()` direto.
  - `RPG.sessao`: Promise que resolve com `{ user, modo }` ou `null`.
  - `RPG.entrar(email, senha)` e `RPG.sair()`.
  - `RPG.escaparHtml(valor)`.
- O papel vem do banco: `/mestres/{uid} = true` ou `/jogadores/{uid} = true`. Esses nós só são editados pelo Console do Firebase.
- `localStorage['rpg_modo_sessao']` é **só um cache para a interface**. As páginas leem esse cache de forma síncrona em `const modoAtual = ...`. O `sessao.js` confere o cache contra o banco e recarrega a página se ele estiver errado.
- Toda página inclui `<script src="js/firebase-config.js"></script>` antes de `js/sessao.js`. As páginas internas usam `<script src="js/sessao.js" data-exigir-login></script>` e, sem sessão válida, voltam para `index.html`.
- Em `localhost`/`127.0.0.1`, o `sessao.js` ignora o `firebase-config.js` e usa uma configuração fixa do projeto demo, apontando para os emuladores.
- **As verificações `if (modoAtual !== 'mestre') return;` no front são apenas UX.** Quem impede um jogador de escrever são as regras em `database.rules.json`. Nunca trate uma checagem no navegador como controle de segurança.

## Regras de segurança (obrigatórias)

1. **Todo dado do banco ou do usuário que entrar em `innerHTML` passa por `RPG.escaparHtml`** (em geral apelidado de `const esc = RPG.escaparHtml;`). Se não houver marcação, prefira `textContent` ou `innerText`.
2. **Nunca interpole dados em handlers inline** (`onclick="f('${id}')"`): escapar HTML não protege ali. Use `data-*` mais `addEventListener`, ou delegação de eventos. O padrão está em `ligarAcoes()` de `sistema_de_confidentes.html`. `onclick` inline só é aceitável com valores fixos, sem interpolação.
3. **Escape `\${` não existe em template string**: ele gera o texto literal `${...}`. Esse bug já quebrou vários botões.
4. URLs vindas do banco (imagens, links) só são aceitas se começarem com `https://`.
5. Valores numéricos do banco usados em loops, tamanhos ou estilos devem ser convertidos e limitados (ex.: `Math.min(100, Math.max(1, parseInt(v, 10) || 1))`), para um dado malicioso não travar o navegador.
6. **Novo nó no banco exige entrada em `database.rules.json`**, porque a raiz nega tudo. Siga o padrão existente: leitura para mestres e jogadores, escrita só para mestres. Se jogadores precisarem escrever (ex.: compras na loja), crie uma regra específica e restrita, com `.validate`.
7. **CSP**: toda página tem o mesmo `<meta http-equiv="Content-Security-Policy">`. Ao adicionar uma origem externa (script, estilo, fonte, API), atualize a CSP **em todas as páginas**. Não adicione `'unsafe-eval'` nem curingas amplos (`*`, `https:` em `script-src`).
8. **Bibliotecas de CDN** devem ter versão fixa e `integrity` (SRI) com `crossorigin="anonymous"`. Para calcular o hash:
   `curl -sL URL | openssl dgst -sha384 -binary | openssl base64 -A`.
   O Tailwind Play CDN é exceção, porque o CDN não envia CORS e o SRI falharia.
9. **Nunca versione a configuração real do Firebase** (apiKey, appId, URLs do projeto) nem qualquer senha ou token. O `js/firebase-config.js` do repositório tem que continuar `null`: o valor real só existe nos secrets do GitHub e é gerado no deploy. Não coloque o ID do projeto real em HTML/JS: a CSP usa `https://*.firebaseapp.com` justamente para isso.
10. Ações destrutivas do Mestre (resetar, excluir) pedem `confirm(...)`.

## Como criar uma página nova

1. Copie o `<head>` de uma página existente: CSP, `referrer`, os três scripts do Firebase com SRI, `js/firebase-config.js` e `js/sessao.js` com `data-exigir-login`.
2. No script da página, use:
   ```js
   const db = RPG.db;
   const esc = RPG.escaparHtml;
   const modoAtual = localStorage.getItem('rpg_modo_sessao') || 'jogador';
   ```
3. Grave no banco só quando `modoAtual === 'mestre'`. Para os jogadores, escute com `db.ref('<nó>').on('value', ...)`.
4. Adicione o nó em `database.rules.json` e um card no `index.html`.
5. Avise o usuário de que as regras precisam ser **publicadas no Firebase** (console ou `firebase deploy --only database --project <id>`). Editar o arquivo não muda nada no banco.
6. O workflow de deploy copia `*.html` e `js/*.js` da raiz. Se a página usar arquivos em outra pasta, inclua no passo "Montar o site".

## Testar localmente (Firebase Local Emulator Suite)

Em `localhost`/`127.0.0.1`, o `js/sessao.js` conecta automaticamente aos emuladores de Auth (porta 9099) e Database (porta 9000), usando o projeto demo `demo-fonte-negra`. **Produção nunca é tocada**: projetos `demo-*` não conseguem falar com serviços reais, e não é preciso `firebase login`. As regras de `database.rules.json` também valem no emulador.

Requisitos: Node 18+ e Java 11+ no PATH.

```bash
npx firebase-tools emulators:start     # site em http://127.0.0.1:5000, painel em http://127.0.0.1:4000
node emulador/seed.js                  # em outro terminal: cria as contas e os papéis (pode repetir)
```

| Conta | Senha | Papel |
|---|---|---|
| `mestre@rpg.com` | `mestre123` | Mestre |
| `jogador@rpg.com` | `jogador123` | Jogador |

- Essas credenciais **só existem no emulador**. Nunca crie contas com elas no projeto real: as senhas estão públicas no Git.
- Os dados do emulador somem quando ele é encerrado. Para mantê-los, use `--import emulador/dados --export-on-exit` (a pasta está no `.gitignore`).
- Para testar regras sem navegador, use a REST do emulador: `GET/PUT http://127.0.0.1:9000/<nó>.json?ns=demo-fonte-negra-default-rtdb&auth=<idToken>`. O header `Authorization: Bearer owner` ignora as regras, como o console.
- A CSP libera o emulador do banco (`127.0.0.1:9000`) em `script-src`, `connect-src` e `frame-src`. Isso é necessário porque, depois de uma falha de WebSocket, o SDK grava `firebase:previous_websocket_failure` no `localStorage` e passa a usar long-polling (scripts JSONP mais um iframe). Sem essas origens, o login fica preso em `banco-indisponivel`. Não remova essas origens.
- O Realtime Database **não guarda arrays vazios** (`[]` volta como `undefined`). Todo dado lido do banco precisa de valores padrão, como em `normalizarEstado()` de `sistema_de_confidentes.html` e em `isAvailableNow()` de `map_total.html`.
- Abrir o HTML com `file://` não funciona: a CSP usa `'self'` e o Auth exige origem http(s).
- Para testar o caminho de produção sem publicar, sirva o site num host que não seja `localhost` (ex.: `python -m http.server 8766 --bind 127.0.0.2`). Com o placeholder, deve aparecer o aviso "Configuração do Firebase ausente". Para testar com a configuração real, gere o arquivo com `.github/scripts/gerar-firebase-config.js` e **restaure o placeholder antes de qualquer commit**.
- Sem login, toda página interna deve redirecionar para `index.html`. Isso é esperado.
- Para verificar CSP e erros sem interface, use o Chrome headless via DevTools Protocol: com `--remote-debugging-port`, capture `Runtime.consoleAPICalled`, `Runtime.exceptionThrown` e `Log.entryAdded` por alguns segundos reais. `--dump-dom` com `--virtual-time-budget` não espera o WebSocket do Firebase e dá falso negativo. Também escute o evento `securitypolicyviolation`.
- Checagem rápida de sintaxe dos scripts embutidos: extraia cada `<script>` sem `src` e passe por `new Function(codigo)` no Node.
- Não escreva no banco de produção durante testes sem pedir ao usuário. É o mesmo banco usado pela mesa.

## Git e deploy

- O `origin` local é o fork `stsmuniz/fonte_negra_tabletop`. O site publicado sai de `gabrielbgoncalves/fonte_negra_tabletop`, então mudanças chegam lá por PR.
- O deploy é feito pelo GitHub Actions (`.github/workflows/deploy-pages.yml`) a cada push na `main`. O Pages precisa estar com *Source: GitHub Actions*. Passo a passo em `docs/DEPLOY.md`.
- `.idea/` é configuração local da IDE: não faça commit.
- Faça commit ou push só quando o usuário pedir.

## Problemas conhecidos

- `loja.html` virou um trecho de JS sem HTML depois do commit `15ab72a` ("rowback"). A última versão completa está em `eb37f4d`. Restaurar a loja é decisão do usuário. Se for feito, aplique as regras de segurança acima (o código antigo usa `innerHTML` sem escape) e crie regras de banco para compras de jogadores.
- Alguns textos têm restos de geração como `[cite: 5]` (grimório, velvet room, confidentes). São conteúdo, não código. Só remova se o usuário pedir.
- A CSP ainda permite `'unsafe-inline'` por causa dos `onclick` estáticos e dos `<style>`/`<script>` embutidos. Ao mexer numa página, prefira `addEventListener`, para um dia ser possível remover isso.
- O Tailwind Play CDN não é recomendado para produção (ele mesmo avisa no console). Migrar para um CSS compilado exigiria um build. Combine com o usuário antes.
