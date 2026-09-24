import { createClient } from '@supabase/supabase-js';
import type { RefusSessionMcp, SessionMcp } from '@schemavibe/shared-types';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { empreinteDe, jetonPorteur } from '../../../../features/api-tokens/jeton';
import {
  marquerUsage,
  trouverJetonParEmpreinte,
} from '../../../../features/api-tokens/repository/api-tokens-repository';

/**
 * Échange d'un jeton personnel contre une session courte (SV-014).
 *
 * POURQUOI PASSER PAR LA PLATEFORME PLUTÔT QUE PAR SUPABASE DIRECTEMENT
 *
 * Le serveur MCP pourrait s'authentifier auprès de Supabase, mais il lui
 * faudrait alors détenir un mot de passe ou un jeton de rafraîchissement, l'un
 * et l'autre équivalents à une connexion permanente. Le jeton personnel, lui,
 * n'ouvre rien par lui-même : il est présenté ici, vérifié contre son empreinte,
 * et ne donne qu'un jeton d'accès de courte durée. Le révoquer ferme donc
 * réellement la porte, au plus tard à l'échéance en cours.
 *
 * POURQUOI UN LIEN À USAGE UNIQUE PLUTÔT QU'UN JETON FABRIQUÉ ICI
 *
 * Signer soi-même un jeton avec le secret du projet marcherait, et serait un
 * contournement complet de l'authentification en cas d'erreur d'une ligne.
 * Passer par `generateLink` puis `verifyOtp` produit une vraie session Supabase,
 * émise par le service dont c'est le métier : la RLS s'applique ensuite sans
 * qu'aucune règle d'autorisation n'ait été réécrite ici.
 *
 * Aucun jeton de rafraîchissement n'est rendu à l'appelant, et celui que
 * l'échange vient de créer est immédiatement invalidé : le seul survivant est le
 * jeton d'accès, qui expire de lui-même.
 */

/** Le corps d'échec, tel que le serveur MCP sait le lire. */
function refus(erreur: RefusSessionMcp['erreur'], message: string, statut: number): Response {
  return Response.json({ erreur, message } satisfies RefusSessionMcp, { status: statut });
}

export async function POST(request: Request): Promise<Response> {
  const jeton = jetonPorteur(request.headers.get('authorization'));

  if (!jeton) {
    return refus(
      'jeton_absent',
      'Présentez un jeton personnel dans l’en-tête Authorization, sous la forme « Bearer svb_… ».',
      401,
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clePublique = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !clePublique) {
    return refus('echange_impossible', 'La plateforme est mal configurée.', 500);
  }

  const admin = createAdminClient();
  const reconnu = await trouverJetonParEmpreinte(admin, empreinteDe(jeton));

  if (!reconnu) {
    return refus('jeton_inconnu', 'Ce jeton n’est pas reconnu.', 401);
  }

  if (reconnu.revoque_le) {
    return refus('jeton_revoque', 'Ce jeton a été révoqué. Émettez-en un nouveau.', 401);
  }

  const { data: compte, error: erreurCompte } = await admin.auth.admin.getUserById(
    reconnu.utilisateur_id,
  );

  if (erreurCompte || !compte.user?.email) {
    return refus('echange_impossible', 'Le compte rattaché à ce jeton est introuvable.', 401);
  }

  const { data: lien, error: erreurLien } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: compte.user.email,
  });

  if (erreurLien || !lien.properties?.hashed_token) {
    return refus('echange_impossible', 'La session n’a pas pu être ouverte.', 502);
  }

  const anonyme = createClient(url, clePublique, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: verification, error: erreurVerification } = await anonyme.auth.verifyOtp({
    type: 'magiclink',
    token_hash: lien.properties.hashed_token,
  });

  const session = verification?.session;

  if (erreurVerification || !session) {
    return refus('echange_impossible', 'La session n’a pas pu être ouverte.', 502);
  }

  // La session vient d'être créée côté Supabase avec son jeton de
  // rafraîchissement ; le fermer aussitôt ne touche pas au jeton d'accès, qui
  // est autoporteur, mais empêche qu'une session dormante reste ouverte à
  // chaque échange.
  await admin.auth.admin.signOut(session.access_token, 'local');

  await marquerUsage(admin, reconnu.id);

  const reponse: SessionMcp = {
    access_token: session.access_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    utilisateur: { id: reconnu.utilisateur_id, nom: reconnu.porteur_nom },
    supabase: { url, cle_publique: clePublique },
  };

  return Response.json(reponse, {
    // Un jeton d'accès n'a rien à faire dans un cache, d'aucune sorte.
    headers: { 'cache-control': 'no-store' },
  });
}
