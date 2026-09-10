import type { Metadata } from "next";
import Link from "next/link";
import { MailX } from "lucide-react";

import { classesBotao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/vazio";
import { CARGO } from "@/lib/dominio";
import { buscarConvitePorToken } from "@/lib/usuarios/convites";

import { FormularioAceite } from "./_componentes/formulario-aceite";

export const metadata: Metadata = { title: "Convite" };
export const dynamic = "force-dynamic";

const TEXTO: Record<string, { titulo: string; descricao: string }> = {
  expirado: {
    titulo: "Este convite expirou",
    descricao: "Convites valem 7 dias. Peça um novo a quem convidou você.",
  },
  revogado: {
    titulo: "Este convite foi cancelado",
    descricao: "Quem convidou você desfez o convite. Se for engano, peça outro.",
  },
  aceito: {
    titulo: "Este convite já foi usado",
    descricao: "A conta já existe. Entre com sua senha.",
  },
  inexistente: {
    titulo: "Convite não encontrado",
    descricao: "Confira se o link do e-mail veio inteiro.",
  },
};

export default async function PaginaConvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const achado = await buscarConvitePorToken(token);

  if (achado.situacao !== "valido" || !achado.convite) {
    const texto = TEXTO[achado.situacao];
    return (
      <EstadoVazio
        icone={<MailX />}
        titulo={texto.titulo}
        descricao={texto.descricao}
        acao={
          <Link href="/entrar" className={classesBotao("secundario", "sm")}>
            Ir para a tela de entrar
          </Link>
        }
      />
    );
  }

  return (
    <FormularioAceite
      token={token}
      email={achado.convite.email}
      cargoRotulo={CARGO[achado.convite.cargo].rotulo}
      equipeNome={achado.equipeNome}
      convidadorNome={achado.convidadorNome}
    />
  );
}
