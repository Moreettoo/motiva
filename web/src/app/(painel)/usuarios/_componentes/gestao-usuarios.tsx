"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";

import { Botao } from "@/components/ui/botao";
import { useNotificacao } from "@/components/ui/notificacoes";
import type { Resultado } from "@/lib/resultado";
import type { Cargo, Convite, Perfil } from "@/lib/types";

import { ConvitesPendentes } from "./convites-pendentes";
import { PainelConvidar } from "./painel-convidar";
import { PainelUsuario } from "./painel-usuario";
import { TabelaUsuarios } from "./tabela-usuarios";

export type PerfilNaTela = Perfil & { equipe_liderada: { id: number; nome: string } | null };
export type ConviteNaTela = Convite & { convidador_nome: string; equipe_nome: string | null };
export type EquipeOpcao = { id: number; nome: string; lider_nome: string | null };
export type Eu = { usuarioId: string; cargo: Cargo };

/** O que `executar` faz com o desfecho de uma action. */
export type Opcoes<T> = {
  aoConcluir?: (dados: T) => void;
  /** Presente = o erro aparece NA superfície de quem chamou, e o toast fica
   *  calado: gaveta com um `Aviso` em cima do formulário mais um toast no canto
   *  são dois canais narrando o mesmo erro. */
  aoFalhar?: (erro: string) => void;
};

export type Executar = <T>(nome: string, fn: () => Promise<Resultado<T>>, opcoes?: Opcoes<T>) => void;

export function GestaoUsuarios({
  perfis,
  convites,
  equipes,
  superAdminsAtivos,
  eu,
}: {
  perfis: PerfilNaTela[];
  convites: ConviteNaTela[];
  equipes: EquipeOpcao[];
  superAdminsAtivos: number;
  eu: Eu;
}) {
  const router = useRouter();
  const { mostrar } = useNotificacao();
  const [pendente, iniciar] = useTransition();

  // Gaveta aberta e usuário selecionado vivem na URL: o gestor manda o link do
  // usuário para outro administrador e a tela abre no mesmo lugar.
  const [convidar, setConvidar] = useQueryState("convidar", parseAsBoolean.withDefault(false));
  const [usuarioAberto, setUsuarioAberto] = useQueryState("usuario", parseAsString);

  const executar = useCallback<Executar>(
    (nome, fn, opcoes) => {
      iniciar(async () => {
        const resultado = await fn();
        if (!resultado.ok) {
          if (opcoes?.aoFalhar) opcoes.aoFalhar(resultado.erro);
          // Erro de permissão ou de banco não desaparece sozinho da tela.
          else mostrar({ tom: "critical", titulo: nome, descricao: resultado.erro, duracao: 0 });
          return;
        }
        opcoes?.aoConcluir?.(resultado.dados);
        mostrar({ tom: "good", titulo: nome });
        router.refresh();
      });
    },
    [mostrar, router],
  );

  const selecionado = perfis.find((p) => p.usuario_id === usuarioAberto) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-3">
          Acesso é por convite: não existe cadastro aberto nesta aplicação.
        </p>
        <Botao
          variante="primario"
          iconeEsquerda={<UserPlus />}
          onClick={() => void setConvidar(true)}
        >
          Convidar
        </Botao>
      </div>

      {convites.length > 0 ? (
        <ConvitesPendentes convites={convites} executar={executar} pendente={pendente} />
      ) : null}

      <TabelaUsuarios
        perfis={perfis}
        eu={eu}
        aoAbrir={(id) => void setUsuarioAberto(id)}
        selecionadoId={usuarioAberto}
        aoConvidar={() => void setConvidar(true)}
      />

      <PainelConvidar
        aberto={convidar}
        aoFechar={() => void setConvidar(null)}
        equipes={equipes}
        eu={eu}
        executar={executar}
        pendente={pendente}
      />

      <PainelUsuario
        perfil={selecionado}
        aoFechar={() => void setUsuarioAberto(null)}
        equipes={equipes}
        eu={eu}
        superAdminsAtivos={superAdminsAtivos}
        executar={executar}
        pendente={pendente}
      />
    </div>
  );
}
