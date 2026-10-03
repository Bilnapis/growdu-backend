export function isAllowedFrontendOrigin(
  origin: string,
  allowedOrigins: readonly string[],
  nodeEnv: string,
): boolean {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return nodeEnv === 'development' && isLocalDevelopmentOrigin(origin);
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

    return (
      url.protocol === 'http:' &&
      localHosts.has(url.hostname) &&
      url.port.length > 0
    );
  } catch {
    return false;
  }
}
