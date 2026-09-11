"use client";

import { useState, type ReactNode } from "react";
import { CalendarClock, CircleCheck, CircleSlash, LoaderCircle, Ruler, ShieldCheck, Undo2 } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { ChipRisco } from "@/components/ui/chip";
import { PainelLateral } from "@/components/ui/painel-lateral";
import { acoesDisponiveis, terminal, type Acao } from "@/lib/chamados/maquina";
import { diasDeAtraso, estaAtrasado } from "@/lib/chamados/numero";
import type { ChamadoNaTela } from "@/lib/chamados/queries";
import { MOTIVO_ADIAMENTO, prioridadeExibida, textoDivergencia } from "@/lib/dominio";
import { fmt, relativoEmDias } from "@/lib/format";
import type {
  Cargo,
  ChamadoAdiamento,
  ChamadoEvento,
  ChamadoFoto,
} from "@/lib/types";

import { desde } from "./cartao-chamado";
import {
  FormularioAdiamento,
  FormularioAprovar,
  FormularioCancelar,
  FormularioDevolver,
  FormularioEncerrarAdmin,
  type EntradaAdiamento,
  type EntradaAprovar,
  type EntradaCancelar,
  type EntradaDevolver,
  type EntradaEncerrarAdmin,
} from "./formularios-decisao";
import { FotosAntesDepois } from "./fotos-antes-depois";
import { ChipChamado } from "./icones";
import { LinhaDoTempo } from "./linha-do-tempo";

export type DetalheChamado = ChamadoNaTela & {
  eventos: ChamadoEvento[];
  fotos: ChamadoFoto[];
  adiamento_pendente: ChamadoAdiamento | null;
};

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="min-w-0 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2.5 text-xs font-medium tracking-wider text-ink-3 uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

/** Par rótulo/valor das duas primeiras seções. Grade de duas colunas em vez de
 *  `<dl>` corrida: são pares curtos e o olho compara verticalmente. */
function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-2xs text-ink-3">{rotulo}</span>
      <span className="mt-0.5 block text-sm break-words text-ink">{children}</span>
    </div>
  );
}

const ROTULO_ACAO: Record<Acao, string> = {
  iniciar: "Iniciar",
  finalizar: "Finalizar",
  pedir_adiamento: "Pedir adiamento",
  aprovar: "Aprovar",
  devolver: "Devolver",
  decidir_adiamento: "Decidir adiamento",
  encerrar_admin: "Encerrar administrativamente",
  cancelar: "Cancelar chamado",
  informar_altura: "Informar altura",
};

type PropsCorpo = {
  detalhe: DetalheChamado;
  cargo: Cargo;
  hoje: string;
  agora: string;
  pendente: boolean;
  /** Recusa da última decisão. Vive AQUI, e não só no toast: a pilha de
   *  notificações nasce no canto inferior direito, que no desktop é
   *  exatamente onde a gaveta está — o toast de erro fica atrás dela e a
   *  pessoa vê o botão parar de girar sem nenhuma explicação. */
  erroDecisao: string | null;
  nomeDaEquipe: (id: number) => string;
  aoAprovar: (e: EntradaAprovar) => void;
  aoDevolver: (e: EntradaDevolver) => void;
  aoDecidirAdiamento: (e: EntradaAdiamento) => void;
  aoEncerrar: (e: EntradaEncerrarAdmin) => void;
  aoCancelar: (e: EntradaCancelar) => void;
  aoInformarAltura: (alturaCm: number) => void;
};

/**
 * A gaveta do chamado: tudo o que existe sobre uma ordem de roçada, e as
 * decisões que cabem no estado em que ela está.
 *
 * Quem decide quais botões aparecem é `acoesDisponiveis`, a mesma função pura
 * que o app de campo usa — e a cópia autoritativa da máquina vive em
 * `ia.registrar_evento_chamado`. Se as duas divergirem, o botão aparece e o
 * banco recusa: a tela erra do lado seguro.
 */
export function PainelChamado({
  detalhe,
  aberto,
  carregando,
  aoFechar,
  ...resto
}: Omit<PropsCorpo, "detalhe"> & {
  detalhe: DetalheChamado | null;
  aberto: boolean;
  /** O servidor está buscando o chamado do `?chamado=` recém-clicado. */
  carregando: boolean;
  aoFechar: () => void;
}) {
  return (
    <PainelLateral
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={detalhe?.numero ?? "Chamado"}
      descricao={
        detalhe
          ? `${detalhe.trecho.rodovia} · ${fmt.faixaKm(Number(detalhe.trecho.km_inicio), Number(detalhe.trecho.km_fim))} · ${detalhe.trecho.uf}`
          : undefined
      }
      largura="lg"
    >
      {detalhe ? (
        /* A `key` é o que fecha o formulário quando o chamado muda debaixo da
           gaveta. `atualizado_em` é carimbado por gatilho a cada `update`, então
           ela troca em TODA alteração confirmada pelo banco — inclusive as que
           não mexem no estado, como informar a altura inicial. Com a chave só
           no estado, salvar a altura deixava o campo aberto com o valor antigo
           ao lado do novo, convidando a salvar de novo.

           Remontar é mais honesto do que limpar campo a campo num efeito: o
           formulário pertencia à versão anterior do chamado. */
        <CorpoChamado key={`${detalhe.id}:${detalhe.atualizado_em}`} detalhe={detalhe} {...resto} />
      ) : carregando ? (
        /* Enquanto o servidor busca, a gaveta espera. Sem este ramo ela
           abriria dizendo "não encontrado" no intervalo entre o clique e a
           resposta — uma acusação de erro para o caso normal. */
        <p role="status" className="flex items-center gap-2 text-sm text-ink-3">
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
          Abrindo o chamado…
        </p>
      ) : (
        <Aviso tom="warning" titulo="Chamado não encontrado">
          <p>O endereço aponta para um chamado que não existe mais. Feche e escolha outro na lista.</p>
        </Aviso>
      )}
    </PainelLateral>
  );
}

function CorpoChamado({
  detalhe,
  cargo,
  hoje,
  agora,
  pendente,
  erroDecisao,
  nomeDaEquipe,
  aoAprovar,
  aoDevolver,
  aoDecidirAdiamento,
  aoEncerrar,
  aoCancelar,
  aoInformarAltura,
}: PropsCorpo) {
  /* Qual formulário está aberto NÃO vai para a URL, ao contrário do filtro e
     da seleção: é passo de preenchimento, não lugar. Um link para
     "?chamado=7&form=aprovar" prometeria um estado que o servidor não pode
     garantir — o chamado pode ter sido aprovado por outra pessoa no caminho. */
  const [formulario, setFormulario] = useState<Acao | null>(null);
  const [altura, setAltura] = useState("");
  const [erroAltura, setErroAltura] = useState<string | undefined>();

  const { trecho, agendamento, adiamento_pendente: adiamento } = detalhe;
  const equipe = agendamento.equipe;
  const atrasado = estaAtrasado(detalhe.status, agendamento.data_sugerida, hoje);
  const prioridade = prioridadeExibida(detalhe.prazo_dias, agendamento.prioridade, agendamento.origem);
  const divergencia = textoDivergencia(prioridade);
  const acoes = acoesDisponiveis(detalhe.status, cargo, false);
  const kmDoTrecho = Math.max(0, Number(trecho.km_fim) - Number(trecho.km_inicio));

  function confirmarAltura() {
    /* O campo vazio precisa sair ANTES da conta: `Number("")` e 0, `Number.isFinite(0)`
       e true e 0 passa na faixa — o gestor que abrisse so para VER quanto era e
       apertasse Enter gravava "0,0 cm - informada pelo gestor", que na aprovacao vira
       `altura_antes_cm = 0` em `ia.execucoes`. O irmao no mesmo recurso ja separa os
       dois casos: `paraNumero`, em `formularios-decisao.tsx`. */
    const texto = altura.trim().replace(",", ".");
    if (texto === "") {
      setErroAltura("Informe a altura medida.");
      return;
    }
    const valor = Number(texto);
    if (!Number.isFinite(valor) || valor < 0 || valor > 300) {
      setErroAltura("Altura fora da faixa (0 a 300 cm).");
      return;
    }
    setErroAltura(undefined);
    aoInformarAltura(valor);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {erroDecisao ? (
        <Aviso tom="critical" titulo="A decisão não foi registrada">
          <p>{erroDecisao}</p>
        </Aviso>
      ) : null}

      <Secao titulo="Estado e prazo">
        <div className="flex flex-wrap items-center gap-2">
          <ChipChamado status={detalhe.status} />
          {/* Do PRAZO de hoje. Ver `prioridadeExibida`. */}
          <ChipRisco risco={prioridade.risco} />
          {atrasado ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-critical-soft px-2 py-0.5 text-xs font-medium text-critical-ink">
              <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
              {fmt.contar(diasDeAtraso(agendamento.data_sugerida, hoje), "dia de atraso", "dias de atraso")}
            </span>
          ) : null}
        </div>

        {/* A divergência não some: a tela mostra as duas e diz qual prevaleceu.
            Numa simulação a LLM já devolveu `critica` para um trecho que
            cruzava o limite em 61 dias, justificando com "menos de 7 dias" no
            mesmo parágrafo em que escreveu "61". */}
        {divergencia ? (
          <p className="mt-2 text-xs text-ink-3">{divergencia}</p>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Dado rotulo="Data prevista">
            <span className="tnum">{fmt.dataMedia(agendamento.data_sugerida)}</span>
            <span className="text-ink-3"> · {relativoEmDias(agendamento.data_sugerida, hoje)}</span>
          </Dado>

          <Dado rotulo="Equipe">
            {equipe ? (
              <>
                {equipe.nome}
                <span className="text-ink-3">
                  {equipe.lider_nome ? ` · ${equipe.lider_nome}` : " · sem líder"}
                </span>
              </>
            ) : (
              <span className="text-warning-ink">Sem equipe</span>
            )}
          </Dado>
        </div>

        {detalhe.sem_evidencia ? (
          <Aviso tom="warning" titulo="Concluído sem evidência de campo" className="mt-3">
            <p>
              Este chamado foi encerrado no painel, sem as fotos do app. A execução existe no
              histórico do trecho; a comprovação, não.
            </p>
          </Aviso>
        ) : null}
      </Secao>

      <Secao titulo="Alturas">
        <div className="grid gap-3 sm:grid-cols-3">
          <Dado rotulo="Inicial">
            <span className="tnum">{fmt.cm(detalhe.altura_inicial_cm)}</span>
            <span className="block text-2xs text-ink-3">
              {detalhe.altura_inicial_origem === "informada"
                ? "informada pelo gestor"
                : "prevista pelo modelo"}
            </span>
          </Dado>

          <Dado rotulo="Final">
            <span className="tnum">{fmt.cm(detalhe.altura_final_cm)}</span>
            <span className="block text-2xs text-ink-3">
              {/* "medida no fechamento" e falso quando o gestor digitou a
                  altura no encerramento administrativo -- e o cartao dizia
                  isso a dois centimetros do aviso "Concluido sem evidencia de
                  campo", na mesma tela. Mesma regra da altura inicial logo
                  acima: a legenda nomeia quem produziu o numero. */}
              {detalhe.altura_final_cm == null
                ? "a equipe ainda não mediu"
                : detalhe.sem_evidencia
                  ? "informada no encerramento"
                  : "medida no fechamento"}
            </span>
          </Dado>

          <Dado rotulo="Limite do trecho">
            <span className="tnum">{fmt.cm(Number(trecho.altura_limite_cm))}</span>
            <span className="block text-2xs text-ink-3">acima disso vira risco</span>
          </Dado>
        </div>

        {acoes.includes("informar_altura") ? (
          formulario === "informar_altura" ? (
            <form
              noValidate
              onSubmit={(evento) => {
                evento.preventDefault();
                confirmarAltura();
              }}
              className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-2 p-3"
            >
              <Campo
                rotulo="Altura inicial medida, em cm"
                erro={erroAltura}
                dica="Substitui a previsão do modelo e fica registrada como sua."
              >
                <Entrada
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="300"
                  value={altura}
                  onChange={(evento) => setAltura(evento.target.value)}
                  className="tnum w-32"
                />
              </Campo>
              <div className="flex items-center gap-2 pb-6">
                <Botao type="submit" variante="primario" tamanho="sm" carregando={pendente}>
                  Salvar altura
                </Botao>
                <Botao
                  type="button"
                  variante="fantasma"
                  tamanho="sm"
                  disabled={pendente}
                  onClick={() => setFormulario(null)}
                >
                  Voltar
                </Botao>
              </div>
            </form>
          ) : (
            <Botao
              variante="secundario"
              tamanho="sm"
              className="mt-3"
              iconeEsquerda={<Ruler />}
              onClick={() => {
                setAltura(detalhe.altura_inicial_cm == null ? "" : String(detalhe.altura_inicial_cm));
                setFormulario("informar_altura");
              }}
            >
              Informar altura
            </Botao>
          )
        ) : null}
      </Secao>

      <Secao titulo="Fotos">
        <FotosAntesDepois fotos={detalhe.fotos} trecho={trecho} encerradoSemCampo={detalhe.sem_evidencia} />
      </Secao>

      {adiamento ? (
        <Secao titulo="Adiamento pedido">
          <div className="rounded-md border border-l-2 border-border bg-surface-2 p-3">
            <p className="text-sm font-medium text-ink">{MOTIVO_ADIAMENTO[adiamento.motivo]}</p>
            {adiamento.detalhe ? (
              <p className="mt-1 text-sm break-words text-ink-2">{adiamento.detalhe}</p>
            ) : null}
            <p className="mt-2 text-xs text-ink-3">
              {adiamento.data_sugerida
                ? `Sugere ${fmt.dataMedia(adiamento.data_sugerida)} · pedido ${desde(adiamento.solicitado_em, agora)}`
                : `Sem data sugerida · pedido ${desde(adiamento.solicitado_em, agora)}`}
            </p>
          </div>
        </Secao>
      ) : null}

      <Secao titulo="Decisões">
        {acoes.length === 0 ? (
          <p className="text-sm text-ink-3">
            {terminal(detalhe.status)
              ? "Chamado encerrado. O histórico abaixo continua disponível."
              : "Nada a decidir neste estado. A próxima ação é da equipe, no app."}
          </p>
        ) : formulario && formulario !== "informar_altura" ? (
          <>
            {formulario === "aprovar" ? (
              <FormularioAprovar
                kmSugerido={kmDoTrecho}
                alturaFinalCm={detalhe.altura_final_cm}
                pendente={pendente}
                aoCancelar={() => setFormulario(null)}
                aoConfirmar={aoAprovar}
              />
            ) : null}

            {formulario === "devolver" ? (
              <FormularioDevolver
                pendente={pendente}
                aoCancelar={() => setFormulario(null)}
                aoConfirmar={aoDevolver}
              />
            ) : null}

            {formulario === "decidir_adiamento" && adiamento ? (
              <FormularioAdiamento
                adiamento={adiamento}
                pendente={pendente}
                aoCancelar={() => setFormulario(null)}
                aoConfirmar={aoDecidirAdiamento}
              />
            ) : null}

            {formulario === "encerrar_admin" ? (
              <FormularioEncerrarAdmin
                hoje={hoje}
                pendente={pendente}
                aoCancelar={() => setFormulario(null)}
                aoConfirmar={aoEncerrar}
              />
            ) : null}

            {formulario === "cancelar" ? (
              <FormularioCancelar
                numero={detalhe.numero}
                pendente={pendente}
                aoCancelar={() => setFormulario(null)}
                aoConfirmar={aoCancelar}
              />
            ) : null}
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {acoes
              .filter((a) => a !== "informar_altura")
              .map((a) => (
                <Botao
                  key={a}
                  variante={a === "aprovar" ? "primario" : a === "cancelar" ? "perigo" : "secundario"}
                  iconeEsquerda={
                    a === "aprovar" ? (
                      <CircleCheck />
                    ) : a === "devolver" ? (
                      <Undo2 />
                    ) : a === "decidir_adiamento" ? (
                      <CalendarClock />
                    ) : a === "encerrar_admin" ? (
                      <ShieldCheck />
                    ) : (
                      <CircleSlash />
                    )
                  }
                  onClick={() => setFormulario(a)}
                >
                  {ROTULO_ACAO[a]}
                </Botao>
              ))}
          </div>
        )}
      </Secao>

      <Secao titulo="Linha do tempo">
        <LinhaDoTempo eventos={detalhe.eventos} nomeDaEquipe={nomeDaEquipe} />
      </Secao>
    </div>
  );
}
