import Link from 'next/link';
import type { Metadata } from 'next';
import { MotDePasseOublieForm } from '../../features/auth/components/mot-de-passe-oublie-form';

export const metadata: Metadata = {
  title: 'Mot de passe oublié — SchemaVibe',
};

export default function MotDePasseOubliePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm opacity-70">
          Indiquez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe.
        </p>
      </header>

      <MotDePasseOublieForm />

      <p className="text-sm opacity-70">
        <Link href="/connexion" className="underline">
          Retour à la connexion
        </Link>
      </p>
    </main>
  );
}
