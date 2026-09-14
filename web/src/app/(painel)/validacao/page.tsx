import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { AvisoSomenteLeitura } from "@/components/ui/aviso-somente-leitura";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { podeEscrever } from "@/lib/auth/permissoes";
import { exigirCargo } from "@/lib/auth/sessao";
import { levantamentosImportados } from "@/lib/levantamentos/queries";
import { distanciaFronteiraClasse1, ndviAnalises, validacaoVigente, validacoesSensibilidade } from "@/lib/validacao/queries";

import { LevantamentosImportados } from "./_componentes/levantamentos-importados";
import { Limitacoes } from "./_componentes/limitacoes";
import { MatrizConfusao } from "./_componentes/matriz-confusao";
import { NdviSeparacao } from "./_componentes/ndvi-separacao";
import { ResumoValidacao } from "./_componentes/resumo-validacao";
import { Sensibilidade } from "./_componentes/sensibilidade";

export const metadata: Metadata = {
  title: "Validação",
  description: "O modelo de crescimento confrontado com o levantamento de campo da Motiva: acertos, erros, calibração e o satélite.",
};

export const dynamic = "force-dynamic";

export default async function PaginaValidacao() {
  const sessao = await exigirCargo("super_admin", "admin", "analista");
  const escreve = podeEscrever(sessao.cargo);
  const vigente = await validacaoVigente();
  const [sensibilidade, ndvi, distanciaFronteira, importados] = await Promise.all([
    vigente ? validacoesSensibilidade(vigente) : Promise.resolve([]),
    ndviAnalises(),
    vigente ? distanciaFronteiraClasse1(vigente) : Promise.resolve(null),
    levantamentosImportados(),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Validação"
        descricao="A acurácia deixou de ser alegação: é medida contra o que a equipe da Motiva viu na estrada."
      />
      <AvisoSomenteLeitura podeEscrever={escreve} />

      <div className="grid gap-4">
        {vigente ? (
          <>
            <ResumoValidacao v={vigente} />
            <div className="grid gap-4 lg:grid-cols-2">
              <MatrizConfusao v={vigente} />
              <Limitacoes v={vigente} distanciaFronteiraCm={distanciaFronteira} />
            </div>
            <Sensibilidade linhas={sensibilidade} />
          </>
        ) : (
          <Cartao>
            <CartaoCabecalho titulo="Nenhuma validação gravada" descricao="Rode `pesquisa/validar.py` e `pesquisa/publicar_rodoanel.py`. Esta página lê `ia.validacoes`." />
            <CartaoCorpo><p className="text-sm text-ink-2">Sem validação não há calibração, e o lote roda com o modelo sintético puro. A página existe para isso nunca passar despercebido.</p></CartaoCorpo>
          </Cartao>
        )}
        <NdviSeparacao analises={ndvi} />
        <LevantamentosImportados linhas={importados} />
      </div>
    </div>
  );
}
