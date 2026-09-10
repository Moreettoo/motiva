import type { Cargo } from "../types";

/**
 * A matriz de acesso, em um lugar só e sem I/O.
 *
 * O proxy, o Shell (que filtra a navegação), cada página (`exigirCargo`) e cada
 * action (`permitir`) leem daqui. Se dois deles discordassem, a tela mostraria
 * um item que o servidor recusa, ou esconderia um que ele aceita.
 */

const TODOS: readonly Cargo[] = ["super_admin", "admin", "analista", "rocador"];
const GESTAO: readonly Cargo[] = ["super_admin", "admin"];
const LEITURA: readonly Cargo[] = ["super_admin", "admin", "analista"];

/** Rotas que existem para quem NAO tem sessao. Prefixo casa filhos (`/convite/<token>`). */
export const ROTAS_PUBLICAS = ["/entrar", "/esqueci-a-senha", "/redefinir-senha", "/convite"] as const;

type Tela = { prefixo: string; exato?: boolean; cargos: readonly Cargo[] };

const TELAS: readonly Tela[] = [
  { prefixo: "/", exato: true, cargos: LEITURA },
  { prefixo: "/malha", cargos: LEITURA },
  { prefixo: "/agenda", cargos: LEITURA },
  { prefixo: "/trechos", cargos: LEITURA },
  { prefixo: "/copiloto", cargos: LEITURA },
  { prefixo: "/chamados", cargos: GESTAO },
  { prefixo: "/usuarios", cargos: GESTAO },
  { prefixo: "/campo", cargos: ["super_admin", "admin", "rocador"] },
  { prefixo: "/simulador", cargos: ["super_admin"] },
  { prefixo: "/sem-acesso", cargos: TODOS },
  { prefixo: "/definir-senha", cargos: TODOS },
];

function casa(prefixo: string, pathname: string, exato = false): boolean {
  if (exato) return pathname === prefixo;
  return pathname === prefixo || pathname.startsWith(`${prefixo}/`);
}

export function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((p) => casa(p, pathname));
}

/**
 * Rota desconhecida (ex.: `/api/...`) devolve true: quem a serve decide.
 * Excecao: Rocador so tem `/campo`; para ele, o que nao e tela conhecida e
 * recusado, senao um prefixo parecido (`/campos`) passaria pelo proxy.
 */
export function podeVerRota(cargo: Cargo, pathname: string): boolean {
  const tela = TELAS.find((t) => casa(t.prefixo, pathname, t.exato));
  return tela ? tela.cargos.includes(cargo) : cargo !== "rocador";
}

export function rotaInicial(cargo: Cargo): "/" | "/campo" {
  return cargo === "rocador" ? "/campo" : "/";
}

export function podeEscrever(cargo: Cargo): boolean {
  return GESTAO.includes(cargo);
}

export function podeConvidar(convidador: Cargo, alvo: Cargo): boolean {
  if (convidador === "super_admin") return true;
  if (convidador === "admin") return alvo !== "super_admin";
  return false;
}

/** `null` = pode. Texto = motivo legivel da recusa, que a tela e a action mostram igual. */
export function motivoParaNaoAlterar(a: {
  autorId: string;
  autorCargo: Cargo;
  alvoId: string;
  alvoCargo: Cargo;
  alvoAtivo: boolean;
  novoCargo: Cargo | null;
  desativar: boolean;
  superAdminsAtivos: number;
}): string | null {
  if (!GESTAO.includes(a.autorCargo)) return "Você não tem permissão para alterar usuários.";
  if (a.autorId === a.alvoId) return "Você não pode alterar a si mesmo. Peça a outro administrador.";
  if (a.autorCargo === "admin" && a.alvoCargo === "super_admin") return "Um Admin não altera um Super Admin.";
  if (a.novoCargo === "super_admin" && a.autorCargo !== "super_admin") return "Só um Super Admin promove a Super Admin.";
  const tiraSuperAdmin = a.alvoCargo === "super_admin" && a.alvoAtivo && (a.desativar || (a.novoCargo != null && a.novoCargo !== "super_admin"));
  if (tiraSuperAdmin && a.superAdminsAtivos <= 1) return "Este é o último Super Admin ativo; promova outro antes.";
  return null;
}
