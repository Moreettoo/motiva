"use client";

import { OctagonAlert } from "lucide-react";

import { fmt, parseData } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ehFimDeSemana, type ResumoDia } from "../dados";

/**
 * A faixa de 28 dias. Sem legenda e sem frase próprias: as três marcas que ela
 * usa ("com equipe", "sem equipe", "acima da capacidade") foram para a legenda
 * ÚNICA do cabeçalho do quadro, ao lado das faixas de risco, as duas legendas
 * respondiam à mesma pergunta em dois lugares, a poucos centímetros uma da
 * outra.
 *
 * A frase que explicava a altura da barra e o clique também saiu. A altura se
 * lê do próprio gráfico, e o clique agora tem o afeto que faltava: a coluna
 * sobe 2 px no hover e no foco (ver `transition-transform`, abaixo) e o
 * `aria-label` de cada uma termina em "Ir para esta semana.", sinal e
 * instrução no próprio objeto, em vez de uma nota de rodapé sobre ele.
 *
 * Este componente ficou responsável por um recado que antes tinha dois donos: é
 * o ÚNICO lugar da tela que ainda mostra a pressão de serviço SEM EQUIPE por
 * dia (a banda de cima de cada barra). A linha "Propostas da IA" mostrava isso
 * para 7 dias e duplicava a fila de decisão; aqui são 28, sem duplicar nada.
 */
export function MiniMapa({
  resumos,
  janela,
  hoje,
  aoEscolherSemana,
}: {
  resumos: ResumoDia[];
  /** Dias da semana visível, para marcar o intervalo no mapa. */
  janela: string[];
  hoje: string;
  aoEscolherSemana: (dia: string) => void;
}) {
  // Escala local: o dia mais cheio das quatro semanas vai à altura cheia. Uma
  // escala global sobre a capacidade instalada achataria tudo abaixo de 21%.
  const teto = Math.max(1, ...resumos.map((r) => r.comEquipe + r.semEquipe));
  const naJanela = new Set(janela);

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-end gap-px">
        {resumos.map((r) => {
          const dentro = naJanela.has(r.dia);
          const ehHoje = r.dia === hoje;

          return (
            <button
              key={r.dia}
              type="button"
              onClick={() => aoEscolherSemana(r.dia)}
              aria-label={`${fmt.dataLonga(r.dia)}. ${fmt.contar(r.comEquipe, "serviço com equipe", "serviços com equipe")}, ${fmt.contar(r.semEquipe, "sem equipe", "sem equipe")}.${r.algumaExcedida ? " Alguma equipe acima da capacidade." : ""}${ehHoje ? " Hoje." : ""} Ir para esta semana.`}
              className={cn(
                "group relative flex h-14 min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-xs",
                // Só `transform`: o resto do sistema de movimento roda em opacity/transform
                // pra `prefers-reduced-motion` desligar tudo num lugar só (globals.css), sem
                // precisar checar a preferência aqui também. Subir 2px no hover/foco é o
                // sinal de "isto é clicável" que faltava, antes só o cursor padrão (uma
                // seta, não uma mão) e um filete de 1px sinalizavam interação, e nenhum dos
                // dois é um sinal que alguém procura numa faixa de barrinhas.
                "transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
                ehFimDeSemana(r.dia) && "bg-surface-3",
                dentro && "bg-accent-soft",
              )}
            >
              {r.algumaExcedida ? (
                <OctagonAlert
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 mx-auto size-2.5 text-critical-ink"
                />
              ) : null}

              {/* Altura em porcentagem, não `scaleY`: as duas faixas são irmãs
                  de flex com a mesma base, e `transform` é só pintura, não
                  muda o tamanho de layout, então cada uma escalaria dentro da
                  própria caixa e sobraria um vão entre elas em todo dia que
                  não fosse o pico exato dos 28. Altura real empilha de
                  verdade. O arredondamento do topo mora no envoltório
                  (`overflow-hidden`), não numa das faixas: assim o canto
                  aparece sobre qualquer uma que toque o topo: a de cima, a de
                  baixo, ou nenhuma, no dia zerado.

                  A ORDEM é o que a legenda nomeia, e é por isso que ela fala em
                  cima e embaixo: `flex-col` com `justify-end` põe o primeiro
                  filho ACIMA do segundo, então sem equipe fica em cima e com
                  equipe embaixo, nos dois temas. A legenda dizia "a parte clara
                  ainda não tem equipe", verdade só no claro. `--ink` inverte
                  de sentido com o tema (quase preto no claro, quase branco no
                  escuro), então no escuro a parte CLARA é justamente a que TEM
                  equipe: a única explicação do gráfico mentia em metade dos
                  temas. Posição não inverte; luminância inverte. Por isso a
                  legenda abaixo não fala mais em "claro"/"escuro": é uma
                  marca de cor de verdade, no MESMO token que pinta a faixa,
                  as duas viram juntas com o tema, e não há frase pra
                  desatualizar.

                  As duas faixas usam `--ink-3`/`--ink` (cinzas puros, sem
                  matiz nenhum, a paleta de tinta do projeto não tem hue) em
                  vez de qualquer cor de status: a hierarquia de risco é
                  reservada para o ÚNICO sinal que é status de verdade aqui
                  (o ícone de excesso, abaixo). `--ink-3` sobre `--surface`
                  mede ~4,9:1 nos dois temas, mesma folga que já era usada
                  para "com equipe"; antes "sem equipe" ficava em `--surface-3`
                  (~1,1:1, quase fundido ao fundo, e é a faixa que MAIS
                  aparece: 62 dos 97 serviços não têm equipe). Sendo cinza puro,
                  a distinção sobrevive a quem não percebe matiz, só depende
                  de luminância, que é justamente o canal que sobrou intacto;
                  as duas faixas separam 3,70:1 no claro e 3,47:1 no escuro,
                  acima do piso de 3:1 de elemento gráfico. Contra os três
                  fundos que a coluna pode ter, o pior caso de cada faixa é
                  4,57:1 (`ink-3` sobre `surface-3`) no claro e 3,98:1 (`ink-3`
                  sobre `accent-soft`) no escuro. `border-t` em cada faixa (não
                  só no envoltório) dá a cada uma um contorno próprio: sem ele,
                  a faixa de cima flutuava sem nenhuma borda quando não
                  alcançava o topo do envoltório. */}
              <span
                aria-hidden="true"
                className="flex h-8 w-full flex-col justify-end overflow-hidden rounded-t-xs border border-border-strong"
              >
                <span
                  style={{ height: `${(r.semEquipe / teto) * 100}%` }}
                  className="block w-full shrink-0 border-t border-border-strong bg-ink-3"
                />
                <span
                  style={{ height: `${(r.comEquipe / teto) * 100}%` }}
                  className="block w-full shrink-0 border-t border-border-strong bg-ink"
                />
              </span>
              <span
                aria-hidden="true"
                className="mt-0.5 block h-px w-full bg-transparent group-hover:bg-accent-line group-focus-visible:bg-accent-line"
              />

              {/* Número do dia: sem ele, a única forma de saber qual data uma
                  coluna representa era passar o mouse e ouvir o `aria-label`,
                  nada visível âncora a barra a um dia do calendário. `tnum`
                  porque é número em coluna (28 lado a lado). Não é `aria-hidden`
                  por decoração; é porque o `aria-label` do botão já fala a data
                  inteira por extenso, repetir "13" aqui pro leitor de tela
                  seria o mesmo fato duas vezes, na forma pior primeiro (mesmo
                  argumento do `sr-only` em `cabecalho-dia.tsx`). */}
              <span
                aria-hidden="true"
                className={cn(
                  "tnum mt-0.5 block text-center font-mono text-2xs",
                  ehHoje ? "font-semibold text-ink" : "text-ink-3",
                )}
              >
                {fmt.n(parseData(r.dia).getDate())}
              </span>
              {ehHoje ? (
                <span aria-hidden="true" className="mx-auto mt-0.5 h-0.5 w-3 rounded-full bg-accent-line" />
              ) : null}
            </button>
          );
        })}
      </div>

    </div>
  );
}
