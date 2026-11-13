export default function LayoutAcceso({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#012147_0%,#0f3466_60%,#0b6b52_100%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="flex items-center justify-center gap-1.5 font-titulo text-3xl font-bold text-white">
            DepaHost
            <span aria-hidden className="size-2.5 rounded-full bg-[#3ddc97]" />
          </p>
          <p className="mt-1 text-sm text-[#cfe0f0]">Panel de seguimiento</p>
        </div>
        <div className="rounded-2xl bg-card p-6">{children}</div>
      </div>
    </main>
  )
}
