import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Disparador — Email em Massa',
  description: 'Sistema de envio de email em massa personalizado',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
