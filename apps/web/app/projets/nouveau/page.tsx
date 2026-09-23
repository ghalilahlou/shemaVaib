import Link from 'next/link';
import type { Metadata } from 'next';
import { ProjectForm } from '../../../features/projects/components/project-form';

export const metadata: Metadata = {
  title: 'Nouveau projet — SchemaVibe',
};

export default function NewProjectPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-12">
      <nav>
        <Link href="/projets" className="text-sm opacity-70 hover:underline">
          ← Tous les projets
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau projet</h1>
        <p className="text-sm opacity-70">
          Un projet créé en brouillon n’est visible que de vous. Passez-le en « actif » quand vous
          voulez l’ouvrir aux contributeurs.
        </p>
      </header>

      <ProjectForm />
    </main>
  );
}
