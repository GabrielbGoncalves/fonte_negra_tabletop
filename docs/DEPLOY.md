# Deploy no GitHub Pages

Este guia publica o site em `https://gabrielbgoncalves.github.io/fonte_negra_tabletop/` **sem guardar a configuração do Firebase no repositório**.

## Antes de começar: o que fica protegido, e o que não fica

| Item | Onde fica | Exposto? |
|---|---|---|
| Configuração web do Firebase (`apiKey`, `appId`, URLs) | Secrets do GitHub, injetada no deploy em `js/firebase-config.js` | **Fora do código e do Git.** Mas quem abre o site consegue ver os valores no navegador, porque é assim que o SDK web do Firebase funciona. Não existe forma de esconder isso num site estático. |
| Senhas dos usuários | Firebase Authentication | Não. Nunca passam pelo repositório. |
| Quem é Mestre ou Jogador | `/mestres` e `/jogadores` no banco, editáveis só pelo console | Não. |
| Dados da mesa | Realtime Database, protegido por `database.rules.json` | Só para contas cadastradas. |

A segurança dos dados vem de **três camadas**, todas configuradas abaixo:
1. as Regras do banco;
2. a restrição da chave de API ao domínio do site;
3. a troca da chave antiga, que ficou no histórico do Git.

> **A chave antiga está no histórico do Git.** Até o commit que introduziu este guia, a configuração (`AIzaSy…`) estava escrita nos HTML. Tirar do código não apaga o histórico. Por isso, a etapa 2.2 cria uma chave nova e apaga a antiga.

Quem executa cada etapa:
- **Etapas 1 e 2**: dono do projeto Firebase/Google Cloud usado pela mesa.
- **Etapa 3**: dono do repositório `gabrielbgoncalves/fonte_negra_tabletop`.

---

## Etapa 1: Firebase (console)

Abra https://console.firebase.google.com/ e selecione o projeto.

1. **Authentication → Começar**. Depois, em **Sign-in method**, ative **E-mail/senha**.
2. **Authentication → Settings → Authorized domains**: confirme que `gabrielbgoncalves.github.io` está na lista.
3. **Authentication → Users → Add user**: crie uma conta para o Mestre e uma para cada jogador, com senhas fortes. Anote o **User UID** de cada conta.
4. **Realtime Database → Data**: crie os papéis. O console ignora as regras, então dá para editar ali.
   ```json
   {
     "mestres":   { "UID_DO_MESTRE": true },
     "jogadores": { "UID_JOGADOR_1": true, "UID_JOGADOR_2": true }
   }
   ```
5. **Configurações do projeto → Geral → Seus apps → app Web → Configuração do SDK**: deixe essa tela aberta. Os valores dela vão para os secrets na etapa 3. Se for trocar a chave (etapa 2.2), use a chave nova no lugar da `apiKey`.

As **regras do banco** são publicadas na etapa 3.6, junto com o site. Publicar antes quebra o site antigo, que não faz login. Publicar depois deixa o banco aberto por mais tempo.

---

## Etapa 2: Proteger a chave de API (Google Cloud Console)

Abra https://console.cloud.google.com/apis/credentials com o projeto selecionado.

### 2.1 Restringir a chave

Edite a chave do navegador ("Browser key (auto created by Firebase)", ou a nova, se fizer a 2.2):
- **Restrições de aplicativo → Referenciadores HTTP**: adicione `https://gabrielbgoncalves.github.io/*`.
- **Restrições de API** (opcional): se restringir, mantenha pelo menos **Identity Toolkit API** e **Token Service API**, que são as usadas pelo login.

Com isso, a chave só funciona quando a requisição vem do site.

### 2.2 Trocar a chave (recomendado)

1. **Criar credenciais → Chave de API**, e restrinja a chave nova como na 2.1.
2. Use a chave nova no secret `FIREBASE_API_KEY` (etapa 3.3).
3. Depois que o site novo estiver no ar e o login funcionando, **apague a chave antiga**.

### 2.3 App Check (opcional)

No console do Firebase, em **App Check**, registre o app web com reCAPTCHA. Isso dificulta o uso da API por scripts fora do site. Exige um pequeno ajuste no código para inicializar o App Check, que ainda não foi feito.

---

## Etapa 3: GitHub

No repositório `gabrielbgoncalves/fonte_negra_tabletop`:

1. **Faça o merge do PR** com estas mudanças na `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**. Antes estava "Deploy from a branch".
3. **Settings → Secrets and variables → Actions → New repository secret**: crie os cinco secrets, com os valores da tela da etapa 1.5.

   | Secret | Campo da configuração do SDK | Exemplo de formato |
   |---|---|---|
   | `FIREBASE_API_KEY` | `apiKey` (ou a chave nova da 2.2) | `AIzaSy...` |
   | `FIREBASE_AUTH_DOMAIN` | `authDomain` | `<projeto>.firebaseapp.com` |
   | `FIREBASE_DATABASE_URL` | `databaseURL` | `https://<projeto>-default-rtdb.firebaseio.com` |
   | `FIREBASE_PROJECT_ID` | `projectId` | `<projeto>` |
   | `FIREBASE_APP_ID` | `appId` | `1:123...:web:abc...` |

4. **Actions → Deploy GitHub Pages → Run workflow** (ou faça qualquer push na `main`). O workflow:
   - gera `js/firebase-config.js` a partir dos secrets, e **falha** se faltar algum, para nunca publicar um site sem configuração;
   - publica só os `*.html` e `js/*.js`. Documentação, regras, emulador e workflow não vão para o site.
5. **Verifique o site**: abra a URL e faça login com uma conta da etapa 1.3.
6. **Publique as regras do banco**, logo em seguida. Escolha uma das opções:
   - **Console**: em **Realtime Database → Rules**, cole o conteúdo de `database.rules.json` e clique em **Publicar**.
   - **CLI**: `npx firebase-tools login`, depois `npx firebase-tools deploy --only database --project <id-do-projeto>`.

   Até este passo, o banco continua **aberto para qualquer pessoa**.
7. Confirme que o banco fechou. Este comando precisa responder `Permission denied`:
   ```bash
   curl "https://<projeto>-default-rtdb.firebaseio.com/.json?shallow=true"
   ```

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Faixa vermelha "Configuração do Firebase ausente" | O Pages ainda serve a branch em vez do Actions (3.2), ou o deploy não rodou |
| Workflow falha em "Gerar js/firebase-config.js" | Falta algum secret (3.3); o log diz qual |
| "Email ou palavra-passe inválidos" para uma conta que existe | Login por e-mail/senha não ativado (1.1), ou senha errada |
| "Esta conta não tem acesso à sessão" | O UID não está em `/mestres` nem em `/jogadores` (1.4) |
| Login demora e mostra "o banco de dados não respondeu" | Bloqueio de rede, ou `FIREBASE_DATABASE_URL` errado (3.3) |
| `curl` do passo 3.7 ainda devolve dados | As regras não foram publicadas (3.6) |
| Erros `API key not valid` / `referer blocked` | A restrição da chave (2.1) não inclui o domínio exato do site |

## Para quem tem um fork

O workflow roda em qualquer repositório. Num fork, ele só publica se você também fizer as etapas 3.2 e 3.3 no fork. Nesse caso, o site sai em `https://<seu-usuario>.github.io/fonte_negra_tabletop/`, e esse domínio precisa entrar nas etapas 1.2 e 2.1.

## Desenvolvimento local

Não precisa de nada disto: em `localhost` o site usa os emuladores. Veja a seção "Rodar localmente" no [README](../README.md).
