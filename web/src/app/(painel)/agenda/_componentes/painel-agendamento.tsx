"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CircleSlash,
  ClipboardList,
  Flag,
  OctagonAlert,
  Pencil,
  Undo2,
} from "lucide-react";

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
import { AvisoSomenteLeitura } from "@/components/ui/aviso-somente-leitura";
import { terminal } from "@/lib/chamados/maquina";
import { fmt } from "@/lib/format";
import type { Equipe, StatusAgendamento } from "@/lib/types";

import {
  FormularioEncerrarAdmin,
  type EntradaEncerrarAdmin,
} from "../../chamados/_componentes/formularios-decisao";

import { textoServico, type ItemAgenda, type TrechoResumo } from "./dados";
import { ChipChamado } from "./quadro/cartao-servico";

type AcoesPainel = {
  pendente: boolean;
  aoFechar: () => void;
  aoMudarStatus: (item: ItemAgenda, status: StatusAgendamento) => void;
  aoAtribuir: (item: ItemAgenda, equipe: Equipe | null) => void;
  aoRemarcar: (item: ItemAgenda, data: string) => void;
  /** Fecha o chamado sem a evidência de campo. Recebe o id do CHAMADO, não o
   *  do agendamento: quem executa é `ia.encerrar_chamado_admin`. */
  aoEncerrarAdmin: (chamadoId: number, entrada: EntradaEncerrarAdmin) => void;
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
  hoje,
  podeEscrever,
  ...acoes
}: AcoesPainel & {
  agendamento: ItemAgenda | null;
  trecho: TrechoResumo | undefined;
  equipes: Equipe[];
  /** `isoHoje()` do servidor, nunca `new Date()` do navegador: é o teto da
   *  data no formulário de encerramento, e um relógio de máquina em UTC já
   *  virou o dia às 21 h de Brasília. */
  hoje: string;
  /** Analista: a gaveta abre e explica a decisão, mas não a altera. */
  podeEscrever: boolean;
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
      hoje={hoje}
      podeEscrever={podeEscrever}
      {...acoes}
    />
  );
}

function Gaveta({
  item,
  aberta,
  trecho,
  equipes,
  hoje,
  pendente,
  aoFechar,
  aoMudarStatus,
  aoAtribuir,
  aoRemarcar,
  aoEncerrarAdmin,
  podeEscrever,
}: AcoesPainel & {
  item: ItemAgenda;
  aberta: boolean;
  trecho: TrechoResumo | undefined;
  equipes: Equipe[];
  hoje: string;
  podeEscrever: boolean;
}) {
  const idEquipe = useId();
  const idData = useId();
  const [novaData, setNovaData] = useState(item.data);
  const [confirmando, setConfirmando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  const t = item.ag.trecho;
  const previsao = item.ag.previsao;
  const ocupacao = trecho?.ocupacao_pct ?? null;
  const emAberto = item.status === "sugerido" || item.status === "aprovado";
  const bloqueioAprovacao = erroFaltaEquipe(item.equipeId, "aprovado");

  /* Por que o encerramento pede um CHAMADO e não um agendamento.
     Quem fecha a roçada é `ia.encerrar_chamado_admin`, que grava a execução, a
     medição e o evento numa transação só. Sem chamado não há o que encerrar —
     e "aprovado sem equipe" é exatamente esse caso, porque o gatilho só abre a
     ordem de serviço quando a equipe chega. Antes o botão "Marcar como
     executada" atravessava isso escrevendo `executado` direto na tabela, o que
     concluía o chamado com `sem_evidencia` e nada mais: nenhum km, nenhuma
     altura, nenhum autor. Ver a recusa em `mudarStatusAgendamento`. */
  const chamado = item.chamado;
  const podeEncerrar = chamado != null && !terminal(chamado.status);

  /* Só faz sentido explicar a AUSÊNCIA do chamado enquanto a roçada ainda pode
     ganhar um. Numa `executado` ou `descartada` o chamado terminou e saiu da
     consulta de abertos por desenho, e dizer "ainda não existe" ali seria a
     tela anunciando como pendência o desfecho normal do que acabou de
     acontecer — foi o que apareceu logo depois do primeiro encerramento feito
     por esta gaveta. */
  const bloqueioEncerramento =
    emAberto && chamado == null
      ? erroFaltaEquipe(item.equipeId, "executado") ??
        "O chamado desta roçada ainda não existe. Recarregue a página."
      : null;

  return (
    <PainelLateral
      aberto={aberta}
      aoFechar={aoFechar}
      largura="md"
      titulo={t.rodovia}
      descricao={`${fmt.faixaKm(Number(t.km_inicio), Number(t.km_fim))} · ${t.uf}${t.sentido ? ` · ${t.sentido}` : ""}`}
      rodape={
        podeEscrever ? (
          <div className="flex min-w-0 flex-col gap-2">
            {/* O motivo do bloqueio em TEXTO, e nao so no `title`. Botao
                `disabled` nao recebe foco e, na maioria dos navegadores, nem
                dispara tooltip no hover: "Aprovar rocada" aparecia apagado e
                nada explicava por que ate a pessoa rolar a gaveta inteira ate
                a secao "Ajustar plano", que e onde a mesma frase ja aparecia
                como dica do campo Equipe. */}
            {(item.status === "sugerido" && bloqueioAprovacao) ||
            (item.status === "aprovado" && !encerrando && bloqueioEncerramento) ? (
              <p className="min-w-0 text-xs text-ink-3">
                {item.status === "sugerido" ? bloqueioAprovacao : bloqueioEncerramento}
              </p>
            ) : null}

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

            {/* "Marcar como executada" virou "Encerrar administrativamente", e
                o nome mudou porque o ATO mudou. O botão antigo dizia "isto foi
                roçado" e não registrava nada disso; este abre o formulário que
                pergunta quando aconteceu e por que não passou pelo app, e o
                chamado fecha com o selo "sem evidência".

                Ele não é o caminho normal: o normal é a equipe fechar pelo
                celular e o gestor aprovar em `/chamados`, com as fotos lado a
                lado. Por isso `secundario`, e não `primario` — o botão
                primário desta gaveta é a aprovação da sugestão. */}
            {item.status === "aprovado" && !encerrando ? (
              <Botao
                variante="secundario"
                tamanho="sm"
                disabled={pendente || !podeEncerrar}
                title={bloqueioEncerramento ?? undefined}
                iconeEsquerda={<Flag />}
                onClick={() => setEncerrando(true)}
              >
                Encerrar administrativamente
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
          </div>
        ) : (
          <AvisoSomenteLeitura podeEscrever={false} />
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <ChipRisco risco={item.risco} />
        <ChipStatus status={item.status} />
        {/* Só o manual se anuncia. "Da IA" é o padrão desta tela, 198 das 199
            linhas, e carimbar o padrão em todo cartão é ruído; o que muda a
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

      {/* A LLM discordou do prazo. O chip acima ja saiu do prazo; esta linha e
          a outra metade da regra, "a tela mostra as duas e diz qual
          prevaleceu". Sem ela a gaveta punha o chip "Media" no topo e, quinze
          centimetros abaixo, a justificativa da propria IA dizendo
          "prioridade critica" -- as duas na mesma tela, nenhuma explicada. */}
      {item.divergencia ? (
        <p className="mt-3 text-xs text-ink-3">{item.divergencia}</p>
      ) : null}

      {/* A explicação de por que o selo apareceu, com o botão logo abaixo no
          rodapé. O lote descarta sozinho o que ele mesmo sugeriu e o que já
          venceu sem execução; um `aprovado` com data futura chega até aqui de
          propósito, porque desfazer uma decisão humana em silêncio não é
          trabalho de lote. */}
      {item.dispensavel ? (
        <p className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-xs text-ink-2">
          A previsão mudou desde que esta roçada foi marcada: o trecho tem mais
          de {DIAS_FOLGA_DISPENSA} dias de folga até o limite de altura. Se ela
          não for mais fazer sentido, descarte no rodapé, o lote não faz isso
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

      {/* A ORDEM DE SERVIÇO.
          Depois de "O serviço", que descreve o que foi PLANEJADO, e antes da
          leitura do modelo, que é o porquê: esta seção é o que está
          ACONTECENDO, e é a única da gaveta que muda sem ninguém mexer no
          painel — quem a move é a equipe, do celular.

          O link e o encerramento administrativo, e mais nada. Aprovar,
          devolver e decidir adiamento exigem as fotos lado a lado, km, custo e
          comentário, e essa é a gaveta de `/chamados`, que tem largura para
          isso; duplicá-las aqui criaria duas telas para a mesma decisão, cada
          uma com metade do contexto. O encerramento fica porque ele SUBSTITUI
          um botão que já existia nesta gaveta e não tem essa exigência: quem
          encerra administrativamente está justamente dizendo que não há
          evidência de campo nenhuma para olhar. */}
      {chamado ? (
        <section className="mt-6">
          <h3 className="flex items-center gap-1.5 text-2xs font-medium tracking-widest text-ink-3 uppercase">
            <ClipboardList aria-hidden="true" className="size-3.5 shrink-0" />
            Chamado
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tnum font-mono text-sm text-ink">{chamado.numero}</span>
            <ChipChamado status={chamado.status} tamanho="md" />
          </div>

          {/* O formulário abre AQUI, no corpo, e não no rodapé: ele tem data,
              altura e um texto obrigatório, e o rodapé da gaveta é uma tira de
              botões. Mesma disposição da gaveta de `/chamados`, que é de onde
              o componente vem — e é ele mesmo, importado, não uma segunda
              cópia: duas validações da mesma decisão divergem na primeira vez
              que uma delas muda. */}
          {encerrando ? (
            <div className="mt-3">
              <FormularioEncerrarAdmin
                hoje={hoje}
                pendente={pendente}
                aoCancelar={() => setEncerrando(false)}
                aoConfirmar={(entrada) => {
                  setEncerrando(false);
                  aoEncerrarAdmin(chamado.id, entrada);
                }}
              />
            </div>
          ) : (
            <Link
              href={`/chamados?chamado=${chamado.id}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-sm text-xs text-accent transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink"
            >
              Abrir em Chamados
              <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
            </Link>
          )}
        </section>
      ) : null}

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
                barra compara altura com limite, a altura e o limite estão logo
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
            mão seria atribuir a decisão a quem não a tomou, na tela em que
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

      {podeEscrever ? (
        <section className="mt-6 border-t border-border pt-5">
          <h3 className="text-2xs font-medium tracking-widest text-ink-3 uppercase">Ajustar plano</h3>

          <div className="mt-3 flex flex-col gap-4">
            <Campo
              rotulo="Equipe responsável"
              id={idEquipe}
              /* Em `sugerido` a falta de equipe barra a aprovação; em
                 `aprovado`, barra o encerramento — e ali ela barra por não
                 existir chamado nenhum, que é o que `bloqueioEncerramento`
                 explica. Nos dois casos a dica diz o que a equipe destrava. */
              dica={
                (item.status === "sugerido" ? bloqueioAprovacao : bloqueioEncerramento) ?? undefined
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
      ) : null}
    </PainelLateral>
  );
}
