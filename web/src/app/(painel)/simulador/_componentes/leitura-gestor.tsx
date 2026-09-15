import { CalendarClock, Scale, Sparkles } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { ChipRisco } from "@/components/ui/chip";
import { Esqueleto } from "@/components/ui/esqueleto";
import { estadoDaCalibracao, type CalibracaoVigente } from "@/lib/calibracao-regra";
import { PRIORIDADE, riscoPorPrazo, rotuloPrazo } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import { lerSimulacao, type ContextoLeitura } from "@/lib/leitura-ia";

/**
 * A calibração em uma frase, nos três estados de `estadoDaCalibracao`.
 *
 * "Medida" quer dizer que HOUVE validação contra campo, não que o fator esteja
 * corrigindo alguma coisa: no Rodoanel ele é 1,0 porque a medição aconteceu e o
 * resultado dela foi DESLIGAR a calibração. `nPares` e `validadaEm` vêm do mesmo
 * embed de `validacoes` e são nulos juntos ou preenchidos juntos -- a redação
 * sem detalhes existe pela garantia do tipo, e se aparecer na tela é porque
 * alguém criou uma linha de `ia.calibracoes` sem `validacao_id`.
 */
function fraseDaCalibracao(c: CalibracaoVigente): string {
  const medida =
    c.nPares != null && c.validadaEm != null
      ? `medida em ${fmt.n(c.nPares)} pares reais${c.rodovia ? ` da ${c.rodovia}` : ""} em ${fmt.dataMedia(
          c.validadaEm,
        )}`
      : "medida contra o campo (detalhes da validação indisponíveis)";

  switch (estadoDaCalibracao(c)) {
    case "ausente":
      return "Sem calibração medida para este ponto: a curva acima é o modelo sintético puro.";
    case "desligada":
      return `Calibração desligada (fator 1,00): ${medida}, e o fator candidato foi testado e rejeitado fora da amostra — a curva acima é o modelo sem correção.`;
    case "aplicada":
      return `Calibração aplicada: fator ${fmt.d2(c.fator)}, ${medida}.`;
  }
}

/**
 * A IA 2.
 *
 * Componente de servidor `async` dentro de um `<Suspense>`: a curva aparece na
 * hora e o texto do gestor chega depois, quando a OpenAI responde. Nao e so
 * desempenho, a tela encena as duas IAs na ordem em que elas existem no
 * sistema. O modelo estatistico responde QUANTO; a LLM le esse numero e
 * responde QUANDO.
 *
 * Se a OpenAI falhar, a curva continua na tela e so este bloco vira aviso. A
 * metade determinista do produto nao depende da metade que fala.
 */
export async function LeituraGestor({
  contexto,
  calibracao,
  mobilizacao,
}: {
  contexto: ContextoLeitura;
  calibracao: CalibracaoVigente;
  mobilizacao: { dias: number; daConcessionaria: boolean };
}) {
  const leitura = await lerSimulacao(contexto);

  if (!leitura.ok) {
    return (
      <Aviso tom="warning" titulo="A leitura da IA não veio">
        {leitura.erro}
      </Aviso>
    );
  }

  const { data_sugerida, prioridade, justificativa, fatores } = leitura.dados;

  // O chip sai da REGRA DE PRAZO, não da palavra da LLM.
  //
  // É a mesma invariante do resto do painel, `riscoPorPrazo` na view e em
  // `dominio.ts`, e `criarRocadaManual` recusando deixar um gestor escolher
  // prioridade: risco vem do prazo, não de opinião. Uma tela que carimbasse
  // "crítica" num trecho que cruza o limite em 61 dias desmentiria, nela
  // mesma, a regra que o produto anuncia, e não é hipótese: foi o que a LLM
  // devolveu numa das simulações de teste.
  const doPrazo = riscoPorPrazo(contexto.dias_ate_cruzar_o_limite);
  const discordou = prioridade !== doPrazo;

  // A mobilização é o que separa "o dia em que o capim passa do limite" do "dia
  // de pôr turma na estrada". Ela vem da concessionária do trecho vizinho; sem
  // vínculo, é a premissa de 7 dias e a tela diz isso em vez de calar.
  const mob = `mobilização de ${fmt.contar(mobilizacao.dias, "dia")}${
    mobilizacao.daConcessionaria ? "" : " (premissa)"
  }`;
  const ideal = contexto.dia_ideal_rocada;
  const notaDaData =
    ideal == null
      ? "o limite não é cruzado dentro do período"
      : ideal === data_sugerida
        ? `${mob} já descontada`
        : `dia ideal ${fmt.dataMedia(ideal)} · ${mob}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ChipRisco risco={doPrazo} />
        <span className="flex items-center gap-1.5 text-sm text-ink">
          <CalendarClock aria-hidden="true" className="size-4 text-ink-3" />
          <span className="tnum font-medium">{fmt.dataMedia(data_sugerida)}</span>
        </span>
        {/* A data ideal so aparece quando ela NAO e a data sugerida: quando as
            duas coincidem, repetir o mesmo dia em dois lugares e ruido. Quando
            diferem, o gestor precisa ver que a LLM adiou de proposito -- o
            porque esta na justificativa logo abaixo. */}
        <span className="text-xs text-ink-3">{notaDaData}</span>
      </div>

      {discordou ? (
        <Aviso tom="warning" titulo="A LLM discordou da regra de prazo">
          Ela classificou como <strong>{PRIORIDADE[prioridade].rotulo.toLowerCase()}</strong>; pelo
          prazo de {rotuloPrazo(contexto.dias_ate_cruzar_o_limite)} a prioridade é{" "}
          <strong>{PRIORIDADE[doPrazo].rotulo.toLowerCase()}</strong>. O chip acima segue o prazo,
          porque no painel inteiro o risco vem do número e não de opinião, a mesma regra vale na
          view e no agendamento manual. O texto abaixo é o que ela escreveu, sem edição.
        </Aviso>
      ) : null}

      <p className="max-w-prose text-sm leading-relaxed text-ink">{justificativa}</p>

      {fatores.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {fatores.map((fator) => (
            <li key={fator} className="flex items-start gap-2 text-xs text-ink-2">
              <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-accent-line" />
              <span className="min-w-0">{fator}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Procedencia, junta e no fim: de onde veio o TEXTO e de onde veio o
          NUMERO que ele cita. As duas frases eram blocos separados em alturas
          diferentes da seçao, e a de calibraçao vinha em tres ramos de ternario
          no meio do caminho -- ela nao e uma etapa da decisao, e a nota de
          rodape dela. */}
      <ul className="flex flex-col gap-1.5 border-t border-border pt-3 text-2xs text-ink-3">
        <li className="flex items-start gap-2">
          <Sparkles aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span>
            Texto escrito pela LLM a partir dos números acima. Ela não recalcula o crescimento,
            recebe o resultado do modelo pronto e decide a data, exatamente como no lote diário.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Scale aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span>{fraseDaCalibracao(calibracao)}</span>
        </li>
      </ul>
    </div>
  );
}

export function LeituraCarregando() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">A IA está lendo o resultado da simulação.</span>
      <div className="flex items-center gap-3">
        <Esqueleto className="h-6 w-20 rounded-full" />
        <Esqueleto className="h-4 w-28" />
      </div>
      <Esqueleto className="h-4 w-full" />
      <Esqueleto className="h-4 w-11/12" />
      <Esqueleto className="h-4 w-2/3" />
    </div>
  );
}
