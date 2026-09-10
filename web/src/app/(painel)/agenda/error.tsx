"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";

export default function ErroAgenda({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Falha ao montar a agenda:", error);
  }, [error]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Agenda"
        descricao="O que cada equipe faz nas próximas semanas."
      />

      <Aviso
        tom="critical"
        titulo="Não foi possível carregar o plano de roçada"
        acao={
          <>
            <Botao variante="primario" iconeEsquerda={<RotateCcw />} onClick={() => retry()}>
              Tentar novamente
            </Botao>
            <Botao variante="secundario" onClick={() => window.location.reload()}>
              Recarregar a página
            </Botao>
          </>
        }
      >
        <p>
          A leitura dos agendamentos e das equipes falhou. Tente de novo: se o erro voltar, confira
          se o banco está acessível e se a chave de serviço do Supabase está no ambiente.
        </p>

        {error.digest ? (
          <p className="tnum mt-2 font-mono text-2xs text-ink-3">Código do erro: {error.digest}</p>
        ) : null}
      </Aviso>
    </div>
  );
}
