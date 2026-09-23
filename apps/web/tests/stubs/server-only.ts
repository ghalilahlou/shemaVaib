// Neutralise le paquet `server-only` sous Vitest.
//
// `server-only` lève une erreur dès qu'il est importé hors du runtime React
// Server Components. Le garde-fou reste entier pour l'application — le build
// Next.js échouerait toujours si un composant client importait le repository —
// mais les tests d'intégration doivent pouvoir charger ces modules directement.
export {};
