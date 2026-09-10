"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";

export default function ErroUsuarios({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Falha ao montar a tela de usuários:", error);
  }, [error]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina titulo="Usuários" descricao="Quem acessa o HighwAI, e com que cargo." />

      <Aviso
        tom="critical"
        titulo="Não foi possível carregar os usuários"
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
          A leitura dos perfis, dos convites ou das equipes falhou. Tente de novo: se o erro voltar,
          confira se o banco está acessível e se a chave secreta do Supabase está no ambiente.
        </p>

        {error.digest ? (
          <p className="tnum mt-2 font-mono text-2xs text-ink-3">Código do erro: {error.digest}</p>
        ) : null}
      </Aviso>
    </div>
  );
}
