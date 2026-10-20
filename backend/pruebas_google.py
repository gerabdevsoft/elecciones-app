"""Pruebas sin acceso a credenciales ni servicios externos."""

import unittest
from unittest.mock import MagicMock, patch

from google.cloud import documentai

from backend import servicios_google


def crear_entidad(tipo, valor="", hijos=None, confianza=0.99):
    return documentai.Document.Entity(
        type_=tipo,
        mention_text=valor,
        confidence=confianza,
        properties=hijos or [],
    )


def crear_documento(votos_validos="195", total="200", mesa="017", confianza=0.99):
    return documentai.Document(entities=[
        crear_entidad("numero_mesa", mesa),
        crear_entidad("electores_habilitados", "250"),
        crear_entidad("franja", hijos=[
            crear_entidad("franja/nombre_franja", "Presidente"),
            crear_entidad("franja/candidato", hijos=[
                crear_entidad("franja/candidato/nombre_candidato", "Candidatura A"),
                crear_entidad("franja/candidato/votos_candidato", "120", confianza=confianza),
            ]),
            crear_entidad("franja/candidato", hijos=[
                crear_entidad("franja/candidato/nombre_candidato", "Candidatura B"),
                crear_entidad("franja/candidato/votos_candidato", "75"),
            ]),
            crear_entidad("franja/votos_validos", votos_validos),
            crear_entidad("franja/votos_blancos", "3"),
            crear_entidad("franja/votos_nulos", "2"),
            crear_entidad("franja/total_emitidos", total),
        ]),
    ])


class PruebasResultadosGoogle(unittest.TestCase):
    def setUp(self):
        self.franjas = [{
            "id_franja": "franja-prueba",
            "nombre_franja": "Presidente",
            "nombre_papeleta": "Papeleta de prueba",
            "candidatos": [
                {"id_candidato": "candidato-a", "nombre": "Candidatura A"},
                {"id_candidato": "candidato-b", "nombre": "Candidatura B"},
            ],
        }]

    def validar(self, documento):
        return servicios_google.validar_y_mapear_resultados(documento, self.franjas, "17")

    def test_mapea_campos_anidados_a_identificadores_internos(self):
        resultado = self.validar(crear_documento())
        self.assertNotIn("error", resultado)
        self.assertEqual(
            resultado["conteos"][0]["votos_por_candidato"],
            {"candidato-a": 120, "candidato-b": 75},
        )

    def test_rechaza_suma_de_candidatos_incorrecta(self):
        resultado = self.validar(crear_documento(votos_validos="194"))
        self.assertEqual(resultado["conteos"], [])
        self.assertTrue(any("votos por candidato" in mensaje for mensaje in resultado["errores_validacion"]))

    def test_rechaza_total_emitido_incorrecto(self):
        resultado = self.validar(crear_documento(total="201"))
        self.assertEqual(resultado["conteos"], [])
        self.assertTrue(any("no suman" in mensaje for mensaje in resultado["errores_validacion"]))

    def test_rechaza_mesa_distinta(self):
        resultado = self.validar(crear_documento(mesa="18"))
        self.assertEqual(resultado["conteos"], [])
        self.assertTrue(any("mesa" in mensaje for mensaje in resultado["errores_validacion"]))

    def test_no_confunde_mesas_alfanumericas(self):
        resultado = servicios_google.validar_y_mapear_resultados(
            crear_documento(mesa="A17"), self.franjas, "B17",
        )
        self.assertIn("error", resultado)

    def test_rechaza_baja_confianza_sin_devolver_conteos(self):
        resultado = self.validar(crear_documento(confianza=0.5))
        self.assertEqual(resultado["conteos"], [])
        self.assertTrue(any("Confianza" in mensaje for mensaje in resultado["errores_validacion"]))

    def test_rechaza_conteos_no_enteros(self):
        resultado = self.validar(crear_documento(votos_validos="19,5"))
        self.assertEqual(resultado["conteos"], [])
        self.assertTrue(any("entero" in mensaje for mensaje in resultado["errores_validacion"]))

    def test_rechaza_fracciones_sin_candidaturas_configuradas(self):
        self.franjas[0]["candidatos"] = []
        self.assertIn("error", self.validar(crear_documento()))

    def test_rechaza_votos_superiores_a_electores_habilitados(self):
        documento = crear_documento()
        documento.entities[1].mention_text = "199"
        resultado = self.validar(documento)
        self.assertTrue(any("habilitados" in mensaje for mensaje in resultado["errores_validacion"]))

    @patch.object(servicios_google, "_bucket_actas")
    def test_guarda_archivo_original_y_url_firmada_temporal(self, obtener_bucket):
        objeto = MagicMock()
        objeto.name = "actas/eleccion/mesa-17.pdf"
        obtener_bucket.return_value.blob.return_value = objeto
        original = b"%PDF-1.7 documento de prueba"
        ruta = servicios_google.subir_archivo_google(objeto.name, original, "application/pdf")
        objeto.upload_from_string.assert_called_once_with(
            original, content_type="application/pdf", timeout=120,
        )
        self.assertEqual(ruta, objeto.name)
        servicios_google.crear_url_temporal_google(ruta)
        argumentos = objeto.generate_signed_url.call_args.kwargs
        self.assertEqual(argumentos["method"], "GET")
        self.assertEqual(argumentos["expiration"].total_seconds(), 900)
        self.assertEqual(objeto.cache_control, "private, no-store")


if __name__ == "__main__":
    unittest.main()
