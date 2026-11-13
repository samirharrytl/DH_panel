// Verifica que el rediseño no deje restos: emojis en la interfaz, etiquetas en mayúsculas,
// importaciones del kit viejo ni tokens de color viejos. Sale con 1 si encuentra algo.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..')
// Textos que se publican en redes o se envían a clientes: sus emojis son contenido, no interfaz
const EXCLUIDOS = new Set([path.join('app', '(panel)', 'difusion', 'texto.ts')])
const REGLAS = [
  ['emoji', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u],
  ['mayúsculas', /\buppercase\b/],
  ['kit legado', /@\/components\/legado/],
  ['token viejo', /\b(?:bg|text|border|ring|divide|outline|fill|stroke|from|to|via|accent|placeholder)-(?:marino|tinta|suave|tenue|borde|borde-suave|fondo)(?:-\d+)?\b|shadow-(?:tarjeta|flotante)\b/],
]

async function* archivos(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* archivos(p)
    else if (/\.tsx?$/.test(e.name)) yield p
  }
}

let hallazgos = 0
for (const carpeta of ['app', 'components']) {
  for await (const archivo of archivos(path.join(raiz, carpeta))) {
    const relativo = path.relative(raiz, archivo)
    if (EXCLUIDOS.has(relativo)) continue
    const lineas = (await readFile(archivo, 'utf8')).split('\n')
    lineas.forEach((linea, i) => {
      for (const [regla, patron] of REGLAS) {
        if (patron.test(linea)) {
          hallazgos++
          console.log(`${relativo}:${i + 1}  ${regla}  ${linea.trim().slice(0, 90)}`)
        }
      }
    })
  }
}
console.log(hallazgos ? `\n${hallazgos} restos del diseño anterior` : 'Sin restos del diseño anterior')
process.exit(hallazgos ? 1 : 0)
