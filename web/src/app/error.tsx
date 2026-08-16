"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { CodigoDoErro } from "@/components/ui/codigo-do-erro";

/**
 * O painel só falha por leitura do banco. A mensagem diz o que fazer, não só o
 * que quebrou: em produção o `message` vem genérico, e aí o `digest` é o que
 * casa a tela com a linha do log do servidor.
 */
export default function ErroPainel({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Falha ao montar o painel:", error);
  }, [error]);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Painel"
        descricao="Os números da malha não puderam ser lidos agora."
      />

      <Aviso
        tom="critical"
        titulo="Não foi possível carregar o painel"
        acao={
          <Botao variante="secundario" iconeEsquerda={<RotateCw />} onClick={() => retry()}>
            Tentar novamente
          </Botao>
        }
      >
        <p>
          A leitura do banco falhou. Tente de novo. Se o erro persistir, confira se{" "}
          <span className="font-mono">SUPABASE_URL</span> e{" "}
          <span className="font-mono">SUPABASE_SERVICE_KEY</span> estão preenchidas em{" "}
          <span className="font-mono">web/.env.local</span>, e se a view{" "}
          <span className="font-mono">ia.vw_trecho_status</span> existe no projeto.
        </p>

        <CodigoDoErro digest={error.digest} />
      </Aviso>
    </div>
  );
}
