// Aplica las migraciones pendientes de supabase/migrations a la base de DATABASE_URL.
// Registra cada una en supabase_migrations.schema_migrations, la misma tabla que usa la CLI de Supabase.
// Uso: npm run db:migrar
import postgres from 'postgres'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env.local'))
} catch {
  // Sin .env.local se usan las variables del entorno
}

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en .env.local (cadena "Session pooler" del botón Connect de Supabase).')
  process.exit(1)
}

const dir = path.resolve(import.meta.dirname, '..', 'supabase', 'migrations')
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, onnotice: () => {} })

try {
  await sql`create schema if not exists supabase_migrations`
  await sql`create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text
  )`
  const aplicadas = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version))
  const archivos = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  let nuevas = 0
  for (const archivo of archivos) {
    const [version, ...resto] = archivo.replace(/\.sql$/, '').split('_')
    if (aplicadas.has(version)) continue
    const contenido = await readFile(path.join(dir, archivo), 'utf8')
    process.stdout.write(`Aplicando ${archivo}... `)
    await sql.begin(async (tx) => {
      await tx.unsafe(contenido)
      await tx`insert into supabase_migrations.schema_migrations (version, statements, name)
               values (${version}, ${[contenido]}, ${resto.join('_')})`
    })
    console.log('listo')
    nuevas++
  }
  console.log(nuevas ? `${nuevas} migraciones aplicadas.` : 'La base ya está al día.')
} catch (e) {
  console.error(`\nError: ${e.message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
