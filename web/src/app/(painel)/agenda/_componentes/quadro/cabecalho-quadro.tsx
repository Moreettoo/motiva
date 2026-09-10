"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, OctagonAlert } from "lucide-react";

import { Botao, BotaoIcone, classesBotao } from "@/components/ui/botao";
import { IconeDominio, Legenda } from "@/components/viz/legenda";
import { RISCO } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { Risco } from "@/lib/types";

import type { Janela } from "../dados";

/**
 * O topo do quadro: navegar a semana, ler a semana, ver o que está errado, e os
 * dois controles que governam o quadro.
 *
 * Existe como arquivo próprio por duas razões. Uma é tamanho, `quadro-semana`
 * já carrega o arrasto, o roving tabindex e as regiões vivas, e não precisa
 * também do cabeçalho. A outra é que este é o lugar para onde vieram morar
 * números que antes eram uma FAIXA de quatro mostradores (`resumo.tsx`,
 * apagado): "roçadas planejadas" e "km previstos" descrevem a semana que o
 * quadro desenha, então são a legenda dele, não um painel à parte.
 *
 * O que NÃO veio junto, e por quê:
 *  - "equipes mobilizadas 8 de 10": o quadro já mostra, nas linhas sem cartão.
 *    Um número que repete o que está desenhado a dez centímetros não informa.
 *  - "críticos sem data 0": virou `criticosSemData`, que só aparece quando é
 *    maior que zero. Ocupar um quarto de faixa para dizer "nada errado" é o
 *    oposto de um alerta.
 *
 * A LEGENDA é uma só, e antes eram duas mais três frases soltas. As faixas de
 * risco vão até `media`: pela regra de negócio, trecho de risco `baixa` não tem
 * agendamento em aberto (ver a spec de 2026-08-14), então um cartão verde não
 * pode aparecer no quadro e nomear a faixa seria prometer uma cor que não vem.
 */

/** As faixas que podem aparecer num cartão do quadro. `baixa` fica de fora, ver
 *  o comentário acima. Escrita à mão e não derivada de `ORDEM_RISCO` de
 *  propósito: derivar com um `.filter()` esconderia a decisão dentro de uma
 *  expressão, e esta lista é uma afirmação sobre o domínio. */
const RISCOS_NO_QUADRO: Risco[] = ["critica", "alta", "media"];

export function CabecalhoQuadro({
  janela,
  hoje,
  rocadas,
  km,
  totalAtrasados,
  semanaAtraso,
  criticosSemData,
  controles,
  acoes,
  aoNavegarSemana,
  aoIrParaHoje,
  aoIrParaAtrasados,
}: {
  janela: Janela;
  hoje: string;
  /** Serviços com data na semana visível, em TODO status que o filtro deixou
   *  passar: o mesmo conjunto que a grade desenha, e por isso conferível
   *  contando cartões. Já contou só os em aberto, e com "Executado" ligado
   *  anunciava "0 roçadas" sobre uma semana cheia de cartões. */
  rocadas: number;
  km: number;
  /** Da malha inteira, não da semana: o filtro escolhe o que olhar e não pode
   *  decidir se o problema existe. Por isso este número navega em vez de só
   *  informar, ver `aoIrParaAtrasados`. */
  totalAtrasados: number;
  semanaAtraso: string | null;
  /** Trechos de risco crítico sem nenhum agendamento em aberto. Também da malha
   *  inteira, e por isso leva para `/malha`, que é onde o problema se resolve. */
  criticosSemData: number;
  /** `<Controles>`, filtro de status e destaque de equipe. Vem como nó e não
   *  como props porque este componente não tem nada a dizer sobre eles: só
   *  reserva o canto direito. */
  controles: React.ReactNode;
  /** O botão que abre a criação manual, pelo mesmo contrato de `controles`.
   *  Nó separado e não junto deles porque são coisas diferentes: os controles
   *  mudam o que se VÊ, este muda o que EXISTE. Ficam no mesmo canto, e o
   *  primeiro na ordem de leitura e de Tab é o que cria, a ação de escrita
   *  não deve estar atrás de três filtros. */
  acoes: React.ReactNode;
  aoNavegarSemana: (delta: -1 | 1) => void;
  aoIrParaHoje: () => void;
  aoIrParaAtrasados: () => void;
}) {
  const semanaDeHoje = janela.dias.includes(hoje);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <BotaoIcone rotulo="Semana anterior" tamanho="sm" onClick={() => aoNavegarSemana(-1)}>
            <ChevronLeft />
          </BotaoIcone>

          {/* Sem `aria-live`, de propósito: esta faixa é o RÓTULO do controle que
              a própria pessoa acabou de acionar (‹, ›, Hoje, ou uma coluna do
              mini-mapa), o foco permanece no botão e o passo do movimento já
              narra a chegada. Viva, ela só competia com as duas regiões vivas do
              quadro, um Shift+seta durante um movimento por teclado disparava
              três anúncios de uma vez. */}
          <p className="tnum min-w-0 font-mono text-sm text-ink">
            {fmt.dataCurta(janela.inicio)} – {fmt.dataMedia(janela.fim)}
          </p>

          <BotaoIcone rotulo="Próxima semana" tamanho="sm" onClick={() => aoNavegarSemana(1)}>
            <ChevronRight />
          </BotaoIcone>

          {/* Só quando leva a algum lugar. Na semana de hoje o botão não faz
              nada, e um controle inerte ao lado de dois que funcionam é ruído
              que a pessoa tem de testar para descobrir que é ruído. */}
          {semanaDeHoje ? null : (
            <Botao tamanho="sm" variante="fantasma" onClick={aoIrParaHoje}>
              Hoje
            </Botao>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {acoes}
          {controles}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          {/* A legenda numérica da semana: o que sobrou, com uso, da faixa de
              quatro mostradores. Texto corrido e não cartões: são duas medidas
              do mesmo conjunto que está desenhado logo abaixo, e cartão daria a
              elas o peso de um indicador independente. */}
          <p className="tnum min-w-0 font-mono text-2xs text-ink-3">
            {fmt.contar(rocadas, "roçada", "roçadas")} <span aria-hidden="true">·</span>{" "}
            {fmt.d1(km)} km
          </p>

          {totalAtrasados > 0 && semanaAtraso ? (
            <Botao
              tamanho="sm"
              variante="perigo"
              iconeEsquerda={<OctagonAlert />}
              onClick={aoIrParaAtrasados}
            >
              {fmt.contar(totalAtrasados, "vencido")} · ir para a semana
            </Botao>
          ) : null}

          {criticosSemData > 0 ? (
            <Link
              href="/malha"
              className={classesBotao("perigo", "sm")}
              aria-label={`${fmt.contar(criticosSemData, "trecho crítico", "trechos críticos")} sem agendamento. Abrir a malha.`}
            >
              <OctagonAlert aria-hidden="true" className="size-3.5" />
              {fmt.contar(criticosSemData, "crítico")} sem data
            </Link>
          ) : null}
        </div>

        <Legenda
          className="text-2xs"
          itens={[
            ...RISCOS_NO_QUADRO.map((risco) => ({
              rotulo: RISCO[risco].rotulo,
              cor: RISCO[risco].cor,
              icone: <IconeDominio nome={RISCO[risco].icone} />,
            })),
            // As duas bandas do mini-mapa e a hachura de excesso entram na MESMA
            // linha das faixas de risco. Eram um bloco separado logo abaixo da
            // faixa de 28 dias, mais duas frases explicando o que já está dito
            // aqui, e as duas legendas respondem à mesma pergunta ("o que esta
            // cor quer dizer?"), então lidas juntas custam menos que lidas em
            // dois lugares.
            { rotulo: "Com equipe", cor: "var(--ink)" },
            { rotulo: "Sem equipe", cor: "var(--ink-3)" },
            {
              rotulo: "Acima da capacidade",
              cor: "var(--critical)",
              icone: <OctagonAlert />,
            },
          ]}
        />
      </div>
    </div>
  );
}
