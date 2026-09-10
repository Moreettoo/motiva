"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";

export default function ErroTrecho({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Não foi possível abrir o trecho"
        descricao="A leitura do banco falhou no meio do caminho. Nenhum dado foi alterado."
      />

      <Aviso
        tom="critical"
        titulo="Falha ao carregar os dados do trecho"
        acao={
          <>
            <Botao variante="primario" iconeEsquerda={<RefreshCw />} onClick={() => retry()}>
              Tentar novamente
            </Botao>
            <Link
              href="/malha"
              className="inline-flex h-9 items-center rounded-md border border-border bg-surface-2 px-4 text-sm font-medium text-ink hover:border-border-strong hover:bg-surface-3"
            >
              Voltar para a malha
            </Link>
          </>
        }
      >
        <p>
          Tente de novo: quase sempre é uma consulta que caiu sozinha. Se persistir, confirme que o
          Supabase está no ar e que a <code className="font-mono">SUPABASE_SERVICE_KEY</code> do
          servidor continua válida.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-ink-3">
            Código para o suporte: <span className="tnum font-mono">{error.digest}</span>
          </p>
        ) : null}
      </Aviso>
    </div>
  );
}
