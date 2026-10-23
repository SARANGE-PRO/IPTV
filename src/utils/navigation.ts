/**
 * Retour arriere fiable en PWA installee : ouverte directement sur une page
 * (lien, reouverture de l'app), l'historique est vide et `router.back()` ne
 * fait rien — il faut alors aller vers une page de repli.
 */
export function canGoBack(): boolean {
  return typeof window !== 'undefined' && window.history.length > 1;
}
