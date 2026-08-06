'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

const NAV = [
  { href: '/', label: 'Painel', icon: '📊' },
  { href: '/campaigns', label: 'Campanhas', icon: '🚀' },
  { href: '/accounts', label: 'Contas Gmail', icon: '📮' },
  { href: '/caixa-respondidos', label: 'Responderam', icon: '💬' },
  { href: '/caixa-invalidos', label: 'Inválidos', icon: '⛔' },
];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="px-5 py-5 flex items-center gap-2 border-b border-slate-100">
        <div className="h-9 w-9 rounded-lg bg-brand-500 grid place-items-center text-white font-bold">
          ✉
        </div>
        <div>
          <div className="font-bold text-slate-900 leading-tight">Disparador</div>
          <div className="text-xs text-slate-400">email em massa</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <div className="px-2 pb-2 text-xs text-slate-400 truncate">{email}</div>
        <button onClick={logout} className="btn-ghost w-full">
          Sair
        </button>
      </div>
    </aside>
  );
}
