import { Button, Heading, Text } from "@react-email/components";

import { BaseEmail, estiloBotao, estiloLinkCru, estiloTexto, estiloTitulo } from "./base";

export function EmailRedefinirSenha({ link, validoAte }: { link: string; validoAte: string }) {
  return (
    <BaseEmail previa="Link para definir uma senha nova no HighwAI.">
      <Heading as="h1" style={estiloTitulo}>Redefinir sua senha</Heading>
      <Text style={estiloTexto}>Alguém pediu uma senha nova para esta conta do HighwAI. Se foi você, siga pelo botão.</Text>
      <Button href={link} style={estiloBotao}>Definir senha nova</Button>
      <Text style={estiloTexto}>O link vale até {validoAte} e funciona uma vez só. Se não foi você, ignore: sua senha continua a mesma.</Text>
      <Text style={estiloLinkCru}>Se o botão não abrir, copie este endereço: {link}</Text>
    </BaseEmail>
  );
}
