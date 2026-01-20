export async function reportError(error: unknown, context?: string) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[${context || 'Error'}]`, error);

  try {
    await fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: errorMessage,
        stack,
        context,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    });
  } catch (e) {
    // Silently fail if reporting fails
  }
}
