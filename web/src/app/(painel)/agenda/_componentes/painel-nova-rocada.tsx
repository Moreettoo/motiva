"use client";

import { useId, useMemo, useState } from "react";
import { CalendarPlus, OctagonAlert } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada, Selecao } from "@/components/ui/campo";
import { PainelLateral } from "@/components/ui/painel-lateral";
import { RISCO, rotuloPrazo } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { Equipe } from "@/lib/types";

import {
  agendamentosAbertosPorTrecho,
  previaDeNovoServico,
  textoServico,
  type ItemAgenda,
  type TrechoResumo,
} from "./dados";

/**
 * Criar uma roçada que a IA não propôs.
 *
 * A gaveta é a metade visível de `criarRocadaManual` (em `acoes.ts`), e as duas
 * cobrem regras diferentes de propósito. Aqui não há validação de segurança
 * nenhuma: o servidor revalida tudo, porque o cliente não é fonte confiável.
 * O que esta tela faz é o que o servidor NÃO consegue fazer: dizer antes.
 * O trecho que já tem roçada em aberto chega desabilitado com a data ao lado,
 * a data não aceita passado pelo `min` do próprio calendário, e a prévia de
 * carga mostra o estouro de capacidade enquanto ainda dá para escolher outro
 * dia. Uma recusa que aparece só depois do clique é uma recusa que chegou
 * tarde.
 */

export type EntradaNovaRocada = {
  trechoId: number;
  data: string;
  equipeId: number;
  motivo: string;
};

/** Espelha `MOTIVO_MAX` em `acoes.ts`. Aqui ele serve ao contador de
 *  caracteres; lá, à recusa. Os dois números precisam continuar iguais. */
const MOTIVO_MAX = 500;

type Erros = Partial<Record<"trecho" | "data" | "equipe" | "motivo", string>>;

export function PainelNovaRocada({
  aberta,
  aoFechar,
  trechos,
  equipes,
  itens,
  hoje,
  pendente,
  erroServidor,
  aoCriar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  trechos: TrechoResumo[];
  equipes: Equipe[];
  /** A malha inteira de agendamentos: alimenta a prévia de carga e a lista de
   *  trechos que já têm roçada em aberto. */
  itens: ItemAgenda[];
  hoje: string;
  pendente: boolean;
  /** Recusa devolvida pela Server Action. Fica NA GAVETA, além do toast: a
   *  gaveta continua aberta com o formulário preenchido, e mandar a pessoa ler
   *  o motivo num toast do canto oposto da tela enquanto o formulário que
   *  causou o erro está na frente dela é jogar a mensagem no lugar errado. */
  erroServidor: string | null;
  aoCriar: (entrada: EntradaNovaRocada) => void;
}) {
  const idFormulario = useId();
  const idTrecho = useId();
  const idData = useId();
  const idEquipe = useId();
  const idMotivo = useId();

  const [trecho, setTrecho] = useState("");
  const [data, setData] = useState(hoje);
  const [equipe, setEquipe] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erros, setErros] = useState<Erros>({});

  /* Zera o formulário na ABERTURA, não no fechamento: fechando, a gaveta ainda
     está animando para fora e apagar os campos no meio da saída é visível. O
     padrão de ajustar estado durante o render é o mesmo de `PainelAgendamento`,
     o React reinicia o render antes de pintar, sem efeito e sem quadro extra. */
  const [abertaAntes, setAbertaAntes] = useState(aberta);
  if (aberta !== abertaAntes) {
    setAbertaAntes(aberta);
    if (aberta) {
      setTrecho("");
      setData(hoje);
      setEquipe("");
      setMotivo("");
      setErros({});
    }
  }

  const jaAgendados = useMemo(() => agendamentosAbertosPorTrecho(itens), [itens]);

  /* Agrupado por rodovia e não ordenado por risco, ao contrário do resto do
     painel: isto é um SELETOR, e quem procura um trecho procura pelo nome da
     rodovia que tem na cabeça, não pela posição dele na fila de urgência. O
     risco não some: vai no rótulo de cada opção, junto com o prazo, que é o
     contexto que faz escolher entre duas faixas de km da mesma rodovia. */
  const porRodovia = useMemo(() => {
    const grupos = new Map<string, TrechoResumo[]>();
    for (const t of trechos) {
      const chave = `${t.rodovia} · ${t.uf}`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), t]);
    }
    return [...grupos.entries()]
      .map(([chave, lista]) => ({
        chave,
        trechos: [...lista].sort((a, b) => a.km_inicio - b.km_inicio),
      }))
      .sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));
  }, [trechos]);

  const trechoEscolhido = useMemo(
    () => trechos.find((t) => String(t.id) === trecho) ?? null,
    [trechos, trecho],
  );
  const equipeEscolhida = useMemo(
    () => equipes.find((e) => String(e.id) === equipe) ?? null,
    [equipes, equipe],
  );

  const km = trechoEscolhido
    ? Math.max(0, trechoEscolhido.km_fim - trechoEscolhido.km_inicio)
    : 0;

  /* A prévia só existe com trecho E equipe: sem os dois não há nem extensão nem
     capacidade, e uma prévia pela metade ("? de 4,5 km") é pior que nenhuma. */
  const previa = useMemo(
    () =>
      trechoEscolhido && equipeEscolhida && /^\d{4}-\d{2}-\d{2}$/.test(data)
        ? previaDeNovoServico({ itens, equipe: equipeEscolhida, dia: data, km })
        : null,
    [trechoEscolhido, equipeEscolhida, data, itens, km],
  );

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();

    const achados: Erros = {};
    if (!trechoEscolhido) achados.trecho = "Escolha o trecho que vai ser roçado.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) achados.data = "Escolha um dia no calendário.";
    else if (data < hoje) achados.data = "Não dá para agendar para um dia que já passou.";
    if (!equipeEscolhida) achados.equipe = "Escolha a equipe que vai executar.";
    if (motivo.trim().length === 0) achados.motivo = "Escreva por que esta roçada foi marcada.";
    else if (motivo.trim().length > MOTIVO_MAX) {
      achados.motivo = `Passou de ${fmt.n(MOTIVO_MAX)} caracteres. Resuma um pouco.`;
    }

    setErros(achados);
    // As duas primeiras condições são redundantes com `achados` e estão aqui
    // para o compilador estreitar os tipos: sem elas o `aoCriar` precisaria de
    // `!`, e um `!` num caminho de escrita é exatamente onde ele não deve estar.
    if (!trechoEscolhido || !equipeEscolhida || Object.keys(achados).length > 0) return;

    aoCriar({
      trechoId: trechoEscolhido.id,
      data,
      equipeId: equipeEscolhida.id,
      motivo: motivo.trim(),
    });
  }

  return (
    <PainelLateral
      aberto={aberta}
      aoFechar={aoFechar}
      largura="md"
      titulo="Nova roçada"
      descricao="Uma roçada que a IA não propôs: reclamação, obra, evento."
      rodape={
        <div className="flex flex-wrap items-center gap-2">
          {/* `form=` e não um botão dentro do `<form>`: o rodapé da gaveta é uma
              região própria, fora do fluxo do conteúdo, e o atributo é o que
              liga os dois sem duplicar o handler nem prender o Enter. */}
          <Botao
            type="submit"
            form={idFormulario}
            variante="primario"
            tamanho="sm"
            carregando={pendente}
            iconeEsquerda={<CalendarPlus />}
          >
            Agendar roçada
          </Botao>
          <Botao variante="fantasma" tamanho="sm" disabled={pendente} onClick={aoFechar}>
            Cancelar
          </Botao>
        </div>
      }
    >
      {erroServidor ? (
        <Aviso tom="critical" titulo="A roçada não foi criada" className="mb-5">
          {erroServidor}
        </Aviso>
      ) : null}

      <form id={idFormulario} onSubmit={enviar} className="flex flex-col gap-4">
        {/* Trecho que já tem roçada em aberto vem FECHADO, não escondido: sumir
            com a opção deixaria a pessoa procurando um trecho que ela sabe que
            existe. Fechado e com a data ao lado, ela lê que já há roçada
            marcada e sabe para onde ir. */}
        <Campo
          rotulo="Trecho"
          id={idTrecho}
          obrigatorio
          erro={erros.trecho}
          dica="Trecho com roçada já marcada aparece fechado: é uma por trecho."
        >
          <Selecao value={trecho} disabled={pendente} onChange={(e) => setTrecho(e.target.value)}>
            <option value="">Escolha o trecho…</option>
            {porRodovia.map((grupo) => (
              <optgroup key={grupo.chave} label={grupo.chave}>
                {grupo.trechos.map((t) => {
                  const agendado = jaAgendados.get(t.id);
                  return (
                    <option key={t.id} value={String(t.id)} disabled={agendado != null}>
                      {fmt.faixaKm(t.km_inicio, t.km_fim)}
                      {agendado
                        ? ` · já agendado ${fmt.dataMedia(agendado)}`
                        : ` · ${RISCO[t.risco].rotulo} · ${rotuloPrazo(t.dias_ate_limite)}`}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </Selecao>
        </Campo>

        <Campo
          rotulo="Dia da roçada"
          id={idData}
          obrigatorio
          erro={erros.data}
          dica="A equipe mobiliza o dia inteiro, mesmo num trecho curto."
        >
          {/* `min` no próprio calendário, além da checagem do envio e da trava
              do servidor: é a única das três que impede o erro em vez de
              relatá-lo. */}
          <Entrada
            type="date"
            min={hoje}
            value={data}
            disabled={pendente}
            onChange={(e) => setData(e.target.value)}
          />
        </Campo>

        <Campo
          rotulo="Equipe responsável"
          id={idEquipe}
          obrigatorio
          erro={erros.equipe}
          dica="A roçada manual já nasce aprovada, e aprovar exige equipe."
        >
          <Selecao value={equipe} disabled={pendente} onChange={(e) => setEquipe(e.target.value)}>
            <option value="">Escolha a equipe…</option>
            {equipes
              .filter((e) => e.ativo)
              .map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.nome} · {fmt.d1(Number(e.capacidade_km_dia))} km/dia
                </option>
              ))}
          </Selecao>
        </Campo>

        <Campo
          rotulo="Motivo"
          id={idMotivo}
          obrigatorio
          erro={erros.motivo}
          dica="Fica no lugar em que a justificativa da IA apareceria. É o que a próxima pessoa vai ler para entender esta decisão."
        >
          <AreaTexto
            value={motivo}
            maxLength={MOTIVO_MAX}
            disabled={pendente}
            placeholder="Ex.: duas reclamações de motorista sobre visibilidade na curva do km 146."
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Campo>
      </form>

      {previa && equipeEscolhida ? (
        <PreviaDeCarga previa={previa} equipeNome={equipeEscolhida.nome} />
      ) : null}
    </PainelLateral>
  );
}

/**
 * O que esta roçada faz com a agenda da equipe, antes de ela existir.
 *
 * É a mesma pergunta que a prévia do arrasto responde quando um cartão paira
 * sobre uma célula, e a resposta precisa existir aqui pelo mesmo motivo: o
 * quadro inteiro é construído para que ninguém estoure uma equipe sem ver. Um
 * formulário que só diz "pronto" depois do fato seria a única porta desta tela
 * por onde o estouro entra às cegas.
 */
function PreviaDeCarga({
  previa,
  equipeNome,
}: {
  previa: ReturnType<typeof previaDeNovoServico>;
  equipeNome: string;
}) {
  return (
    <section className="mt-6 border-t border-border pt-5">
      <h3 className="text-2xs font-medium tracking-widest text-ink-3 uppercase">
        Como fica a agenda
      </h3>

      <p className="tnum mt-2 font-mono text-sm text-ink">
        {fmt.km(previa.km)} <span aria-hidden="true">·</span>{" "}
        {textoServico(previa.diasServico)}
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {previa.dias.map((d) => (
          <li key={d.dia} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="tnum min-w-0 font-mono text-ink-2">
              {fmt.dataMedia(d.dia)} <span aria-hidden="true">·</span> {equipeNome} fica com{" "}
              {fmt.d1(d.km)} de {fmt.d1(d.capacidade)} km
            </span>
            {/* Cor de status nunca sozinha: ícone + rótulo, como manda o
                vocabulário do domínio. */}
            {d.excedida ? (
              <span className="inline-flex items-center gap-1 rounded-xs bg-critical-soft px-1.5 py-0.5 text-2xs text-critical-ink">
                <OctagonAlert aria-hidden="true" className="size-3 shrink-0" />
                acima da capacidade
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {previa.dias.some((d) => d.excedida) ? (
        <p className="mt-2 text-2xs text-ink-3">
          Dá para agendar assim mesmo, o quadro vai mostrar o excesso na célula.
          Outro dia ou outra equipe resolve.
        </p>
      ) : null}
    </section>
  );
}
