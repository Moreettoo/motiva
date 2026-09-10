import { Smartphone } from "lucide-react";

import { Aviso } from "@/components/ui/aviso";
import { Cartao, CartaoCabecalho, CartaoCorpo } from "@/components/ui/cartao";
import { Chip } from "@/components/ui/chip";
import { fmt } from "@/lib/format";

/**
 * Como o Roçador instala o app de campo.
 *
 * O app não vive numa loja: é um APK anexado a uma release do GitHub, e o link
 * `releases/latest/download/campo.apk` é FIXO — ele segue apontando para a
 * release mais nova, então o QR em `public/icones/qr-apk.svg` (que codifica
 * exatamente esta string) não precisa ser gerado de novo a cada versão.
 *
 * Server Component: não há estado nenhum aqui, e a página é `force-dynamic` de
 * qualquer jeito.
 */

const LINK_APK = "https://github.com/Moreettoo/motiva/releases/latest/download/campo.apk";
const VERSAO = "campo-v0.1.0";

/**
 * Dia em que a release entra no ar; `null` quando já está publicada.
 *
 * Enquanto tem data, o cartão avisa que o link ainda não baixa nada — o link
 * definitivo já está aqui de propósito, para o QR impresso e o cartão não
 * mudarem quando a release sair. Publicada a release, troque por `null`: o
 * aviso sai e o resto do cartão continua igual.
 */
const DISPONIVEL_EM: string | null = "2026-09-12";

/**
 * O SHA-256 sai da página da release, calculado no arquivo publicado.
 * `null` até lá: um número inventado aqui seria pior que a ausência dele, já
 * que a conferência existe justamente para provar que o APK é o nosso.
 */
const SHA256: string | null = null;

const PASSOS = [
  "Abrir este link no celular Android — pelo QR ao lado, ou digitando o endereço.",
  'Quando o Android perguntar, permitir que o Chrome instale "apps de fontes desconhecidas". Ele pergunta uma vez só, e a permissão é do Chrome, não do nosso app.',
  "Abrir o app e entrar com o e-mail e a senha criados no convite.",
  "A primeira abertura precisa de sinal: é ela que baixa a lista de chamados. Depois disso o app funciona sem rede.",
];

export function BaixarApp() {
  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Baixar o app de campo"
        descricao="O que passar para a turma de roçada instalar no celular."
        icone={<Smartphone />}
        acoes={<Chip tamanho="sm">{VERSAO}</Chip>}
      />
      <CartaoCorpo className="flex flex-col gap-5">
        {DISPONIVEL_EM ? (
          /* `info`, e não `warning`: não há nada errado, só uma data. O tom
             `info` do Aviso usa a caixa neutra, então nenhuma cor de status
             aparece aqui sem precisar.

             Só a data, sem o dia da semana: `fmt.diaSemana` é `weekday: "short"`,
             feito para os cabeçalhos de coluna da agenda, e "sáb.," no meio de uma
             frase lê pior que a data inteira. Escrever "sábado" à mão sairia errado
             no dia em que `DISPONIVEL_EM` mudasse. */
          <Aviso tom="info" titulo={`Disponível a partir de ${fmt.dataMedia(DISPONIVEL_EM)}`}>
            <p>
              O endereço e o QR abaixo já são os definitivos. Até a release ser publicada, o link
              abre a página de releases sem baixar o arquivo.
            </p>
          </Aviso>
        ) : null}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          {/* O QR fica em SVG e sem `next/image`: é um desenho de 2,4 kB que
              precisa sair nítido tanto na tela quanto impresso e colado no
              alojamento da turma, e o otimizador só teria o que piorar — o
              `next/image` nem redimensiona SVG, só o serve por outra rota. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icones/qr-apk.svg"
            alt="QR code para baixar o app de campo"
            width={160}
            height={160}
            className="shrink-0 self-center rounded-md border border-border bg-surface-2 p-2 sm:self-start"
          />

          <div className="flex min-w-0 flex-col gap-4">
            <div className="min-w-0">
              <p className="text-xs text-ink-3">Endereço do APK</p>
              <a
                href={LINK_APK}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block font-mono text-2xs break-all text-ink-2 underline-offset-4 hover:underline"
              >
                {LINK_APK}
              </a>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-ink-3">Versão</p>
                <p className="mt-1 font-mono text-xs text-ink-2">{VERSAO}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-ink-3">SHA-256 do arquivo</p>
                <p className="mt-1 font-mono text-xs break-all text-ink-2">
                  {SHA256 ?? "publicado na página da release"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs text-ink-3">Como instalar</p>
          <ol className="mt-2 flex flex-col gap-2 text-sm text-ink-2">
            {PASSOS.map((passo, i) => (
              <li key={passo} className="flex gap-3">
                {/* O número é conteúdo, não decoração: quem lê a tela em voz
                    alta precisa dele para saber em que passo está. */}
                <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-2xs font-medium text-ink-2 tnum">
                  {fmt.n(i + 1)}
                </span>
                <span className="min-w-0">{passo}</span>
              </li>
            ))}
          </ol>
        </div>
      </CartaoCorpo>
    </Cartao>
  );
}
