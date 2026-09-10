import { describe, expect, it } from "vitest";

import { ehCacheDeResposta } from "./banco-local";

/**
 * Os nomes abaixo NAO sao inventados: sao os que o `caches.keys()` devolveu no
 * Chrome, num build de producao, com o app de campo aberto e sincronizado. Eles
 * estao aqui porque a regra de `sair` erra em silencio nas duas direcoes —
 * apagar de menos deixa dado de sessao no celular da equipe, apagar demais tira
 * o offline do app — e nenhum dos dois erros aparece na tela.
 */
describe("o que o sair apaga do aparelho", () => {
  it("preserva o precache, que e onde moram a casca de /campo e os chunks", () => {
    expect(ehCacheDeResposta("serwist-precache-v2-http://localhost:3003/")).toBe(false);
  });

  it("preserva os caches de ativo estatico, que sao saida de build", () => {
    expect(ehCacheDeResposta("static-font-assets")).toBe(false);
    expect(ehCacheDeResposta("static-image-assets")).toBe(false);
    expect(ehCacheDeResposta("static-js-assets")).toBe(false);
  });

  it("apaga tudo o que pode carregar resposta de servidor", () => {
    expect(ehCacheDeResposta("apis")).toBe(true);
    expect(ehCacheDeResposta("pages-rsc")).toBe(true);
    expect(ehCacheDeResposta("pages-rsc-prefetch")).toBe(true);
    expect(ehCacheDeResposta("others")).toBe(true);
  });

  /* O erro seguro e apagar demais: um cache que o defaultCache passe a criar
     numa atualizacao nao pode ficar de fora por omissao. */
  it("apaga um cache desconhecido, em vez de preserva-lo por omissao", () => {
    expect(ehCacheDeResposta("cache-que-ainda-nao-existe")).toBe(true);
  });
});
