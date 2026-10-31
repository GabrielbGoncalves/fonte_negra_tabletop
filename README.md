# fonte_negra_tabletop

Ferramentas web para a mesa de RPG (tema Persona 5): combate, mapas, confidentes, fusões e outras. São páginas HTML estáticas, publicadas no GitHub Pages e sincronizadas em tempo real pelo Firebase Realtime Database.

- **Publicar o site e configurar o Firebase:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **O que já foi feito e por quê:** [docs/HISTORICO.md](docs/HISTORICO.md)
- **Regras para quem desenvolve (pessoas e agentes):** [AGENTS.md](AGENTS.md)

## Rodar localmente

Requisitos: Node 18+ e Java 11+.

```bash
node emulador/iniciar.js             # sobe os emuladores e cria as contas de teste (Ctrl+C encerra)
node emulador/iniciar.js --abrir     # idem, e abre o site no navegador
node emulador/iniciar.js --limpo     # começa do zero e não salva os dados ao sair
```

No Windows, também dá para abrir o `iniciar.cmd` com dois cliques. O site fica em http://127.0.0.1:5000 e o painel dos emuladores em http://127.0.0.1:4000. Os dados ficam em `emulador/dados/` entre uma execução e outra. Se o Java não estiver no PATH, o script procura o `JAVA_HOME` e o Java que vem com as IDEs JetBrains.

Passo a passo manual, se preferir:

```bash
npx firebase-tools emulators:start   # site em http://127.0.0.1:5000, painel em http://127.0.0.1:4000
node emulador/seed.js                # em outro terminal: cria as contas de teste
```

| Conta | Senha | Papel |
|---|---|---|
| `mestre@rpg.com` | `mestre123` | Mestre |
| `jogador@rpg.com` | `jogador123` | Jogador |

Em `localhost`, o site conecta automaticamente aos emuladores do Firebase (projeto demo). Essas contas **só existem no emulador**, e o banco real nunca é tocado.

## Segurança, em resumo

- **Login:** Firebase Authentication (e-mail e senha). O papel (Mestre/Jogador) vem do banco, em `/mestres` e `/jogadores`, editáveis só pelo console.
- **Dados:** protegidos por [`database.rules.json`](database.rules.json). Só contas cadastradas leem, e só Mestres escrevem.
- **Configuração do Firebase:** não fica no repositório. O `js/firebase-config.js` versionado é um placeholder, e o valor real vem dos secrets do GitHub no deploy. Como em qualquer app web do Firebase, ela fica visível no navegador. Por isso, a chave deve ser restrita ao domínio do site (veja o DEPLOY).
- **Navegador:** CSP, SRI nas bibliotecas de CDN, escape de todo dado do banco e bloqueio de iframe.
