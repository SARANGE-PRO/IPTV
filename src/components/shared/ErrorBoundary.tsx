'use client';

import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Ecran de reprise ; `reset` remonte les enfants. */
  fallback: (reset: () => void) => ReactNode;
  /** Changer de valeur oublie l'erreur (ex. une autre fiche s'ouvre). */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Frontiere d'erreur LOCALE : les hotes montes dans le layout (fiches, lecteur)
 * echappent a `(app)/error.tsx` (qui ne couvre que les pages). Sans elle, un
 * plantage d'une fiche donnerait l'ecran blanc de Next, sans reprise.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    // Nom + message seulement (jamais d'URL de flux dans nos erreurs d'affichage).
    console.warn('[ZiBTV] plantage d’affichage', error.name, error.message);
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  private readonly reset = (): void => this.setState({ failed: false });

  render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
