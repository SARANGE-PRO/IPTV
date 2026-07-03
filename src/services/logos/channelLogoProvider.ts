import type { LiveChannel } from '@/types/models';

/**
 * Abstraction de resolution de logo de chaine — point d'extension unique.
 *
 * Source actuelle : `stream_icon` fourni par le panel Xtream de l'utilisateur
 * (deja normalise en `logoUrl`). C'est la seule source legale et sans requete
 * supplementaire disponible aujourd'hui.
 *
 * Sources futures possibles (a brancher ici, jamais en masse sur 55k chaines,
 * toujours a la demande + cache Dexie) :
 *  - jeu de logos ouvert type "tv-logos" (matching par nom/pays) ;
 *  - service EPG fournissant des logos officiels sous licence.
 * Tant qu'aucune source fiable/legale n'est retenue, on ne fait AUCUN appel
 * externe : fallback monogramme (voir composant ChannelLogo).
 */

export interface LogoResolution {
  url: string | null;
  source: 'xtream' | 'none';
}

export function resolveChannelLogo(channel: Pick<LiveChannel, 'logoUrl'>): LogoResolution {
  if (channel.logoUrl !== null && channel.logoUrl !== '') {
    return { url: channel.logoUrl, source: 'xtream' };
  }
  return { url: null, source: 'none' };
}
