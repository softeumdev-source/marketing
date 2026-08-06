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

## Como funciona
- **Campanhas**: cada uma tem assunto, mensagem (com `{{nome}}`, `{{primeiro_nome}}`,
  `{{email}}`), limite diário e intervalo entre envios.
- **Contatos únicos**: o email é único em todo o sistema. Um email jamais se repete
  entre campanhas, e a importação ignora duplicados automaticamente.
- **Envio temporizado**: um worker (`/api/cron/send`) é chamado a cada minuto e envia
  respeitando o intervalo e o limite diário de cada campanha e de cada conta Gmail.
- **Múltiplas contas**: os envios são distribuídos entre as contas conectadas.
- **Rastreamento de abertura**: pixel em `/api/track/[id]`.
- **Bounce/resposta**: `/api/cron/scan` lê a caixa de entrada via IMAP; emails
  inexistentes vão para a caixa de inválidos e respostas para a caixa de respondidos —
  ambos removidos da campanha.

## Login
- Email: `softeumdev@gmail.com`
- Senha: `123456`

## Conectar uma conta Gmail
Use uma **Senha de app** do Google (não a senha normal):
1. Ative a verificação em 2 etapas na conta Google.
2. Vá em myaccount.google.com → Segurança → Senhas de app.
3. Gere uma senha e cole na tela "Contas Gmail".

## Segredos (produção)
Os valores padrão estão embutidos para funcionar de imediato. Para endurecer,
defina na Vercel: `ENCRYPTION_KEY`, `CRON_SECRET` (igual ao `mail_settings.worker_secret`),
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
