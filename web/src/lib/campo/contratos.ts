import type { MotivoAdiamento, Prioridade, StatusChamado, TipoEventoChamado } from "@/lib/types";

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

/**
 * Uma linha da linha do tempo do detalhe. Recorte de `ChamadoEvento` a proposito:
 * o `payload` inteiro nao cabe na tela e traz dado de gestao que o campo nao usa.
 */
export type EventoRecente = {
  tipo: TipoEventoChamado;
  ocorrido_em: string;
  autor_nome: string;
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
  adiamento_pendente: { motivo: MotivoAdiamento; data_sugerida: string | null; solicitado_em: string } | null;
  /**
   * Os cinco ultimos, do mais novo para o mais velho. E a linha do tempo do detalhe.
   *
   * OPCIONAL de proposito, como `EstadoCampo.notificacoes`: este tipo descreve
   * tambem o que esta GRAVADO no IndexedDB, e um aparelho que sincronizou antes
   * desta versao tem um snapshot sem o campo. Exigi-lo faria a tela quebrar na
   * primeira abertura offline depois de atualizar o app, que e justamente a hora
   * em que ninguem tem rede para consertar.
   */
  eventos_recentes?: EventoRecente[];
  atualizado_em: string;
};

/** O que o sino do campo mostra. Recorte de `Notificacao`: sem `href` nem `tipo`, que sao de navegacao do painel. */
export type NotificacaoCampo = {
  id: number;
  titulo: string;
  texto: string | null;
  chamado_id: number | null;
  lida_em: string | null;
  criado_em: string;
};

export type EstadoCampo = {
  equipe: { id: number; nome: string };
  lider: { nome: string };
  chamados: ChamadoCampo[];
  notificacoesNaoLidas: number;
  /** As 20 ultimas, para o sino abrir sem rede. Opcional: ver `ChamadoCampo.eventos_recentes`. */
  notificacoes?: NotificacaoCampo[];
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
  /**
   * Quando foi a ULTIMA tentativa de envio. E daqui que a espera exponencial
   * conta, e nao de `criado_em`, que nunca muda.
   *
   * OPCIONAL, como `ChamadoCampo.eventos_recentes` e pelo mesmo motivo: um
   * aparelho que enfileirou antes desta versao tem itens gravados sem o campo, e
   * exigi-lo faria a fila quebrar justamente com o trabalho ja registrado dentro.
   */
  ultima_tentativa_em?: string | null;
};

/**
 * "O servidor recebeu, mas o chamado ja tinha terminado."
 *
 * Fica num store PROPRIO e nao na fila: o item sai da fila (reenviar nunca vai
 * mudar a resposta) e ainda assim a pessoa precisa saber. Sem isto o app
 * engolia o fato — media-se `foraDeOrdem` no relatorio de sincronizacao e nunca
 * se mostrava nada. A equipe passava a manha no trecho, fotografava, e a unica
 * coisa que aparecia na tela era o chamado virando "Cancelado" sozinho.
 *
 * `visto` existe para o aviso poder ser DISPENSADO pela pessoa, e nao por um
 * relogio: quem esta de luva no sol nao vai ler um aviso que sai da tela em
 * quatro segundos.
 */
export type ForaDeOrdem = {
  evento_id: string;
  chamado_id: number;
  tipo: TipoEventoCampo;
  /** Frase do servidor, ja em portugues. */
  motivo: string;
  em: string;
  visto: boolean;
};

export const LIMITES = {
  ladoMaximoPx: 1600,
  qualidadeJpeg: 0.82,
  fotosExtrasMax: 4,
  alturaMaxCm: 300,
  gpsTimeoutMs: 8000,
} as const;
