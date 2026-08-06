export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Falhou',
  bounced: 'Inválido',
  invalid: 'Inválido',
  replied: 'Respondeu',
  unsubscribed: 'Descadastrado',
  draft: 'Rascunho',
  running: 'Em execução',
  paused: 'Pausada',
  completed: 'Concluída',
};

export const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  sending: 'bg-amber-100 text-amber-700',
  sent: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  bounced: 'bg-red-100 text-red-700',
  invalid: 'bg-red-100 text-red-700',
  replied: 'bg-green-100 text-green-700',
  unsubscribed: 'bg-slate-100 text-slate-500',
  draft: 'bg-slate-100 text-slate-600',
  running: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
};
