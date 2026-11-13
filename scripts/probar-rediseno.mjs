// Regresiones del rediseño que no tienen prueba de navegador: revisa en el código fuente los patrones que
// causaron fallas. shortcut: comprueba el código, no el comportamiento; cambiar a pruebas con React Testing
// Library si se agrega un entorno de pruebas de componentes.
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const raiz = path.resolve(import.meta.dirname, '..')
const leer = (r) => readFile(path.join(raiz, r), 'utf8')
const pruebas = []
const prueba = (nombre, fn) => pruebas.push([nombre, fn])

prueba('Casilla se vuelve a montar cuando cambia el valor guardado (Radix ignora el defaultChecked nuevo al reiniciar)', async () => {
  const s = await leer('components/campos.tsx')
  assert.match(s, /<Checkbox\s+key=\{String\(props\.defaultChecked/)
})

prueba('Los botones de subir archivos no envían el formulario que los contiene', async () => {
  const s = await leer('components/subir-archivos.tsx')
  const botones = s.match(/<Button\b[^>]*>/g) ?? []
  assert.ok(botones.length > 0)
  for (const b of botones) assert.match(b, /type="button"/, b)
})

prueba('El ancho de los diálogos se fija desde sm, para no perder el margen en el celular', async () => {
  const usos = []
  for (const carpeta of ['app', 'components']) {
    for (const e of await readdir(path.join(raiz, carpeta), { recursive: true })) {
      if (e.endsWith('.tsx') && (await leer(path.join(carpeta, e))).includes('ancho="max-w-')) usos.push(e)
    }
  }
  assert.deepEqual(usos, [])
})

prueba('El aviso de éxito se muestra al recibir el resultado, aunque el diálogo se desmonte', async () => {
  const s = await leer('components/formulario.tsx')
  const efecto = s.slice(s.indexOf('useEffect(() => {\n    if (estado?.ok)'))
  assert.match(s, /useActionState\(\s*async[^]*?toast\.success/)
  assert.doesNotMatch(efecto.slice(0, efecto.indexOf('}, [')), /toast/)
})

prueba('Tocar el logo dentro del menú del celular lo cierra', async () => {
  const s = await leer('components/navegacion.tsx')
  assert.match(s, /<SheetTitle[^>]*>\s*<Logo\s+alNavegar=\{\(\) => setAbierto\(false\)\}/)
})

let fallas = 0
for (const [nombre, fn] of pruebas) {
  try {
    await fn()
    console.log(`  ok  ${nombre}`)
  } catch (e) {
    fallas++
    console.log(`  FALLA  ${nombre}\n        ${e.message.split('\n')[0]}`)
  }
}
console.log(`\n${pruebas.length - fallas} de ${pruebas.length} pasaron`)
process.exit(fallas ? 1 : 0)
