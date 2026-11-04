const comparadorNatural = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

function ordenarPorNumeroNatural(elementos, campo) {
  return [...elementos].sort((a, b) => (
    comparadorNatural.compare(String(a[campo] ?? ""), String(b[campo] ?? "")) ||
    String(a.id ?? "").localeCompare(String(b.id ?? ""))
  ));
}

export function ordenarCandidatosPorNumeroLista(candidatos = []) {
  return candidatos
    .map((candidato, indice) => ({ candidato, indice, numero: Number(candidato?.numero_lista) }))
    .sort((a, b) => {
      const aTieneNumero = Number.isFinite(a.numero) && a.candidato?.numero_lista !== null && a.candidato?.numero_lista !== undefined && a.candidato?.numero_lista !== "";
      const bTieneNumero = Number.isFinite(b.numero) && b.candidato?.numero_lista !== null && b.candidato?.numero_lista !== undefined && b.candidato?.numero_lista !== "";
      if (aTieneNumero !== bTieneNumero) return aTieneNumero ? -1 : 1;
      if (aTieneNumero && a.numero !== b.numero) return a.numero - b.numero;
      return a.indice - b.indice;
    })
    .map(({ candidato }) => candidato);
}

export function ordenarMesasNumericamente(mesas = []) {
  return ordenarPorNumeroNatural(mesas, "numero_mesa");
}

export function ordenarAnforasNumericamente(anforas = []) {
  return ordenarPorNumeroNatural(anforas, "numero_anfora");
}

export function ordenarRecintosAlfabeticamente(recintos = []) {
  return [...recintos].sort((a, b) => (
    comparadorNatural.compare(String(a.nombre ?? ""), String(b.nombre ?? "")) ||
    String(a.id ?? "").localeCompare(String(b.id ?? ""))
  ));
}

export function ordenarNodosAlfabeticamente(nodos = []) {
  return [...nodos].sort((a, b) => (
    comparadorNatural.compare(String(a.nombre_nodo ?? ""), String(b.nombre_nodo ?? "")) ||
    String(a.id ?? "").localeCompare(String(b.id ?? ""))
  ));
}
