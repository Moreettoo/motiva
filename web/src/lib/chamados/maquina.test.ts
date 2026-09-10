import { describe, expect, it } from "vitest";

import { acoesDisponiveis, proximoStatus, terminal } from "./maquina";

describe("proximoStatus", () => {
  it("segue o caminho feliz", () => {
    expect(proximoStatus("aberto", "iniciado", null)).toBe("em_andamento");
    expect(proximoStatus("em_andamento", "finalizado", null)).toBe("aguardando_aprovacao");
    expect(proximoStatus("devolvido", "finalizado", null)).toBe("aguardando_aprovacao");
    expect(proximoStatus("aguardando_aprovacao", "aprovado", null)).toBe("concluido");
    expect(proximoStatus("aguardando_aprovacao", "devolvido", null)).toBe("devolvido");
  });
  it("adiamento volta ao estado anterior", () => {
    expect(proximoStatus("aberto", "adiamento_solicitado", null)).toBe("adiamento_solicitado");
    expect(proximoStatus("em_andamento", "adiamento_solicitado", null)).toBe("adiamento_solicitado");
    expect(proximoStatus("adiamento_solicitado", "adiamento_aceito", "em_andamento")).toBe("em_andamento");
    expect(proximoStatus("adiamento_solicitado", "adiamento_recusado", null)).toBe("aberto");
  });
  it("recusa o que não pode", () => {
    expect(proximoStatus("aberto", "finalizado", null)).toBeNull();
    expect(proximoStatus("aguardando_aprovacao", "iniciado", null)).toBeNull();
    expect(proximoStatus("devolvido", "adiamento_solicitado", null)).toBeNull();
    expect(proximoStatus("concluido", "cancelado", null)).toBeNull();
    expect(proximoStatus("cancelado", "iniciado", null)).toBeNull();
  });
  it("eventos informativos não mudam o estado", () => {
    for (const tipo of ["remarcado", "equipe_alterada", "altura_inicial_alterada", "comentario"] as const) {
      expect(proximoStatus("em_andamento", tipo, null)).toBe("em_andamento");
    }
  });
  it("encerramento administrativo conclui qualquer não terminal", () => {
    for (const s of ["aberto", "em_andamento", "devolvido", "adiamento_solicitado", "aguardando_aprovacao"] as const) {
      expect(proximoStatus(s, "encerrado_admin", null)).toBe("concluido");
    }
  });
});

describe("terminal", () => {
  it("só concluído e cancelado", () => {
    expect(terminal("concluido")).toBe(true);
    expect(terminal("cancelado")).toBe(true);
    expect(terminal("aberto")).toBe(false);
  });
});

describe("acoesDisponiveis", () => {
  it("líder da equipe inicia, finaliza e pede adiamento; não aprova", () => {
    expect(acoesDisponiveis("aberto", "rocador", true)).toEqual(["iniciar", "pedir_adiamento"]);
    expect(acoesDisponiveis("em_andamento", "rocador", true)).toEqual(["finalizar", "pedir_adiamento"]);
    expect(acoesDisponiveis("devolvido", "rocador", true)).toEqual(["finalizar"]);
    expect(acoesDisponiveis("aguardando_aprovacao", "rocador", true)).toEqual([]);
  });
  it("roçador de outra equipe não faz nada", () => {
    expect(acoesDisponiveis("aberto", "rocador", false)).toEqual([]);
  });
  it("admin aprova, devolve, decide adiamento, encerra e cancela", () => {
    expect(acoesDisponiveis("aguardando_aprovacao", "admin", false)).toEqual(["aprovar", "devolver", "encerrar_admin", "cancelar"]);
    expect(acoesDisponiveis("adiamento_solicitado", "admin", false)).toEqual(["decidir_adiamento", "encerrar_admin", "cancelar"]);
    expect(acoesDisponiveis("aberto", "super_admin", false)).toEqual(["informar_altura", "encerrar_admin", "cancelar"]);
    expect(acoesDisponiveis("concluido", "admin", false)).toEqual([]);
  });
  it("analista não age", () => {
    expect(acoesDisponiveis("aguardando_aprovacao", "analista", false)).toEqual([]);
  });
});
