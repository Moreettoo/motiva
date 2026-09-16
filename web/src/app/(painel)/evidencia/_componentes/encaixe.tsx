"use client";

import { useEffect } from "react";

/**
 * Liga o encaixe de seções enquanto esta página está montada.
 *
 * Quem rola o painel é o DOCUMENTO -- o `<main>` do Shell não é contêiner de
 * rolagem --, e `scroll-snap-type` só tem efeito em quem rola. Como `<html>`
 * é do layout raiz e serve a todas as telas, a classe entra aqui e sai na
 * limpeza: sem isso, navegar para a Agenda levaria o encaixe junto.
 *
 * Não renderiza nada. A regra correspondente está em `globals.css`.
 */
export function EncaixeDeSecoes() {
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.add("encaixar-secoes");
    return () => raiz.classList.remove("encaixar-secoes");
  }, []);

  return null;
}
