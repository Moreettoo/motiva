import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Cartao, CartaoCabecalho, CartaoRodape } from "@/components/ui/cartao";
import type { DeltaIndicador } from "@/components/ui/indicador";
import type { BarraDado } from "@/components/viz/barras";
import type { SerieLinha } from "@/components/viz/linha";
import { corSerie, ESPECIE, ordemRisco } from "@/lib/dominio";
import { diasEntre, fmt, isoHoje, proximaReanalise } from "@/lib/format";
import {
  cargaDasEquipes,
  lacunasDeDados,
  listarAgendamentos,
  listarEquipes,
  listarTrechos,
  montarPainel,
  serieCrescimentoPorEspecie,
  trechosPorRodovia,
} from "@/lib/queries";
import { ESPECIES, type AgendamentoDetalhado, type Especie } from "@/lib/types";
import { sum } from "@/lib/utils";

import { CarimboDoLote } from "./_componentes/carimbo-lote";
import { CargaDasEquipes } from "./_componentes/carga-equipes";
import type { CrescimentoEspecieDado } from "./_componentes/cartao-crescimento";
import { CrescimentoPorEspecie } from "./_componentes/crescimento-especies";
import { DistribuicaoDeRisco } from "./_componentes/distribuicao-risco";
import { ExigemDecisao, type ItemDecisao } from "./_componentes/exigem-decisao";
import { Indicadores } from "./_componentes/indicadores";
import { Lacunas } from "./_componentes/lacunas";
import { LinkAcao } from "./_componentes/link-acao";
import { MalhaEmRelance } from "./_componentes/malha-relance";

export const metadata: Metadata = {
  title: "Painel",
  description:
    "O que exige decisão hoje na faixa de domínio: trechos críticos, roçadas sugeridas pela IA e carga das equipes.",
};

/* Sala de controle lê o banco a cada carregamento. Sem isso a rota seria
   pré-renderizada no build e o gestor abriria a manhã com os números de ontem. */
export const dynamic = "force-dynamic";

const MAX_DECISOES = 6;
const MAX_RODOVIAS = 6;
const JANELA_DECISAO_DIAS = 7;

/**
 * `ia.agendamentos` acumula: uma linha por trecho a cada execução do lote.
 * Só a mais recente de cada trecho ainda é uma decisão de verdade, as
 * anteriores já foram substituídas pela análise seguinte e apareceriam como
 * duplicatas na fila.
 */
function sugestoesVigentes(agendamentos: AgendamentoDetalhado[]): AgendamentoDetalhado[] {
  const porTrecho = new Map<number, AgendamentoDetalhado>();

  for (const a of agendamentos) {
    if (a.status !== "sugerido") continue;
    const atual = porTrecho.get(a.trecho_id);
    const maisNova =
      !atual || a.criado_em > atual.criado_em || (a.criado_em === atual.criado_em && a.id > atual.id);
    if (maisNova) porTrecho.set(a.trecho_id, a);
  }

  return [...porTrecho.values()];
}

/** Variação do crescimento médio entre a última leitura e a de ~7 dias antes. */
function variacaoCrescimento(datas: string[], valores: number[]): DeltaIndicador | undefined {
  if (valores.length < 2) return undefined;

  const fim = valores.length - 1;
  let inicio = -1;
  for (let i = fim - 1; i >= 0; i -= 1) {
    if (diasEntre(datas[i], datas[fim]) >= 7) {
      inicio = i;
      break;
    }
  }
  if (inicio < 0) return undefined;

  const variacao = valores[fim] - valores[inicio];
  const dias = diasEntre(datas[inicio], datas[fim]);
  // Abaixo de 0,005 cm/dia a diferença some no arredondamento de três casas.
  const direcao = Math.abs(variacao) < 0.005 ? "estavel" : variacao > 0 ? "sobe" : "desce";
  const sinal = direcao === "sobe" ? "+" : direcao === "desce" ? "−" : "";

  return {
    valor: `${sinal}${fmt.d3(Math.abs(variacao))} cm/dia em ${dias} dias`,
    direcao,
    // Vegetação crescendo mais rápido aperta a fila de roçada: subir é ruim.
    bom: direcao === "estavel" ? undefined : direcao === "desce",
  };
}

export default async function PaginaPainel() {
  const [painel, trechos, porRodovia, serie, carga, lacunas, agendamentos, equipes] = await Promise.all([
    montarPainel(),
    listarTrechos(),
    trechosPorRodovia(),
    serieCrescimentoPorEspecie(45),
    cargaDasEquipes(),
    lacunasDeDados(),
    // Sem filtro de propósito: `montarPainel` já pediu esta mesma lista, e o
    // `cache()` do React só deduplica quando os argumentos são idênticos.
    listarAgendamentos(),
    listarEquipes(),
  ]);

  const hoje = isoHoje();
  const porTrecho = new Map(trechos.map((t) => [t.id, t]));

  const kmEmRisco = sum(
    trechos.filter((t) => t.risco === "critica").map((t) => Number(t.extensao_km) || 0),
  );

  /* Exige decisão o que a IA sugeriu e ninguém confirmou: prioridade crítica ou
     alta, ou data sugerida dentro da semana (incluindo as que já venceram). */
  const urgentes = sugestoesVigentes(agendamentos)
    .filter(
      (a) =>
        a.prioridade === "critica" ||
        a.prioridade === "alta" ||
        diasEntre(hoje, a.data_sugerida) <= JANELA_DECISAO_DIAS,
    )
    .sort(
      (a, b) =>
        ordemRisco(a.prioridade) - ordemRisco(b.prioridade) ||
        (a.previsao?.dias_ate_limite ?? 9999) - (b.previsao?.dias_ate_limite ?? 9999) ||
        a.data_sugerida.localeCompare(b.data_sugerida),
    );

  const decisoes: ItemDecisao[] = urgentes.slice(0, MAX_DECISOES).map((a) => {
    const trecho = porTrecho.get(a.trecho_id);
    const previsao = a.previsao;

    return {
      id: a.id,
      trechoId: a.trecho.id,
      rodovia: a.trecho.rodovia,
      uf: a.trecho.uf,
      kmInicio: Number(a.trecho.km_inicio),
      kmFim: Number(a.trecho.km_fim),
      sentido: a.trecho.sentido,
      prioridade: a.prioridade,
      diasAteLimite: previsao?.dias_ate_limite ?? trecho?.dias_ate_limite ?? null,
      dataSugerida: a.data_sugerida,
      justificativa: a.justificativa,
      fatores: a.fatores ?? [],
      crescimentoCmDia:
        previsao?.crescimento_cm_dia != null
          ? Number(previsao.crescimento_cm_dia)
          : trecho?.crescimento_cm_dia != null
            ? Number(trecho.crescimento_cm_dia)
            : null,
      alturaAtualCm:
        previsao?.altura_atual_cm != null
          ? Number(previsao.altura_atual_cm)
          : trecho?.altura_atual_cm != null
            ? Number(trecho.altura_atual_cm)
            : null,
      alturaLimiteCm: Number(a.trecho.altura_limite_cm),
      equipe: a.equipe?.nome ?? null,
      equipeId: a.equipe?.id ?? null,
    };
  });

  const decisoesRestantes = urgentes.length - decisoes.length;

  /* Cor por ENTIDADE: o slot vem da posição da espécie em `ESPECIES`, não da
     ordem em que ela apareceu no recorte. Uma espécie sumir não repinta as outras. */
  const seriesEspecie: SerieLinha[] = serie.especies.map((nome, i) => {
    const chave = nome as Especie;
    const slot = ESPECIES.indexOf(chave);

    return {
      chave: nome,
      rotulo: ESPECIE[chave]?.rotulo ?? nome,
      cor: corSerie(slot >= 0 ? slot : ESPECIES.length + i),
      pontos: serie.pontos.map((p) => ({ x: p.data, y: Number(p[nome]) || 0 })),
    };
  });

  const datasSerie = serie.pontos.map((p) => p.data);
  const mediaDiaria = serie.pontos.map((p) => {
    const leituras = serie.especies.map((e) => Number(p[e]) || 0).filter((v) => v > 0);
    return leituras.length ? sum(leituras) / leituras.length : 0;
  });

  /* Verso do card "Crescimento médio": o mesmo cálculo de `montarPainel`
     (média/pico do crescimento mais recente por trecho), só que agrupado por
     espécie em vez da malha inteira. Ordem fixa de `ESPECIES`, não a do
     recorte, pela mesma razão de `seriesEspecie`: a cor é da entidade. */
  const crescimentoPorEspecie: CrescimentoEspecieDado[] = ESPECIES.map((especie, i) => {
    const doGrupo = trechos.filter((t) => t.especie === especie);
    const valores = doGrupo.map((t) => t.crescimento_cm_dia ?? 0).filter((v) => v > 0);
    const valoresSerie = serie.pontos.map((p) => Number(p[especie]) || 0);

    return {
      especie,
      rotulo: ESPECIE[especie].rotulo,
      cor: corSerie(i),
      valor: valores.length ? sum(valores) / valores.length : 0,
      pico: valores.length ? Math.max(...valores) : 0,
      delta: variacaoCrescimento(datasSerie, valoresSerie),
      serie: valoresSerie,
    };
  });

  const cargaOrdenada = [...carga].sort((a, b) => b.ocupacao - a.ocupacao);
  const sobrecarregadas = cargaOrdenada.filter((c) => c.ocupacao > 100).length;
  const barrasCarga: BarraDado[] = cargaOrdenada.map((c) => ({
    // Todas as equipes começam com "Equipe Roçada": o prefixo não distingue nada
    // e só rouba largura do rótulo.
    rotulo: c.equipe.nome.replace(/^Equipe\s+Roçada\s+/i, ""),
    valor: c.ocupacao,
    ...(c.ocupacao > 100 ? { cor: "var(--critical)", icone: "OctagonAlert" } : {}),
  }));

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Painel"
        destaque
        acoes={<CarimboDoLote proximaEm={proximaReanalise()} />}
      />

      <Indicadores
        painel={painel}
        rodovias={porRodovia.length}
        kmEmRisco={kmEmRisco}
        serieCrescimento={mediaDiaria}
        deltaCrescimento={variacaoCrescimento(datasSerie, mediaDiaria)}
        crescimentoPorEspecie={crescimentoPorEspecie}
      />

      <DistribuicaoDeRisco
        porRisco={painel.por_risco}
        total={painel.trechos_total}
        indice={5}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Cartao className="rise" style={{ "--i": 6 } as CSSProperties}>
          <CartaoCabecalho
            icone={<ListChecks />}
            titulo="Exigem decisão"
            descricao="Sugestões da IA ainda sem resposta, da mais urgente para a menos."
            acoes={<LinkAcao href="/agenda">Ver agenda</LinkAcao>}
          />

          <ExigemDecisao itens={decisoes} equipes={equipes} />

          {decisoesRestantes > 0 ? (
            <CartaoRodape>
              <span className="tnum">
                {decisoesRestantes === 1
                  ? "Mais 1 sugestão aguardando decisão."
                  : `Mais ${decisoesRestantes} sugestões aguardando decisão.`}
              </span>
              <LinkAcao href="/agenda" className="ml-auto">
                Ver todas na agenda
              </LinkAcao>
            </CartaoRodape>
          ) : null}
        </Cartao>

        <div className="flex min-w-0 flex-col gap-6">
          <Cartao className="rise p-5" style={{ "--i": 7 } as CSSProperties}>
            <h2 className="sr-only">Crescimento por espécie</h2>
            <CrescimentoPorEspecie series={seriesEspecie} />
          </Cartao>

          <Cartao className="rise p-5" style={{ "--i": 8 } as CSSProperties}>
            <h2 className="sr-only">Carga das equipes</h2>
            <CargaDasEquipes dados={barrasCarga} sobrecarregadas={sobrecarregadas} />
          </Cartao>
        </div>
      </div>

      <MalhaEmRelance
        rodovias={porRodovia.slice(0, MAX_RODOVIAS)}
        totalRodovias={porRodovia.length}
        indice={9}
      />

      <Lacunas lacunas={lacunas} />
    </div>
  );
}
