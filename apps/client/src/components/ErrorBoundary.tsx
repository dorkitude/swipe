import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

async function reportError(error: string, componentStack?: string) {
  try {
    await fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error,
        componentStack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    });
  } catch (e) {
    // Silently fail if reporting fails
  }
}

// Set up global error handler
if (typeof window !== 'undefined') {
  window.onerror = (message, source, lineno, colno, error) => {
    const errorMsg = `${message} at ${source}:${lineno}:${colno}`;
    console.error('[Global Error]', errorMsg, error);
    reportError(errorMsg);
    return false;
  };

  window.onunhandledrejection = (event) => {
    const errorMsg = `Unhandled Promise Rejection: ${event.reason}`;
    console.error('[Unhandled Rejection]', errorMsg);
    reportError(errorMsg);
  };
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[React Error Boundary]', error, errorInfo);
    reportError(error.toString(), errorInfo.componentStack || undefined);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          textAlign: 'center',
        }}>
          <h1 style={{ color: '#ff6b6b', marginBottom: '16px' }}>Something went wrong</h1>
          <p style={{ color: '#888', marginBottom: '24px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#4ecdc4',
              color: '#1a1a2e',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600,
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
