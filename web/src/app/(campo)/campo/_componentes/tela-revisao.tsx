"use client";

import { useState } from "react";

import type { FotoLocal } from "@/lib/campo/contratos";

import { BotaoCampo, ESCALA, PreviaFoto, Rotulo } from "./base";

/**
 * A ultima tela antes de gravar: o que vai, o que muda, e dois botoes.
 *
 * Passo separado, e nao uma confirmacao dentro do formulario, porque no campo o
 * toque acidental e regra: celular na mao com luva, sol na tela, caminhao
 * passando. A frase de consequencia diz o que vai acontecer com o chamado, em
 * portugues, incluindo o caso sem sinal — que e o normal, nao a excecao.
 */

export function TelaRevisao({
  titulo,
  consequencia,
  fotos,
  children,
  rotuloConfirmar,
  rotuloGravando,
  aoConfirmar,
  aoVoltar,
}: {
  titulo: string;
  consequencia: string;
  fotos: FotoLocal[];
  /** O resumo em texto do que a pessoa preencheu (altura, motivo, data). */
  children?: React.ReactNode;
  rotuloConfirmar: string;
  rotuloGravando: string;
  aoConfirmar: () => Promise<void>;
  aoVoltar: () => void;
}) {
  const [gravando, setGravando] = useState(false);

  return (
    <div className="space-y-5">
      <h1 className={ESCALA.tela}>{titulo}</h1>

      {fotos.length > 0 ? (
        <section>
          <Rotulo contagem={fotos.length}>Fotos</Rotulo>
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {fotos.map((f) => (
              <li key={f.foto_id} className="aspect-square overflow-hidden rounded-md border border-border bg-surface-3">
                <PreviaFoto blob={f.blob} alt={`Foto ${f.papel}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {children ? <section>{children}</section> : null}

      <p className={`${ESCALA.corpo} rounded-lg border border-border bg-surface p-4 text-ink-2`}>{consequencia}</p>

      <div className="space-y-2">
        <BotaoCampo
          variante="primario"
          carregando={gravando}
          rotuloCarregando={rotuloGravando}
          onClick={() => {
            setGravando(true);
            void aoConfirmar().finally(() => setGravando(false));
          }}
        >
          {rotuloConfirmar}
        </BotaoCampo>
        <BotaoCampo variante="fantasma" disabled={gravando} onClick={aoVoltar}>
          Voltar e corrigir
        </BotaoCampo>
      </div>
    </div>
  );
}
