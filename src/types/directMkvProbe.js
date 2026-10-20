"use strict";
/**
 * Sonde « lecture directe d'un MKV » (etape 2 de la coquille HTTP) : peut-on
 * lire un MKV DANS Safari sans passerelle, en le remuxant cote client vers
 * MediaSource ? Trois conditions : fetch direct autorise (CORS + Range),
 * conteneur Matroska lisible, codecs decodables par l'appareil.
 *
 * Rapport ANONYME (invariant #4) : jamais d'URL, d'hote ni d'identifiant —
 * uniquement des metadonnees structurelles (codecs, resolution, langues).
 */
Object.defineProperty(exports, "__esModule", { value: true });
