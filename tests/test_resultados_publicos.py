"""Verifica la caché breve y su invalidación en Resultados públicos."""

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from backend import server


class ResultadosPublicosCacheTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server._resultados_publicos_cache.clear()
        server._resultados_publicos_versiones.clear()
        server._resultados_publicos_locks.clear()

    async def asyncTearDown(self):
        server._resultados_publicos_cache.clear()
        server._resultados_publicos_versiones.clear()
        server._resultados_publicos_locks.clear()

    async def test_agrupa_solicitudes_concurrentes_de_la_misma_eleccion(self):
        async def generar(id_eleccion, id_papeleta, id_franja):
            await asyncio.sleep(0.01)
            return {
                "proceso": {"id_eleccion": id_eleccion},
                "seleccion": {"id_papeleta": id_papeleta, "id_franja": id_franja},
            }

        with patch.object(server, "_generar_resultados_publicos", new=AsyncMock(side_effect=generar)) as generar_mock:
            primero, segundo = await asyncio.gather(
                server.resultados_publicos("eleccion-prueba"),
                server.resultados_publicos("eleccion-prueba"),
            )

        self.assertEqual(primero, segundo)
        generar_mock.assert_awaited_once_with("eleccion-prueba", None, None)

    async def test_consolidacion_invalida_la_cache_de_esa_eleccion(self):
        resultado = {"proceso": {"id_eleccion": "eleccion-prueba"}}
        with patch.object(
            server,
            "_generar_resultados_publicos",
            new=AsyncMock(return_value=resultado),
        ) as generar_mock:
            await server.resultados_publicos("eleccion-prueba")
            await server.gestor_resultados_en_vivo.publicar(
                "eleccion-prueba",
                {"evento": "acta_consolidada"},
            )
            actualizado = await server.resultados_publicos("eleccion-prueba")

        self.assertEqual(actualizado, resultado)
        self.assertEqual(generar_mock.await_count, 2)


class LocalizadorPublicoCacheTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        server._localizador_publico_cache.clear()
        server._localizador_publico_locks.clear()

    async def asyncTearDown(self):
        server._localizador_publico_cache.clear()
        server._localizador_publico_locks.clear()

    async def test_reutiliza_el_localizador_durante_el_ttl(self):
        datos = {"actas": [{"id_acta": "acta-prueba"}]}
        with patch.object(
            server,
            "_generar_localizador_publico_actas",
            new=AsyncMock(return_value=datos),
        ) as generar_mock:
            primero = await server.localizador_publico_actas("eleccion-cache")
            segundo = await server.localizador_publico_actas("eleccion-cache")

        self.assertEqual(primero, datos)
        self.assertEqual(segundo, datos)
        generar_mock.assert_awaited_once_with("eleccion-cache")

    async def test_la_consolidacion_invalida_el_localizador(self):
        with patch.object(
            server,
            "_generar_localizador_publico_actas",
            new=AsyncMock(side_effect=[
                {"actas": []},
                {"actas": [{"id_acta": "acta-consolidada"}]},
            ]),
        ) as generar_mock:
            await server.localizador_publico_actas("eleccion-invalida-cache")
            server._invalidar_cache_resultados_publicos("eleccion-invalida-cache")
            actualizado = await server.localizador_publico_actas("eleccion-invalida-cache")

        self.assertEqual(actualizado, {"actas": [{"id_acta": "acta-consolidada"}]})
        self.assertEqual(generar_mock.await_count, 2)

