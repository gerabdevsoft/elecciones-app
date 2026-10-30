import {
  ordenarMesasNumericamente,
  ordenarNodosAlfabeticamente,
  ordenarRecintosAlfabeticamente,
} from "./sorting";

export function construirFiltrosEstructura(
  localizador = {},
  rutaNodos = [],
  idRecinto = "",
) {
  const nodos = localizador.nodos || [];
  const niveles = [];
  let idPadre = null;

  for (let indice = 0; ; indice += 1) {
    const nodosNivel = ordenarNodosAlfabeticamente(
      nodos.filter((nodo) => (nodo.id_padre || null) === idPadre),
    );
    if (!nodosNivel.length) break;

    niveles.push({
      indice,
      etiqueta: nodosNivel[0].nombre_nivel || "Estructura electoral",
      nodos: nodosNivel,
    });

    const idSeleccionado = rutaNodos[indice];
    if (!idSeleccionado) break;
    idPadre = idSeleccionado;
  }

  const idNodoTerminal = rutaNodos.at(-1) || "";
  const recintos = ordenarRecintosAlfabeticamente(
    (localizador.recintos || []).filter((recinto) => (
      !idNodoTerminal ||
      recinto.id_nodo_padre === idNodoTerminal ||
      (recinto.path_ancestros || []).some((nodo) => nodo.id === idNodoTerminal)
    )),
  );
  const idsRecintos = new Set(recintos.map((recinto) => recinto.id));
  const mesas = ordenarMesasNumericamente(
    (localizador.mesas || []).filter((mesa) => (
      (!idNodoTerminal || idsRecintos.has(mesa.id_recinto)) &&
      (!idRecinto || mesa.id_recinto === idRecinto)
    )),
  );

  return { niveles, idNodoTerminal, recintos, mesas };
}

export function filtrarAnforasPorEstructura(
  anforas = [],
  rutaNodos = [],
  idRecinto = "",
  idMesa = "",
) {
  return anforas.filter((anfora) => {
    const coincideRuta = rutaNodos.every((idNodo) => (
      (anfora.path_ancestros || []).some((nodo) => nodo.id === idNodo)
    ));
    return (
      coincideRuta &&
      (!idRecinto || anfora.id_recinto === idRecinto) &&
      (!idMesa || anfora.id_mesa === idMesa)
    );
  });
}
