'use client';

import { useEffect, useState } from 'react';

/**
 * Bascule entre les deux thèmes, pour la page de démonstration.
 *
 * Elle vit ici et non dans `components/ui/` : ce n'est pas un composant du
 * système de design, c'est l'outil qui permet de le regarder. Le thème sombre
 * étant le défaut, basculer consiste à poser ou retirer `data-theme="light"` sur
 * l'élément racine — exactement ce que fera plus tard une préférence
 * enregistrée.
 */
export function BasculeTheme() {
  const [clair, setClair] = useState(false);

  useEffect(() => {
    const racine = document.documentElement;

    if (clair) {
      racine.setAttribute('data-theme', 'light');
    } else {
      racine.removeAttribute('data-theme');
    }
  }, [clair]);

  return (
    <button
      type="button"
      data-testid="bascule-theme"
      onClick={() => {
        setClair((precedent) => !precedent);
      }}
      className="rounded-[var(--radius-md)] border px-[12px] py-[4px] font-mono text-xs"
      style={{
        borderColor: 'var(--border-strong)',
        backgroundColor: 'var(--surface-300)',
        color: 'var(--ink)',
      }}
    >
      {clair ? 'Thème clair' : 'Thème sombre'}
    </button>
  );
}
