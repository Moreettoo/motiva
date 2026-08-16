"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { ChartLine, OctagonAlert, Scissors } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Segmentado, type OpcaoSegmentada } from "@/components/ui/segmentado";
import {
  Tabela,
  TabelaCabecalho,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from "@/components/ui/tabela";
import { EstadoVazio } from "@/components/ui/vazio";
import { DicaGrafico, DicaLinha, DicaTitulo } from "@/components/viz/dica-grafico";
import {
  almofadaDominio,
  caminhoLinha,
  comprimentoLinha,
  dominioComTicks,
  escalaLinear,
  extensao,
  ticksAgradaveis,
  type Ponto,
} from "@/components/viz/escalas";
import { Legenda, type ItemLegenda } from "@/components/viz/legenda";
import { EixoX, EixoY, MolduraGrafico, type Dimensoes } from "@/components/viz/moldura";
import { diasEntre, fmt, parseData, somarDias } from "@/lib/format";
import type { Execucao, Medicao } from "@/lib/types";
import { clamp } from "@/lib/utils";

const PERIODOS = ["90", "180", "240"] as const;
type Periodo = (typeof PERIODOS)[number];

const OPCOES: OpcaoSegmentada<Periodo>[] = [
  { valor: "90", rotulo: "90 d" },
  { valor: "180", rotulo: "180 d" },
  { valor: "240", rotulo: "240 d" },
];

const DIAS_PROJECAO = 45;
const PASSO_PROJECAO = 5;

/** A projeção é a MESMA entidade da medição: nunca uma segunda cor de série,
 *  senão o gráfico sugere duas grandezas diferentes.
 *
 *  As duas usam o MESMO passo de cor: quem separa medição de projeção é o traço
 *  tracejado, e a legenda diz isso por extenso. Apagar a projeção com
 *  color-mix chegava a 1,98:1 no tema escuro e 1,82:1 no claro, abaixo do
 *  mínimo de 3:1 para marca de gráfico. Não se gasta contraste codificando o
 *  que o padrão do traço já carrega. */
const COR_MEDIDA = "var(--s1)";
const COR_PROJECAO = "var(--s1)";

/** Passo redondo não ganha casa decimal à toa: "40" ao lado de "37,5" desalinha a coluna. */
function rotularY(v: number): string {
  return Number.isInteger(v) ? fmt.n(v) : fmt.d1(v);
}

/**
 * Altura da vegetação: medição de campo, projeção do modelo e roçadas.
 *
 * Um eixo Y só (cm). A parte tracejada não é medida, é a última medição
 * estendida pela taxa prevista, e por isso muda de traço e de intensidade além
 * de aparecer nomeada na legenda.
 */
export function GraficoAltura({
  medicoes,
  execucoes,
  limiteCm,
  crescimentoCmDia,
  alturaAtualCm,
  hojeIso,
}: {
  medicoes: Medicao[];
  execucoes: Execucao[];
  limiteCm: number;
  crescimentoCmDia: number | null;
  alturaAtualCm: number | null;
  /** Vem do servidor: calcular "hoje" no cliente faria o primeiro quadro divergir. */
  hojeIso: string;
}) {
  const [periodo, setPeriodo] = useQueryState(
    "periodo",
    parseAsStringLiteral(PERIODOS).withDefault("180"),
  );
  const [ativo, setAtivo] = useState<number | null>(null);

  const dias = Number(periodo);

  const modelo = useMemo(() => {
    const hoje = parseData(hojeIso);
    const tHoje = hoje.getTime();
    const tInicio = somarDias(hoje, -dias).getTime();

    const medidos = medicoes
      .map((m) => ({ t: parseData(m.data).getTime(), y: Number(m.altura_cm) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y) && p.t >= tInicio)
      .sort((a, b) => a.t - b.t);

    const taxa = crescimentoCmDia == null ? null : Number(crescimentoCmDia);
    const ultima = medidos.length ? medidos[medidos.length - 1] : null;

    // `altura_atual_cm` já é extrapolada; sem ela, extrapolamos aqui do mesmo jeito.
    const alturaHoje =
      alturaAtualCm != null
        ? Number(alturaAtualCm)
        : ultima && taxa != null
          ? Math.max(0, ultima.y + taxa * diasEntre(new Date(ultima.t), hoje))
          : null;

    const projetados: { t: number; y: number }[] = [];
    if (alturaHoje != null && Number.isFinite(alturaHoje)) {
      // O traço começa na última medição real: o pedaço entre ela e hoje também
      // é extrapolação, e desenhá-lo cheio mentiria sobre o que foi medido.
      if (ultima && ultima.t < tHoje) projetados.push({ t: ultima.t, y: ultima.y });
      for (let d = 0; d <= DIAS_PROJECAO; d += PASSO_PROJECAO) {
        projetados.push({
          t: somarDias(hoje, d).getTime(),
          y: Math.max(0, alturaHoje + (taxa ?? 0) * d),
        });
      }
    }

    const mapaMedida = new Map(medidos.map((p) => [p.t, p.y]));
    const mapaProjecao = new Map(projetados.map((p) => [p.t, p.y]));

    const rocadas = execucoes
      .map((e) => ({ id: e.id, t: parseData(e.data_execucao).getTime(), data: e.data_execucao }))
      .filter((e) => Number.isFinite(e.t) && e.t >= tInicio && e.t <= tHoje)
      .sort((a, b) => a.t - b.t);

    const mapaRocada = new Map(rocadas.map((r) => [r.t, r]));
    const eixo = [...new Set([...mapaMedida.keys(), ...mapaProjecao.keys()])].sort((a, b) => a - b);
    const valores = [...mapaMedida.values(), ...mapaProjecao.values(), limiteCm];

    return { medidos, projetados, mapaMedida, mapaProjecao, mapaRocada, rocadas, eixo, valores, tHoje };
  }, [medicoes, execucoes, limiteCm, crescimentoCmDia, alturaAtualCm, hojeIso, dias]);

  const { medidos, projetados, mapaMedida, mapaProjecao, mapaRocada, rocadas, eixo, valores, tHoje } =
    modelo;

  const [minAlvo, maxAlvo] = almofadaDominio(valores, { naoNegativo: true });
  const ticksY = ticksAgradaveis(minAlvo, maxAlvo, 5);
  const dominioY = dominioComTicks([minAlvo, maxAlvo], ticksY);
  const dominioX = extensao(eixo);

  const semDados = eixo.length === 0;
  const fimProjecao = projetados.length ? projetados[projetados.length - 1] : null;

  function escalas(dentro: Dimensoes["dentro"]) {
    return {
      x: escalaLinear({ dominio: dominioX, alcance: [dentro.x, dentro.x + dentro.largura] }),
      y: escalaLinear({ dominio: dominioY, alcance: [dentro.y + dentro.altura, dentro.y] }),
    };
  }

  // Legenda é chave do que está desenhado: entrada de série ausente manda o
  // gestor procurar no gráfico um traço que não existe.
  const rocadasNoEixo = rocadas.filter((r) => r.t >= dominioX[0] && r.t <= dominioX[1]);

  const itensLegenda: ItemLegenda[] = [
    ...(medidos.length ? [{ rotulo: "Altura medida em campo", cor: COR_MEDIDA }] : []),
    ...(projetados.length >= 2
      ? [{ rotulo: `Projeção do modelo · ${DIAS_PROJECAO} dias (tracejado)`, cor: COR_PROJECAO }]
      : []),
    { rotulo: `Limite de ${fmt.cm(limiteCm)}`, cor: "var(--critical)", icone: <OctagonAlert /> },
    ...(rocadasNoEixo.length
      ? [{ rotulo: "Roçada executada", cor: "var(--ink-3)", icone: <Scissors /> }]
      : []),
  ];

  const tabela = (
    <Tabela rotulo="Altura da vegetação por data" className="max-h-80">
      <TabelaCabecalho>
        <tr>
          <TabelaTitulo>Data</TabelaTitulo>
          <TabelaTitulo numerica>Medida (cm)</TabelaTitulo>
          <TabelaTitulo numerica>Projeção (cm)</TabelaTitulo>
          <TabelaTitulo>Evento</TabelaTitulo>
        </tr>
      </TabelaCabecalho>
      <TabelaCorpo>
        {eixo.map((t) => {
          const medida = mapaMedida.get(t);
          const projecao = mapaProjecao.get(t);
          return (
            <TabelaLinha key={t}>
              <TabelaCelula className="tnum font-mono whitespace-nowrap">
                {fmt.dataMedia(new Date(t))}
              </TabelaCelula>
              <TabelaCelula numerica className="font-mono">
                {medida == null ? "—" : fmt.d1(medida)}
              </TabelaCelula>
              <TabelaCelula numerica className="font-mono">
                {projecao == null ? "—" : fmt.d1(projecao)}
              </TabelaCelula>
              <TabelaCelula className="text-ink-3">
                {mapaRocada.has(t) ? "Roçada" : t === tHoje ? "Hoje" : ""}
              </TabelaCelula>
            </TabelaLinha>
          );
        })}
      </TabelaCorpo>
    </Tabela>
  );

  return (
    <Cartao>
      <CartaoCabecalho
        como="h2"
        icone={<ChartLine />}
        titulo="Altura da vegetação"
        descricao="Medição de campo, projeção do modelo e roçadas registradas no trecho."
        acoes={
          <Segmentado
            tamanho="sm"
            rotulo="Período do histórico"
            opcoes={OPCOES}
            valor={periodo}
            aoMudar={(valor) => {
              setAtivo(null);
              void setPeriodo(valor);
            }}
          />
        }
      />

      <CartaoCorpo>
        <MolduraGrafico
          titulo="Altura em cm"
          descricao={
            fimProjecao
              ? `Últimos ${dias} dias · projeção até ${fmt.dataMedia(new Date(fimProjecao.t))}`
              : `Últimos ${dias} dias`
          }
          altura={320}
          margens={{ topo: 30, direita: 18, baixo: 28, esquerda: 48 }}
          legenda={<Legenda itens={itensLegenda} />}
          tabela={tabela}
          vazio={
            semDados ? (
              <EstadoVazio
                icone={<ChartLine />}
                titulo="Sem série para desenhar"
                descricao="Nenhuma medição neste período e nenhuma previsão para projetar. Registre uma medição abaixo ou amplie o período."
              />
            ) : undefined
          }
          sobreposicao={({ dentro }) => {
            if (ativo == null) return null;
            const t = eixo[ativo];
            if (t == null) return null;

            const { x, y } = escalas(dentro);
            const medida = mapaMedida.get(t);
            const projecao = mapaProjecao.get(t);
            const rocada = mapaRocada.get(t);

            const alturas = [medida, projecao].filter((v): v is number => v != null).map(y);
            const topo = alturas.length ? Math.min(...alturas) : dentro.y + dentro.altura / 2;

            return (
              <DicaGrafico x={x(t)} y={topo} visivel>
                <DicaTitulo>{fmt.dataMedia(new Date(t))}</DicaTitulo>
                <div className="space-y-1">
                  {medida != null ? (
                    <DicaLinha cor={COR_MEDIDA} rotulo="Medida" valor={fmt.cm(medida)} />
                  ) : null}
                  {projecao != null ? (
                    <DicaLinha cor={COR_PROJECAO} rotulo="Projeção" valor={fmt.cm(projecao)} />
                  ) : null}
                  {rocada ? <p className="text-ink-3">Roçada executada nesta data.</p> : null}
                </div>
              </DicaGrafico>
            );
          }}
        >
          {({ dentro }) => {
            const { x, y } = escalas(dentro);
            const base = dentro.y + dentro.altura;
            const yLimite = y(limiteCm);
            const xHoje = x(tHoje);
            const limiteAcima = yLimite - 6 > dentro.y + 10;

            // Sem projeção o eixo termina na última medição: marca fora do domínio
            // seria desenhada por cima da margem, já que o SVG não recorta.
            const noEixo = (t: number) => t >= dominioX[0] && t <= dominioX[1];

            const coordsMedida: Ponto[] = medidos.map((p) => [x(p.t), y(p.y)]);
            const coordsProjecao: Ponto[] = projetados.map((p) => [x(p.t), y(p.y)]);

            const qtdMarcas = clamp(Math.floor(dentro.largura / 86), 2, 6);
            const marcasX = Array.from({ length: qtdMarcas }, (_, k) => {
              const t = dominioX[0] + ((dominioX[1] - dominioX[0]) * k) / (qtdMarcas - 1);
              return { posicao: x(t), rotulo: fmt.dataCurta(new Date(t)) };
            });

            const estiloMedida = {
              "--dash": comprimentoLinha(coordsMedida),
              stroke: COR_MEDIDA,
            } as CSSProperties;

            return (
              <>
                <EixoY ticks={ticksY} escala={y} dentro={dentro} formatar={rotularY} />

                <text
                  x={2}
                  y={dentro.y - 10}
                  className="fill-ink-3 text-2xs font-medium tracking-wider uppercase"
                >
                  cm
                </text>

                {/* Roçadas: marca vertical discreta, rótulo na vertical para nunca
                    colidir com o rótulo da roçada vizinha. */}
                <g aria-hidden="true">
                  {rocadasNoEixo.map((r) => {
                    const px = x(r.t);
                    return (
                      <g key={r.id}>
                        <line
                          x1={px}
                          y1={dentro.y}
                          x2={px}
                          y2={base}
                          className="stroke-ink-3"
                          strokeWidth="1"
                          strokeOpacity="0.45"
                          strokeDasharray="2 4"
                          shapeRendering="crispEdges"
                        />
                        <circle cx={px} cy={base} r="2.5" className="fill-ink-3" />
                        <text
                          x={px}
                          y={base - 8}
                          dy={-4}
                          transform={`rotate(-90 ${px} ${base - 8})`}
                          className="fill-ink-3 text-2xs"
                        >
                          Roçada {fmt.dataCurta(r.data)}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* Fronteira entre o que foi medido e o que é conta. */}
                {noEixo(tHoje) ? (
                  <g aria-hidden="true">
                    <line
                      x1={xHoje}
                      y1={dentro.y}
                      x2={xHoje}
                      y2={base}
                      className="stroke-axis"
                      strokeWidth="1"
                      shapeRendering="crispEdges"
                    />
                    <text x={xHoje + 4} y={dentro.y + 9} className="fill-ink-3 text-2xs">
                      hoje
                    </text>
                  </g>
                ) : null}

                <g>
                  <line
                    x1={dentro.x}
                    y1={yLimite}
                    x2={dentro.x + dentro.largura}
                    y2={yLimite}
                    className="stroke-critical"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                  />
                  <text
                    x={dentro.x + 4}
                    y={limiteAcima ? yLimite - 6 : yLimite + 14}
                    className="fill-critical-ink text-2xs font-medium"
                  >
                    Limite {fmt.cm(limiteCm)}
                  </text>
                </g>

                {coordsProjecao.length >= 2 ? (
                  <path
                    d={caminhoLinha(coordsProjecao)}
                    fill="none"
                    strokeWidth="2"
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="fade"
                    style={{ stroke: COR_PROJECAO }}
                  />
                ) : null}

                {coordsMedida.length >= 2 ? (
                  <path
                    d={caminhoLinha(coordsMedida)}
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="draw"
                    style={estiloMedida}
                  />
                ) : null}

                {/* Marcador em TODO ponto medido: aqui cada ponto é uma ida a campo,
                    e distinguir medição de interpolação é o assunto do gráfico. */}
                <g className="fade">
                  {coordsMedida.map(([cx, cy], i) => (
                    <circle
                      key={medidos[i].t}
                      cx={cx}
                      cy={cy}
                      r="4"
                      style={{ fill: COR_MEDIDA }}
                      className="stroke-surface"
                      strokeWidth="2"
                    />
                  ))}
                </g>

                {ativo != null && eixo[ativo] != null ? (
                  <g aria-hidden="true">
                    <line
                      x1={x(eixo[ativo])}
                      y1={dentro.y}
                      x2={x(eixo[ativo])}
                      y2={base}
                      className="stroke-axis"
                      strokeWidth="1"
                      shapeRendering="crispEdges"
                    />
                    {[
                      { valor: mapaMedida.get(eixo[ativo]), cor: COR_MEDIDA },
                      { valor: mapaProjecao.get(eixo[ativo]), cor: COR_PROJECAO },
                    ].map(({ valor, cor }, i) =>
                      valor == null ? null : (
                        <circle
                          key={i}
                          cx={x(eixo[ativo])}
                          cy={y(valor)}
                          r="4.5"
                          style={{ fill: cor }}
                          className="stroke-surface"
                          strokeWidth="2"
                        />
                      ),
                    )}
                  </g>
                ) : null}

                <EixoX dentro={dentro} marcas={marcasX} />

                {/* Alvo de hover = a faixa em volta do ponto, não o traço de 2px.
                    É também o caminho de teclado: o aria-label carrega as leituras. */}
                <g onPointerLeave={() => setAtivo(null)}>
                  {eixo.map((t, i) => {
                    const px = x(t);
                    const inicio = i === 0 ? dentro.x : (x(eixo[i - 1]) + px) / 2;
                    const fim =
                      i === eixo.length - 1 ? dentro.x + dentro.largura : (px + x(eixo[i + 1])) / 2;

                    const medida = mapaMedida.get(t);
                    const projecao = mapaProjecao.get(t);
                    const leitura = [
                      medida == null ? null : `medida ${fmt.cm(medida)}`,
                      projecao == null ? null : `projeção ${fmt.cm(projecao)}`,
                      mapaRocada.has(t) ? "roçada executada" : null,
                    ]
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <rect
                        key={t}
                        x={inicio}
                        y={dentro.y}
                        width={Math.max(1, fim - inicio)}
                        height={dentro.altura}
                        fill="transparent"
                        tabIndex={0}
                        role="img"
                        aria-label={`${fmt.dataMedia(new Date(t))}: ${leitura || "sem leitura"}`}
                        onPointerEnter={() => setAtivo(i)}
                        onFocus={() => setAtivo(i)}
                        onBlur={() => setAtivo(null)}
                      />
                    );
                  })}
                </g>
              </>
            );
          }}
        </MolduraGrafico>
      </CartaoCorpo>
    </Cartao>
  );
}
