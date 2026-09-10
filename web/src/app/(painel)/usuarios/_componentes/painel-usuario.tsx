"use client";

import { useState } from "react";
import { CircleSlash, RotateCcw, Save, UserCog } from "lucide-react";

import { Botao } from "@/components/ui/botao";
import { Campo, Selecao } from "@/components/ui/campo";
import { Leitura } from "@/components/ui/leitura";
import { PainelLateral } from "@/components/ui/painel-lateral";
import { motivoParaNaoAlterar } from "@/lib/auth/permissoes";
import { CARGO } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import {
  alterarCargo,
  alterarEquipeLiderada,
  desativarUsuario,
  reativarUsuario,
} from "@/lib/usuarios/acoes";
import { CARGOS, type Cargo } from "@/lib/types";

import type { EquipeOpcao, Eu, Executar, PerfilNaTela } from "./gestao-usuarios";

type PropsGaveta = {
  equipes: EquipeOpcao[];
  eu: Eu;
  superAdminsAtivos: number;
  executar: Executar;
  pendente: boolean;
  aoFechar: () => void;
};

/**
 * Guarda o último perfil aberto para a gaveta poder SAIR animada: o perfil vem
 * da URL, e sem isto ele fica nulo no mesmo quadro em que a gaveta começa a
 * fechar, deixando um painel vazio deslizando para fora.
 */
export function PainelUsuario({ perfil, ...props }: PropsGaveta & { perfil: PerfilNaTela | null }) {
  const [ultimo, setUltimo] = useState<PerfilNaTela | null>(perfil);
  if (perfil && perfil !== ultimo) setUltimo(perfil);

  const alvo = perfil ?? ultimo;
  if (!alvo) return null;

  // `key`: trocar de pessoa na tabela sem fechar a gaveta remonta os campos com
  // os dados dela, sem efeito de sincronizacao.
  return <Gaveta key={alvo.usuario_id} perfil={alvo} aberta={perfil != null} {...props} />;
}

function Gaveta({
  perfil,
  aberta,
  aoFechar,
  equipes,
  eu,
  superAdminsAtivos,
  executar,
  pendente,
}: PropsGaveta & { perfil: PerfilNaTela; aberta: boolean }) {
  const [cargo, setCargo] = useState<Cargo>(perfil.cargo);
  const [equipeId, setEquipeId] = useState<string>(
    perfil.equipe_liderada ? String(perfil.equipe_liderada.id) : "",
  );
  const [substituirLider, setSubstituirLider] = useState(false);
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false);

  const base = {
    autorId: eu.usuarioId,
    autorCargo: eu.cargo,
    alvoId: perfil.usuario_id,
    alvoCargo: perfil.cargo,
    alvoAtivo: perfil.ativo,
    superAdminsAtivos,
  };

  // A mesma função que o servidor chama, com os dados que a tela tem: o botão
  // desabilitado e a recusa da action dizem a MESMA frase.
  const motivoCargo = motivoParaNaoAlterar({ ...base, novoCargo: cargo, desativar: false });
  const motivoDesativar = motivoParaNaoAlterar({ ...base, novoCargo: null, desativar: true });
  const motivoReativar = motivoParaNaoAlterar({ ...base, novoCargo: null, desativar: false });

  const cargosPossiveis = CARGOS.filter((c) => c !== "super_admin" || eu.cargo === "super_admin");
  const equipeEscolhida = equipes.find((e) => String(e.id) === equipeId) ?? null;
  const outroLider =
    equipeEscolhida?.lider_nome != null && equipeEscolhida.id !== perfil.equipe_liderada?.id;

  return (
    <PainelLateral
      aberto={aberta}
      aoFechar={aoFechar}
      titulo={perfil.nome}
      descricao={perfil.email}
      largura="sm"
      rodape={
        <Botao variante="fantasma" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <Campo rotulo="Cargo" dica={motivoCargo ?? CARGO[cargo].descricao}>
            <Selecao value={cargo} onChange={(e) => setCargo(e.target.value as Cargo)}>
              {cargosPossiveis.map((c) => (
                <option key={c} value={c}>
                  {CARGO[c].rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>
          <div>
            <Botao
              tamanho="sm"
              variante="secundario"
              iconeEsquerda={<UserCog />}
              disabled={pendente || motivoCargo != null || cargo === perfil.cargo}
              onClick={() => executar("Cargo alterado", () => alterarCargo(perfil.usuario_id, cargo))}
            >
              Alterar cargo
            </Botao>
          </div>
        </section>

        {perfil.cargo === "rocador" ? (
          <section className="flex flex-col gap-3">
            <Campo rotulo="Equipe liderada" dica="Uma equipe tem exatamente um líder.">
              <Selecao
                value={equipeId}
                onChange={(e) => {
                  setEquipeId(e.target.value);
                  setSubstituirLider(false);
                }}
              >
                <option value="">Nenhuma</option>
                {equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lider_nome ? `${e.nome} · líder: ${e.lider_nome}` : `${e.nome} · sem líder`}
                  </option>
                ))}
              </Selecao>
            </Campo>

            {outroLider ? (
              <label className="flex items-start gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={substituirLider}
                  onChange={(e) => setSubstituirLider(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
                <span>substituir o líder atual ({equipeEscolhida?.lider_nome})</span>
              </label>
            ) : null}

            <div>
              <Botao
                tamanho="sm"
                variante="secundario"
                iconeEsquerda={<Save />}
                disabled={pendente || (outroLider && !substituirLider)}
                onClick={() =>
                  executar("Equipe gravada", () =>
                    alterarEquipeLiderada(
                      perfil.usuario_id,
                      equipeId === "" ? null : Number(equipeId),
                      substituirLider,
                    ),
                  )
                }
              >
                Gravar
              </Botao>
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3 border-t border-border pt-5">
          {perfil.ativo ? (
            <>
              <p className="text-xs text-ink-3">
                {motivoDesativar ??
                  "Desativar bloqueia o acesso na próxima requisição e solta a equipe liderada. Ninguém é excluído."}
              </p>
              <div className="flex flex-wrap gap-2">
                {confirmandoDesativar ? (
                  <>
                    <Botao
                      tamanho="sm"
                      variante="perigo"
                      disabled={pendente}
                      onClick={() => {
                        setConfirmandoDesativar(false);
                        executar("Acesso desativado", () => desativarUsuario(perfil.usuario_id));
                      }}
                    >
                      Confirmar desativação
                    </Botao>
                    <Botao
                      tamanho="sm"
                      variante="fantasma"
                      onClick={() => setConfirmandoDesativar(false)}
                    >
                      Manter acesso
                    </Botao>
                  </>
                ) : (
                  <Botao
                    tamanho="sm"
                    variante="perigo"
                    iconeEsquerda={<CircleSlash />}
                    disabled={pendente || motivoDesativar != null}
                    onClick={() => setConfirmandoDesativar(true)}
                  >
                    Desativar acesso
                  </Botao>
                )}
              </div>
            </>
          ) : (
            <>
              {motivoReativar ? <p className="text-xs text-ink-3">{motivoReativar}</p> : null}
              <div>
                <Botao
                  tamanho="sm"
                  variante="secundario"
                  iconeEsquerda={<RotateCcw />}
                  disabled={pendente || motivoReativar != null}
                  onClick={() => executar("Acesso reativado", () => reativarUsuario(perfil.usuario_id))}
                >
                  Reativar
                </Botao>
              </div>
            </>
          )}
        </section>

        <section className="grid grid-cols-2 gap-4 border-t border-border pt-5">
          <Leitura rotulo="Entrou no sistema" valor={fmt.dataMedia(perfil.criado_em)} />
          <Leitura
            rotulo="Último acesso"
            valor={perfil.ultimo_acesso_em ? fmt.dataMedia(perfil.ultimo_acesso_em) : "nunca entrou"}
          />
          {perfil.desativado_em ? (
            <Leitura rotulo="Desativado em" valor={fmt.dataMedia(perfil.desativado_em)} />
          ) : null}
        </section>
      </div>
    </PainelLateral>
  );
}
