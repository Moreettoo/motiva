"use client";

import { useState, type ReactNode } from "react";
import { CalendarCheck, CalendarX, CircleCheck, CircleSlash, ShieldCheck, Undo2 } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campo";
import { MOTIVO_ADIAMENTO } from "@/lib/dominio";
import { fmt } from "@/lib/format";
import type { ChamadoAdiamento } from "@/lib/types";

/* ==========================================================================
   OS CINCO FORMULÁRIOS DE DECISÃO DO CHAMADO

   Aprovar, devolver, decidir adiamento, encerrar administrativamente e
   cancelar. Cada um recebe SÓ dados primitivos e devolve a entrada já
   validada por `aoConfirmar`: nenhum deles chama Server Action, importa
   `router` ou conhece a gaveta em que está.

   Isso não é purismo. Os mesmos formulários abrem em dois lugares diferentes:
   na gaveta de `/chamados` e, no caso de "encerrar administrativamente",
   no painel do agendamento na agenda, onde ele substituiu "Marcar como
   executada". Um formulário que soubesse de onde veio precisaria de dois
   caminhos por dentro, e o segundo chamador é sempre o que descobre o que
   estava implícito no primeiro.

   A validação daqui ESPELHA a de `lib/chamados/acoes.ts`. As duas precisam
   continuar iguais: aqui ela existe para o erro aparecer embaixo do campo
   errado, antes da ida ao servidor; lá, para o servidor não confiar na tela.
   ========================================================================== */

export type EntradaAprovar = {
  kmRocados: number;
  custoReais: number | null;
  observacao: string;
  reanalisar: boolean;
};

export type EntradaDevolver = { comentario: string };

export type EntradaAdiamento = { aceito: boolean; novaData: string | null; resposta: string };

export type EntradaEncerrarAdmin = {
  dataExecucao: string;
  alturaDepoisCm: number | null;
  observacao: string;
};

export type EntradaCancelar = { motivo: string };

/** Props que os cinco compartilham. `pendente` desabilita e gira o botão. */
type Comum = {
  pendente: boolean;
  aoCancelar: () => void;
};

/* --------------------------------------------------------------------------
   Moldura
   -------------------------------------------------------------------------- */

/**
 * A moldura de todos eles: título, texto de apoio, campos e a dupla de botões.
 *
 * `<form>` de verdade, e não uma `<div>` com um `onClick`: é o `submit` que faz
 * o Enter no campo de texto confirmar, e é o `type="submit"` que faz o botão
 * primário ser o padrão do teclado. Numa fila de aprovação, tirar a mão do
 * teclado a cada chamado é o que decide se a pessoa usa a tela ou a planilha.
 */
function Formulario({
  titulo,
  apoio,
  destrutivo,
  confirmar,
  iconeConfirmar,
  pendente,
  aoCancelar,
  aoEnviar,
  children,
}: {
  titulo: string;
  apoio?: string;
  destrutivo?: boolean;
  confirmar: string;
  iconeConfirmar: ReactNode;
  pendente: boolean;
  aoCancelar: () => void;
  aoEnviar: () => void;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        aoEnviar();
      }}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4"
    >
      <div className="min-w-0">
        <h4 className="text-sm font-medium text-ink">{titulo}</h4>
        {apoio ? <p className="mt-1 text-xs text-ink-3">{apoio}</p> : null}
      </div>

      {children}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Botao
          type="submit"
          variante={destrutivo ? "perigo" : "primario"}
          carregando={pendente}
          iconeEsquerda={iconeConfirmar}
        >
          {confirmar}
        </Botao>
        <Botao type="button" variante="fantasma" disabled={pendente} onClick={aoCancelar}>
          Voltar
        </Botao>
      </div>
    </form>
  );
}

/** `type="number"` guarda texto: o campo precisa aceitar vazio enquanto a
 *  pessoa digita, e "abc" num `<input type=number>` chega como string vazia.
 *  A vírgula entra porque o teclado numérico do Android manda vírgula no
 *  português e `Number("1,5")` é `NaN`. */
function paraNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/* --------------------------------------------------------------------------
   1 · Aprovar
   -------------------------------------------------------------------------- */

/**
 * Aprovar é a única decisão desta tela que ESCREVE fora do chamado: a função
 * SQL insere `ia.execucoes` e `ia.medicoes` na mesma transação. Por isso os km
 * são obrigatórios e vêm pré-preenchidos com a extensão do trecho, que é o
 * valor certo em quase todo chamado, e por isso a reanálise é o padrão: a
 * roçada muda `dias_desde_rocada_inicio`, que é feature do modelo.
 */
export function FormularioAprovar({
  kmSugerido,
  alturaFinalCm,
  pendente,
  aoCancelar,
  aoConfirmar,
}: Comum & {
  /** Extensão do trecho, `km_fim - km_inicio`. */
  kmSugerido: number;
  /** Só para o texto de apoio: é ela que vira medição nova. */
  alturaFinalCm: number | null;
  aoConfirmar: (entrada: EntradaAprovar) => void;
}) {
  const [km, setKm] = useState(kmSugerido > 0 ? String(kmSugerido) : "");
  const [custo, setCusto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [reanalisar, setReanalisar] = useState(true);
  const [erros, setErros] = useState<{ km?: string; custo?: string }>({});

  function enviar() {
    const kmRocados = paraNumero(km);
    const custoReais = paraNumero(custo);
    const novos: { km?: string; custo?: string } = {};

    if (kmRocados == null || kmRocados <= 0 || kmRocados > 500) {
      novos.km = "Informe os km roçados (entre 0 e 500).";
    }
    if (custo.trim() !== "" && (custoReais == null || custoReais < 0)) {
      novos.custo = "Custo inválido.";
    }

    setErros(novos);
    if (Object.keys(novos).length > 0) return;

    aoConfirmar({
      kmRocados: kmRocados as number,
      custoReais: custo.trim() === "" ? null : custoReais,
      observacao,
      reanalisar,
    });
  }

  return (
    <Formulario
      titulo="Aprovar a roçada"
      apoio={
        alturaFinalCm == null
          ? "Registra a execução no histórico do trecho."
          : `Registra a execução e uma medição de ${fmt.cm(alturaFinalCm)} no trecho.`
      }
      confirmar="Aprovar"
      iconeConfirmar={<CircleCheck />}
      pendente={pendente}
      aoCancelar={aoCancelar}
      aoEnviar={enviar}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Quilômetros roçados" obrigatorio erro={erros.km} dica="Pré-preenchido com a extensão do trecho.">
          <Entrada
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="500"
            value={km}
            onChange={(evento) => setKm(evento.target.value)}
            className="tnum"
          />
        </Campo>

        <Campo rotulo="Custo em reais" erro={erros.custo} dica="Opcional.">
          <Entrada
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={custo}
            onChange={(evento) => setCusto(evento.target.value)}
            placeholder="—"
            className="tnum"
          />
        </Campo>
      </div>

      <Campo rotulo="Observação" dica="Fica na execução, no histórico do trecho.">
        <AreaTexto
          rows={2}
          value={observacao}
          onChange={(evento) => setObservacao(evento.target.value)}
          placeholder="O que vale registrar sobre esta roçada?"
        />
      </Campo>

      {/* A caixa está ligada porque reanalisar é o certo em quase todo caso; ela
          existe para o caso em que não é: uma aprovação retroativa de semanas
          atrás gastaria uma execução do workflow para reescrever a mesma
          previsão. O rótulo diz o que acontece, não o nome do botão de lá. */}
      <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={reanalisar}
          onChange={(evento) => setReanalisar(evento.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <span className="min-w-0">
          Reanalisar o trecho depois de aprovar
          <span className="block text-ink-3">
            A roçada muda a fase da rebrota, que é entrada do modelo.
          </span>
        </span>
      </label>
    </Formulario>
  );
}

/* --------------------------------------------------------------------------
   2 · Devolver
   -------------------------------------------------------------------------- */

/** Devolver sem dizer o que refazer manda a equipe de volta ao campo para
 *  adivinhar. O comentário é obrigatório aqui e no servidor. */
export function FormularioDevolver({
  pendente,
  aoCancelar,
  aoConfirmar,
}: Comum & { aoConfirmar: (entrada: EntradaDevolver) => void }) {
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | undefined>();

  function enviar() {
    if (comentario.trim().length < 3) {
      setErro("Diga à equipe o que precisa ser refeito.");
      return;
    }
    setErro(undefined);
    aoConfirmar({ comentario });
  }

  return (
    <Formulario
      titulo="Devolver para a equipe"
      apoio="O chamado volta para a equipe, que refaz o fechamento com fotos novas."
      confirmar="Devolver"
      iconeConfirmar={<Undo2 />}
      pendente={pendente}
      aoCancelar={aoCancelar}
      aoEnviar={enviar}
    >
      <Campo rotulo="O que a equipe precisa refazer" obrigatorio erro={erro}>
        <AreaTexto
          rows={3}
          value={comentario}
          onChange={(evento) => setComentario(evento.target.value)}
          placeholder="A foto do resultado não mostra a faixa inteira; refaça do km 12 ao 14."
        />
      </Campo>
    </Formulario>
  );
}

/* --------------------------------------------------------------------------
   3 · Decidir adiamento
   -------------------------------------------------------------------------- */

/**
 * Duas decisões num formulário só, e não dois botões soltos, porque a resposta
 * escrita serve às duas: aceitar com uma data e recusar com um motivo saem do
 * mesmo momento de leitura do pedido. O campo de data só aparece no caminho
 * que o usa.
 */
export function FormularioAdiamento({
  adiamento,
  pendente,
  aoCancelar,
  aoConfirmar,
}: Comum & {
  adiamento: ChamadoAdiamento;
  aoConfirmar: (entrada: EntradaAdiamento) => void;
}) {
  const [novaData, setNovaData] = useState(adiamento.data_sugerida ?? "");
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState<string | undefined>();

  function decidir(aceito: boolean) {
    if (aceito && !/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
      setErro("Escolha a nova data.");
      return;
    }
    setErro(undefined);
    aoConfirmar({ aceito, novaData: aceito ? novaData : null, resposta });
  }

  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        decidir(true);
      }}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4"
    >
      <div className="min-w-0">
        <h4 className="text-sm font-medium text-ink">Decidir o adiamento</h4>
        <p className="mt-1 text-xs text-ink-3">
          A equipe pediu por {MOTIVO_ADIAMENTO[adiamento.motivo].toLowerCase()}
          {adiamento.data_sugerida ? ` e sugeriu ${fmt.dataCurta(adiamento.data_sugerida)}` : ""}.
          Aceitar remarca a roçada na agenda.
        </p>
      </div>

      <Campo rotulo="Nova data" erro={erro} dica="Só é usada se você aceitar.">
        <Entrada
          type="date"
          value={novaData}
          onChange={(evento) => setNovaData(evento.target.value)}
          className="tnum"
        />
      </Campo>

      <Campo rotulo="Resposta para a equipe" dica="Opcional. Aparece na linha do tempo do chamado.">
        <AreaTexto
          rows={2}
          value={resposta}
          onChange={(evento) => setResposta(evento.target.value)}
          placeholder="Combinado, mas avise se a chuva continuar."
        />
      </Campo>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Botao type="submit" variante="primario" carregando={pendente} iconeEsquerda={<CalendarCheck />}>
          Aceitar e remarcar
        </Botao>
        <Botao
          type="button"
          variante="secundario"
          disabled={pendente}
          iconeEsquerda={<CalendarX />}
          onClick={() => decidir(false)}
        >
          Recusar
        </Botao>
        <Botao type="button" variante="fantasma" disabled={pendente} onClick={aoCancelar}>
          Voltar
        </Botao>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------------------
   4 · Encerrar administrativamente
   -------------------------------------------------------------------------- */

/**
 * A saída para a roçada que aconteceu fora do app: o chamado fecha como
 * `concluido` com `sem_evidencia = true`, e esse selo é o ponto. Sem ele, um
 * chamado encerrado no painel ficaria indistinguível de um aprovado com quatro
 * fotos e GPS, e o histórico do trecho passaria a misturar duas coisas.
 *
 * Também é o formulário que a agenda abre no lugar de "Marcar como executada".
 */
export function FormularioEncerrarAdmin({
  hoje,
  pendente,
  aoCancelar,
  aoConfirmar,
}: Comum & {
  /** `isoHoje()` do servidor, nunca `new Date()` do navegador. */
  hoje: string;
  aoConfirmar: (entrada: EntradaEncerrarAdmin) => void;
}) {
  const [dataExecucao, setDataExecucao] = useState(hoje);
  const [altura, setAltura] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erros, setErros] = useState<{ data?: string; altura?: string; observacao?: string }>({});

  function enviar() {
    const alturaDepoisCm = paraNumero(altura);
    const novos: { data?: string; altura?: string; observacao?: string } = {};

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataExecucao)) {
      novos.data = "Informe a data em que a roçada aconteceu.";
    } else if (dataExecucao > hoje) {
      novos.data = "A data não pode estar no futuro.";
    }
    if (altura.trim() !== "" && (alturaDepoisCm == null || alturaDepoisCm < 0 || alturaDepoisCm > 300)) {
      novos.altura = "Altura fora da faixa (0 a 300 cm).";
    }
    if (observacao.trim().length < 5) {
      novos.observacao = "A observação é obrigatória: por que está encerrando sem a evidência de campo?";
    }

    setErros(novos);
    if (Object.keys(novos).length > 0) return;

    aoConfirmar({
      dataExecucao,
      alturaDepoisCm: altura.trim() === "" ? null : alturaDepoisCm,
      observacao,
    });
  }

  return (
    <Formulario
      titulo="Encerrar administrativamente"
      apoio="Use quando a roçada aconteceu sem passar pelo app. Fica marcado como sem evidência."
      confirmar="Encerrar"
      iconeConfirmar={<ShieldCheck />}
      pendente={pendente}
      aoCancelar={aoCancelar}
      aoEnviar={enviar}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Data da roçada" obrigatorio erro={erros.data}>
          <Entrada
            type="date"
            max={hoje}
            value={dataExecucao}
            onChange={(evento) => setDataExecucao(evento.target.value)}
            className="tnum"
          />
        </Campo>

        <Campo rotulo="Altura depois, em cm" erro={erros.altura} dica="Opcional. Vira medição no trecho.">
          <Entrada
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="300"
            value={altura}
            onChange={(evento) => setAltura(evento.target.value)}
            placeholder="—"
            className="tnum"
          />
        </Campo>
      </div>

      <Campo rotulo="Por que sem a evidência de campo" obrigatorio erro={erros.observacao}>
        <AreaTexto
          rows={2}
          value={observacao}
          onChange={(evento) => setObservacao(evento.target.value)}
          placeholder="Equipe roçou antes do app entrar em uso; confirmado pelo encarregado por rádio."
        />
      </Campo>
    </Formulario>
  );
}

/* --------------------------------------------------------------------------
   5 · Cancelar
   -------------------------------------------------------------------------- */

/**
 * Dois passos, e não um `confirm()`: cancelar descarta o agendamento na agenda,
 * e é a única ação daqui cujo efeito aparece numa tela que a pessoa não está
 * olhando. O segundo passo diz isso em vez de perguntar "tem certeza?".
 */
export function FormularioCancelar({
  numero,
  pendente,
  aoCancelar,
  aoConfirmar,
}: Comum & {
  numero: string;
  aoConfirmar: (entrada: EntradaCancelar) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [confirmando, setConfirmando] = useState(false);

  function enviar() {
    if (motivo.trim().length < 3) {
      setErro("Escreva por que o chamado está sendo cancelado.");
      setConfirmando(false);
      return;
    }
    setErro(undefined);
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    aoConfirmar({ motivo });
  }

  return (
    <Formulario
      titulo="Cancelar o chamado"
      apoio="A roçada não vai acontecer. O motivo fica na linha do tempo."
      destrutivo
      confirmar={confirmando ? `Cancelar ${numero} mesmo assim` : "Cancelar chamado"}
      iconeConfirmar={<CircleSlash />}
      pendente={pendente}
      aoCancelar={aoCancelar}
      aoEnviar={enviar}
    >
      <Campo rotulo="Motivo do cancelamento" obrigatorio erro={erro}>
        <AreaTexto
          rows={2}
          value={motivo}
          onChange={(evento) => {
            setMotivo(evento.target.value);
            setConfirmando(false);
          }}
          placeholder="Obra na pista suspendeu o acesso por tempo indeterminado."
        />
      </Campo>

      {confirmando ? (
        <Aviso tom="warning" titulo="O agendamento também será descartado">
          <p>
            {numero} sai da agenda junto com o chamado. Para reagendar depois, crie uma roçada nova.
          </p>
        </Aviso>
      ) : null}
    </Formulario>
  );
}
