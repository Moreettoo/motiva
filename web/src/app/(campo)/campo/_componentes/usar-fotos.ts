"use client";

import { useCallback, useMemo, useState } from "react";

import { LIMITES, type FotoLocal, type Papel } from "@/lib/campo/contratos";

import type { QuadroFoto } from "./captura-foto";

/**
 * O estado das fotos de UM evento: os quadros obrigatorios, os extras e o
 * `evento_id` que amarra todos.
 *
 * O `evento_id` nasce aqui, UMA vez: e ele que o servidor usa para casar as
 * fotos com o evento (`ia.chamado_fotos.evento_id`) e para garantir
 * idempotencia. Se ele mudasse a cada render, as fotos ja enviadas ficariam
 * orfas e o evento seria recusado por falta de foto — o defeito mais caro
 * possivel, porque so aparece depois do envio.
 *
 * `useState` com inicializador, e nao `useRef`: este valor E lido no render
 * (desce como prop para cada `CapturaFoto`), e ref lida em render e justamente
 * o que a regra `react-hooks/refs` proibe. O estado nunca recebe um segundo
 * valor; o inicializador em funcao garante um UUID por montagem, nao por render.
 *
 * `useFotosDoEvento` e nao `usarFotosDoEvento` (o arquivo continua em portugues,
 * como `usar-sincronizacao.ts`): a regra `react-hooks/rules-of-hooks` reconhece
 * hook pelo prefixo `use`, e sem ele o lint nao verifica NENHUMA das regras dos
 * hooks aqui dentro — inclusive as dependencias dos `useCallback` abaixo.
 */

export type ExtraFoto = { chave: string; foto: FotoLocal | null };

export function useFotosDoEvento(quadros: QuadroFoto[]) {
  const [eventoId] = useState(() => crypto.randomUUID());
  const [fotos, setFotos] = useState<Partial<Record<Papel, FotoLocal>>>({});
  const [extras, setExtras] = useState<ExtraFoto[]>([]);

  /* Os extras compartilham o papel `extra`, entao o mapa por papel nao serve
     para eles: guardam-se numa lista com chave propria. O papel no banco
     continua `extra` para todos, que e o que a coluna aceita. */
  const definir = useCallback((papel: Papel, foto: FotoLocal, chaveExtra?: string) => {
    if (papel === "extra" && chaveExtra) {
      setExtras((atuais) => atuais.map((e) => (e.chave === chaveExtra ? { ...e, foto } : e)));
      return;
    }
    setFotos((atuais) => ({ ...atuais, [papel]: foto }));
  }, []);

  const adicionarExtra = useCallback(() => {
    setExtras((atuais) => (atuais.length >= LIMITES.fotosExtrasMax ? atuais : [...atuais, { chave: crypto.randomUUID(), foto: null }]));
  }, []);

  const removerExtra = useCallback((chave: string) => {
    setExtras((atuais) => atuais.filter((e) => e.chave !== chave));
  }, []);

  const obrigatoriasProntas = quadros.every((q) => fotos[q.papel] != null);

  /* Ordem: as obrigatorias na ordem dos quadros, os extras depois. E a ordem em
     que `sincronizar.ts` sobe as fotos e a ordem da revisao — a mesma nas duas
     telas, para a miniatura da esquerda ser sempre a mesma foto. */
  const todas = useMemo(() => {
    const obrigatorias = quadros.map((q) => fotos[q.papel]).filter((f): f is FotoLocal => f != null);
    const opcionais = extras.map((e) => e.foto).filter((f): f is FotoLocal => f != null);
    return [...obrigatorias, ...opcionais];
  }, [extras, fotos, quadros]);

  return { eventoId, fotos, extras, definir, adicionarExtra, removerExtra, obrigatoriasProntas, todas };
}
