import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '../../../lib/supabase/server';

/**
 * Point d'atterrissage des connexions qui passent par un aller-retour externe :
 * magic link reçu par e-mail, et retour d'un fournisseur OAuth.
 *
 * Le code à usage unique reçu en paramètre est échangé ici contre une session,
 * côté serveur, ce qui pose les cookies sans jamais exposer le jeton au
 * navigateur.
 */

/**
 * Origine à laquelle renvoyer le visiteur.
 *
 * `new URL(request.url).origin` rend l'hôte interne du serveur — `localhost` —
 * et non celui que le visiteur a dans sa barre d'adresse. Rediriger vers cette
 * origine-là déplacerait la session sur un domaine différent : les cookies
 * posés juste avant ne seraient pas renvoyés, et la connexion échouerait en
 * silence. Le même écart se produit derrière un proxy en production, d'où la
 * lecture des en-têtes transmis.
 */
function origineDuVisiteur(request: NextRequest): string {
  const hote = request.headers.get('x-forwarded-host') ?? request.headers.get('host');

  if (!hote) {
    return new URL(request.url).origin;
  }

  // À défaut d'en-tête transmis, le protocole de la requête reçue fait foi —
  // `http` en local, `https` derrière un proxy qui n'annoncerait rien.
  const protocole =
    request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');

  return `${protocole}://${hote}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origine = origineDuVisiteur(request);
  const code = searchParams.get('code');
  const destination = searchParams.get('next') ?? '/projets';

  // `next` vient de l'URL : il ne doit pouvoir désigner qu'un chemin interne,
  // sans quoi le callback deviendrait une redirection ouverte.
  const destinationSure =
    destination.startsWith('/') && !destination.startsWith('//') ? destination : '/projets';

  if (!code) {
    return NextResponse.redirect(`${origine}/connexion?erreur=lien_invalide`);
  }

  const client = await createServerSupabaseClient();
  const { error } = await client.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origine}/connexion?erreur=lien_expire`);
  }

  return NextResponse.redirect(`${origine}${destinationSure}`);
}
