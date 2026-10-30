const comparadorNatural = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

export function ordenarMesasNumericamente(mesas = []) {
  return [...mesas].sort((a, b) => (
    comparadorNatural.compare(String(a.numero_mesa ?? ""), String(b.numero_mesa ?? "")) ||
    String(a.id ?? "").localeCompare(String(b.id ?? ""))
  ));
}
