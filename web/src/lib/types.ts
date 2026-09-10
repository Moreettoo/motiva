/**
 * Tipos do schema `ia` do Supabase.
 *
 * Escritos a mao e nao gerados: o painel consome um subconjunto pequeno e
 * estavel do banco, e a view `vw_trecho_status` (que e de onde quase tudo vem)
 * gera tipos ruins automaticamente porque o Postgres marca toda coluna de view
 * como nullable.
 */

export const UFS = ["MG", "MS", "PR", "RJ", "RS", "SC", "SP"] as const;
export type UF = (typeof UFS)[number];

export const ESPECIES = ["batatais", "braquiaria", "esmeralda"] as const;
export type Especie = (typeof ESPECIES)[number];

/**
 * O sistema em que o capim esta, e por consequencia o conjunto de premissas de
 * solo e de manejo que valem para ele.
 *
 * `faixa` e o dominio do produto: canteiro e talude de rodovia, rocados por
 * programa de concessionaria. `pasto` e EXPERIMENTAL e existe por um motivo
 * pratico -- medicao de campo em pastagem se consegue; em faixa de dominio,
 * quase nao. Validar o motor de crescimento em pasto e o unico jeito barato de
 * testar contra a realidade a parte do modelo que nunca foi validada.
 *
 * O que ele muda esta em `solo.ts` (profundidade de raiz) e em `REGIMES`, no
 * `gerador_v3_1_rebrota.py` (eventos de desfolha). O que ele NAO muda: nenhuma
 * feature do modelo. Mora aqui, e nao em `solo.ts`, porque `solo.ts` e
 * `server-only` e o formulario do simulador e componente de cliente.
 */
export const REGIMES = ["faixa", "pasto"] as const;
export type Regime = (typeof REGIMES)[number];
export const REGIME_PADRAO: Regime = "faixa";

export const PRIORIDADES = ["critica", "alta", "media", "baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const STATUS_AGENDAMENTO = ["sugerido", "aprovado", "executado", "descartado"] as const;
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number];

/**
 * Quem criou o agendamento: o lote diario (`ia`) ou um gestor no painel
 * (`manual`).
 *
 * Coluna propria e nao deducao a partir de `modelo_usado`/`previsao_id` nulos:
 * "nao sei qual modelo" e "nao houve modelo" sao fatos diferentes, e so o
 * segundo autoriza o painel a trocar "Justificativa da IA" por "Motivo do
 * agendamento" e a suprimir o selo de dispensavel.
 */
export const ORIGENS = ["ia", "manual"] as const;
export type Origem = (typeof ORIGENS)[number];

/** Cargos de acesso. Ordem: do maior ao menor poder; `CARGO` em dominio.ts da o rotulo. */
export const CARGOS = ["super_admin", "admin", "analista", "rocador"] as const;
export type Cargo = (typeof CARGOS)[number];

export type Perfil = {
  usuario_id: string;
  nome: string;
  email: string;
  cargo: Cargo;
  ativo: boolean;
  senha_provisoria: boolean;
  convidado_por: string | null;
  criado_em: string;
  ultimo_acesso_em: string | null;
  desativado_em: string | null;
};

export type Convite = {
  id: string;
  email: string;
  cargo: Cargo;
  equipe_id: number | null;
  expira_em: string;
  criado_por: string;
  criado_em: string;
  enviado_em: string | null;
  aceito_em: string | null;
  revogado_em: string | null;
};

/** Estados do chamado (ordem de servico). A maquina de estados esta em `chamados/maquina.ts`. */
export const STATUS_CHAMADO = ["aberto","em_andamento","aguardando_aprovacao","devolvido","adiamento_solicitado","concluido","cancelado"] as const;
export type StatusChamado = (typeof STATUS_CHAMADO)[number];

export const TIPOS_EVENTO_CHAMADO = ["criado","iniciado","finalizado","aprovado","devolvido","adiamento_solicitado","adiamento_aceito","adiamento_recusado","remarcado","equipe_alterada","altura_inicial_alterada","cancelado","encerrado_admin","fora_de_ordem","comentario"] as const;
export type TipoEventoChamado = (typeof TIPOS_EVENTO_CHAMADO)[number];

export const MOTIVOS_ADIAMENTO = ["chuva","equipamento","acesso_bloqueado","seguranca_trafego","falta_efetivo","outro"] as const;
export type MotivoAdiamento = (typeof MOTIVOS_ADIAMENTO)[number];

export type Chamado = { id: number; numero: string; agendamento_id: number; trecho_id: number; status: StatusChamado; status_anterior: StatusChamado | null;
  altura_inicial_cm: number | null; altura_inicial_origem: "prevista" | "informada"; altura_final_cm: number | null; km_rocados: number | null;
  custo_reais: number | null; observacao_conclusao: string | null; sem_evidencia: boolean; iniciado_em: string | null; finalizado_em: string | null;
  concluido_em: string | null; cancelado_em: string | null; criado_em: string; atualizado_em: string };

export type ChamadoEvento = { id: number; chamado_id: number; evento_id: string; tipo: TipoEventoChamado; autor_id: string | null; autor_nome: string;
  origem: "painel" | "campo" | "lote" | "sistema"; payload: Record<string, unknown>; ocorrido_em: string; registrado_em: string };

export type ChamadoFoto = { id: number; chamado_id: number; evento_id: string; etapa: "inicio" | "fim"; papel: "medida" | "extensao" | "resultado" | "extra";
  caminho: string; largura_px: number; altura_px: number; bytes: number; latitude: number | null; longitude: number | null; precisao_m: number | null;
  capturada_em: string; enviada_em: string; autor_id: string | null };

export type ChamadoAdiamento = { id: number; chamado_id: number; evento_id: string; motivo: MotivoAdiamento; detalhe: string | null; data_sugerida: string | null;
  solicitado_por: string | null; solicitado_em: string; decidido_por: string | null; decidido_em: string | null; decisao: "aceito" | "recusado" | null;
  nova_data: string | null; resposta: string | null };

export type Notificacao = { id: number; destinatario_id: string; tipo: string; titulo: string; texto: string | null; href: string | null; chamado_id: number | null; lida_em: string | null; criado_em: string };

export type ChamadoDetalhado = Chamado & {
  agendamento: { id: number; data_sugerida: string; prioridade: Prioridade; justificativa: string; origem: Origem; equipe_id: number | null;
    equipe: { id: number; nome: string; lider_nome: string | null } | null };
  trecho: Pick<Trecho, "id" | "rodovia" | "km_inicio" | "km_fim" | "uf" | "sentido" | "latitude" | "longitude" | "altura_limite_cm" | "observacoes">;
};

/** Risco derivado do prazo pela view, nao do texto da LLM. */
export type Risco = Prioridade;

export type Trecho = {
  id: number;
  rodovia: string;
  km_inicio: number;
  km_fim: number;
  sentido: string | null;
  uf: UF;
  latitude: number;
  longitude: number;
  especie: Especie;
  altura_limite_cm: number;
  tipo_pista: string | null;
  observacoes: string | null;
  criado_em: string;
};

/** Uma linha de `ia.vw_trecho_status`, o modelo central do painel. */
export type TrechoStatus = {
  id: number;
  rodovia: string;
  km_inicio: number;
  km_fim: number;
  extensao_km: number;
  sentido: string | null;
  uf: UF;
  latitude: number;
  longitude: number;
  especie: Especie;
  altura_limite_cm: number;
  tipo_pista: string | null;
  observacoes: string | null;

  altura_atual_cm: number | null;
  crescimento_cm_dia: number | null;
  dias_ate_limite: number | null;
  temperatura_media_c: number | null;
  chuva_total_mm: number | null;
  previsto_em: string | null;

  medido_em: string | null;
  altura_medida_cm: number | null;
  rocado_em: string | null;

  agendamento_id: number | null;
  data_sugerida: string | null;
  prioridade: Prioridade | null;
  justificativa: string | null;
  fatores: string[] | null;
  agendamento_status: StatusAgendamento | null;
  /** Quem criou o agendamento aberto deste trecho. `null` quando nao ha nenhum,
   *  e por isso nao e `Origem` puro, ao contrario da coluna da tabela. As
   *  telas que mostram `justificativa` a partir da view precisam dele para nao
   *  chamar de "Decisao da IA" um texto que um gestor digitou. */
  agendamento_origem: Origem | null;
  equipe_id: number | null;
  equipe_nome: string | null;

  ocupacao_pct: number | null;
  risco: Risco;

  /** Chamado aberto do trecho, quando ha. A view ganha estas colunas na Fase 2. */
  chamado_id: number | null;
  chamado_numero: string | null;
  chamado_status: StatusChamado | null;
};

export type Medicao = {
  id: number;
  trecho_id: number;
  data: string;
  altura_cm: number;
};

export type Previsao = {
  id: number;
  trecho_id: number;
  data_previsao: string;
  crescimento_cm_dia: number;
  altura_atual_cm: number;
  altura_prevista_cm: number;
  dias_ate_limite: number | null;
  temperatura_media_c: number | null;
  chuva_total_mm: number | null;
  criado_em: string;
};

export type Agendamento = {
  id: number;
  trecho_id: number;
  previsao_id: number | null;
  data_sugerida: string;
  prioridade: Prioridade;
  justificativa: string;
  fatores: string[] | null;
  status: StatusAgendamento;
  origem: Origem;
  modelo_usado: string | null;
  equipe_id: number | null;
  atualizado_em: string | null;
  criado_em: string;
};

/** Agendamento com o trecho e a equipe ja resolvidos, o que a agenda lista. */
export type AgendamentoDetalhado = Agendamento & {
  trecho: Pick<
    Trecho,
    "rodovia" | "km_inicio" | "km_fim" | "uf" | "sentido" | "especie" | "tipo_pista" | "altura_limite_cm" | "latitude" | "longitude"
  > & { id: number };
  equipe: { id: number; nome: string; base_uf: UF } | null;
  previsao: Pick<Previsao, "crescimento_cm_dia" | "altura_atual_cm" | "dias_ate_limite" | "chuva_total_mm" | "temperatura_media_c"> | null;
};

export type Equipe = {
  id: number;
  nome: string;
  base_uf: UF;
  base_cidade: string | null;
  capacidade_km_dia: number;
  ativo: boolean;
  lider_id: string | null;
};

export type Execucao = {
  id: number;
  agendamento_id: number | null;
  trecho_id: number;
  equipe_id: number | null;
  data_execucao: string;
  km_rocados: number;
  altura_antes_cm: number | null;
  altura_depois_cm: number | null;
  custo_reais: number | null;
  observacao: string | null;
};

export type ZonaClima = {
  id: number;
  rodovia: string;
  km_inicio: number;
  km_fim: number;
  latitude: number;
  longitude: number;
  nome: string | null;
  altitude_m: number | null;
  extensao_km: number;
};

/**
 * Uma execucao do workflow de reanalise no GitHub Actions.
 *
 * Vive aqui, e nao em `github.ts`, porque o componente cliente que acompanha o
 * progresso precisa do tipo, e `github.ts` importa `server-only`.
 */
export type ExecucaoAnalise = {
  id: number;
  nome: string;
  url: string;
  /** `queued` | `in_progress` | `completed`, vocabulario da propria API. */
  situacao: string;
  /** `success` | `failure` | `cancelled` | … So existe quando `completed`. */
  desfecho: string | null;
  criadaEm: string;
};

/** Numeros do topo do painel. */
export type Painel = {
  trechos_total: number;
  km_monitorados: number;
  por_risco: Record<Risco, number>;
  pendentes: number;
  aprovados: number;
  executados_30d: number;
  rocadas_proximos_7d: number;
  crescimento_medio_cm_dia: number;
  crescimento_maximo_cm_dia: number;
  trechos_acima_do_limite: number;
};
