// Prueba de lib/recordatorios.ts: node scripts/probar-recordatorios.mjs
import assert from 'node:assert/strict'
import { avisoQueToca } from '../lib/recordatorios.ts'

const lima = (s) => Date.parse(`${s}-05:00`)
const nada = { recordatorio_24h_at: null, recordatorio_dia_at: null }
const ahora = lima('2026-11-08T10:00:00')

assert.equal(avisoQueToca('2026-11-09T09:00:00-05:00', nada, ahora), '24h', 'mañana dentro de 24 h')
assert.equal(avisoQueToca('2026-11-09T11:00:00-05:00', nada, ahora), null, 'más de 24 h: todavía no')
assert.equal(avisoQueToca('2026-11-08T15:00:00-05:00', nada, ahora), 'dia', 'hoy: el del mismo día')
assert.equal(avisoQueToca('2026-11-08T15:00:00-05:00', { ...nada, recordatorio_dia_at: 'x' }, ahora), null, 'ya enviado')
assert.equal(avisoQueToca('2026-11-09T09:00:00-05:00', { ...nada, recordatorio_24h_at: 'x' }, ahora), null, 'ya enviado 24 h')
assert.equal(avisoQueToca('2026-11-08T09:00:00-05:00', nada, ahora), null, 'ya pasó')
assert.equal(avisoQueToca('2026-11-09T06:00:00-05:00', nada, lima('2026-11-08T22:30:00')), null, 'de noche no se envía')
assert.equal(avisoQueToca('2026-11-09T09:00:00-05:00', nada, lima('2026-11-08T23:59:00')), null, 'de noche no se envía')
assert.equal(avisoQueToca('2026-11-09T09:00:00-05:00', nada, lima('2026-11-09T08:00:00')), 'dia', 'a primera hora del día de la cita')
console.log('recordatorios: 9 casos ok')
