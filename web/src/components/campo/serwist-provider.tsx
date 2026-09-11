"use client";

import { SerwistProvider as Original, type SerwistProviderProps } from "@serwist/turbopack/react";

/* O provider do @serwist/turbopack ja e um componente cliente, mas o layout do
   grupo (campo) e servidor: sem este reexporte marcado, o import atravessaria a
   fronteira e o build recusaria.

   E ele nao e um reexporte puro por um motivo so, que vale o arquivo inteiro:
   `reloadOnOnline` do pacote vem LIGADO por padrao, e o que ele liga e um
   `window.addEventListener("online", () => location.reload())`.

   Numa aba comum recarregar quando a rede volta e uma cortesia. Aqui e a perda
   do trabalho da equipe, exatamente no instante para o qual o app existe: as
   fotos recem-capturadas e a altura digitada vivem em estado do React ate a
   pessoa confirmar (`registrar`, em `usar-sincronizacao.ts`, e quem grava no
   IndexedDB). O caminhao anda duzentos metros, o modem reengata, `online`
   dispara -- e o formulario de "Finalizar rocada", com as duas fotos
   obrigatorias e as extras, some sem uma palavra. De quebra, o reload mata no
   meio um `enviarFotos` que estivesse em voo.

   Nao ha nada a recarregar: /campo le do IndexedDB, e a fila reage a `online`
   sozinha (`sincronizar.ts`). A prop continua aceita -- quem quiser o
   comportamento do pacote passa `reloadOnOnline` explicito. */
export function SerwistProvider({ reloadOnOnline = false, ...resto }: SerwistProviderProps) {
  return <Original reloadOnOnline={reloadOnOnline} {...resto} />;
}
