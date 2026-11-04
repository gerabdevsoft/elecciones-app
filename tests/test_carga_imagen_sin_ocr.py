"""La carga almacena fotografías sin consultar el servicio de reconocimiento."""

from io import BytesIO
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile
from backend import server


class CargaImagenSinOcrTests(unittest.IsolatedAsyncioTestCase):
    async def test_carga_solo_guarda_imagen(self):
        archivo = UploadFile(filename="acta.jpg", file=BytesIO(b"imagen-de-prueba"))
        db = SimpleNamespace(procesos_electorales=SimpleNamespace(
            find_one=AsyncMock(return_value={"id_eleccion": "prueba"}),
        ))
        with (
            patch.object(server, "db", db),
            patch.object(server, "_autorizar_anfora_operativa", new_callable=AsyncMock) as autorizar,
            patch.object(server, "subir_objeto", return_value={"path": "prueba/acta.jpg"}) as guardar,
            patch.object(server, "obtener_objeto") as leer,
            patch.object(server, "_procesar_document_ai") as reconocer,
        ):
            resultado = await server.subir_imagen_acta(
                id_eleccion="prueba", id_anfora="anfora", archivo=archivo,
                usuario={"id": "operador"},
            )
            autorizar.assert_awaited_once_with(
                {"id": "operador"}, "prueba", "anfora", "guardar",
            )
            guardar.assert_called_once()
            self.assertEqual(guardar.call_args.args[1], b"imagen-de-prueba")
            self.assertEqual(resultado, {
                "url_imagen": "/api/imagenes/prueba/acta.jpg",
                "ruta_storage": "prueba/acta.jpg",
            })
            leer.assert_not_called()
            reconocer.assert_not_called()

    async def test_ruta_ocr_no_procesa_imagenes(self):
        with patch.object(server, "_procesar_document_ai") as reconocer:
            with self.assertRaises(HTTPException) as error:
                await server.procesar_ocr(usuario={"id": "operador"})
            self.assertEqual(error.exception.status_code, 503)
            reconocer.assert_not_called()

    async def test_sin_permiso_no_guarda_imagen(self):
        db = SimpleNamespace(procesos_electorales=SimpleNamespace(
            find_one=AsyncMock(return_value={"id_eleccion": "prueba"}),
        ))
        with (
            patch.object(server, "db", db),
            patch.object(server, "_autorizar_anfora_operativa", new_callable=AsyncMock,
                         side_effect=HTTPException(403, "Sin permiso")),
            patch.object(server, "subir_objeto") as guardar,
        ):
            with self.assertRaises(HTTPException) as error:
                await server.subir_imagen_acta(
                    id_eleccion="prueba", id_anfora="anfora",
                    archivo=UploadFile(filename="acta.jpg", file=BytesIO(b"imagen")),
                    usuario={"id": "operador"},
                )
            self.assertEqual(error.exception.status_code, 403)
            guardar.assert_not_called()
