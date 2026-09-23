import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../features/auth/repository/session-repository';
import { SiteHeader } from '../features/auth/components/site-header';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SchemaVibe',
  description:
    'Le vibe coding transformé en workflow collaboratif, traçable et gamifié : tickets vivants, patterns éprouvés et contrôle qualité automatisé.',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const client = await createServerSupabaseClient();
  const utilisateur = await recupererUtilisateurConnecte(client);

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader utilisateur={utilisateur} />
        {children}
      </body>
    </html>
  );
}
