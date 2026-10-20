"use strict";
/**
 * Lecture DIRECTE d'un MKV dans le navigateur (coquille HTTP, sans passerelle) :
 * le fichier est lu par fetch depuis l'appareil, demuxe (Matroska), remuxe en
 * MP4 fragmente et pousse dans MediaSource / ManagedMediaSource. Aucun decodage
 * en JavaScript : le decodeur materiel de l'appareil fait le travail.
 */
Object.defineProperty(exports, "__esModule", { value: true });
