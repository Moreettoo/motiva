import { Suspense } from "react";
import { Brain, MapPin, Ruler, Sparkles, TrendingUp } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Indicador } from "@/components/ui/indicador";
import { Leitura } from "@/components/ui/leitura";
import { agregar } from "@/lib/clima";
import { ESPECIE } from "@/lib/dominio";
import { fmt, isoHoje, somarDias } from "@/lib/format";
import { ufConhecidaPeloModelo, UFS_DO_MODELO } from "@/lib/modelo/campos";
import { janelaDoPonto } from "@/lib/open-meteo";
import { trechoMaisProximo } from "@/lib/queries";
import { diaQueCruza, simular } from "@/lib/simulacao";
import type { UF } from "@/lib/types";

import { Curva } from "./curva";
import { FaixasDoModelo } from "./faixas-modelo";
import { JanelaClima } from "./janela-clima";
import { LeituraCarregando, LeituraGestor } from "./leitura-gestor";
import type { Pedido } from "./parametros";

/** Acima disso o trecho vizinho deixa de ser vizinhança e vira só "o mais
 *  próximo que existe", a tela passa a dizer isso com todas as letras. */
const LONGE_DEMAIS_KM = 150;

export async function Resultado({ pedido }: { pedido: Pedido }) {
  const [janela, vizinho] = await Promise.all([
    janelaDoPonto(pedido.latitude, pedido.longitude, pedido.dias),
    trechoMaisProximo(pedido.latitude, pedido.longitude),
  ]);

  // A UF sai do trecho mais próximo em vez de virar um quinto campo. O modelo
  // pede `uf_cod` e um ponto solto no mapa não tem UF; o vizinho tem, é dado
  // real da malha, e a tela mostra de onde veio para quem olha julgar.
  const uf: UF = vizinho?.trecho.uf ?? "SP";
  const mes = Number(isoHoje().slice(5, 7));

  const simulacao = simular(
    {
      especie: pedido.especie,
      uf,
      latitude: pedido.latitude,
      alturaInicialCm: pedido.alturaCm,
      dias: pedido.dias,
      mes,
    },
    janela,
  );

  const diasSimulados = simulacao.pontos.length - 1;
  const agregado = agregar(janela.dias.slice(0, diasSimulados));

  const perto = vizinho != null && vizinho.distanciaKm <= LONGE_DEMAIS_KM;
  const limiteCm = vizinho ? Number(vizinho.trecho.altura_limite_cm) : null;
  const cruza = limiteCm != null ? diaQueCruza(simulacao, limiteCm) : null;

  const dataFinal = somarDias(isoHoje(), diasSimulados).toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      {/* A faixa amarela "Este pedido sai do que o modelo viu no treino" saiu
          daqui a pedido. A informação não sumiu: o cartão "Até onde o modelo foi
          treinado" continua marcando em âmbar a régua que estourou, com o texto
          "fora do treino, o modelo satura aqui". O que mudou foi o peso: ela
          deixou de interromper o topo do resultado. `simulacao.extrapolacoes`
          segue existindo e testado, e é de onde qualquer outra superfície
          futura deve ler; não recalcule a regra. */}

      {!ufConhecidaPeloModelo(uf) ? (
        <Aviso tom="warning" titulo={`O modelo nunca viu a UF ${uf}`}>
          Ele foi treinado em {UFS_DO_MODELO.join(", ")}. Neste ponto a UF entra codificada como a
          primeira da lista, mesmo comportamento do lote diário. A latitude e o clima continuam
          valendo, e são eles que carregam quase toda a geografia.
        </Aviso>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo={`Altura em ${fmt.contar(diasSimulados, "dia")}`}
          valor={fmt.d1(simulacao.alturaFinalCm)}
          unidade="cm"
          icone={<Ruler />}
          nota={fmt.dataMedia(dataFinal)}
          indice={0}
        />
        <Indicador
          rotulo="Crescimento no período"
          valor={`+${fmt.d1(simulacao.crescimentoTotalCm)}`}
          unidade="cm"
          icone={<TrendingUp />}
          nota={`De ${fmt.cm(simulacao.alturaInicialCm)} para ${fmt.cm(simulacao.alturaFinalCm)}`}
          indice={1}
        />
        <Indicador
          rotulo="Ritmo previsto"
          valor={fmt.d3(simulacao.crescimentoCmDia)}
          unidade="cm/dia"
          icone={<Brain />}
          nota={`Média do período, pelo modelo · ${ESPECIE[pedido.especie].rotulo}`}
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
                  ? `Limite de ${fmt.cm(limiteCm)} do trecho vizinho`
                  : `Fica abaixo de ${fmt.cm(limiteCm)} no período inteiro`
          }
          indice={3}
        />
      </section>

      <Cartao>
        <CartaoCabecalho
          titulo="IA 1 · modelo de crescimento"
          descricao="Regressão treinada em histórico de campo. Roda no painel, sem chamar a OpenAI: dada a espécie, o ponto, a altura e o clima, responde quantos centímetros por dia."
          icone={<Brain />}
        />
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
            )}. A curva entorta porque o ritmo cai com a altura e com o tamanho do período, não é reta.`}
          />
        </CartaoCorpo>
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <Cartao>
          <CartaoCabecalho
            titulo="De onde veio o clima"
            descricao="O modelo não inventa tempo: ele recebe a janela real do Open-Meteo para este ponto."
          />
          <CartaoCorpo>
            <JanelaClima janela={janela} agregado={agregado} />
          </CartaoCorpo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            titulo="Até onde o modelo foi treinado"
            descricao="Fora destas faixas ele satura na borda em vez de errar com barulho."
          />
          <CartaoCorpo>
            <FaixasDoModelo
              alturaCm={pedido.alturaCm}
              dias={pedido.dias}
              latitude={pedido.latitude}
            />
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
            key={`${pedido.especie}|${pedido.latitude}|${pedido.longitude}|${pedido.alturaCm}|${pedido.dias}`}
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
                crescimento_previsto_cm_por_dia: Number(simulacao.crescimentoCmDia.toFixed(3)),
                dias_ate_cruzar_o_limite: cruza,
                altura_limite_de_referencia_cm: limiteCm,
                temperatura_media_prevista_c: Number(agregado.temperaturaMediaC.toFixed(1)),
                chuva_total_prevista_mm: Math.round(agregado.precipitacaoTotalMm),
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
            descricao="O ponto simulado não é um trecho cadastrado. A UF que o modelo recebeu e o limite de altura da decisão vêm do trecho monitorado mais próximo."
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
              <Leitura rotulo="UF usada no modelo" valor={vizinho.trecho.uf} />
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
