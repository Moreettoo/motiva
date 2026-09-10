import { Suspense } from "react";
import { Brain, MapPin, Ruler, Shovel, Sparkles, TrendingUp } from "lucide-react";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Indicador } from "@/components/ui/indicador";
import { Leitura } from "@/components/ui/leitura";
import { resumir } from "@/lib/clima";
import { ESPECIE, REGIME } from "@/lib/dominio";
import { fmt, isoHoje } from "@/lib/format";
import { janelaDoPeriodo } from "@/lib/open-meteo";
import { trechoMaisProximo } from "@/lib/queries";
import { bandaQueCruza, simular } from "@/lib/simulacao";
import { soloDoPonto } from "@/lib/solo";

import { Curva } from "./curva";
import { JanelaClima } from "./janela-clima";
import { LeituraCarregando, LeituraGestor } from "./leitura-gestor";
import type { Pedido } from "./parametros";

/** Acima disso o trecho vizinho deixa de ser vizinhança e vira só "o mais
 *  próximo que existe", a tela passa a dizer isso com todas as letras. */
const LONGE_DEMAIS_KM = 150;

export async function Resultado({ pedido }: { pedido: Pedido }) {
  // As três buscas são independentes e nenhuma delas encadeia na outra. O
  // SoilGrids é o mais lento dos três e seria bobagem serializá-lo atrás do
  // clima; cada um tem seu próprio cache e seu próprio orçamento de tempo.
  const [janela, vizinho, soloDoMapa] = await Promise.all([
    janelaDoPeriodo(pedido.latitude, pedido.longitude, pedido.periodo.inicio, pedido.periodo.fim),
    trechoMaisProximo(pedido.latitude, pedido.longitude),
    soloDoPonto(pedido.latitude, pedido.longitude, pedido.regime),
  ]);
  const regime = REGIME[pedido.regime];

  // O formulário só sobrepõe o mapa quando alguém digitou. Vazio quer dizer
  // "pergunte ao SoilGrids", que é o que o lote diário faz.
  const fertilidade = pedido.fertilidade ?? soloDoMapa.fertilidade;
  const capacidadeMm = pedido.capacidadeMm ?? soloDoMapa.capacidadeMm;
  const soloManual = pedido.fertilidade != null || pedido.capacidadeMm != null;

  const simulacao = simular(
    {
      especie: pedido.especie,
      latitude: pedido.latitude,
      alturaInicialCm: pedido.alturaCm,
      dias: pedido.periodo.dias,
      diasDesdeRocada: pedido.diasDesdeRocada,
      fertilidade,
      capacidadeMm,
    },
    janela,
  );

  const diasSimulados = simulacao.pontos.length - 1;
  const resumo = {
    ...resumir(janela.dias.slice(0, diasSimulados)),
    aguaSoloMediaPct: simulacao.aguaSoloMediaPct,
  };

  const perto = vizinho != null && vizinho.distanciaKm <= LONGE_DEMAIS_KM;
  const limiteCm = vizinho ? Number(vizinho.trecho.altura_limite_cm) : null;
  const banda = limiteCm != null ? bandaQueCruza(simulacao, limiteCm) : null;
  const cruza = banda?.mediana ?? null;

  // A data final sai do PERIODO, e nao mais de "hoje + n". Quando a série de
  // clima é mais curta que o pedido, `diasSimulados` encolhe e a data tem que
  // encolher junto — senão o cartão anuncia uma data que a curva não alcança.
  const dataFinal = janela.dias[diasSimulados - 1]?.data ?? pedido.periodo.fim;
  const noPassado = pedido.periodo.fim < isoHoje();

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      {/* A faixa amarela "Este pedido sai do que o modelo viu no treino" saiu
          daqui a pedido. `simulacao.extrapolacoes` segue existindo e testado, e
          é de onde qualquer outra superfície futura deve ler; não recalcule a
          regra. O componente `faixas-modelo.tsx` continua no repositório sem
          chamador — ver o cabeçalho daquele arquivo. */}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo={noPassado ? "Altura ao fim do período" : `Altura em ${fmt.contar(diasSimulados, "dia")}`}
          valor={fmt.d1(simulacao.alturaFinalCm)}
          unidade="cm"
          icone={<Ruler />}
          nota={`${fmt.dataMedia(pedido.periodo.inicio)} a ${fmt.dataMedia(dataFinal)}`}
          indice={0}
        />
        <Indicador
          rotulo="Crescimento no período"
          valor={`+${fmt.d1(simulacao.crescimento.q50)}`}
          unidade="cm"
          icone={<TrendingUp />}
          // O intervalo na nota, e não escondido: é a diferença entre o modelo
          // novo e o antigo. Um número sozinho aqui prometeria uma precisão
          // que o crescimento de grama não tem.
          nota={`Intervalo de 80%: +${fmt.d1(simulacao.crescimento.q10)} a +${fmt.d1(
            simulacao.crescimento.q90,
          )} cm`}
          indice={1}
        />
        <Indicador
          rotulo="Ritmo previsto"
          valor={fmt.d3(simulacao.crescimentoCmDia)}
          unidade="cm/dia"
          icone={<Brain />}
          nota={`Média do período · ${ESPECIE[pedido.especie].rotulo} · ${fmt.contar(
            pedido.diasDesdeRocada,
            "dia",
          )} desde a roçada`}
          indice={2}
        />
        <Indicador
          rotulo="Cruza o limite de referência"
          // "0 dias" seria tecnicamente certo e leria como defeito. O domínio
          // já tem frase para o caso (`rotuloPrazo`): quem começa acima do
          // limite não cruza em zero dias, ele já está acima.
          valor={cruza == null ? "não cruza" : cruza === 0 ? "já acima" : fmt.contar(cruza, "dia")}
          icone={<MapPin />}
          nota={
            limiteCm == null
              ? "Sem trecho de referência na malha"
              : cruza === 0
                ? `Já começa acima dos ${fmt.cm(limiteCm)} do trecho vizinho`
                : cruza != null
                  ? // As pontas trocam de papel: mais crescimento cruza ANTES.
                    banda?.cedo != null && banda.cedo !== cruza
                    ? `Entre ${banda.cedo} e ${
                        banda.tarde == null ? "mais de " + diasSimulados : banda.tarde
                      } dias · limite de ${fmt.cm(limiteCm)}`
                    : `Limite de ${fmt.cm(limiteCm)} do trecho vizinho`
                  : `Fica abaixo de ${fmt.cm(limiteCm)} no período inteiro`
          }
          indice={3}
        />
      </section>

      <Cartao>
        <CartaoCabecalho titulo="IA 1 · modelo de crescimento" icone={<Brain />} />
        <CartaoCorpo>
          <Curva
            pontos={simulacao.pontos}
            limite={
              limiteCm != null
                ? { valor: limiteCm, rotulo: `Limite do trecho vizinho · ${fmt.cm(limiteCm)}` }
                : null
            }
            descricao={`${ESPECIE[pedido.especie].rotulo} a partir de ${fmt.cm(
              pedido.alturaCm,
            )}. A curva entorta porque o ritmo cai com a altura, muda com o tamanho do período e acompanha a virada da estação — não é reta. A faixa é o que o modelo admite não saber.`}
          />
        </CartaoCorpo>
      </Cartao>

      <div className="grid gap-6 lg:gap-8 xl:grid-cols-[1.4fr_1fr]">
        <Cartao>
          <CartaoCabecalho titulo="De onde veio o clima" />
          <CartaoCorpo>
            <JanelaClima janela={janela} resumo={resumo} />
          </CartaoCorpo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            titulo="De onde veio o solo"
            descricao={
              `Duas entradas do modelo que nenhum sensor de estrada mede. O painel estima as duas ` +
              `do mapa de solo SoilGrids no ponto, na profundidade de raiz de ${regime.rotulo.toLowerCase()}: ` +
              `${fmt.n(regime.raizMm)} mm.`
            }
            icone={<Shovel />}
          />
          <CartaoCorpo>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Leitura
                rotulo="Fertilidade"
                valor={fmt.d2(fertilidade)}
                nota={
                  pedido.fertilidade != null
                    ? "digitada no formulário"
                    : soloDoMapa.fonte === "soilgrids"
                      ? `SoilGrids · ${fmt.d2(soloDoMapa.nitrogenioGkg ?? 0)} g/kg de N`
                      : "premissa de beira de estrada"
                }
              />
              <Leitura
                rotulo="Água disponível"
                valor={`${fmt.n(Math.round(capacidadeMm))} mm`}
                nota={
                  pedido.capacidadeMm != null
                    ? "digitada no formulário"
                    : soloDoMapa.fonte === "soilgrids"
                      ? `SoilGrids + Saxton & Rawls · ${fmt.n(regime.raizMm)} mm de raiz`
                      : `premissa de ${fmt.n(Math.round(capacidadeMm))} mm`
                }
              />
            </dl>

            <p className="mt-5 max-w-prose text-xs leading-relaxed text-ink-3">
              {soloManual ? (
                <>
                  Um dos dois valores veio do formulário e sobrepôs o mapa. É para isso que os
                  campos existem: a fertilidade sozinha move o crescimento previsto em cerca de 71%
                  entre as pontas da escala, e ver isso acontecer vale mais que ler.
                </>
              ) : soloDoMapa.fonte === "soilgrids" ? (
                <>
                  A água disponível sai da textura do solo pela pedotransferência de Saxton &amp;
                  Rawls; a fertilidade é uma rampa sobre o nitrogênio total, e essa rampa é premissa
                  declarada, não equação publicada.{" "}
                  {soloDoMapa.distanciaKm > 0
                    ? `O mapa não cobre o ponto exato — mancha urbana ou água —, então o valor vem de ${fmt.km(
                        soloDoMapa.distanciaKm,
                      )} dali.`
                    : "O mapa cobre o ponto exato."}{" "}
                  {/* A mesma leitura significa coisas diferentes nos dois
                      regimes, e é por isso que o regime não é só um número de
                      profundidade: numa faixa terraplenada o mapa da paisagem é
                      generoso; num pasto ele é a paisagem. */}
                  {pedido.regime === "pasto" ? (
                    <>
                      O SoilGrids descreve o solo da paisagem, e um pasto é essa paisagem: aqui o
                      número não tem o viés de generosidade que ele tem na estrada. O que ele
                      continua não vendo é o microsítio — mancha de urina, sombra de árvore, pé de
                      talude —, onde uma touceira sozinha cresce muito mais que o piquete.
                    </>
                  ) : (
                    <>
                      O SoilGrids descreve o solo da paisagem, e faixa de domínio é terraplenada e
                      compactada: o número tende a ser generoso.
                    </>
                  )}
                </>
              ) : (
                <>
                  O SoilGrids não cobre este ponto nem a vizinhança de 2 km — costuma ser mancha
                  urbana ou água. Os dois valores acima são a premissa de beira de estrada, a mesma
                  do caderno de calibração{" "}
                  {pedido.regime === "pasto"
                    ? "— inclusive a fertilidade, porque não existe mediana medida de pastagem para pôr no lugar. Só a água foi reescalada para a raiz mais funda."
                    : "."}{" "}
                  Não são medição deste lugar.
                </>
              )}
            </p>
          </CartaoCorpo>
        </Cartao>
      </div>

      <Cartao>
        <CartaoCabecalho
          titulo="IA 2 · decisão e justificativa"
          descricao="A LLM recebe os números acima prontos e não recalcula nada. Ela decide quando roçar e escreve o porquê, o mesmo papel e o mesmo esquema de saída do lote diário."
          icone={<Sparkles />}
        />
        <CartaoCorpo>
          {/* `key` amarra o Suspense ao pedido: sem ela o React reaproveita a
              fronteira entre simulações e o texto da anterior fica na tela
              enquanto a nova carrega. */}
          <Suspense
            key={`${pedido.especie}|${pedido.regime}|${pedido.latitude}|${pedido.longitude}|${pedido.alturaCm}|${pedido.periodo.inicio}|${pedido.periodo.fim}|${pedido.diasDesdeRocada}|${fertilidade}|${capacidadeMm}`}
            fallback={<LeituraCarregando />}
          >
            <LeituraGestor
              contexto={{
                especie: pedido.especie,
                latitude: pedido.latitude,
                longitude: pedido.longitude,
                // Arredondados na fonte, e não só na tela: a LLM cita o número
                // no texto dela, e sem isso a justificativa sai com "16,76 cm"
                // do lado de um cartão que mostra "16,8 cm".
                altura_inicial_cm: pedido.alturaCm,
                altura_prevista_cm: Number(simulacao.alturaFinalCm.toFixed(1)),
                dias_simulados: diasSimulados,
                periodo: { de: pedido.periodo.inicio, ate: dataFinal,
                           ja_aconteceu: noPassado },
                dias_desde_a_ultima_rocada: pedido.diasDesdeRocada,
                crescimento_previsto_cm_por_dia: Number(simulacao.crescimentoCmDia.toFixed(3)),
                crescimento_no_periodo_cm: {
                  q10: Number(simulacao.crescimento.q10.toFixed(1)),
                  q50: Number(simulacao.crescimento.q50.toFixed(1)),
                  q90: Number(simulacao.crescimento.q90.toFixed(1)),
                },
                dias_ate_cruzar_o_limite: cruza,
                quando_cruza_o_limite: {
                  mais_cedo_dias: banda?.cedo ?? null,
                  mais_tarde_dias: banda?.tarde ?? null,
                },
                altura_limite_de_referencia_cm: limiteCm,
                temperatura_media_prevista_c: Number(resumo.temperaturaMediaC.toFixed(1)),
                temperatura_minima_prevista_c: Number(resumo.temperaturaMinC.toFixed(1)),
                chuva_total_prevista_mm: Math.round(resumo.precipitacaoTotalMm),
                dias_com_chuva_previstos: resumo.diasComChuva,
                agua_no_solo_media_pct: Math.round(simulacao.aguaSoloMediaPct),
                solo: {
                  fertilidade_0_a_1: Number(fertilidade.toFixed(2)),
                  capacidade_de_agua_mm: Math.round(capacidadeMm),
                  origem: soloManual
                    ? "digitado no formulário do simulador"
                    : soloDoMapa.fonte === "soilgrids"
                      ? "estimado do mapa SoilGrids"
                      : "premissa, o SoilGrids não cobre este ponto",
                  profundidade_de_raiz_mm: regime.raizMm,
                },
                // A LLM decide quando roçar. Ela precisa saber que num regime
                // experimental o número que ela recebeu vem de um modelo
                // treinado noutro sistema -- senão ela escreve a mesma
                // justificativa confiante nos dois casos.
                sistema: {
                  regime: pedido.regime,
                  rotulo: regime.rotulo,
                  o_modelo_foi_treinado_neste_sistema: !regime.experimental,
                },
                dias_de_previsao_real: janela.diasPrevistos,
                origem_do_resto_do_clima:
                  janela.complemento === "historico"
                    ? `média observada de ${janela.anos.join(" e ")}`
                    : janela.complemento === "repeticao"
                      ? "padrão previsto repetido (o arquivo histórico não respondeu)"
                      : "a previsão cobriu o período inteiro",
                referencia_operacional: vizinho
                  ? {
                      rodovia: vizinho.trecho.rodovia,
                      km: fmt.faixaKm(Number(vizinho.trecho.km_inicio), Number(vizinho.trecho.km_fim)),
                      uf: vizinho.trecho.uf,
                      distancia_km: Math.round(vizinho.distanciaKm),
                      altura_limite_cm: Number(vizinho.trecho.altura_limite_cm),
                      tipo_pista: vizinho.trecho.tipo_pista,
                      observacoes: vizinho.trecho.observacoes,
                    }
                  : null,
              }}
            />
          </Suspense>
        </CartaoCorpo>
      </Cartao>

      {vizinho ? (
        <Cartao>
          <CartaoCabecalho
            titulo="Referência na malha"
            descricao="O ponto simulado não é um trecho cadastrado. O limite de altura contra o qual a decisão é tomada vem do trecho monitorado mais próximo."
            icone={<MapPin />}
          />
          <CartaoCorpo>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Leitura
                rotulo="Trecho"
                valor={vizinho.trecho.rodovia}
                nota={fmt.faixaKm(Number(vizinho.trecho.km_inicio), Number(vizinho.trecho.km_fim))}
              />
              <Leitura
                rotulo="Distância"
                valor={fmt.km(vizinho.distanciaKm)}
                nota={perto ? "em linha reta" : "fora da malha monitorada"}
              />
              <Leitura rotulo="UF" valor={vizinho.trecho.uf} nota="do trecho vizinho" />
              <Leitura
                rotulo="Limite de altura"
                valor={fmt.cm(Number(vizinho.trecho.altura_limite_cm))}
                nota={`Espécie do trecho: ${ESPECIE[vizinho.trecho.especie].rotulo}`}
              />
            </dl>

            {!perto ? (
              <p className="mt-4 text-xs text-ink-3">
                O trecho mais próximo está a {fmt.km(vizinho.distanciaKm)} daqui. A malha monitorada
                não cobre este ponto, então o limite acima serve de referência operacional, não de
                regra do lugar.
              </p>
            ) : null}
          </CartaoCorpo>
        </Cartao>
      ) : null}
    </div>
  );
}
