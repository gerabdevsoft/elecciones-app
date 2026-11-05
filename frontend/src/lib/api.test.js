import { normalizarRutaApi } from "./api";

describe("normalizarRutaApi", () => {
  test("quita el prefijo /api cuando el cliente ya lo agrega", () => {
    expect(normalizarRutaApi("/api/imagenes/stre-electoral/actas/acta.jpg"))
      .toBe("/imagenes/stre-electoral/actas/acta.jpg");
  });

  test("conserva rutas sin el prefijo /api", () => {
    expect(normalizarRutaApi("/imagenes/actas/acta.jpg"))
      .toBe("/imagenes/actas/acta.jpg");
  });

  test("conserva valores que no son rutas de texto", () => {
    expect(normalizarRutaApi(null)).toBeNull();
  });
});
