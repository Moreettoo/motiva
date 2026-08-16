"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { MessageSquareText, Send, Sparkles } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { AreaTexto } from "@/components/ui/campo";
import { EstadoVazio } from "@/components/ui/vazio";
import { perguntarAoCopiloto } from "@/lib/acoes";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { RespostaFormatada } from "./resposta-formatada";

type Turno = {
  id: number;
  pergunta: string;
  hora: string;
  resposta: string | null;
  erro: string | null;
};

const LINHAS_MAX = 5;
/** Mesmo piso que `perguntarAoCopiloto` aplica no servidor. */
const MINIMO_CARACTERES = 3;

export function Conversa({ sugestoes, escopo }: { sugestoes: string[]; escopo: number }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const idCampo = useId();
  const proximoId = useRef(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  // A altura acompanha o conteúdo até 5 linhas; daí em diante o campo rola.
  useEffect(() => {
    const campo = area.current;
    if (!campo) return;

    campo.style.height = "auto";
    const estilo = getComputedStyle(campo);
    const linha = Number.parseFloat(estilo.lineHeight) || 20;
    const folga =
      Number.parseFloat(estilo.paddingTop) +
      Number.parseFloat(estilo.paddingBottom) +
      Number.parseFloat(estilo.borderTopWidth) +
      Number.parseFloat(estilo.borderBottomWidth);
    const teto = linha * LINHAS_MAX + folga;

    campo.style.height = `${Math.min(campo.scrollHeight, teto)}px`;
    campo.style.overflowY = campo.scrollHeight > teto ? "auto" : "hidden";
  }, [texto]);

  useEffect(() => {
    if (turnos.length === 0) return;
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [turnos]);

  function enviar(bruto: string) {
    const pergunta = bruto.trim();
    if (pendente || pergunta.length === 0) return;

    // Curto demais é recusa com motivo, não silêncio: o servidor aplica o mesmo
    // piso, e quem digitou algo precisa saber por que nada aconteceu.
    if (pergunta.length < MINIMO_CARACTERES) {
      setAviso(
        `Escreva pelo menos ${MINIMO_CARACTERES} caracteres para o copiloto entender a pergunta.`,
      );
      area.current?.focus();
      return;
    }

    setAviso(null);

    const id = proximoId.current++;
    setTurnos((atual) => [
      ...atual,
      { id, pergunta, hora: fmt.horaMin(new Date()), resposta: null, erro: null },
    ]);
    setTexto("");
    area.current?.focus();

    iniciar(async () => {
      const resultado = await perguntarAoCopiloto(pergunta);
      setTurnos((atual) =>
        atual.map((turno) => {
          if (turno.id !== id) return turno;
          return resultado.ok
            ? { ...turno, resposta: resultado.dados.resposta }
            : { ...turno, erro: resultado.erro };
        }),
      );
    });
  }

  function aoEnviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    enviar(texto);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: com IME, Enter confirma o candidato e não pode enviar.
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      enviar(texto);
    }
  }

  const podeEnviar = texto.trim().length > 0 && !pendente;

  const rodapeEscopo =
    escopo > 0
      ? `Baseado nos ${fmt.n(escopo)} agendamentos mais recentes. O copiloto não lê medições, alturas nem escala de equipe.`
      : "A base ainda não tem agendamentos: rode a análise em lote antes de confiar na resposta.";

  return (
    <section aria-label="Conversa" className="flex w-full min-w-0 min-h-0 flex-1 flex-col">
      {/* A altura real vem de cima (`Shell` → página → esta seção); aqui só
          resta decidir quem cresce. O histórico rola sozinho, dentro do seu
          próprio espaço, o campo de pergunta abaixo não se move. */}
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {turnos.length === 0 && (
          <EstadoVazio
            icone={<MessageSquareText />}
            titulo="Nenhuma pergunta nesta sessão"
            descricao="O histórico existe só nesta aba: recarregar a página começa do zero. Comece por uma das sugestões abaixo ou escreva a sua."
          />
        )}

        {/* A região viva fica montada desde o início: inserir o <ol> junto com a
            primeira resposta não seria anunciado de forma confiável. */}
        <ol aria-live="polite" aria-atomic="false" className="flex flex-col gap-6">
          {turnos.map((turno) => (
            <li key={turno.id} className="rise">
              <p className="flex items-baseline gap-2 text-2xs tracking-widest text-ink-3 uppercase">
                <span>Pergunta</span>
                <span aria-hidden="true">·</span>
                <span className="tnum font-mono normal-case">{turno.hora}</span>
              </p>
              <p className="mt-1.5 text-base break-words text-ink">{turno.pergunta}</p>

              <div className="mt-3 border-l-2 border-accent-line pl-4">
                {turno.erro ? (
                  <Aviso tom="critical" titulo="O copiloto não respondeu">
                    <p>{turno.erro}</p>
                  </Aviso>
                ) : turno.resposta == null ? (
                  <div className="sweep relative overflow-hidden rounded-md border border-border bg-surface-2 px-3 py-2">
                    <p className="text-sm text-ink-2">Consultando…</p>
                  </div>
                ) : (
                  <div className="fade">
                    <p className="text-2xs tracking-widest text-ink-3 uppercase">Copiloto</p>
                    <div className="mt-2">
                      <RespostaFormatada texto={turno.resposta} />
                    </div>
                    <p className="mt-3 text-2xs text-ink-3">{rodapeEscopo}</p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div ref={fim} aria-hidden="true" />
      </div>

      {/* Fora da área que rola: o campo de pergunta fica sempre à vista,
          abaixo do histórico, sem precisar de `sticky`, a seção acima já é
          quem rola por dentro do próprio espaço. */}
      <div className="mt-6 shrink-0 border-t border-border bg-bg pt-4 pb-3 md:pb-4">
        {sugestoes.length > 0 && (
          <div className="mb-3">
            <h3 className="text-2xs tracking-widest text-ink-3 uppercase">Sugestões</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {sugestoes.map((sugestao, i) => (
                <li key={sugestao} className="fade min-w-0" style={{ "--i": i } as CSSProperties}>
                  <button
                    type="button"
                    onClick={() => enviar(sugestao)}
                    disabled={pendente}
                    className={cn(
                      "inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-border",
                      "bg-surface-2 px-3 py-1.5 text-xs text-ink-2",
                      "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-quint)]",
                      "hover:border-border-strong hover:bg-surface-3 hover:text-ink",
                      "disabled:pointer-events-none disabled:opacity-50",
                    )}
                  >
                    <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
                    <span className="truncate">{sugestao}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={aoEnviarFormulario}>
          <label htmlFor={idCampo} className="sr-only">
            Pergunta para o copiloto
          </label>

          <div className="flex items-end gap-2">
            <AreaTexto
              ref={area}
              id={idCampo}
              rows={1}
              value={texto}
              onChange={(evento) => {
                setTexto(evento.target.value);
                if (aviso) setAviso(null);
              }}
              onKeyDown={aoTeclar}
              invalido={aviso != null}
              placeholder="Pergunte sobre prazo, prioridade ou agrupamento de roçada…"
              spellCheck={false}
              className="min-h-0 resize-none"
            />
            <Botao
              type="submit"
              variante="primario"
              disabled={!podeEnviar}
              carregando={pendente}
              iconeDireita={<Send />}
            >
              Perguntar
            </Botao>
          </div>

          {/* A dica de teclado e o aviso de campo curto dividem o mesmo parágrafo:
              a região viva já está montada, então o aviso é anunciado ao aparecer. */}
          <p
            aria-live="polite"
            className={cn("mt-2 text-2xs", aviso ? "text-critical-ink" : "text-ink-3")}
          >
            {aviso ?? "Enter envia · Shift + Enter quebra linha. O histórico não é salvo."}
          </p>
        </form>
      </div>
    </section>
  );
}
