import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { evaluerDefinitionOfReady } from '@schemavibe/shared-types';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import { recupererTicket } from '../../../features/tickets/repository/tickets-repository';
import {
  LIBELLES_COMPLEXITE,
  LIBELLES_STATUT,
} from '../../../features/tickets/components/ticket-card';
import { LIBELLES_MOTIFS } from '../../../features/tickets/actions/ticket-action-state';

export async function generateMetadata({ params }: PageProps<'/tickets/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const client = await createServerSupabaseClient();
  const ticket = await recupererTicket(client, id);

  return { title: ticket ? `${ticket.titre} — SchemaVibe` : 'Ticket introuvable — SchemaVibe' };
}

export default async function TicketDetailPage({ params }: PageProps<'/tickets/[id]'>) {
  const { id } = await params;
  const client = await createServerSupabaseClient();
  const ticket = await recupererTicket(client, id);

  // Un ticket invisible pour la RLS est introuvable, et non « interdit » : on ne
  // révèle pas son existence (même choix qu'en SV-003).
  if (!ticket) {
    notFound();
  }

  const conformite = evaluerDefinitionOfReady({
    contexte: ticket.contexte,
    criteres_acceptation: ticket.criteres_acceptation,
    critere_test: ticket.critere_test,
    complexite: ticket.complexite,
    source: ticket.source,
    score_confiance: ticket.score_confiance,
    nombre_patterns_suggeres: ticket.patterns_suggeres.length,
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <nav>
        <Link href="/tickets" className="text-sm opacity-70 hover:underline">
          ← Tous les tickets
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{ticket.titre}</h1>
        <p className="text-sm opacity-70">
          <span data-testid="ticket-statut">{LIBELLES_STATUT[ticket.statut]}</span>
          {ticket.projet ? (
            <>
              {' · '}
              <Link href={`/projets/${ticket.projet.id}`} className="hover:underline">
                {ticket.projet.nom}
              </Link>
            </>
          ) : null}
          {ticket.complexite ? ` · ${LIBELLES_COMPLEXITE[ticket.complexite]}` : null}
        </p>
      </header>

      {ticket.statut === 'brouillon' && !conformite.pret ? (
        <section
          data-testid="definition-of-ready"
          className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm"
        >
          <p className="font-medium">Ce brouillon ne réunit pas encore la Definition of Ready.</p>
          <ul className="list-disc pl-5">
            {conformite.motifs.map((motif) => (
              <li key={motif}>{LIBELLES_MOTIFS[motif]}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Section titre="Contexte" contenu={ticket.contexte} testId="ticket-contexte" />
      <Section
        titre="Critères d’acceptation"
        contenu={ticket.criteres_acceptation}
        testId="ticket-criteres"
      />
      <Section titre="Critère de test" contenu={ticket.critere_test} testId="ticket-critere-test" />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Patterns suggérés</h2>
        {ticket.patterns_suggeres.length === 0 ? (
          <p className="text-sm opacity-60">Aucun pattern suggéré.</p>
        ) : (
          <ul data-testid="ticket-patterns" className="flex flex-col gap-2">
            {ticket.patterns_suggeres.map((pattern) => (
              <li
                key={pattern.id}
                className="rounded border border-black/10 px-3 py-2 text-sm dark:border-white/15"
              >
                <span className="font-medium">{pattern.nom}</span>
                <span className="opacity-60"> · {pattern.categorie}</span>
                {pattern.principe ? (
                  <span className="block text-xs opacity-70">{pattern.principe}</span>
                ) : null}
                {pattern.cas_usage ? (
                  <span className="block text-xs opacity-50">
                    Cas d’usage : {pattern.cas_usage}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Section({
  titre,
  contenu,
  testId,
}: {
  titre: string;
  contenu: string | null;
  testId: string;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-sm font-medium">{titre}</h2>
      {contenu ? (
        <p data-testid={testId} className="text-sm whitespace-pre-line opacity-90">
          {contenu}
        </p>
      ) : (
        <p className="text-sm opacity-50">Non renseigné.</p>
      )}
    </section>
  );
}
