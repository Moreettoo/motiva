"use client";

import { RotateCcw } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";

/** No Next 16 a função de recuperação é `retry()` — ela refaz a leitura do
 *  segmento. `reset()` só limparia o estado do limite de erro sem buscar nada. */
export default function ErroMalha({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Malha"
        descricao="Onde a vegetação está perto do limite ao longo de cada rodovia."
      />

      <Aviso
        tom="critical"
        titulo="Não foi possível carregar a malha"
        acao={
          <Botao variante="secundario" iconeEsquerda={<RotateCcw />} onClick={retry}>
            Tentar novamente
          </Botao>
        }
      >
        <p>
          A leitura de <code className="font-mono">ia.vw_trecho_status</code> falhou. Tente de novo;
          se insistir, confira as variáveis do Supabase em <code className="font-mono">.env.local</code>{" "}
          e se o projeto está no ar.
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
