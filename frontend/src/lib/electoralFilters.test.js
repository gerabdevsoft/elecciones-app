import {
  construirFiltrosEstructura,
  filtrarAnforasPorEstructura,
} from "./electoralFilters";

const localizador = {
  nodos: [
    { id: "norte", nombre_nodo: "Norte", id_padre: null, nombre_nivel: "Departamento" },
    { id: "sur", nombre_nodo: "Sur", id_padre: null, nombre_nivel: "Departamento" },
    { id: "norte-1", nombre_nodo: "Zona 1", id_padre: "norte", nombre_nivel: "Zona" },
  ],
  recintos: [
    {
      id: "r2",
      nombre: "Escuela 10",
      id_nodo_padre: "norte-1",
      path_ancestros: [{ id: "norte" }],
    },
    {
      id: "r1",
      nombre: "Escuela 2",
      id_nodo_padre: "norte-1",
      path_ancestros: [{ id: "norte" }],
    },
    { id: "r3", nombre: "Escuela Sur", id_nodo_padre: "sur" },
  ],
  mesas: [
    { id: "m10", numero_mesa: "10", id_recinto: "r1" },
    { id: "m2", numero_mesa: "2", id_recinto: "r1" },
    { id: "m3", numero_mesa: "3", id_recinto: "r2" },
    { id: "m4", numero_mesa: "4", id_recinto: "r3" },
  ],
};

describe("construirFiltrosEstructura", () => {
  it("ordena niveles y recintos, y limita recintos y mesas al nodo seleccionado", () => {
    const filtros = construirFiltrosEstructura(localizador, ["norte", "norte-1"]);

    expect(filtros.niveles.map((nivel) => nivel.etiqueta)).toEqual(["Departamento", "Zona"]);
    expect(filtros.niveles[0].nodos.map((nodo) => nodo.nombre_nodo)).toEqual(["Norte", "Sur"]);
    expect(filtros.recintos.map((recinto) => recinto.id)).toEqual(["r1", "r2"]);
    expect(filtros.mesas.map((mesa) => mesa.id)).toEqual(["m2", "m3", "m10"]);
  });

  it("limita las mesas al recinto elegido y conserva estados sin selección", () => {
    const filtrosRecinto = construirFiltrosEstructura(localizador, ["norte"], "r1");
    expect(filtrosRecinto.mesas.map((mesa) => mesa.id)).toEqual(["m2", "m10"]);

    const filtrosVacios = construirFiltrosEstructura();
    expect(filtrosVacios.niveles).toEqual([]);
    expect(filtrosVacios.recintos).toEqual([]);
    expect(filtrosVacios.mesas).toEqual([]);

    const filtrosSinNodo = construirFiltrosEstructura(localizador);
    expect(filtrosSinNodo.recintos.map((recinto) => recinto.id)).toEqual(["r1", "r2", "r3"]);
    expect(filtrosSinNodo.mesas.map((mesa) => mesa.id)).toEqual(["m2", "m3", "m4", "m10"]);
  });
});

describe("filtrarAnforasPorEstructura", () => {
  const anforas = [
    {
      id: "a1",
      id_recinto: "r1",
      id_mesa: "m2",
      path_ancestros: [{ id: "norte" }, { id: "norte-1" }],
    },
    {
      id: "a2",
      id_recinto: "r2",
      id_mesa: "m3",
      path_ancestros: [{ id: "norte" }, { id: "norte-1" }],
    },
    { id: "a3", id_recinto: "r3", id_mesa: "m4", path_ancestros: [{ id: "sur" }] },
  ];

  it("aplica en cascada todos los nodos, recintos y mesas seleccionados", () => {
    expect(
      filtrarAnforasPorEstructura(anforas, ["norte", "norte-1"], "r1", "m2")
        .map((anfora) => anfora.id),
    ).toEqual(["a1"]);
  });

  it("devuelve una lista vacía cuando no hay coincidencias", () => {
    expect(filtrarAnforasPorEstructura(anforas, ["sur"], "r1")).toEqual([]);
  });
});
