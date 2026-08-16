"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";

export default function ErroSimulador({
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
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
      <CabecalhoPagina
        titulo="Simulador"
        descricao="A simulação não chegou ao fim."
      />

      <Aviso
        tom="critical"
        titulo="Não foi possível simular"
        className="max-w-[68ch]"
        acao={
          <Botao variante="secundario" onClick={() => retry()} iconeEsquerda={<RotateCcw />}>
            Tentar novamente
          </Botao>
        }
      >
        <p>
          A página depende de três coisas para responder: o Open-Meteo (clima do ponto), o Supabase
          (trecho mais próximo, de onde saem a UF e o limite de referência) e o modelo exportado. A
          leitura da IA não entra nessa lista, quando só ela falha, o resto da tela continua de pé.
        </p>
        <p className="mt-2">
          Se repetir, confira a conexão e se a <span className="font-mono">SUPABASE_SERVICE_KEY</span>{" "}
          está preenchida. O Open-Meteo é gratuito e limita uso: um{" "}
          <span className="font-mono">429</span> some sozinho depois de alguns minutos.
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
