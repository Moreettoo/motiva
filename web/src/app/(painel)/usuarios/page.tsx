import type { Metadata } from "next";

import { CabecalhoPagina, MetricaCabecalho } from "@/components/shell/cabecalho-pagina";
import { exigirCargo } from "@/lib/auth/sessao";
import { fmt } from "@/lib/format";
import {
  contarSuperAdminsAtivos,
  equipesParaConvite,
  listarConvitesPendentes,
  listarPerfis,
} from "@/lib/usuarios/queries";

import { GestaoUsuarios } from "./_componentes/gestao-usuarios";

export const metadata: Metadata = {
  title: "Usuários",
  description: "Quem acessa o HighwAI, com que cargo, e que equipe lidera. Convites por e-mail.",
};

export default async function PaginaUsuarios() {
  const sessao = await exigirCargo("super_admin", "admin");
  const [perfis, convites, equipes, superAdmins] = await Promise.all([
    listarPerfis(),
    listarConvitesPendentes(),
    equipesParaConvite(),
    contarSuperAdminsAtivos(),
  ]);

  const ativos = perfis.filter((p) => p.ativo).length;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Usuários"
        destaque
        metricas={
          <>
            <MetricaCabecalho rotulo="Ativos" valor={fmt.n(ativos)} />
            <MetricaCabecalho rotulo="Convites pendentes" valor={fmt.n(convites.length)} />
          </>
        }
      />
      <GestaoUsuarios
        perfis={perfis}
        convites={convites}
        equipes={equipes}
        superAdminsAtivos={superAdmins}
        eu={{ usuarioId: sessao.usuarioId, cargo: sessao.cargo }}
      />
    </div>
  );
}
