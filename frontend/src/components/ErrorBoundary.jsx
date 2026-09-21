import { RotateCcw } from 'lucide-react';
import { Component } from 'react';

/**
 * Keeps one broken view from taking the whole dashboard down.
 *
 * Without this, a single render error anywhere leaves a blank screen with no way
 * back — the dock included. Here the failure stays inside the panel that caused
 * it, and everything else keeps working.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Left in the console on purpose: this is the one place a crash is visible.
    console.error('Pulse view error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Navigating away from a broken view clears it.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="theme-card flex max-w-md flex-col items-center gap-3 rounded-3xl px-8 py-7 text-center">
          <p className="display-type text-lg font-light text-moon">This panel hit a snag</p>
          <p className="text-xs leading-5 text-moon/50">
            {String(error?.message || error).slice(0, 200)}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="soft-button mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-moon/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
