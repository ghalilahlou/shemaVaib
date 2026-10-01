import type { NextConfig } from 'next';

/**
 * En-têtes de sécurité servis sur toutes les routes (SV-022).
 *
 * Ce sont ceux qui ne dépendent ni de l'hébergeur ni du contenu des pages. Une
 * politique de sécurité de contenu (CSP) viendra avec la Vibe Security Gate :
 * mal calibrée, elle casserait le Realtime ou les polices sans prévenir, et
 * elle mérite ses propres tests.
 */
export const EN_TETES_DE_SECURITE = [
  // Aucune page de la plateforme n'a à s'afficher dans le cadre d'un autre site :
  // c'est la parade au détournement de clic sur les boutons de réclamation.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Les identifiants de tickets et de projets figurent dans les chemins ; ils ne
  // partent pas vers les sites tiers liés depuis un ticket.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Ignoré en http, il impose https une fois servi en https. Sans
  // `includeSubDomains` : le domaine n'est pas encore choisi, et ce choix
  // engagerait ses sous-domaines pour deux ans.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
] as const;

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: [...EN_TETES_DE_SECURITE] }]);
  },
};

export default nextConfig;
