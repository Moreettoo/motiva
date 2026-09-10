import Link from "next/link";
import { Signpost } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { EstadoVazio } from "@/components/ui/vazio";

export default function TrechoNaoEncontrado() {
  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Trecho não encontrado"
        descricao="O endereço aponta para um trecho que não existe na malha monitorada."
      />

      <EstadoVazio
        icone={<Signpost />}
        titulo="Este trecho saiu da malha ou nunca esteve nela"
        descricao="O identificador do endereço não corresponde a nenhum trecho. Se você chegou por um link antigo, o trecho pode ter sido removido do monitoramento."
        acao={
          <Link
            href="/malha"
            className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-hover"
          >
            Ver todos os trechos
          </Link>
        }
      />
    </div>
  );
}
