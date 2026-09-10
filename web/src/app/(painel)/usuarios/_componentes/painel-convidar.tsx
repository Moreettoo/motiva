"use client";

import { useState } from "react";
import { Copy, Send } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { useNotificacao } from "@/components/ui/notificacoes";
import { PainelLateral } from "@/components/ui/painel-lateral";
import { podeConvidar } from "@/lib/auth/permissoes";
import { CARGO } from "@/lib/dominio";
import { convidarUsuario } from "@/lib/usuarios/acoes";
import { CARGOS, type Cargo } from "@/lib/types";

import type { EquipeOpcao, Eu, Executar } from "./gestao-usuarios";

type Criado = { link: string; emailEnviado: boolean; aviso: string | null };

type PropsConvite = {
  equipes: EquipeOpcao[];
  eu: Eu;
  executar: Executar;
  pendente: boolean;
  aoFechar: () => void;
};

/**
 * Fechar e reabrir e um convite NOVO. Quem zera os campos e a `key` do corpo,
 * que muda a cada abertura — nao um efeito de sincronizacao, que dispararia
 * render em cascata. A `key` nao muda ao FECHAR de proposito: o aviso "convite
 * criado", com o link, tem que continuar na tela enquanto a gaveta desliza.
 */
export function PainelConvidar({ aberto, ...props }: PropsConvite & { aberto: boolean }) {
  const [visivel, setVisivel] = useState(aberto);
  const [geracao, setGeracao] = useState(0);
  if (aberto !== visivel) {
    setVisivel(aberto);
    if (aberto) setGeracao((g) => g + 1);
  }

  return <Gaveta key={geracao} aberto={aberto} {...props} />;
}

function Gaveta({ aberto, aoFechar, equipes, eu, executar, pendente }: PropsConvite & { aberto: boolean }) {
  const { mostrar } = useNotificacao();
  const cargosPossiveis = CARGOS.filter((c) => podeConvidar(eu.cargo, c));

  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState<Cargo>("analista");
  const [equipeId, setEquipeId] = useState<string>("");
  const [substituirLider, setSubstituirLider] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<Criado | null>(null);

  const equipeEscolhida = equipes.find((e) => String(e.id) === equipeId) ?? null;
  const precisaEquipe = cargo === "rocador";

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      mostrar({ tom: "good", titulo: "Link copiado" });
    } catch {
      mostrar({
        tom: "critical",
        titulo: "O navegador não deixou copiar",
        descricao: "Selecione o endereço na tela e copie na mão.",
        duracao: 0,
      });
    }
  }

  function enviar() {
    setErro(null);
    executar(
      "Convite criado",
      () =>
        convidarUsuario({
          email,
          cargo,
          equipeId: precisaEquipe && equipeId !== "" ? Number(equipeId) : null,
          substituirLider,
        }),
      {
        aoConcluir: (dados) => setCriado(dados),
        aoFalhar: (mensagem) => setErro(mensagem),
      },
    );
  }

  return (
    <PainelLateral
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Convidar"
      descricao="A pessoa recebe um e-mail e define nome e senha ao aceitar."
      largura="sm"
      rodape={
        criado ? (
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
        ) : (
          <>
            <Botao
              variante="primario"
              carregando={pendente}
              iconeEsquerda={<Send />}
              onClick={enviar}
            >
              Enviar convite
            </Botao>
            <Botao variante="fantasma" onClick={aoFechar}>
              Cancelar
            </Botao>
          </>
        )
      }
    >
      {criado ? (
        <div className="flex flex-col gap-4">
          <Aviso
            tom="good"
            titulo="Convite criado"
            acao={
              <Botao
                tamanho="sm"
                variante="secundario"
                iconeEsquerda={<Copy />}
                onClick={() => void copiar(criado.link)}
              >
                Copiar link
              </Botao>
            }
          >
            <p className="font-mono text-2xs break-all text-ink-2">{criado.link}</p>
          </Aviso>

          {/* O link na tela é o corte mínimo: em modo de teste o Resend só
              entrega para o e-mail da própria conta. */}
          {!criado.emailEnviado ? (
            <Aviso tom="warning" titulo="O e-mail não saiu">
              <p>{criado.aviso ?? "O serviço de e-mail recusou o envio."}</p>
              <p className="mt-1">Mande o link por outro canal.</p>
            </Aviso>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {erro ? <Aviso tom="critical" titulo={erro} /> : null}

          <Campo rotulo="E-mail" obrigatorio>
            <Entrada
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Campo>

          <Campo rotulo="Cargo" dica={CARGO[cargo].descricao} obrigatorio>
            <Selecao
              value={cargo}
              onChange={(e) => {
                setCargo(e.target.value as Cargo);
                setSubstituirLider(false);
              }}
            >
              {cargosPossiveis.map((c) => (
                <option key={c} value={c}>
                  {CARGO[c].rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>

          {precisaEquipe ? (
            <>
              <Campo rotulo="Equipe que vai liderar" obrigatorio>
                <Selecao
                  value={equipeId}
                  onChange={(e) => {
                    setEquipeId(e.target.value);
                    setSubstituirLider(false);
                  }}
                >
                  <option value="">Escolha a equipe…</option>
                  {equipes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lider_nome ? `${e.nome} · líder: ${e.lider_nome}` : `${e.nome} · sem líder`}
                    </option>
                  ))}
                </Selecao>
              </Campo>

              {equipeEscolhida?.lider_nome ? (
                <label className="flex items-start gap-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={substituirLider}
                    onChange={(e) => setSubstituirLider(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                  />
                  <span>substituir o líder atual ({equipeEscolhida.lider_nome})</span>
                </label>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </PainelLateral>
  );
}
