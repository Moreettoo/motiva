"use client";

/* O provider do @serwist/turbopack ja e um componente cliente, mas o layout do
   grupo (campo) e servidor: sem este reexporte marcado, o import atravessaria a
   fronteira e o build recusaria. */
export { SerwistProvider } from "@serwist/turbopack/react";
