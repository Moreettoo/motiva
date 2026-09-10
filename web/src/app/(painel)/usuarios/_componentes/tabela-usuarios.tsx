"use client";

import { CircleCheck, CircleSlash, UserPlus, Users } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Chip } from "@/components/ui/chip";
import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { EstadoVazio } from "@/components/ui/vazio";
import { IconeDominio } from "@/components/viz/legenda";
import { CARGO } from "@/lib/dominio";
import { relativoEmDias } from "@/lib/format";

import type { Eu, PerfilNaTela } from "./gestao-usuarios";
import { IconeCargo } from "./icone-cargo";

export function TabelaUsuarios({
  perfis,
  eu,
  aoAbrir,
  selecionadoId,
  aoConvidar,
}: {
  perfis: PerfilNaTela[];
  eu: Eu;
  aoAbrir: (usuarioId: string) => void;
  selecionadoId: string | null;
  aoConvidar: () => void;
}) {
  if (perfis.length === 0) {
    return (
      <EstadoVazio
        icone={<Users />}
        titulo="Só você por aqui"
        descricao="Ninguém mais tem acesso ao HighwAI. Convide quem precisa entrar."
        acao={
          <Botao variante="primario" tamanho="sm" iconeEsquerda={<UserPlus />} onClick={aoConvidar}>
            Convidar alguém
          </Botao>
        }
      />
    );
  }

  return (
    <Tabela rotulo="Usuários">
      <TabelaCabecalho>
        <TabelaLinha>
          <TabelaTitulo>Nome</TabelaTitulo>
          <TabelaTitulo>Cargo</TabelaTitulo>
          <TabelaTitulo>Equipe liderada</TabelaTitulo>
          <TabelaTitulo>Situação</TabelaTitulo>
          <TabelaTitulo>Último acesso</TabelaTitulo>
        </TabelaLinha>
      </TabelaCabecalho>

      <TabelaCorpo>
        {perfis.map((p) => {
          const cargo = CARGO[p.cargo];
          const souEu = p.usuario_id === eu.usuarioId;

          return (
            <TabelaLinha
              key={p.usuario_id}
              selecionada={p.usuario_id === selecionadoId}
              // A linha inteira é o alvo: a gaveta é a única ação da tabela, e
              // um botão "abrir" em cada linha só repetiria isso cinco vezes.
              onClick={() => aoAbrir(p.usuario_id)}
              onKeyDown={(evento) => {
                if (evento.key !== "Enter" && evento.key !== " ") return;
                evento.preventDefault();
                aoAbrir(p.usuario_id);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Abrir ${p.nome}`}
              className="cursor-pointer"
            >
              <TabelaCelula>
                <span className="block font-medium text-ink">
                  {p.nome}
                  {souEu ? <span className="font-normal text-ink-3"> (você)</span> : null}
                </span>
                <span className="block text-xs text-ink-3">{p.email}</span>
              </TabelaCelula>

              <TabelaCelula>
                <Chip icone={<IconeCargo cargo={p.cargo} />}>{cargo.rotulo}</Chip>
              </TabelaCelula>

              <TabelaCelula>
                {p.equipe_liderada ? (
                  p.equipe_liderada.nome
                ) : p.cargo === "rocador" ? (
                  <Chip tom="warning" icone={<IconeDominio nome="TriangleAlert" />}>
                    sem equipe
                  </Chip>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </TabelaCelula>

              <TabelaCelula>
                {p.ativo ? (
                  <Chip tom="good" icone={<CircleCheck />}>
                    Ativo
                  </Chip>
                ) : (
                  <Chip tom="neutro" icone={<CircleSlash />}>
                    Desativado
                  </Chip>
                )}
              </TabelaCelula>

              <TabelaCelula>
                {p.ultimo_acesso_em ? (
                  relativoEmDias(p.ultimo_acesso_em)
                ) : (
                  <span className="text-ink-3">nunca entrou</span>
                )}
              </TabelaCelula>
            </TabelaLinha>
          );
        })}
      </TabelaCorpo>
    </Tabela>
  );
}
