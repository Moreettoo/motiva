import { describe, expect, it } from "vitest";

import {
  ehRotaPublica,
  motivoParaNaoAlterar,
  podeConvidar,
  podeEscrever,
  podeVerRota,
  rotaInicial,
} from "./permissoes";

describe("podeVerRota", () => {
  it("super_admin vê tudo, inclusive o Laboratório", () => {
    for (const rota of ["/", "/malha", "/agenda", "/trechos/31", "/copiloto", "/chamados", "/usuarios", "/campo", "/simulador"]) {
      expect(podeVerRota("super_admin", rota)).toBe(true);
    }
  });
  it("admin não vê o Laboratório", () => {
    expect(podeVerRota("admin", "/simulador")).toBe(false);
    expect(podeVerRota("admin", "/chamados")).toBe(true);
    expect(podeVerRota("admin", "/usuarios")).toBe(true);
    expect(podeVerRota("admin", "/campo")).toBe(true);
  });
  it("analista vê painel, malha, agenda, trecho e copiloto; nada de operação", () => {
    for (const rota of ["/", "/malha", "/agenda", "/trechos/3", "/copiloto"]) expect(podeVerRota("analista", rota)).toBe(true);
    for (const rota of ["/chamados", "/usuarios", "/campo", "/simulador"]) expect(podeVerRota("analista", rota)).toBe(false);
  });
  it("rocador só vê /campo", () => {
    expect(podeVerRota("rocador", "/campo")).toBe(true);
    for (const rota of ["/", "/agenda", "/chamados", "/usuarios", "/simulador"]) expect(podeVerRota("rocador", rota)).toBe(false);
  });
  it("prefixo não vaza: /campoX não é /campo", () => {
    expect(podeVerRota("rocador", "/campos")).toBe(false);
  });
  it("rotas de serviço são de todos", () => {
    for (const cargo of ["super_admin", "admin", "analista", "rocador"] as const) {
      expect(podeVerRota(cargo, "/sem-acesso")).toBe(true);
      expect(podeVerRota(cargo, "/definir-senha")).toBe(true);
    }
  });
});

describe("rotaInicial e podeEscrever", () => {
  it("rocador começa no campo, o resto no painel", () => {
    expect(rotaInicial("rocador")).toBe("/campo");
    expect(rotaInicial("analista")).toBe("/");
  });
  it("só admin e super_admin escrevem no painel", () => {
    expect(podeEscrever("super_admin")).toBe(true);
    expect(podeEscrever("admin")).toBe(true);
    expect(podeEscrever("analista")).toBe(false);
    expect(podeEscrever("rocador")).toBe(false);
  });
});

describe("podeConvidar", () => {
  it("super_admin convida qualquer cargo", () => {
    for (const alvo of ["super_admin", "admin", "analista", "rocador"] as const) expect(podeConvidar("super_admin", alvo)).toBe(true);
  });
  it("admin convida tudo abaixo de super_admin", () => {
    expect(podeConvidar("admin", "super_admin")).toBe(false);
    expect(podeConvidar("admin", "admin")).toBe(true);
    expect(podeConvidar("admin", "rocador")).toBe(true);
  });
  it("analista e rocador não convidam", () => {
    expect(podeConvidar("analista", "rocador")).toBe(false);
    expect(podeConvidar("rocador", "rocador")).toBe(false);
  });
});

describe("motivoParaNaoAlterar", () => {
  const base = { autorId: "a", autorCargo: "admin" as const, alvoId: "b", alvoCargo: "analista" as const, alvoAtivo: true, novoCargo: null, desativar: false, superAdminsAtivos: 2 };
  it("ninguém altera a si mesmo", () => {
    expect(motivoParaNaoAlterar({ ...base, alvoId: "a", desativar: true })).toMatch(/a si mesmo/);
  });
  it("admin não promove a super_admin", () => {
    expect(motivoParaNaoAlterar({ ...base, novoCargo: "super_admin" })).toMatch(/Super Admin/);
    expect(motivoParaNaoAlterar({ ...base, autorCargo: "super_admin", novoCargo: "super_admin" })).toBeNull();
  });
  it("admin não mexe em super_admin", () => {
    expect(motivoParaNaoAlterar({ ...base, alvoCargo: "super_admin", desativar: true })).toMatch(/Super Admin/);
  });
  it("o último super_admin ativo fica", () => {
    const ultimo = { ...base, autorCargo: "super_admin" as const, alvoCargo: "super_admin" as const, superAdminsAtivos: 1 };
    expect(motivoParaNaoAlterar({ ...ultimo, desativar: true })).toMatch(/último Super Admin/);
    expect(motivoParaNaoAlterar({ ...ultimo, novoCargo: "admin" })).toMatch(/último Super Admin/);
    expect(motivoParaNaoAlterar({ ...ultimo, superAdminsAtivos: 2, novoCargo: "admin" })).toBeNull();
  });
  it("alteração comum passa", () => {
    expect(motivoParaNaoAlterar({ ...base, novoCargo: "admin" })).toBeNull();
    expect(motivoParaNaoAlterar({ ...base, desativar: true })).toBeNull();
  });
});

describe("ehRotaPublica", () => {
  it("reconhece as quatro rotas e seus filhos", () => {
    expect(ehRotaPublica("/entrar")).toBe(true);
    expect(ehRotaPublica("/convite/abc")).toBe(true);
    expect(ehRotaPublica("/redefinir-senha/xyz")).toBe(true);
    expect(ehRotaPublica("/esqueci-a-senha")).toBe(true);
    expect(ehRotaPublica("/")).toBe(false);
  });
});
