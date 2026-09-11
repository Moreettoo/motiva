"use client";

import type { ChamadoCampo, ItemFila } from "@/lib/campo/contratos";
import { agruparChamados } from "@/lib/campo/fila";

import { ESCALA, Rotulo } from "./base";
import { CartaoChamado } from "./cartao-chamado";

/**
 * Os cinco grupos, na ordem em que o dia acontece: o que e para agora, o que
 * ficou para tras, o que vem, o que esta na mao do gestor e o que fechou.
 *
 * `agruparChamados` (testado, em `lib/campo/fila.ts`) decide o grupo; aqui so
 * se desenha. Secao vazia nao aparece, com UMA excecao: "Hoje" vazio e uma
 * informacao que a pessoa precisa ("nao ha rocada hoje"), e nao a ausencia de
 * uma secao.
 */

const SECOES = [
  { chave: "hoje", titulo: "Hoje", destaque: true },
  { chave: "atrasados", titulo: "Atrasados", destaque: false },
  { chave: "proximos", titulo: "Próximos", destaque: false },
  /* "Ja enviados", e nao "Aguardando aprovacao": o grupo `aguardando` de
     `agruparChamados` junta TRES situacoes — `aguardando_aprovacao`,
     `adiamento_solicitado` e `devolvido` —, e so a primeira espera aprovacao.
     No ensaio do roteiro o cartao de um adiamento pedido aparecia com o selo
     "Adiamento pedido" debaixo do titulo "Aguardando aprovacao", duas frases
     que se contradizem na mesma tela. O que as tres tem em comum e ter saido
     do aparelho. */
  { chave: "aguardando", titulo: "Já enviados", destaque: false },
  { chave: "recentes", titulo: "Concluídos recentes", destaque: false },
] as const;

export function ListaChamados({
  chamados,
  fila,
  hoje,
  aoAbrir,
}: {
  chamados: ChamadoCampo[];
  fila: ItemFila[];
  hoje: string;
  aoAbrir: (chamadoId: number) => void;
}) {
  const grupos = agruparChamados(chamados, hoje);
  const naFila = new Set(fila.map((i) => i.chamado_id));

  if (chamados.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className={`${ESCALA.corpo} font-medium`}>Nenhum chamado para a sua equipe.</p>
        <p className={`${ESCALA.meta} mt-1 text-ink-2`}>Quando o gestor agendar uma roçada, ela aparece aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {SECOES.map((secao) => {
        const itens = grupos[secao.chave];
        if (itens.length === 0 && secao.chave !== "hoje") return null;

        return (
          <section key={secao.chave}>
            <Rotulo contagem={itens.length > 0 ? itens.length : undefined}>{secao.titulo}</Rotulo>

            {itens.length === 0 ? (
              <p className={`${ESCALA.corpo} mt-2 rounded-lg border border-border bg-surface px-4 py-5 text-ink-2`}>
                Nenhuma roçada para hoje.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {itens.map((c) => (
                  <li key={c.id}>
                    <CartaoChamado chamado={c} destaque={secao.destaque} pendente={naFila.has(c.id)} aoAbrir={() => aoAbrir(c.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
