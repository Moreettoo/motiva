"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";

export default function ErroCopiloto({
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
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Copiloto"
        descricao="A tela não conseguiu ler a malha para montar o contexto da pergunta."
      />

      <Aviso
        tom="critical"
        titulo="Não foi possível carregar o copiloto"
        className="max-w-[68ch]"
        acao={
          <Botao variante="secundario" onClick={() => retry()} iconeEsquerda={<RotateCcw />}>
            Tentar novamente
          </Botao>
        }
      >
        <p>
          A leitura de trechos e agendamentos falhou, então não dá para dizer sobre o que o copiloto
          responderia. Tente de novo; se repetir, confira se o Supabase está acessível e se a
          <span className="font-mono"> SUPABASE_SERVICE_KEY </span>
          está preenchida no <span className="font-mono">.env.local</span>.
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
