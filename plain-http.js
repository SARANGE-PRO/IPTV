// Coquille HTTP pure (charge UNIQUEMENT quand NEXT_PUBLIC_PLAIN_HTTP=1).
// Si la page a ete ouverte en https:// (upgrade automatique de Safari, lien
// copie, saisie manuelle), on repasse en http:// : en https, les flux video
// HTTP du serveur Xtream seraient bloques (mixed-content).
(function () {
  if (window.location.protocol !== 'https:') return;
  var l = window.location;
  l.replace('http://' + l.host + l.pathname + l.search + l.hash);
})();
