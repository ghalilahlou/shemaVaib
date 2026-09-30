import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { createServerSupabaseClient } from '../lib/supabase/server';
import { recupererUtilisateurConnecte } from '../features/auth/repository/session-repository';
import { SiteHeader } from '../features/auth/components/site-header';
import './globals.css';

/**
 * Trois familles, trois rôles (SV-015).
 *
 * Space Grotesk porte les titres, Inter le texte courant, et JetBrains Mono tout
 * ce qui est littéral — référence de ticket, statut, extrait de code. La règle
 * n'est pas décorative : une chasse fixe signale qu'une chaîne se lit caractère
 * par caractère et se recopie telle quelle.
 */
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['500', '700'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '600'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '600'],
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
    <html
      lang="fr"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader utilisateur={utilisateur} />
        {children}
      </body>
    </html>
  );
}
