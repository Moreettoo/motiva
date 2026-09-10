import { Marca } from "@/components/shell/marca";

/** Moldura das telas sem sessao: entrar, convite, senha. Sem Shell, sem dados. */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Marca tamanho={28} comTexto />
          <p className="text-sm text-ink-3">Regulação de solo · Motiva</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6" style={{ boxShadow: "var(--shadow-md)" }}>
          {children}
        </div>
      </div>
    </main>
  );
}
