'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '../../../lib/supabase/server';
import {
  ajouterDependance,
  creerJalon,
  DependanceError,
  rattacherTicket,
  supprimerDependance,
  supprimerJalon,
} from '../repository/milestones-repository';
import { dependanceFormSchema, milestoneFormSchema, rattachementSchema } from '../schema';
import {
  MESSAGE_AUTHENTIFICATION_REQUISE_JALON,
  MESSAGE_DEPENDANCE_AUTRE_PROJET,
  MESSAGE_DEPENDANCE_CYCLIQUE,
  MESSAGE_DEPENDANCE_REFUSEE,
  MESSAGE_FORMULAIRE_JALON_INVALIDE,
  MESSAGE_JALON_REFUSE,
  type MilestoneActionState,
} from './milestone-action-state';

/**
 * Server Actions des jalons.
 *
 * Elles orchestrent, la base arbitre : la RLS décide qui a le droit d'écrire, et
 * les triggers refusent une dépendance cyclique ou inter-projets. Ces actions se
 * contentent de valider la saisie et de traduire le refus en message utile.
 */

async function session() {
  const client = await createServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  return { client, user };
}

export async function creerJalonAction(
  _etatPrecedent: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const { client, user } = await session();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE_JALON,
      erreursChamps: {},
    };
  }

  const resultat = milestoneFormSchema.safeParse({
    projet_id: formData.get('projet_id') ?? '',
    theme: formData.get('theme') ?? '',
    date_cible: formData.get('date_cible') ?? '',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_JALON_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await creerJalon(client, resultat.data);
  } catch {
    return { statut: 'erreur', message: MESSAGE_JALON_REFUSE, erreursChamps: {} };
  }

  revalidatePath(`/projets/${resultat.data.projet_id}/jalons`);

  return { statut: 'succes', message: 'Jalon créé.' };
}

export async function supprimerJalonAction(
  _etatPrecedent: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const { client, user } = await session();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE_JALON,
      erreursChamps: {},
    };
  }

  const jalonId = String(formData.get('jalon_id') ?? '');
  const projetId = String(formData.get('projet_id') ?? '');

  await supprimerJalon(client, jalonId);
  revalidatePath(`/projets/${projetId}/jalons`);

  return { statut: 'succes', message: 'Jalon supprimé.' };
}

/** Rattache un ticket à un jalon, ou l'en détache quand `jalon_id` est vide. */
export async function rattacherTicketAction(
  _etatPrecedent: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const { client, user } = await session();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE_JALON,
      erreursChamps: {},
    };
  }

  const jalonBrut = String(formData.get('jalon_id') ?? '');
  const resultat = rattachementSchema.safeParse({
    ticket_id: formData.get('ticket_id') ?? '',
    jalon_id: jalonBrut === '' ? null : jalonBrut,
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_JALON_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const modifie = await rattacherTicket(client, resultat.data.ticket_id, resultat.data.jalon_id);

  if (!modifie) {
    return { statut: 'erreur', message: MESSAGE_JALON_REFUSE, erreursChamps: {} };
  }

  revalidatePath(`/projets/${String(formData.get('projet_id') ?? '')}/jalons`);
  revalidatePath(`/tickets/${resultat.data.ticket_id}`);

  return {
    statut: 'succes',
    message: resultat.data.jalon_id ? 'Ticket rattaché au jalon.' : 'Ticket détaché du jalon.',
  };
}

export async function ajouterDependanceAction(
  _etatPrecedent: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const { client, user } = await session();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE_JALON,
      erreursChamps: {},
    };
  }

  const resultat = dependanceFormSchema.safeParse({
    ticket_id: formData.get('ticket_id') ?? '',
    bloque_par_id: formData.get('bloque_par_id') ?? '',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_JALON_INVALIDE,
      erreursChamps: resultat.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await ajouterDependance(client, resultat.data);
  } catch (erreur) {
    const message =
      erreur instanceof DependanceError && erreur.motif === 'cycle'
        ? MESSAGE_DEPENDANCE_CYCLIQUE
        : erreur instanceof DependanceError && erreur.motif === 'projets_differents'
          ? MESSAGE_DEPENDANCE_AUTRE_PROJET
          : MESSAGE_DEPENDANCE_REFUSEE;

    return { statut: 'erreur', message, erreursChamps: {} };
  }

  revalidatePath(`/tickets/${resultat.data.ticket_id}`);

  return { statut: 'succes', message: 'Dépendance ajoutée.' };
}

export async function supprimerDependanceAction(
  _etatPrecedent: MilestoneActionState,
  formData: FormData,
): Promise<MilestoneActionState> {
  const { client, user } = await session();

  if (!user) {
    return {
      statut: 'erreur',
      message: MESSAGE_AUTHENTIFICATION_REQUISE_JALON,
      erreursChamps: {},
    };
  }

  const resultat = dependanceFormSchema.safeParse({
    ticket_id: formData.get('ticket_id') ?? '',
    bloque_par_id: formData.get('bloque_par_id') ?? '',
  });

  if (!resultat.success) {
    return {
      statut: 'erreur',
      message: MESSAGE_FORMULAIRE_JALON_INVALIDE,
      erreursChamps: {},
    };
  }

  await supprimerDependance(client, resultat.data);
  revalidatePath(`/tickets/${resultat.data.ticket_id}`);

  return { statut: 'succes', message: 'Dépendance retirée.' };
}
