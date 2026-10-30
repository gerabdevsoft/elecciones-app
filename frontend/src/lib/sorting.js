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
