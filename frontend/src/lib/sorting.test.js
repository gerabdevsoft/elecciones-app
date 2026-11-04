import { ordenarCandidatosPorNumeroLista } from "./sorting";

describe("ordenarCandidatosPorNumeroLista", () => {
  test("ordena numéricamente por el número de sorteo", () => {
    const candidatos = [
      { id_candidato: "c100", numero_lista: 100 },
      { id_candidato: "c2", numero_lista: 2 },
      { id_candidato: "c10", numero_lista: "10" },
      { id_candidato: "c1", numero_lista: 1 },
    ];

    expect(ordenarCandidatosPorNumeroLista(candidatos).map(({ id_candidato }) => id_candidato))
      .toEqual(["c1", "c2", "c10", "c100"]);
  });

  test("mantiene al final y en orden original candidatos sin número", () => {
    const candidatos = [
      { id_candidato: "sin-lista-a" },
      { id_candidato: "lista-2", numero_lista: 2 },
      { id_candidato: "sin-lista-b", numero_lista: null },
      { id_candidato: "lista-1", numero_lista: 1 },
    ];

    expect(ordenarCandidatosPorNumeroLista(candidatos).map(({ id_candidato }) => id_candidato))
      .toEqual(["lista-1", "lista-2", "sin-lista-a", "sin-lista-b"]);
  });

  test("no modifica la lista original", () => {
    const candidatos = [{ numero_lista: 2 }, { numero_lista: 1 }];

    ordenarCandidatosPorNumeroLista(candidatos);

    expect(candidatos.map(({ numero_lista }) => numero_lista)).toEqual([2, 1]);
  });
});
