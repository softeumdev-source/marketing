# Disparador — Email em Massa

Sistema para envio de email em massa personalizado, com múltiplas contas Gmail,
temporização por dia, rastreamento de aberturas, e tratamento automático de
emails inválidos (bounce) e respostas.

## Stack
- **Next.js 14** (App Router) na Vercel
- **Supabase** (Postgres + Auth + RLS) — tabelas com prefixo `mail_`
- **Nodemailer** (SMTP Gmail) para envio
- **ImapFlow** (IMAP Gmail) para detectar bounces e respostas
- **pg_cron + pg_net** (Supabase) acionam o worker a cada minuto

> ⚠️ **Leia a seção [Rotação de segredos](#rotação-de-segredos) antes de usar em
> produção.** Este repositório é público e os segredos padrão estão no código.

## Como funciona

- **Campanhas**: cada uma tem assunto, mensagem (com `{{nome}}`, `{{primeiro_nome}}`,
  `{{email}}`), limite diário e intervalo entre envios.
- **Contatos únicos**: o email é único em todo o sistema. Ver
  [Regras de duplicidade](#regras-de-duplicidade).
- **Envio temporizado**: `/api/cron/send` é chamado a cada minuto e envia
  respeitando o intervalo, a janela de horário e os limites diários.
- **Múltiplas contas**: o intervalo é aplicado **por conta**, então cada conta
  ativa a mais multiplica a capacidade de envio.
- **Rastreamento de abertura**: pixel em `/api/track/[id]`, com filtro de
  pré-carregamento (ver [Aberturas reais](#aberturas-reais)).
- **Bounce/resposta**: `/api/cron/scan` lê a caixa de entrada via IMAP de forma
  incremental; emails inexistentes vão para a caixa de inválidos e respostas para
  a caixa de respondidos — ambos saem da campanha e entram na lista de bloqueio.

### Painel

O painel mostra, no fuso configurado:

- **enviados hoje** e quantos ainda cabem no limite do dia;
- **quantos faltam** na fila, com estimativa de dias até terminar;
- resultado do dia: aberturas reais, respostas, inválidos, descadastros, falhas;
- uso do limite diário **de cada conta Gmail**;
- gráfico dos últimos 14 dias (passe o mouse para o detalhe do dia);
- progresso de cada campanha.

Ele também avisa quando algo está travando os envios: fora da janela de horário,
limite diário atingido, ou verificação de respostas atrasada.

## Regras de duplicidade

Um endereço **nunca** entra duas vezes. A importação bloqueia em três níveis:

1. **No próprio arquivo** — linhas repetidas são unificadas.
2. **Em qualquer campanha** — índice único em `email` e em `email_norm`.
3. **Na lista de bloqueio** — quem cancelou a inscrição ou deu bounce nunca é
   reimportado, mesmo que a campanha antiga seja excluída.

A comparação usa a forma canônica do endereço (`mail_norm_email`):

| Digitado | Normalizado |
|---|---|
| `Joao.Silva+promo@Gmail.com` | `joaosilva@gmail.com` |
| `joaosilva@googlemail.com` | `joaosilva@gmail.com` |
| `contato+news@empresa.com.br` | `contato@empresa.com.br` |

Ou seja: no Gmail, pontos e `+tag` são ignorados; nos outros domínios, o `+tag` é
ignorado. Ao importar, o sistema informa quantos foram adicionados, quantos eram
repetidos no arquivo, quantos já existiam, quantos estavam bloqueados e quantos
eram inválidos.

A lista de bloqueio fica visível em **Lista de bloqueio** no menu.

## Aberturas reais

Gmail e Outlook baixam a imagem de rastreamento pelo próprio proxy assim que a
mensagem chega, antes de qualquer pessoa abrir. Essas requisições são registradas
como `prefetch` e **não** entram na taxa de abertura — só contam aberturas que
acontecem depois do tempo mínimo configurado (padrão 60s).

Sem esse filtro a taxa de abertura fica inflada várias vezes.

## Configurações de envio

**Política em uso: horário comercial, dias úteis** — 08:00 às 18:00, de segunda a
sexta, no fuso `America/Sao_Paulo`. Nada é disparado de madrugada nem no fim de
semana. Fora da janela o painel mostra um aviso e o worker sai sem enviar.

Isso não reduz o volume: a janela de 10h comporta ~360 envios com intervalo de
90s, acima do limite diário de 300.

Em **Configurações** (`/configuracoes`):

| Opção | Para que serve |
|---|---|
| Janela de envio | Só envia dentro do horário (padrão 08:00–18:00). Horários iguais = 24h |
| Somente dias úteis | Pausa sábado e domingo (ligado por padrão) |
| Variação aleatória | Segundos aleatórios somados ao intervalo, para o envio não ficar robótico |
| Tentativas por contato | Falhas temporárias são repetidas com intervalo crescente (5, 10, 20 min…) |
| Ignorar aberturas nos primeiros N seg | Filtro de pré-carregamento descrito acima |
| Fuso horário | Base dos limites diários e da janela |

Recusas definitivas do servidor (caixa inexistente) vão direto para a caixa de
inválidos, sem gastar tentativas.

## Login

- Email: `softeumdev@gmail.com`
- Senha: definida no Supabase (**Authentication → Users**). Se precisar trocar,
  use “Reset password” no painel do Supabase — não guarde a senha neste arquivo.

## Conectar uma conta Gmail

Use uma **Senha de app** do Google (não a senha normal):

1. Ative a verificação em 2 etapas na conta Google.
2. Vá em myaccount.google.com → Segurança → Senhas de app.
3. Gere uma senha e cole na tela "Contas Gmail".

## Rotação de segredos

Os valores padrão de `ENCRYPTION_KEY` e `CRON_SECRET` estão no código-fonte
(`src/lib/secrets.ts`) e **este repositório é público**. Enquanto eles estiverem
em uso, qualquer pessoa que leia o repositório consegue chamar as funções do
worker, obter as senhas de app criptografadas das contas Gmail e descriptografá-las.

O painel exibe um aviso vermelho enquanto o segredo padrão estiver ativo.

**Mitigação imediata:** deixe o repositório privado
(GitHub → Settings → General → Change repository visibility).

**Rotação completa:**

1. **Deixe o repositório privado** (acima).
2. **Gere valores novos:**
   ```bash
   openssl rand -hex 32   # ENCRYPTION_KEY (32 bytes)
   openssl rand -hex 24   # CRON_SECRET
   ```
3. **Defina na Vercel** (Project Settings → Environment Variables, ambiente
   Production): `ENCRYPTION_KEY`, `CRON_SECRET`. Faça o redeploy.
4. **Atualize o banco** com o mesmo `CRON_SECRET`:
   ```sql
   update public.mail_settings set worker_secret = '<NOVO_CRON_SECRET>' where id = 1;
   ```
5. **Atualize os jobs do pg_cron** (o segredo vai no header):
   ```sql
   select jobid, jobname, command from cron.job;   -- veja os jobs atuais
   ```
   Recrie `mail_send` e `mail_scan` com o novo header `x-cron-secret`.
6. **Reconecte as contas Gmail.** Trocar a `ENCRYPTION_KEY` torna as senhas já
   salvas ilegíveis: remova cada conta em "Contas Gmail" e conecte de novo com a
   senha de app. Aproveite para **gerar novas senhas de app** no Google e revogar
   as antigas — elas estiveram expostas.

Faça os passos 3, 4 e 5 juntos: enquanto `CRON_SECRET` e `worker_secret`
estiverem diferentes, o worker responde `401` e os envios param.

## Variáveis de ambiente

Veja `.env.example`. Em produção, defina na Vercel:

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `ENCRYPTION_KEY` | recomendada | 32 bytes hex, criptografa as senhas de app |
| `CRON_SECRET` | recomendada | Protege `/api/cron/*`; igual a `mail_settings.worker_secret` |
| `NEXT_PUBLIC_SUPABASE_URL` | opcional | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | opcional | Chave anon (pública por design, protegida por RLS) |
| `NEXT_PUBLIC_APP_URL` | opcional | Base dos links de pixel/descadastro; por padrão usa o host da requisição |

## Banco de dados

O schema é versionado em `supabase/migrations/`. Detalhes das tabelas, das
funções e do agendamento em [`supabase/README.md`](supabase/README.md).
