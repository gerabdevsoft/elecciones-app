"""Verifica la ponderación configurable para resultados universitarios."""

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from backend import server


class CursorPrueba:
    def __init__(self, documentos):
        self.documentos = documentos

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, _limite):
        return self.documentos


class PonderacionUniversitariaTests(unittest.TestCase):
    def test_configuracion_acepta_las_dos_bases_y_precision_de_uno_a_tres(self):
        proceso = server.CrearProcesoReq(
            nombre="Segunda vuelta universitaria",
            tipo="universitaria",
            fecha_eleccion="2026-11-09",
            es_segunda_vuelta=True,
            base_ponderacion_segunda_vuelta="votantes_habilitados",
            precision_ponderacion_segunda_vuelta=3,
        )

        self.assertEqual(proceso.base_ponderacion_segunda_vuelta, "votantes_habilitados")
        self.assertEqual(proceso.precision_ponderacion_segunda_vuelta, 3)
        with self.assertRaises(Exception):
            server.ActualizarProcesoReq(precision_ponderacion_segunda_vuelta=4)

    def test_usa_habilitados_y_redondea_el_factor_a_la_precision_configurada(self):
        docentes = {
            "total_emitidos": 20,
            "base_votos": 18,
            "candidatos": [
                {"id_candidato": "a", "nombre": "Candidatura A", "votos": 8},
            ],
        }
        estudiantes = {
            "total_emitidos": 40,
            "base_votos": 38,
            "candidatos": [
                {"id_candidato": "a", "nombre": "Candidatura A", "votos": 12},
            ],
        }

        resultado = server._construir_ponderacion_reporte(
            docentes,
            estudiantes,
            base_ponderacion="votantes_habilitados",
            precision=1,
            habilitados_docentes=30,
            habilitados_estudiantes=100,
        )

        self.assertEqual(resultado["votos_estudiantes_por_voto_docente"], 3.3)
        self.assertEqual(resultado["total_base_docentes"], 30)
        self.assertEqual(resultado["total_base_estudiantes"], 100)
        self.assertEqual(resultado["candidatos"][0]["votos_docentes_equivalentes"], 26.4)
        self.assertEqual(resultado["candidatos"][0]["votos_ponderados"], 38.4)
        ponderacion_participacion = server._construir_ponderacion_reporte(
            docentes,
            estudiantes,
            base_ponderacion="votos_emitidos",
            precision=2,
        )
        self.assertEqual(
            ponderacion_participacion["votos_estudiantes_por_voto_docente"],
            2.0,
        )

    def test_calcula_ganador_de_segunda_vuelta_sin_umbral_estamentario(self):
        id_papeleta = "papeleta-rector"
        id_franja = "franja-rector"
        proceso = {
            "tipo": "universitaria",
            "es_segunda_vuelta": True,
            "base_ponderacion_segunda_vuelta": "votantes_habilitados",
            "precision_ponderacion_segunda_vuelta": 1,
            "papeletas": [{
                "id_papeleta": id_papeleta,
                "franjas": [{
                    "id_franja": id_franja,
                    "titulo": "Rector y Vicerrector",
                    "calcular_porcentaje_sobre": "solo_validos",
                    "candidatos": [
                        {"id_candidato": "a", "nombre": "Candidatura A"},
                        {"id_candidato": "b", "nombre": "Candidatura B"},
                    ],
                }],
            }],
        }
        actas = [
            {
                "id_anfora": "anfora-docente",
                "id_mesa": "mesa-docente",
                "conteos": [{
                    "id_franja": id_franja,
                    "votos_por_candidato": {"a": 20, "b": 10},
                }],
            },
            {
                "id_anfora": "anfora-estudiante",
                "id_mesa": "mesa-estudiante",
                "conteos": [{
                    "id_franja": id_franja,
                    "votos_por_candidato": {"a": 15, "b": 25},
                }],
            },
        ]
        anforas = [
            {
                "id_mesa": "mesa-docente",
                "id_papeletas": [id_papeleta],
                "cantidad_votantes": 50,
            },
            {
                "id_mesa": "mesa-estudiante",
                "id_papeletas": [id_papeleta],
                "cantidad_votantes": 100,
            },
        ]
        mesas = [
            {"id": "mesa-docente", "tipo_mesa": "docente"},
            {"id": "mesa-estudiante", "tipo_mesa": "estudiante"},
        ]
        buscar_anforas = MagicMock(return_value=CursorPrueba(anforas))
        buscar_mesas = MagicMock(return_value=CursorPrueba(mesas))
        base_datos_falsa = SimpleNamespace(
            anforas_mesa=SimpleNamespace(find=buscar_anforas),
            mesas_sufragio=SimpleNamespace(find=buscar_mesas),
        )

        with (
            patch.object(server, "db", base_datos_falsa),
            patch.object(
                server,
                "_actas_unicas_por_anfora",
                side_effect=lambda filas, _proceso: filas,
            ),
            patch.object(
                server,
                "_sincronizar_tipo_mesa_legado",
                new=AsyncMock(side_effect=lambda _id, filas, **_kwargs: filas),
            ),
        ):
            resultado = asyncio.run(
                server._calcular_resultado_universitario(
                    "eleccion-prueba",
                    proceso=proceso,
                    actas=actas,
                )
            )

        self.assertIn("mesa-docente", buscar_mesas.call_args.args[0]["id"]["$in"])
        self.assertIn(id_papeleta, buscar_anforas.call_args.args[0]["id_papeletas"]["$in"])
        por_franja = resultado["por_franja"][id_franja]
        self.assertEqual(por_franja["modo_resultado"], "segunda_vuelta_ponderada")
        self.assertEqual(
            por_franja["ponderacion"]["votos_estudiantes_por_voto_docente"],
            2.0,
            por_franja,
        )
        self.assertEqual(por_franja["ganadores_ponderados_nombres"], ["Candidatura A"])
        self.assertEqual(por_franja["ganadores_primera_vuelta"], [])
        self.assertEqual(por_franja["ganadores_ponderados"], ["a"])


if __name__ == "__main__":
    unittest.main()
