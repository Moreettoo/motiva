"use client";

import { useId, useState } from "react";
import { Check, CircleSlash, Flag, OctagonAlert, Pencil, Undo2 } from "lucide-react";

import { BarraProgresso } from "@/components/ui/barra-progresso";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Chip, ChipRisco, ChipStatus } from "@/components/ui/chip";
import { PainelLateral } from "@/components/ui/painel-lateral";
import {
  DIAS_FOLGA_DISPENSA,
  ESPECIE,
  TOM_BARRA_POR_RISCO,
  erroFaltaEquipe,
  rotuloPrazo,
} from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { Equipe, StatusAgendamento } from "@/lib/types";

import { textoServico, type ItemAgenda, type TrechoResumo } from "./dados";

type AcoesPainel = {
  pendente: boolean;
  aoFechar: () => void;
  aoMudarStatus: (item: ItemAgenda, status: StatusAgendamento) => void;
  aoAtribuir: (item: ItemAgenda, equipe: Equipe | null) => void;
  aoRemarcar: (item: ItemAgenda, data: string) => void;
};

/**
 * Detalhe do agendamento.
 *
 * O último item aberto continua guardado depois que a seleção sai da URL: sem
 * isso o conteúdo sumiria no meio da animação de saída da gaveta. A `key` por id
 * devolve o formulário ao estado inicial quando outro agendamento entra no lugar.
 */
export function PainelAgendamento({
  agendamento,
  trecho,
  equipes,
  ...acoes
}: AcoesPainel & {
  agendamento: ItemAgenda | null;
  trecho: TrechoResumo | undefined;
  equipes: Equipe[];
}) {
  const [ultimo, setUltimo] = useState<ItemAgenda | null>(agendamento);
  if (agendamento && agendamento !== ultimo) setUltimo(agendamento);

  const item = agendamento ?? ultimo;
  if (!item) return null;

  return (
    <Gaveta
      key={item.id}
      item={item}
      aberta={agendamento != null}
      trecho={trecho}
      equipes={equipes}
      {...acoes}
    />
  );
}

function Gaveta({
  item,
  aberta,
  trecho,
  equipes,
  pendente,
  aoFechar,
  aoMudarStatus,
  aoAtribuir,
  aoRemarcar,
}: AcoesPainel & {
  item: ItemAgenda;
  aberta: boolean;
  trecho: TrechoResumo | undefined;
  equipes: Equipe[];
}) {
  const idEquipe = useId();
  const idData = useId();
  const [novaData, setNovaData] = useState(item.data);
  const [confirmando, setConfirmando] = useState(false);

  const t = item.ag.trecho;
  const previsao = item.ag.previsao;
  const ocupacao = trecho?.ocupacao_pct ?? null;
  const emAberto = item.status === "sugerido" || item.status === "aprovado";
  const bloqueioAprovacao = erroFaltaEquipe(item.equipeId, "aprovado");
  const bloqueioConclusao = erroFaltaEquipe(item.equipeId, "executado");

  return (
    <PainelLateral
      aberto={aberta}
      aoFechar={aoFechar}
      largura="md"
      titulo={t.rodovia}
      descricao={`${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))} · ${t.uf}${t.sentido ? ` · ${t.sentido}` : ""}`}
      rodape={
        <div className="flex flex-wrap items-center gap-2">
          {item.status === "sugerido" ? (
            <Botao
              variante="primario"
              tamanho="sm"
              disabled={pendente || bloqueioAprovacao != null}
              title={bloqueioAprovacao ?? undefined}
              iconeEsquerda={<Check />}
              onClick={() => aoMudarStatus(item, "aprovado")}
            >
              Aprovar roçada
            </Botao>
          ) : null}

          {item.status === "aprovado" ? (
            <Botao
              variante="primario"
              tamanho="sm"
              disabled={pendente || bloqueioConclusao != null}
              title={bloqueioConclusao ?? undefined}
              iconeEsquerda={<Flag />}
              onClick={() => aoMudarStatus(item, "executado")}
            >
              Marcar como executada
            </Botao>
          ) : null}

          {emAberto ? null : (
            <Botao
              variante="secundario"
              tamanho="sm"
              disabled={pendente}
              iconeEsquerda={<Undo2 />}
              onClick={() => aoMudarStatus(item, "sugerido")}
            >
              Reabrir sugestão
            </Botao>
          )}

          {/* Descartar apaga a sugestão do plano: pede confirmação em vez de
              obedecer no primeiro clique. */}
          {emAberto ? (
            confirmando ? (
              <>
                <Botao
                  variante="perigo"
                  tamanho="sm"
                  disabled={pendente}
                  onClick={() => {
                    setConfirmando(false);
                    aoMudarStatus(item, "descartado");
                  }}
                >
                  Confirmar descarte
                </Botao>
                <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmando(false)}>
                  Manter roçada
                </Botao>
              </>
            ) : (
              <Botao
                variante="perigo"
                tamanho="sm"
                disabled={pendente}
                iconeEsquerda={<CircleSlash />}
                onClick={() => setConfirmando(true)}
              >
                Descartar
              </Botao>
            )
          ) : null}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <ChipRisco risco={item.risco} />
        <ChipStatus status={item.status} />
        {/* Só o manual se anuncia. "Da IA" é o padrão desta tela — 198 das 199
            linhas —, e carimbar o padrão em todo cartão é ruído; o que muda a
            leitura é a exceção. O chip também é o que explica por que a seção
            de baixo diz "Motivo do agendamento" e não "Justificativa da IA". */}
        {item.manual ? (
          <Chip tom="neutro" icone={<Pencil />}>
            Agendada na mão
          </Chip>
        ) : null}
        {item.atrasado ? (
          <Chip tom="critical" icone={<OctagonAlert />}>
            Data vencida
          </Chip>
        ) : null}
        {/* Os dois chips convivem aqui, ao contrário do cartão, que escolhe um:
            a gaveta tem largura para os dois e é onde a decisão acontece. */}
        {item.dispensavel ? (
          <Chip tom="neutro" icone={<CircleSlash />}>
            Não é mais necessária
          </Chip>
        ) : null}
      </div>

      {/* A explicação de por que o selo apareceu, com o botão logo abaixo no
          rodapé. O lote descarta sozinho o que ele mesmo sugeriu e o que já
          venceu sem execução; um `aprovado` com data futura chega até aqui de
          propósito, porque desfazer uma decisão humana em silêncio não é
          trabalho de lote. */}
      {item.dispensavel ? (
        <p className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-xs text-ink-2">
          A previsão mudou desde que esta roçada foi marcada: o trecho tem mais
          de {DIAS_FOLGA_DISPENSA} dias de folga até o limite de altura. Se ela
          não for mais fazer sentido, descarte no rodapé — o lote não faz isso
          sozinho com uma data que alguém aprovou.
        </p>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {confirmando ? "Confirme o descarte no rodapé do painel." : ""}
      </p>

      <section className="mt-5">
        <h3 className="text-2xs font-medium tracking-widest text-ink-3 uppercase">O serviço</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-3">Data sugerida</dt>
          <dd className="tnum text-right font-mono text-ink">{fmt.dataMedia(item.data)}</dd>

          <dt className="text-ink-3">Extensão</dt>
          <dd className="tnum text-right font-mono text-ink">{fmt.km(item.km)}</dd>

          <dt className="text-ink-3">Tempo estimado</dt>
          <dd className="tnum text-right font-mono text-ink">{textoServico(item.diasServico)}</dd>

          <dt className="text-ink-3">Capacidade usada</dt>
          <dd className="tnum text-right font-mono text-ink">{fmt.km(item.capacidade)}/dia</dd>

          <dt className="text-ink-3">Equipe</dt>
          <dd className="text-right break-words text-ink">{item.equipeNome ?? "Sem equipe"}</dd>

          <dt className="text-ink-3">Espécie</dt>
          <dd className="text-right text-ink">{ESPECIE[t.especie].rotulo}</dd>

          {t.tipo_pista ? (
            <>
              <dt className="text-ink-3">Tipo de pista</dt>
              <dd className="text-right text-ink">{t.tipo_pista}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="mt-6">
        <h3 className="text-2xs font-medium tracking-widest text-ink-3 uppercase">
          Leitura do modelo
        </h3>

        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-3">Crescimento</dt>
          <dd className="tnum text-right font-mono text-ink">
            {fmt.cmDia(previsao?.crescimento_cm_dia ?? trecho?.crescimento_cm_dia)}
          </dd>

          <dt className="text-ink-3">Altura atual</dt>
          <dd className="tnum text-right font-mono text-ink">
            {fmt.cm(previsao?.altura_atual_cm ?? trecho?.altura_atual_cm)}
          </dd>

          <dt className="text-ink-3">Limite do trecho</dt>
          <dd className="tnum text-right font-mono text-ink">{fmt.cm(Number(t.altura_limite_cm))}</dd>

          <dt className="text-ink-3">Prazo até o limite</dt>
          <dd className="tnum text-right font-mono text-ink">
            {rotuloPrazo(previsao?.dias_ate_limite ?? trecho?.dias_ate_limite)}
          </dd>
        </dl>

        {ocupacao != null ? (
          <div className="mt-3">
            {/* "Ocupação" nesta tela é carga de equipe (linha do tempo). Aqui a
                barra compara altura com limite — a altura e o limite estão logo
                acima, no mesmo `dl`, então o percentual tem referência. */}
            <p className="mb-1.5 text-2xs text-ink-3">Altura contra o limite</p>
            <BarraProgresso
              valor={ocupacao}
              tom={TOM_BARRA_POR_RISCO[item.risco]}
              altura="media"
              mostrarValor
              rotulo={`Altura contra o limite em ${t.rodovia}`}
            />
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        {/* A mesma coluna do banco (`justificativa`) com dois donos possíveis.
            Chamar de "Justificativa da IA" um texto que um gestor escreveu à
            mão seria atribuir a decisão a quem não a tomou — na tela em que
            alguém vai reler essa decisão daqui a três semanas. */}
        <h3 className="text-2xs font-medium tracking-widest text-ink-3 uppercase">
          {item.manual ? "Motivo do agendamento" : "Justificativa da IA"}
        </h3>
        <p className="mt-2 text-sm break-words text-ink-2">{item.ag.justificativa}</p>

        {item.ag.fatores?.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {item.ag.fatores.map((fator) => (
              <li key={fator}>
                <Chip tom="neutro">{fator}</Chip>
              </li>
            ))}
          </ul>
        ) : null}

        {item.ag.modelo_usado ? (
          <p className="tnum mt-3 font-mono text-2xs text-ink-3">Modelo {item.ag.modelo_usado}</p>
        ) : null}
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-2xs font-medium tracking-widest text-ink-3 uppercase">Ajustar plano</h3>

        <div className="mt-3 flex flex-col gap-4">
          <Campo
            rotulo="Equipe responsável"
            id={idEquipe}
            dica={
              (item.status === "sugerido" ? bloqueioAprovacao : bloqueioConclusao) ?? undefined
            }
          >
            <Selecao
              value={item.equipeId == null ? "" : String(item.equipeId)}
              disabled={pendente}
              onChange={(evento) => {
                const valor = evento.target.value;
                aoAtribuir(
                  item,
                  valor ? (equipes.find((e) => String(e.id) === valor) ?? null) : null,
                );
              }}
            >
              <option value="">Sem equipe</option>
              {equipes
                .filter((e) => e.ativo)
                .map((e) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.nome} · {fmt.d1(Number(e.capacidade_km_dia))} km/dia
                  </option>
                ))}
            </Selecao>
          </Campo>

          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(evento) => {
              evento.preventDefault();
              aoRemarcar(item, novaData);
            }}
          >
            <div className="min-w-40 flex-1">
              <Campo
                rotulo="Data da roçada"
                id={idData}
                dica="Adiar demais deixa a vegetação passar do limite."
              >
                <Entrada
                  type="date"
                  value={novaData}
                  onChange={(evento) => setNovaData(evento.target.value)}
                />
              </Campo>
            </div>

            <Botao
              type="submit"
              tamanho="sm"
              variante="secundario"
              disabled={pendente || !novaData || novaData === item.data}
            >
              Remarcar
            </Botao>
          </form>
        </div>
      </section>
    </PainelLateral>
  );
}
