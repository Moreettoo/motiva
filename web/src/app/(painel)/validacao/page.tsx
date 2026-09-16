import { redirect } from "next/navigation";

/**
 * A pagina de validacao virou `/evidencia`, no grupo Laboratorio.
 *
 * O arquivo continua existindo em vez de a rota simplesmente sumir porque o
 * link daqui circulou: a ficha do modelo no Copiloto apontava para ca, e o
 * endereco pode estar salvo. Um 404 mandaria quem tem o link velho para uma
 * tela de erro sobre uma pagina que existe, so que com outro nome.
 */
export default function PaginaValidacao() {
  redirect("/evidencia");
}
