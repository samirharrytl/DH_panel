// Resultado de una Server Action, compartido por servidor y cliente
export type Resultado = { ok: true; mensaje?: string; datos?: Record<string, unknown> } | { ok: false; error: string }
