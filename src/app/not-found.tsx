import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-fg-faint">Erreur 404</p>
      <h1 className="text-2xl font-semibold text-fg">Page introuvable</h1>
      <Link
        href="/"
        className="mt-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Retour à l’accueil
      </Link>
    </main>
  );
}
