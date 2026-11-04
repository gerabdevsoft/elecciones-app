"""Verifica el aislamiento y la agrupación de notificaciones públicas."""

import asyncio
import unittest

from backend.eventos_resultados import CanalesResultadosPublicos


class EventosResultadosTests(unittest.TestCase):
    def test_notifica_solo_la_eleccion_correspondiente(self):
        canales = CanalesResultadosPublicos()
        primera = canales.suscribir("primera")
        segunda = canales.suscribir("segunda")
        canales.publicar("primera")
        self.assertTrue(primera.get_nowait())
        self.assertTrue(segunda.empty())

    def test_agrupa_eventos_y_notifica_todos_los_suscriptores(self):
        canales = CanalesResultadosPublicos()
        colas = [canales.suscribir("eleccion") for _ in range(2)]
        for _ in range(100):
            canales.publicar("eleccion")
        for cola in colas:
            self.assertEqual(cola.qsize(), 1)
            self.assertTrue(cola.get_nowait())
        canales.publicar("eleccion")
        self.assertTrue(all(cola.qsize() == 1 for cola in colas))

    def test_desconexion_libera_el_canal(self):
        canales = CanalesResultadosPublicos()
        cola = canales.suscribir("eleccion")
        canales.desuscribir("eleccion", cola)
        canales.publicar("eleccion")
        self.assertEqual(canales.suscriptores, {})
        self.assertTrue(cola.empty())

    def test_espera_asincrona_recibe_una_notificacion(self):
        async def verificar():
            canales = CanalesResultadosPublicos()
            cola = canales.suscribir("eleccion")
            espera = asyncio.create_task(cola.get())
            await asyncio.sleep(0)
            canales.publicar("eleccion")
            self.assertTrue(await asyncio.wait_for(espera, timeout=1))

        asyncio.run(verificar())
