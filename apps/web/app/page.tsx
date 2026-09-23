import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-6 py-16">
      <h1 className="font-sans text-3xl font-semibold tracking-tight">SchemaVibe</h1>
      <p className="text-base text-balance opacity-80">
        Des projets vivants exposent des tickets précis, que des développeurs résolvent avec
        l&apos;outil de vibe coding de leur choix, en s&apos;appuyant sur des patterns éprouvés et
        un contrôle qualité automatisé.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/projets"
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background"
        >
          Parcourir les projets
        </Link>
        <Link
          href="/projets/nouveau"
          className="rounded-md border border-black/15 px-4 py-2 text-sm dark:border-white/20"
        >
          Créer un projet
        </Link>
      </div>
    </main>
  );
}
