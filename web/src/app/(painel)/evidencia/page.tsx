import type { Metadata } from "next";

import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { exigirCargo } from "@/lib/auth/sessao";
import { fmt } from "@/lib/format";
import { levantamentosImportados } from "@/lib/levantamentos/queries";
import {
  efeitoDaEspecie,
  efeitoDasFeatures,
  fichaDoTreino,
  medirParidade,
} from "@/lib/modelo/ficha";
import { resumirPorClasse } from "@/lib/validacao/fronteira";
import {
  ndviAnalises,
  paresDaValidacao,
  validacaoVigente,
  validacoesSensibilidade,
} from "@/lib/validacao/queries";

import { Acertos } from "./_componentes/acertos";
import { ComoFunciona, OQueMove } from "./_componentes/como-funciona";
import { ComoTreinou } from "./_componentes/como-treinou";
import { EncaixeDeSecoes } from "./_componentes/encaixe";
import { GraficoPremissas } from "./_componentes/grafico-premissas";
import { Ladrilho } from "./_componentes/ladrilho";
import { ProvaTreino } from "./_componentes/prova-treino";
import { Rodape } from "./_componentes/rodape";
import { Secao } from "./_componentes/secao";

export const metadata: Metadata = {
  title: "Evidência",
  description:
    "Como o modelo de crescimento funciona, como foi treinado e o que ele acertou quando foi conferido contra o levantamento de campo da Motiva.",
};

export const dynamic = "force-dynamic";

/**
 * Um numero minusculo escrito por extenso, sem notacao cientifica.
 *
 * "1,4 × 10⁻¹⁴" nao diz nada para quem nao trabalha com isso -- e quem le esta
 * pagina e o gestor, nao o programador. Uma fileira de zeros diz na hora, e
 * sem perder um digito: e o mesmo numero, escrito do jeito que se le.
 */
function porExtenso(v: number): string {
  if (v === 0) return "0";
  const casas = Math.min(20, Math.max(0, -Math.floor(Math.log10(Math.abs(v))) + 1));
  return v.toFixed(casas).replace(".", ",").replace(/0+$/, "");
}

export default async function PaginaEvidencia() {
  await exigirCargo("super_admin", "admin", "analista");

  const vigente = await validacaoVigente();
  const [sensibilidade, pares, ndvi, importados] = await Promise.all([
    vigente ? validacoesSensibilidade(vigente) : Promise.resolve([]),
    vigente ? paresDaValidacao(vigente) : Promise.resolve([]),
    ndviAnalises(),
    levantamentosImportados(),
  ]);

  // As contas do modelo sao sincronas e puras: percorrem as arvores carregadas
  // do `modelo.json`, sem rede e sem banco. Ficam depois do `await` so para nao
  // atrasar as consultas.
  const treino = fichaDoTreino();
  const paridade = medirParidade();
  const features = efeitoDasFeatures();
  const especies = efeitoDaEspecie();
  const resumo = resumirPorClasse(pares);

  const usados = vigente ? Number(vigente.n_pares_usados) : 0;
  const rodadas = sensibilidade.map((s) => ({
    id: s.id,
    especie: s.especie,
    classe3Cm: Number(s.ponto_medio_classe3_cm),
    diasDesdeRocada: Number(s.dias_desde_rocada_premissa),
    acuracia: Number(s.acuracia_classe),
    transicoesDetectadas: Number(s.transicoes_detectadas ?? 0),
    vigente:
      vigente != null &&
      s.especie === vigente.especie &&
      Number(s.ponto_medio_classe3_cm) === Number(vigente.ponto_medio_classe3_cm) &&
      Number(s.dias_desde_rocada_premissa) === Number(vigente.dias_desde_rocada_premissa),
  }));

  return (
    <div className="flex min-w-0 flex-col">
      <EncaixeDeSecoes />

      <Secao primeira>
        <div>
          <h1 className="text-3xl font-semibold text-ink">Evidência</h1>
          <p className="mt-2 text-sm text-ink-2">
Como ela decide, o que ela estudou e quanto acertou quando foi conferida contra capim de verdade.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Ladrilho
            destaque
            rotulo="Situações que ela estudou"
            valor={fmt.n(treino.linhas)}
            nota="cada uma é um pedaço de estrada num pedaço de tempo"
          />
          <Ladrilho
            destaque
            rotulo="Erra por"
            valor={fmt.d2(treino.metricas.mae_locais_novos)}
            unidade="cm"
            nota="em lugares onde ela nunca esteve"
          />
          {vigente ? (
            <Ladrilho
              destaque
              rotulo="Acertou"
              valor={`${fmt.d1(Number(vigente.acuracia_classe) * 100)}%`}
              nota={`quando foi conferida contra ${fmt.n(usados)} medições reais de campo`}
            />
          ) : null}
          <Ladrilho
            destaque
            rotulo="Conferimos a conta"
            valor={fmt.n(paridade.previsoes)}
            unidade={`de ${fmt.n(paridade.previsoes)}`}
            nota="previsões refeitas agora, ao abrir esta página. Todas iguais ao original."
            detalhe={`Maior diferença encontrada: ${porExtenso(paridade.piorDesvio)} cm.`}
          />
        </div>
      </Secao>

      <Secao numero="I" titulo="Como ela decide">
        <ComoFunciona especies={especies} totalFeatures={treino.features} />
      </Secao>

      <Secao numero="II" titulo="O que faz o capim crescer mais, ou menos">
        <OQueMove features={features} totalFeatures={treino.features} />
      </Secao>

      <Secao numero="III" titulo="O que ela estudou" descricao="Situações de computador. A planilha de vocês não entrou aqui.">
        <ComoTreinou
          linhas={treino.linhas}
          features={treino.features}
          arvores={treino.arvores}
          nos={treino.nos}
          especies={treino.especies}
          treinadoEm={treino.treinadoEm}
          paresDeCampo={usados}
        />
      </Secao>

      <Secao
        numero="IV"
        titulo="A prova do treino"
        descricao="No fim do treino ela prestou um exame. Estes lugares ela nunca tinha visto."
      >
        <ProvaTreino metricas={treino.metricas} />
      </Secao>

      <Secao numero="V" titulo="Quanto ela acertou de verdade" descricao="Rodoanel Oeste: a equipe caminhou duas vezes, com uma semana entre elas.">
        {vigente ? (
          <Acertos v={vigente} pares={pares} resumo={resumo} />
        ) : (
          <Cartao>
            <CartaoCabecalho
              titulo="Nenhuma validação gravada"
              descricao="Nenhuma conferência de campo foi gravada ainda."
            />
            <CartaoCorpo>
              <p className="text-sm text-ink-2">
Sem uma conferência contra medições reais, não há como dizer quanto a IA acerta.
              </p>
            </CartaoCorpo>
          </Cartao>
        )}
      </Secao>

      {vigente && rodadas.length > 0 ? (
        <Secao
          numero="VI"
          titulo="O que mais pesa no resultado"
          descricao="Ninguém anotou qual capim é. E é ele que decide."
        >
          <Cartao>
            <CartaoCorpo className="p-5">
              <GraficoPremissas
                rodadas={rodadas}
                linhaDeBase={usados ? Number(vigente.estaveis_total ?? 0) / usados : 0}
              />
            </CartaoCorpo>
          </Cartao>
        </Secao>
      ) : null}

      <Secao numero="VII" titulo="O que estes números não garantem">
        <Rodape v={vigente} analises={ndvi} importados={importados} />
      </Secao>
    </div>
  );
}
