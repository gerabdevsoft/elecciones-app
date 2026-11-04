"""Notificaciones públicas de resultados sin almacenar datos de actas."""

import asyncio


class CanalesResultadosPublicos:
    def __init__(self):
        self.suscriptores: dict[str, set[asyncio.Queue]] = {}

    def suscribir(self, id_eleccion: str) -> asyncio.Queue:
        cola = asyncio.Queue(maxsize=1)
        self.suscriptores.setdefault(id_eleccion, set()).add(cola)
        return cola

    def desuscribir(self, id_eleccion: str, cola: asyncio.Queue) -> None:
        canales = self.suscriptores.get(id_eleccion, set())
        canales.discard(cola)
        if not canales:
            self.suscriptores.pop(id_eleccion, None)

    def publicar(self, id_eleccion: str) -> None:
        # Una señal pendiente basta: el cliente siempre consulta el total vigente.
        for cola in self.suscriptores.get(id_eleccion, set()):
            if cola.empty():
                cola.put_nowait(True)


canales_resultados_publicos = CanalesResultadosPublicos()
