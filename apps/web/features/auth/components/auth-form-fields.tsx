'use client';

/**
 * Briques communes aux formulaires d'authentification.
 *
 * Les trois formulaires — inscription, connexion, magic link — partagent la même
 * présentation des champs et des erreurs ; les factoriser évite qu'ils dérivent
 * les uns des autres.
 */

export function ChampTexte({
  nom,
  id = nom,
  label,
  type = 'text',
  autoComplete,
  required = true,
  aide,
  erreurs,
}: {
  /** Nom du champ dans le `FormData`, lu par la Server Action. */
  nom: string;
  /**
   * Identifiant DOM, distinct du nom quand deux formulaires de la même page
   * portent un champ homonyme — l'adresse e-mail sur la page de connexion, par
   * exemple. Deux `id` identiques rattacheraient les deux libellés au même
   * champ, et le second formulaire resterait vide.
   */
  id?: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  required?: boolean;
  aide?: string;
  erreurs?: string[] | undefined;
}) {
  const idAide = aide ? `${id}-aide` : undefined;
  const idErreur = erreurs?.length ? `${id}-erreur` : undefined;
  const describedBy = [idAide, idErreur].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={nom}
        type={type}
        required={required}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={erreurs?.length ? true : undefined}
        className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
      />
      {aide ? (
        <p id={idAide} className="text-xs opacity-60">
          {aide}
        </p>
      ) : null}
      {erreurs?.length ? (
        <p id={idErreur} className="text-sm text-red-600 dark:text-red-400">
          {erreurs.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

export function MessageAlerte({ message }: { message: string }) {
  return (
    <p
      role="alert"
      data-testid="auth-erreur"
      className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm"
    >
      {message}
    </p>
  );
}

export function MessageSucces({ message }: { message: string }) {
  return (
    <p
      role="status"
      data-testid="auth-succes"
      className="rounded-md border border-green-600/40 bg-green-600/5 px-3 py-2 text-sm"
    >
      {message}
    </p>
  );
}

export function BoutonSoumettre({ enCours, libelle }: { enCours: boolean; libelle: string }) {
  return (
    <button
      type="submit"
      disabled={enCours}
      className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
    >
      {enCours ? 'Un instant…' : libelle}
    </button>
  );
}
