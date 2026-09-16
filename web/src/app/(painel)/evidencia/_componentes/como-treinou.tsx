import { Cpu, FlaskConical } from "lucide-react";

import { Cartao } from "@/components/ui/cartao";
import { fmt } from "@/lib/format";

import { Ladrilho } from "./ladrilho";

/**
 * Um lado do contraste treino x validacao.
 *
 * O ponto -- que a planilha da Motiva nunca treinou nada -- era um paragrafo.
 * Virou dois blocos lado a lado porque a ideia E uma separacao: desenhada,
 * ela se le num relance; escrita, pede quatro linhas e mesmo assim deixa
 * duvida sobre qual dado foi para onde.
 */
function Metade({
  icone,
  papel,
  numero,
  unidade,
  fonte,
  nota,
}: {
  icone: React.ReactNode;
  papel: string;
  numero: string;
  unidade: string;
  fonte: string;
  nota: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 p-5">
      <span className="flex items-center gap-2 text-2xs tracking-widest text-ink-3 uppercase">
        <span aria-hidden="true" className="[&_svg]:size-3.5">
          {icone}
        </span>
        {papel}
      </span>
      <span className="tnum mt-1 flex items-baseline gap-1.5 font-mono text-2xl leading-none font-semibold text-ink">
        {numero}
        <span className="text-xs font-normal text-ink-3">{unidade}</span>
      </span>
      <span className="text-sm text-ink-2">{fonte}</span>
      <span className="mt-1 text-xs text-ink-3">{nota}</span>
    </div>
  );
}

export function ComoTreinou({
  linhas,
  features,
  arvores,
  nos,
  especies,
  treinadoEm,
  paresDeCampo,
}: {
  linhas: number;
  features: number;
  arvores: number;
  nos: number;
  especies: readonly string[];
  treinadoEm: string;
  paresDeCampo: number;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Ladrilho rotulo="Situações estudadas" valor={fmt.n(linhas)} nota="criadas no computador, com clima de verdade" />
        <Ladrilho rotulo="Informações em cada uma" valor={fmt.n(features)} nota="clima, solo, tipo de capim, tempo desde a roçada" />
        <Ladrilho rotulo="Perguntas que ela faz" valor={fmt.n(nos)} nota={`organizadas em ${fmt.n(arvores)} sequências`} />
        <Ladrilho
          rotulo="Pronta desde"
          valor={treinadoEm.slice(0, 10).split("-").reverse().join("/")}
          nota={`${fmt.n(especies.length)} tipos de capim: braquiária, batatais e esmeralda`}
        />
      </div>

      {/* A separacao treino x validacao, desenhada. */}
      <Cartao>
        <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <Metade
            icone={<Cpu />}
            papel="Para aprender"
            numero={fmt.n(linhas)}
            unidade="situações"
            fonte="Criadas no computador, a partir de estudos de agronomia"
            nota="Nenhuma linha da planilha de vocês."
          />
          <Metade
            icone={<FlaskConical />}
            papel="Para conferir"
            numero={fmt.n(paresDeCampo)}
            unidade="medições"
            fonte="O levantamento que a equipe de vocês fez na estrada"
            nota="Só serve para conferir. Nunca ensinou nada a ela."
          />
        </div>
      </Cartao>
    </div>
  );
}
