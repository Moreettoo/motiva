import { Fragment, type ReactNode } from "react";

/**
 * A LLM devolve texto corrido com marcacao leve de markdown. Renderizar cru
 * deixaria "**SP-330**" na tela; renderizar HTML da modelo seria injetar texto
 * de terceiro no DOM. Entao o texto e quebrado em blocos e so tres marcacoes
 * sobrevivem: titulo, lista e enfase.
 */

type Bloco =
  | { tipo: "titulo"; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "lista"; ordenada: boolean; itens: string[] };

const TITULO = /^\s{0,3}#{1,6}\s+/;
const MARCADOR = /^\s*[-*•]\s+/;
const NUMERADO = /^\s*\d+[.)]\s+/;
const ENFASE = /\*\*(.+?)\*\*/g;

export function separarBlocos(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;

  function fecharParagrafo() {
    if (paragrafo.length) blocos.push({ tipo: "paragrafo", texto: paragrafo.join(" ") });
    paragrafo = [];
  }

  function fecharLista() {
    if (lista) blocos.push({ tipo: "lista", ...lista });
    lista = null;
  }

  for (const linha of texto.split("\n")) {
    if (!linha.trim()) {
      fecharParagrafo();
      fecharLista();
      continue;
    }

    if (TITULO.test(linha)) {
      fecharParagrafo();
      fecharLista();
      blocos.push({ tipo: "titulo", texto: linha.replace(TITULO, "").trim() });
      continue;
    }

    const ordenada = NUMERADO.test(linha);
    if (ordenada || MARCADOR.test(linha)) {
      fecharParagrafo();
      const item = linha.replace(ordenada ? NUMERADO : MARCADOR, "").trim();
      if (lista && lista.ordenada === ordenada) lista.itens.push(item);
      else {
        fecharLista();
        lista = { ordenada, itens: [item] };
      }
      continue;
    }

    fecharLista();
    paragrafo.push(linha.trim());
  }

  fecharParagrafo();
  fecharLista();
  return blocos;
}

function comEnfase(texto: string): ReactNode[] {
  // split com grupo de captura intercala: fora, dentro, fora, dentro…
  return texto.split(ENFASE).map((parte, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-medium text-ink">
        {parte}
      </strong>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    ),
  );
}

export function RespostaFormatada({ texto }: { texto: string }) {
  const blocos = separarBlocos(texto);

  if (blocos.length === 0) {
    return <p className="text-sm text-ink-3">O copiloto respondeu sem conteúdo.</p>;
  }

  return (
    <div className="space-y-2.5 text-sm text-ink-2">
      {blocos.map((bloco, i) => {
        if (bloco.tipo === "titulo") {
          return (
            <p key={i} className="text-sm font-medium text-ink">
              {comEnfase(bloco.texto)}
            </p>
          );
        }

        if (bloco.tipo === "paragrafo") {
          return (
            <p key={i} className="break-words">
              {comEnfase(bloco.texto)}
            </p>
          );
        }

        const Lista = bloco.ordenada ? "ol" : "ul";
        return (
          <Lista
            key={i}
            className={bloco.ordenada ? "ml-4 list-decimal space-y-1" : "ml-4 list-disc space-y-1"}
          >
            {bloco.itens.map((item, j) => (
              <li key={j} className="break-words marker:text-ink-3">
                {comEnfase(item)}
              </li>
            ))}
          </Lista>
        );
      })}
    </div>
  );
}
