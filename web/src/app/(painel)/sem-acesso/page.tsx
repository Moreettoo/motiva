import type { Metadata } from "next";
import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { classesBotao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/vazio";
import { rotaInicial } from "@/lib/auth/permissoes";
import { exigirSessao } from "@/lib/auth/sessao";
import { CARGO } from "@/lib/dominio";

export const metadata: Metadata = { title: "Sem acesso" };

export default async function PaginaSemAcesso() {
  const sessao = await exigirSessao();
  return (
    <div className="mx-auto max-w-xl py-16">
      <EstadoVazio
        icone={<ShieldOff />}
        titulo="Esta tela não faz parte do seu acesso"
        descricao={`Você entrou como ${CARGO[sessao.cargo].rotulo}: ${CARGO[sessao.cargo].descricao}. Se precisar desta tela, peça a um administrador.`}
        acao={
          <Link href={rotaInicial(sessao.cargo)} className={classesBotao("primario", "sm")}>
            Voltar ao início
          </Link>
        }
      />
    </div>
  );
}
