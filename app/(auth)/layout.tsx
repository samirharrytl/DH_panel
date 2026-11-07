export default function LayoutAcceso({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-marino-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-semibold tracking-tight text-white">DepaHost</p>
          <p className="text-sm text-marino-200">Panel de seguimiento</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-flotante">{children}</div>
      </div>
    </main>
  )
}
