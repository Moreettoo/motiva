import { Button, Heading, Text } from "@react-email/components";

import { BaseEmail, estiloBotao, estiloLinkCru, estiloTexto, estiloTitulo } from "./base";

export function EmailConvite({
  nomeConvidador,
  cargoRotulo,
  equipeNome,
  link,
  validoAte,
}: {
  nomeConvidador: string;
  cargoRotulo: string;
  equipeNome: string | null;
  link: string;
  /** Ja formatado por `fmt.dataMedia`, ex.: "17 de set. de 2026". */
  validoAte: string;
}) {
  return (
    <BaseEmail previa={`${nomeConvidador} convidou você para o HighwAI como ${cargoRotulo}.`}>
      <Heading as="h1" style={estiloTitulo}>Você foi convidado para o HighwAI</Heading>
      <Text style={estiloTexto}>
        {nomeConvidador} cadastrou você como <strong>{cargoRotulo}</strong>
        {equipeNome ? <> e líder da <strong>{equipeNome}</strong></> : null}. O HighwAI é o painel que
        planeja e acompanha a roçada da faixa de domínio das rodovias da Motiva.
      </Text>
      <Text style={estiloTexto}>Para entrar, escolha um nome e uma senha. Leva um minuto.</Text>
      <Button href={link} style={estiloBotao}>Aceitar convite</Button>
      <Text style={estiloTexto}>O convite vale até {validoAte}. Depois disso, peça um novo a quem convidou você.</Text>
      <Text style={estiloLinkCru}>Se o botão não abrir, copie este endereço: {link}</Text>
    </BaseEmail>
  );
}
