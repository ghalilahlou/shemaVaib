import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Rafraîchit la session Supabase à chaque requête (convention `proxy` de Next 16).
 *
 * Un Server Component ne peut pas écrire de cookie : sans ce middleware, un
 * jeton d'accès expiré ne serait jamais renouvelé et l'utilisateur serait
 * déconnecté en silence au bout d'une heure. C'est ici, et seulement ici, que
 * les cookies de session sont réécrits.
 */
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser` valide le jeton auprès du serveur d'authentification, contrairement
  // à `getSession` qui se contente de lire le cookie. C'est cet appel qui
  // déclenche le renouvellement quand le jeton a expiré.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf les fichiers statiques et les images, qui n'ont
     * aucune raison de déclencher un rafraîchissement de session.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
