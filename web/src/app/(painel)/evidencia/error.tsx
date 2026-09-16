"use client";

import { RotateCcw } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";

/** No Next 16 a funcao de recuperacao e `retry()`: ela refaz a leitura do
 *  segmento. `reset()` so limparia o estado do limite de erro sem buscar nada. */
export default function ErroEvidencia({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Evidência"
        descricao="O que a IA faz, com que dado ela aprendeu e o que aconteceu quando foi conferida contra grama de verdade."
      />

      <Aviso
        tom="critical"
        titulo="Não foi possível montar a evidência"
        acao={
          <Botao variante="secundario" iconeEsquerda={<RotateCcw />} onClick={retry}>
            Tentar novamente
          </Botao>
        }
      >
        <p>
          A leitura de <code className="font-mono">ia.validacoes</code> e{" "}
          <code className="font-mono">ia.validacao_pares</code> falhou. Tente de novo; se insistir,
          confira as variáveis do Supabase em <code className="font-mono">.env.local</code> e se o
          projeto está no ar.
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
