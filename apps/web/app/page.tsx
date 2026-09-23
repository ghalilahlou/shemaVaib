export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-sans text-3xl font-semibold tracking-tight">SchemaVibe</h1>
      <p className="text-base text-balance opacity-80">
        Des projets vivants exposent des tickets précis, que des développeurs résolvent avec
        l&apos;outil de vibe coding de leur choix, en s&apos;appuyant sur des patterns éprouvés et
        un contrôle qualité automatisé.
      </p>
      <p className="font-mono text-sm opacity-60">
        SV-000 — fondations techniques en place. Les fonctionnalités arrivent avec les tickets
        suivants.
      </p>
    </main>
  );
}
