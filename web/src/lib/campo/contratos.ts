import type { MotivoAdiamento, Prioridade, StatusChamado } from "@/lib/types";

/**
 * O contrato entre a API do painel e o aparelho. Os dois lados leem daqui, e
 * este arquivo nao importa nada de servidor nem de navegador de proposito: ele
 * atravessa a rede, o IndexedDB e o service worker.
 *
 * `ChamadoCampo` e um RECORTE do chamado, nao o chamado inteiro: o aparelho
 * carrega o que a tela mostra e o que a fila precisa para decidir o proximo
 * passo. Campos de gestao (custo, km rocados, autor de cada evento) ficam de
 * fora — eles nao cabem numa tela de 5 polegadas nem entram em decisao de campo.
 */

export type TrechoCampo = {
  id: number;
  rodovia: string;
  km_inicio: number;
  km_fim: number;
  uf: string;
  sentido: string | null;
  especie: string;
  altura_limite_cm: number;
  latitude: number;
  longitude: number;
  observacoes: string | null;
};

export type ChamadoCampo = {
  id: number;
  numero: string;
  status: StatusChamado;
  trecho: TrechoCampo;
  data_sugerida: string;
  prioridade: Prioridade;
  justificativa: string;
  altura_inicial_cm: number | null;
  /** "informada pelo gestor" ou "prevista pelo modelo": a tela precisa dizer qual. */
  altura_inicial_origem: "prevista" | "informada";
  altura_final_cm: number | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
  comentario_gestor: string | null;
  adiamento_pendente: { motivo: MotivoAdiamento; data_sugerida: string | null } | null;
  atualizado_em: string;
};

export type EstadoCampo = {
  equipe: { id: number; nome: string };
  lider: { nome: string };
  chamados: ChamadoCampo[];
  notificacoesNaoLidas: number;
  /** Relogio do SERVIDOR na resposta. */
  servidorEm: string;
  /** Relogio do APARELHO quando o snapshot foi gravado; e o que a tela mostra. */
  sincronizadoEm: string;
};

/** Os tres eventos que nascem no aparelho. O resto da maquina e do painel. */
export type TipoEventoCampo = "iniciado" | "finalizado" | "adiamento_solicitado";

export type EventoCampo = {
  /** Nasce no aparelho (`crypto.randomUUID()`) e nunca muda: reenviar e sempre seguro. */
  evento_id: string;
  chamado_id: number;
  tipo: TipoEventoCampo;
  payload: Record<string, unknown>;
  ocorrido_em: string;
};

export type ResultadoEvento = {
  evento_id: string;
  situacao: "aplicado" | "repetido" | "fora_de_ordem" | "recusado";
  erro?: string;
};

export type Papel = "medida" | "extensao" | "resultado" | "extra";

export type FotoLocal = {
  foto_id: string;
  evento_id: string;
  chamado_id: number;
  etapa: "inicio" | "fim";
  papel: Papel;
  blob: Blob;
  largura_px: number;
  altura_px: number;
  bytes: number;
  latitude: number | null;
  longitude: number | null;
  precisao_m: number | null;
  capturada_em: string;
  enviada: boolean;
};

export type ItemFila = EventoCampo & {
  fotos: string[];
  tentativas: number;
  ultimo_erro: string | null;
  criado_em: string;
};

export const LIMITES = {
  ladoMaximoPx: 1600,
  qualidadeJpeg: 0.82,
  fotosExtrasMax: 4,
  alturaMaxCm: 300,
  gpsTimeoutMs: 8000,
} as const;
