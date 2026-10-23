import type { LiveSection } from '@/types/liveLineup';
import type { ChannelTheme } from '@/utils/channelTheme';

/**
 * Referentiel des chaines francaises (et francophones) connues : section
 * d'affichage, theme, numero TNT, rang editorial. Module PUR (donnees +
 * matcher), teste en Node.
 *
 * Les motifs s'appliquent a la cle COMPACTE d'une chaine (voir
 * `referenceKey` dans services/live/channelNormalizer) : nom sans prefixe
 * pays ni tag qualite, minuscules sans accents, « + » ecrit « plus »,
 * « sports » ramene a « sport », puis alphanumerique pur.
 *   « FR| CANAL+ SPORT 360 FHD » -> canalplussport360
 *   « FR: beIN SPORTS 1 ᴴᴰ »     -> beinsport1
 *
 * L'ORDRE du tableau est l'ordre d'affichage dans chaque section (hors TNT,
 * triee par numero). Le premier motif qui correspond gagne : les motifs
 * precis doivent preceder les « fourre-tout » de leur famille.
 *
 * Numerotation TNT : plan Arcom en vigueur depuis le 6 juin 2025 (France 4
 * en 4, LCP en 8, bloc info 13-16, T18, Novo19 ; Canal+, C8 et NRJ 12 ont
 * quitte la TNT). Mettre ce fichier a jour = incrementer LINEUP_VERSION
 * (services/live/frenchLineupService) pour reclasser sans resynchroniser.
 */

export interface FrenchChannelRef {
  match: RegExp;
  /** Nom d'affichage (`$1` = 1re capture). Absent : nom fournisseur nettoye. */
  name?: string;
  section: LiveSection;
  /** Absent : theme detecte par mots-cles. */
  theme?: ChannelTheme;
  lcn?: number;
  foot?: boolean;
  /** Pays d'une chaine francophone etrangere (RTL-TVI -> BE). */
  country?: string;
}

export interface FrenchChannelMatch {
  /** Position dans le referentiel = rang editorial dans la section. */
  rank: number;
  name: string | null;
  section: LiveSection;
  theme: ChannelTheme | null;
  lcn: number | null;
  foot: boolean;
  country: string | null;
}

type Opts = Pick<FrenchChannelRef, 'theme' | 'foot' | 'country'>;

const tnt = (lcn: number, name: string, theme: ChannelTheme, match: RegExp, foot = false): FrenchChannelRef => ({
  match,
  name,
  section: 'tnt',
  theme,
  lcn,
  foot,
});

const ref =
  (section: LiveSection, defaults: Opts = {}) =>
  (match: RegExp, name?: string, opts: Opts = {}): FrenchChannelRef => ({
    match,
    ...(name !== undefined ? { name } : {}),
    section,
    ...defaults,
    ...opts,
  });

const canal = ref('canal');
const sport = ref('sport', { theme: 'sport' });
const news = ref('news', { theme: 'news' });
const cinema = ref('cinema', { theme: 'cinema' });
const series = ref('series', { theme: 'entertainment' });
const kids = ref('kids', { theme: 'kids' });
const doc = ref('doc', { theme: 'doc' });
const music = ref('music', { theme: 'music' });
const regions = ref('regions');
const other = ref('other');
const be = ref('francophonie', { country: 'BE' });
const ch = ref('francophonie', { country: 'CH' });
const ca = ref('francophonie', { country: 'CA' });
const af = ref('francophonie', { country: 'AF' });
const intl = ref('francophonie');

export const FRENCH_CHANNELS: readonly FrenchChannelRef[] = [
  // --- TNT (plan Arcom 2025) ---------------------------------------------------
  tnt(1, 'TF1', 'entertainment', /^tf1$/),
  tnt(2, 'France 2', 'entertainment', /^france2$/),
  tnt(3, 'France 3', 'entertainment', /^france3$/),
  tnt(4, 'France 4', 'entertainment', /^france4$/),
  tnt(5, 'France 5', 'doc', /^france5$/),
  tnt(6, 'M6', 'entertainment', /^m6$/),
  tnt(7, 'Arte', 'doc', /^arte$/),
  tnt(8, 'LCP', 'news', /^lcp(an|assembleenationale)?$/),
  tnt(8, 'Public Sénat', 'news', /^(lcp)?publicsenat$/),
  tnt(9, 'W9', 'entertainment', /^w9$/),
  tnt(10, 'TMC', 'entertainment', /^tmc$/),
  tnt(11, 'TFX', 'entertainment', /^tfx$/),
  tnt(12, 'Gulli', 'kids', /^gulli$/),
  tnt(13, 'BFMTV', 'news', /^bfmtv$/),
  tnt(14, 'CNews', 'news', /^cnews$/),
  tnt(15, 'LCI', 'news', /^lci$/),
  tnt(16, 'franceinfo', 'news', /^franceinfo(tv)?$/),
  tnt(17, 'CStar', 'music', /^cstar$/),
  tnt(18, 'T18', 'entertainment', /^t18$/),
  tnt(19, 'Novo19', 'entertainment', /^novo19$/),
  tnt(20, 'TF1 Séries Films', 'cinema', /^tf1series?films?$/),
  tnt(21, "L'Équipe", 'sport', /^(lachaine)?lequipe(tv|21)?$|^equipe21$/, true),
  tnt(22, '6ter', 'entertainment', /^6ter$/),
  tnt(23, 'RMC Story', 'entertainment', /^rmcstory$/),
  tnt(24, 'RMC Découverte', 'doc', /^rmcdecouverte$/),
  tnt(25, 'Chérie 25', 'entertainment', /^cherie25$/),
  tnt(25, 'RMC Life', 'entertainment', /^rmclife$/),
  tnt(26, 'Paris Première', 'entertainment', /^parispremiere$/),

  // --- Canal+ (toute la famille) -------------------------------------------------
  canal(/^canalplus$/, 'Canal+', { theme: 'cinema', foot: true }),
  canal(/^canalplusfoot$/, 'Canal+ Foot', { theme: 'sport', foot: true }),
  canal(/^canalplussport$/, 'Canal+ Sport', { theme: 'sport', foot: true }),
  canal(/^canalplus(sport)?360$/, 'Canal+ Sport 360', { theme: 'sport', foot: true }),
  canal(/^canalpluspremierleague$/, 'Canal+ Premier League', { theme: 'sport', foot: true }),
  canal(/^canalplus(f1|formula1|formule1)$/, 'Canal+ F1', { theme: 'sport' }),
  canal(/^canalplusmotogp$/, 'Canal+ MotoGP', { theme: 'sport' }),
  canal(/^canalplusrugby$/, 'Canal+ Rugby', { theme: 'sport' }),
  canal(/^canalplusgolf$/, 'Canal+ Golf', { theme: 'sport' }),
  canal(/^canalpluslive(\d+)$/, 'Canal+ Live $1', { theme: 'sport', foot: true }),
  canal(/^canalpluscinemas?$/, 'Canal+ Cinéma(s)', { theme: 'cinema' }),
  canal(/^canalplusgrandecran$/, 'Canal+ Grand Écran', { theme: 'cinema' }),
  canal(/^canalplusboxoffice$/, 'Canal+ Box Office', { theme: 'cinema' }),
  canal(/^canalplusseries?$/, 'Canal+ Séries', { theme: 'entertainment' }),
  canal(/^canalplusdocs?$/, 'Canal+ Docs', { theme: 'doc' }),
  canal(/^canalpluskids$/, 'Canal+ Kids', { theme: 'kids' }),
  canal(/^canalplusdecale$/, 'Canal+ Décalé', { theme: 'cinema' }),
  canal(/^canalplus.+$/),

  // --- Sport --------------------------------------------------------------------
  sport(/^bein(?:sport)?([123])$/, 'beIN Sports $1', { foot: true }),
  sport(/^bein(?:sport)?max(\d+)$/, 'beIN Sports Max $1', { foot: true }),
  sport(/^bein.*$/, undefined, { foot: true }),
  sport(/^rmcsport([1-4])$/, 'RMC Sport $1', { foot: true }),
  sport(/^rmcsportlive(\d+)$/, 'RMC Sport Live $1', { foot: true }),
  sport(/^rmcsport.*$/, undefined, { foot: true }),
  sport(/^ligue1plus$/, 'Ligue 1+', { foot: true }),
  sport(/^ligue1plus(\d+)$/, 'Ligue 1+ $1', { foot: true }),
  sport(/^dazn(\d*)$/, 'DAZN $1', { foot: true }),
  sport(/^dazn.+$/, undefined, { foot: true }),
  sport(/^eurosport([12])$/, 'Eurosport $1'),
  sport(/^eurosport.*$/),
  sport(/^lequipelive(\d*)$/, "L'Équipe Live $1", { foot: true }),
  sport(/^infosportplus$/, 'Infosport+'),
  sport(/^sportenfrance$/, 'Sport en France'),
  sport(/^automoto(lachaine)?$/, 'Automoto'),
  sport(/^golfplus$/, 'Golf+'),
  sport(/^golfchannel$/, 'Golf Channel'),
  sport(/^equidia.*$/),
  sport(/^multisport(\d+)$/, 'Multisports $1'),
  sport(/^motorsporttv$/, 'Motorsport TV'),
  sport(/^extremesport$/, 'Extreme Sports'),
  sport(/^(ol|om|psg)tv$/, undefined, { foot: true }),

  // --- Info ---------------------------------------------------------------------
  news(/^france24$/, 'France 24'),
  news(/^bfmbusiness$/, 'BFM Business'),
  news(/^bfm2$/, 'BFM2'),
  news(/^i24(news)?$/, 'i24NEWS'),
  news(/^euronews$/, 'Euronews'),
  news(/^lefigaro(tv|live)?$/, 'Le Figaro TV'),
  news(/^rtfrance$/, 'RT France'),

  // --- Cinema -------------------------------------------------------------------
  cinema(/^cinepluspremier$/, 'Ciné+ Premier'),
  cinema(/^cineplusfrisson$/, 'Ciné+ Frisson'),
  cinema(/^cineplusemotion$/, 'Ciné+ Émotion'),
  cinema(/^cineplusfamiz$/, 'Ciné+ Famiz'),
  cinema(/^cineplusclub$/, 'Ciné+ Club'),
  cinema(/^cineplusclassic$/, 'Ciné+ Classic'),
  cinema(/^cineplusfestival$/, 'Ciné+ Festival'),
  cinema(/^cineplusocs$/, 'Ciné+ OCS'),
  cinema(/^cineplus$/, 'Ciné+'),
  cinema(/^cineplus.+$/),
  cinema(/^ocsmax$/, 'OCS Max'),
  cinema(/^ocscity$/, 'OCS City'),
  cinema(/^ocschoc$/, 'OCS Choc'),
  cinema(/^ocsgeants$/, 'OCS Géants'),
  cinema(/^ocs.*$/),
  cinema(/^tcm(cinema)?$/, 'TCM Cinéma'),
  cinema(/^paramount(channel)?$/, 'Paramount Channel'),
  cinema(/^action$/, 'Action'),
  cinema(/^polarplus$/, 'Polar+'),
  cinema(/^sundance(tv)?$/, 'Sundance TV'),

  // --- Series & divertissement ---------------------------------------------------
  series(/^serieclub$/, 'Série Club'),
  series(/^13(eme|e|ieme)?rue$/, '13ème Rue'),
  series(/^syfy$/, 'Syfy'),
  series(/^warnertv$/, 'Warner TV'),
  series(/^warnertvnext$/, 'Warner TV Next'),
  series(/^paramountnetwork$/, 'Paramount Network'),
  series(/^teva$/, 'Téva'),
  series(/^rtl9$/, 'RTL9'),
  series(/^ab1$/, 'AB1'),
  series(/^comedieplus$/, 'Comédie+'),
  series(/^comedycentral$/, 'Comedy Central'),
  series(/^tvbreizh$/, 'TV Breizh'),
  series(/^novelas(tv)?$/, 'Novelas TV'),
  series(/^e$/, 'E!'),
  series(/^mcm$/, 'MCM'),
  series(/^gameone$/, 'Game One'),
  series(/^jone$/, 'J-One'),
  series(/^ellegirl(tv)?$/, 'Elle Girl'),
  series(/^c8$/, 'C8'),
  series(/^nrj12$/, 'NRJ 12'),

  // --- Jeunesse -----------------------------------------------------------------
  kids(/^canalj$/, 'Canal J'),
  kids(/^tiji$/, 'TiJi'),
  kids(/^disney(channel)?$/, 'Disney Channel'),
  kids(/^disneyjunior$/, 'Disney Junior'),
  kids(/^disneyxd$/, 'Disney XD'),
  kids(/^nick(elodeon)?$/, 'Nickelodeon'),
  kids(/^nick(elodeon)?(jr|junior)$/, 'Nickelodeon Junior'),
  kids(/^nick(elodeon)?4?teen$/, 'Nickelodeon Teen'),
  kids(/^cartoonnetwork$/, 'Cartoon Network'),
  kids(/^cartoonito$/, 'Cartoonito'),
  kids(/^boomerang$/, 'Boomerang'),
  kids(/^boing$/, 'Boing'),
  kids(/^piwiplus$/, 'Piwi+'),
  kids(/^teletoonplus$/, 'Télétoon+'),
  kids(/^teletoonplus1$/, 'Télétoon+1'),
  kids(/^mangas$/, 'Mangas'),
  kids(/^okoo$/, 'Okoo'),
  kids(/^toonami$/, 'Toonami'),
  kids(/^babytv$/, 'Baby TV'),
  kids(/^ducktv$/, 'Duck TV'),

  // --- Decouverte ---------------------------------------------------------------
  doc(/^planeteplus$/, 'Planète+'),
  doc(/^planeteplus(crime|ci)$/, 'Planète+ Crime'),
  doc(/^planeteplus(aventure|ae|aeexperience)$/, 'Planète+ Aventure'),
  doc(/^planeteplus.+$/),
  doc(/^nationalgeographic(channel)?$/, 'National Geographic'),
  doc(/^nat(ional)?geo(graphic)?wild$/, 'Nat Geo Wild'),
  doc(/^discovery(channel)?$/, 'Discovery Channel'),
  doc(/^discoveryscience$/, 'Discovery Science'),
  doc(/^(investigationdiscovery|discoveryinvestigation|id)$/, 'Investigation Discovery'),
  doc(/^histoire(tv)?$/, 'Histoire TV'),
  doc(/^toutelhistoire$/, "Toute l'Histoire"),
  doc(/^ushuaia(tv)?$/, 'Ushuaïa TV'),
  doc(/^science(et)?vie(tv)?$/, 'Science & Vie TV'),
  doc(/^animaux$/, 'Animaux'),
  doc(/^animalplanet$/, 'Animal Planet'),
  doc(/^trek$/, 'Trek'),
  doc(/^seasons$/, 'Seasons'),
  doc(/^chasse(et)?peche$/, 'Chasse et Pêche'),
  doc(/^museum(tv)?$/, 'Museum TV'),
  doc(/^crimedistrict$/, 'Crime District'),
  doc(/^ultranature$/, 'Ultra Nature'),
  doc(/^myzen(tv)?$/, 'My Zen TV'),
  doc(/^montagne(tv)?$/, 'Montagne TV'),
  doc(/^history$/, 'History'),

  // --- Musique ------------------------------------------------------------------
  music(/^m6music$/, 'M6 Music'),
  music(/^nrjhits$/, 'NRJ Hits'),
  music(/^mtv(france)?$/, 'MTV'),
  music(/^mtvhits$/, 'MTV Hits'),
  music(/^traceurban$/, 'Trace Urban'),
  music(/^tracelatina$/, 'Trace Latina'),
  music(/^trace(caribbean|caraibes)$/, 'Trace Caribbean'),
  music(/^traceafrica$/, 'Trace Africa'),
  music(/^trace.+$/),
  music(/^mezzo$/, 'Mezzo'),
  music(/^mezzolive$/, 'Mezzo Live'),
  music(/^melody$/, 'Melody'),
  music(/^rfm(tv)?$/, 'RFM TV'),
  music(/^mcmtop$/, 'MCM Top'),
  music(/^clubbing(tv)?$/, 'Clubbing TV'),
  music(/^virginradio(tv)?$/, 'Virgin Radio TV'),
  music(/^funradio(tv)?$/, 'Fun Radio'),
  music(/^bblack.*$/),

  // --- Regions & Outre-mer --------------------------------------------------------
  regions(/^france3.+$/),
  regions(/^.+la1ere$|^la1ere.*$/),
  regions(/^bfm.+$/, undefined, { theme: 'news' }),
  regions(/^tv7(bordeaux)?$/, 'TV7 Bordeaux'),
  regions(/^via.+$/),
  regions(/^telegrenoble$/, 'TéléGrenoble'),
  regions(/^tvr(rennes)?$/, 'TVR'),
  regions(/^tebeo$/, 'Tébéo'),
  regions(/^alsace20$/, 'Alsace 20'),
  regions(/^8montblanc$/, '8 Mont-Blanc'),
  regions(/^tl7$/, 'TL7'),
  regions(/^idf1$/, 'IDF1'),
  regions(/^tvvendee$/, 'TV Vendée'),
  regions(/^maritima(tv)?$/, 'Maritima'),
  regions(/^weo(tv)?$/, 'Wéo'),

  other(/^kto$/, 'KTO'),

  // --- Francophonie ---------------------------------------------------------------
  intl(/^tv5(monde)?.*$/, 'TV5Monde'),
  be(/^rtltvi$/, 'RTL-TVI'),
  be(/^clubrtl$/, 'Club RTL'),
  be(/^plugrtl$/, 'Plug RTL'),
  be(/^(rtbf)?la(une|1)$/, 'La Une'),
  be(/^tipik$/, 'Tipik'),
  be(/^(rtbf)?la(trois|3)$/, 'La Trois'),
  be(/^ab3$/, 'AB3'),
  be(/^abxplore$/, 'ABXplore'),
  be(/^ln24$/, 'LN24'),
  be(/^bx1$/, 'BX1'),
  ch(/^rts(un|1)$/, 'RTS 1'),
  ch(/^rts(deux|2)$/, 'RTS 2'),
  ca(/^tva$/, 'TVA'),
  ca(/^tvasport(\d*)$/, 'TVA Sports $1', { theme: 'sport' }),
  ca(/^noovo$/, 'Noovo'),
  ca(/^(ici)?radiocanada(tele)?$/, 'ICI Radio-Canada'),
  ca(/^(ici)?rdi$/, 'ICI RDI', { theme: 'news' }),
  ca(/^telequebec$/, 'Télé-Québec'),
  ca(/^lcn$/, 'LCN', { theme: 'news' }),
  ca(/^rds(\d*|info)$/, undefined, { theme: 'sport' }),
  ca(/^canalvie$/, 'Canal Vie'),
  ca(/^seriesplus$/, 'Séries Plus'),
  ca(/^historia$/, 'Historia'),
  ca(/^canald$/, 'Canal D'),
  ca(/^superecran(\d*)$/, 'Super Écran $1'),
  af(/^africa24$/, 'Africa 24', { theme: 'news' }),
  af(/^africanews$/, 'Africanews', { theme: 'news' }),
  af(/^aplusivoire$/, 'A+ Ivoire'),
  af(/^rti(\d)?$/, 'RTI $1'),
  af(/^nollywood(tv)?$/, 'Nollywood TV'),
];

/** Rapproche une cle compacte du referentiel (null si chaine inconnue). */
export function matchFrenchChannel(compactKey: string): FrenchChannelMatch | null {
  for (let rank = 0; rank < FRENCH_CHANNELS.length; rank++) {
    const entry = FRENCH_CHANNELS[rank]!;
    const m = entry.match.exec(compactKey);
    if (m === null) continue;
    const name =
      entry.name !== undefined ? entry.name.replace('$1', m[1] ?? '').replace(/\s{2,}/g, ' ').trim() : null;
    return {
      rank,
      name,
      section: entry.section,
      theme: entry.theme ?? null,
      lcn: entry.lcn ?? null,
      foot: entry.foot ?? false,
      country: entry.country ?? null,
    };
  }
  return null;
}
