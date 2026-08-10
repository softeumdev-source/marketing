import 'server-only';

// ---------------------------------------------------------------------------
// Server-only secrets.
//
// SEGURANÇA: os valores DEFAULT_* abaixo estão no código-fonte, e este
// repositório é público. Enquanto eles estiverem em uso, qualquer pessoa que
// leia o repositório consegue:
//   1. chamar /api/cron/* e as funções RPC protegidas pelo segredo do worker;
//   2. obter as senhas de app criptografadas das contas Gmail;
//   3. descriptografá-las com a ENCRYPTION_KEY.
//
// Defina ENCRYPTION_KEY e CRON_SECRET nas variáveis de ambiente da Vercel para
// desativá-los. O painel mostra um aviso enquanto o segredo padrão estiver
// ativo no banco (mail_settings.worker_secret). O passo a passo da rotação está
// no README, em "Rotação de segredos".
// ---------------------------------------------------------------------------

const DEFAULT_ENCRYPTION_KEY =
  'a69718c8d3e529e003c435a04a6176de6b4aa78e56c7090bd0d7a1194f058ceb';
const DEFAULT_WORKER_SECRET = '5abc044a8dd24410e895bee11442295eee930fb968b7c352';

// ENCRYPTION_KEY: 32 bytes em hex, usada para AES-256-GCM nas senhas de app.
// Trocar esta chave torna as senhas já salvas ilegíveis — reconecte as contas
// depois de rotacionar.
export const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY;

// WORKER_SECRET: protege os endpoints /api/cron/* e as RPCs SECURITY DEFINER.
// Precisa ser igual a public.mail_settings.worker_secret no Supabase.
export const WORKER_SECRET =
  process.env.CRON_SECRET || process.env.WORKER_SECRET || DEFAULT_WORKER_SECRET;

// Usado pelo painel para avisar que o sistema ainda roda com segredos públicos.
export const USING_DEFAULT_ENCRYPTION_KEY = ENCRYPTION_KEY === DEFAULT_ENCRYPTION_KEY;
export const USING_DEFAULT_WORKER_SECRET = WORKER_SECRET === DEFAULT_WORKER_SECRET;
export const USING_DEFAULT_SECRETS =
  USING_DEFAULT_ENCRYPTION_KEY || USING_DEFAULT_WORKER_SECRET;
