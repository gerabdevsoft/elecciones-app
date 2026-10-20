"""Conexiones privadas con Google Cloud Storage y Document AI."""

import json
import os
import re
import unicodedata
from datetime import timedelta
from typing import Any

from google.api_core.client_options import ClientOptions
from google.cloud import documentai, storage
from google.oauth2 import service_account


CONFIANZA_MINIMA_ENTIDAD = 0.90


def _credenciales_google():
    contenido = os.environ.get("GOOGLE_CREDENCIALES_SERVICIO_JSON")
    if not contenido:
        raise RuntimeError("Falta configurar las credenciales privadas de Google Cloud")
    try:
        datos = json.loads(contenido)
        return service_account.Credentials.from_service_account_info(datos)
    except (json.JSONDecodeError, ValueError, TypeError) as error:
        raise RuntimeError("Las credenciales privadas de Google Cloud no tienen un formato válido") from error


def _cliente_almacenamiento():
    proyecto = os.environ.get("GOOGLE_ID_PROYECTO")
    if not proyecto:
        raise RuntimeError("Falta configurar el proyecto de Google Cloud")
    return storage.Client(project=proyecto, credentials=_credenciales_google())


def _bucket_actas():
    nombre = os.environ.get("GOOGLE_BUCKET_ACTAS")
    if not nombre:
        raise RuntimeError("Falta configurar el bucket de imágenes")
    return _cliente_almacenamiento().bucket(nombre)


def subir_archivo_google(ruta: str, contenido: bytes, tipo_contenido: str) -> str:
    objeto = _bucket_actas().blob(ruta)
    objeto.cache_control = "private, no-store"
    objeto.upload_from_string(contenido, content_type=tipo_contenido, timeout=120)
    return objeto.name


def descargar_archivo_google(ruta: str) -> tuple[bytes, str]:
    objeto = _bucket_actas().blob(ruta)
    objeto.reload(timeout=30)
    contenido = objeto.download_as_bytes(timeout=120)
    return contenido, objeto.content_type or "application/octet-stream"


def crear_url_temporal_google(ruta: str, minutos: int = 15) -> str:
    objeto = _bucket_actas().blob(ruta)
    return objeto.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=minutos),
        method="GET",
    )


def procesar_documento_google(contenido: bytes, tipo_contenido: str):
    proyecto = os.environ.get("GOOGLE_ID_PROYECTO")
    ubicacion = os.environ.get("GOOGLE_REGION_DOCUMENT_AI")
    procesador = os.environ.get("GOOGLE_ID_PROCESADOR_DOCUMENT_AI")
    if not proyecto or not ubicacion or not procesador:
        raise RuntimeError("Falta configurar el proyecto, la región o el procesador de Document AI")

    cliente = documentai.DocumentProcessorServiceClient(
        client_options=ClientOptions(api_endpoint=f"{ubicacion}-documentai.googleapis.com"),
        credentials=_credenciales_google(),
    )
    solicitud = documentai.ProcessRequest(
        name=cliente.processor_path(proyecto, ubicacion, procesador),
        raw_document=documentai.RawDocument(
            content=contenido,
            mime_type=tipo_contenido,
        ),
    )
    return cliente.process_document(request=solicitud, timeout=120).document


def normalizar_nombre(texto: str) -> str:
    texto_normalizado = unicodedata.normalize("NFKD", texto or "")
    sin_tildes = "".join(caracter for caracter in texto_normalizado if not unicodedata.combining(caracter))
    return re.sub(r"\s+", " ", re.sub(r"[^a-zA-Z0-9 ]", " ", sin_tildes)).strip().casefold()


def _entidades_de(entidades: list[Any], tipo: str) -> list[Any]:
    return [
        entidad for entidad in entidades
        if getattr(entidad, "type_", "").rsplit("/", 1)[-1] == tipo
    ]


def _texto_de(entidad: Any) -> str:
    return str(getattr(entidad, "mention_text", "") or "").strip()


def _confianza_de(entidad: Any) -> float:
    return float(getattr(entidad, "confidence", 0) or 0)


def _campo_unico(
    entidades: list[Any],
    tipo: str,
    etiqueta: str,
    errores: list[str],
    obligatorio: bool = True,
) -> Any | None:
    coincidencias = _entidades_de(entidades, tipo)
    if len(coincidencias) != 1:
        if obligatorio or coincidencias:
            errores.append(f"Se esperaba un solo campo «{etiqueta}» y se encontraron {len(coincidencias)}")
        return None
    entidad = coincidencias[0]
    if _confianza_de(entidad) < CONFIANZA_MINIMA_ENTIDAD:
        errores.append(f"Confianza insuficiente para «{etiqueta}»")
    if not _texto_de(entidad):
        errores.append(f"El campo «{etiqueta}» está vacío")
        return None
    return entidad


def _numero_entidad(entidades: list[Any], tipo: str, etiqueta: str, errores: list[str]) -> int | None:
    entidad = _campo_unico(entidades, tipo, etiqueta, errores)
    if entidad is None:
        return None
    texto = re.sub(r"\s+", "", _texto_de(entidad))
    if not re.fullmatch(r"\d+|\d{1,3}(?:[.,]\d{3})+", texto):
        errores.append(f"El campo «{etiqueta}» no es un número entero válido")
        return None
    return int(re.sub(r"[.,]", "", texto))


def _mesa_normalizada(texto: str) -> str:
    texto_limpio = (texto or "").strip()
    return str(int(texto_limpio)) if texto_limpio.isdigit() else normalizar_nombre(texto_limpio)


def validar_y_mapear_resultados(
    documento: Any,
    franjas_esperadas: list[dict[str, Any]],
    numero_mesa_esperado: str,
) -> dict[str, Any]:
    """Valida entidades del Custom Extractor y las convierte al formato de la app."""
    errores: list[str] = []
    entidades = list(getattr(documento, "entities", []) or [])

    entidad_mesa = _campo_unico(entidades, "numero_mesa", "número de mesa", errores)
    numero_mesa = _texto_de(entidad_mesa) if entidad_mesa else ""
    if numero_mesa and _mesa_normalizada(numero_mesa) != _mesa_normalizada(numero_mesa_esperado):
        errores.append("El número de mesa del acta no coincide con el ánfora seleccionada")

    electores_habilitados = _numero_entidad(
        entidades,
        "electores_habilitados",
        "electores habilitados",
        errores,
    )
    franjas_documento = _entidades_de(entidades, "franja")
    if not franjas_documento:
        errores.append("Document AI no encontró franjas de votación")

    conteos: list[dict[str, Any]] = []
    franjas_procesadas: set[str] = set()
    for entidad_franja in franjas_documento:
        campos_franja = list(getattr(entidad_franja, "properties", []) or [])
        entidad_nombre = _campo_unico(campos_franja, "nombre_franja", "nombre de franja", errores)
        if entidad_nombre is None:
            continue
        nombre_franja = _texto_de(entidad_nombre)

        entidad_papeleta = _campo_unico(
            campos_franja,
            "nombre_papeleta",
            "nombre de papeleta",
            errores,
            obligatorio=False,
        )
        nombre_papeleta = _texto_de(entidad_papeleta) if entidad_papeleta else ""
        franjas_coincidentes = [
            franja for franja in franjas_esperadas
            if normalizar_nombre(franja["nombre_franja"]) == normalizar_nombre(nombre_franja)
            and (
                not nombre_papeleta
                or normalizar_nombre(franja["nombre_papeleta"]) == normalizar_nombre(nombre_papeleta)
            )
        ]
        if len(franjas_coincidentes) != 1:
            errores.append(f"No se pudo asociar la franja «{nombre_franja}» con una franja única de la elección")
            continue
        franja_esperada = franjas_coincidentes[0]
        if franja_esperada["id_franja"] in franjas_procesadas:
            errores.append(f"La franja «{nombre_franja}» aparece más de una vez")
            continue
        franjas_procesadas.add(franja_esperada["id_franja"])

        votos_candidatos: dict[str, int] = {}
        candidatos_documento = _entidades_de(campos_franja, "candidato")
        for entidad_candidato in candidatos_documento:
            campos_candidato = list(getattr(entidad_candidato, "properties", []) or [])
            entidad_nombre_candidato = _campo_unico(
                campos_candidato,
                "nombre_candidato",
                "nombre de candidato",
                errores,
            )
            votos_candidato = _numero_entidad(
                campos_candidato,
                "votos_candidato",
                "votos de candidato",
                errores,
            )
            if entidad_nombre_candidato is None or votos_candidato is None:
                continue
            nombre_candidato = _texto_de(entidad_nombre_candidato)
            candidatos_coincidentes = [
                candidato for candidato in franja_esperada["candidatos"]
                if normalizar_nombre(candidato["nombre"]) == normalizar_nombre(nombre_candidato)
            ]
            if len(candidatos_coincidentes) != 1:
                errores.append(
                    f"No se pudo asociar el candidato «{nombre_candidato}» con una candidatura única"
                )
                continue
            id_candidato = candidatos_coincidentes[0]["id_candidato"]
            if id_candidato in votos_candidatos:
                errores.append(f"El candidato «{nombre_candidato}» aparece más de una vez")
                continue
            votos_candidatos[id_candidato] = votos_candidato

        ids_esperados = {candidato["id_candidato"] for candidato in franja_esperada["candidatos"]}
        ids_detectados = set(votos_candidatos)
        if ids_esperados != ids_detectados:
            errores.append(f"Faltan candidaturas o votos por leer en la franja «{nombre_franja}»")

        votos_validos = _numero_entidad(campos_franja, "votos_validos", "votos válidos", errores)
        votos_blancos = _numero_entidad(campos_franja, "votos_blancos", "votos blancos", errores)
        votos_nulos = _numero_entidad(campos_franja, "votos_nulos", "votos nulos", errores)
        total_emitidos = _numero_entidad(campos_franja, "total_emitidos", "total emitido", errores)
        if None not in (votos_validos, votos_blancos, votos_nulos, total_emitidos):
            if sum(votos_candidatos.values()) != votos_validos:
                errores.append(f"La suma de votos por candidato no coincide con los votos válidos en «{nombre_franja}»")
            if votos_validos + votos_blancos + votos_nulos != total_emitidos:
                errores.append(f"Los votos válidos, blancos y nulos no suman el total emitido en «{nombre_franja}»")
            if electores_habilitados is not None and total_emitidos > electores_habilitados:
                errores.append(f"El total emitido supera los electores habilitados en «{nombre_franja}»")
            conteos.append({
                "id_franja": franja_esperada["id_franja"],
                "votos_por_candidato": votos_candidatos,
                "votos_blancos": votos_blancos,
                "votos_nulos": votos_nulos,
                "votos_validos": votos_validos,
                "total_emitidos": total_emitidos,
            })

    if franjas_procesadas != {franja["id_franja"] for franja in franjas_esperadas}:
        errores.append("El acta no contiene todas las franjas asociadas al ánfora seleccionada")

    if errores:
        return {
            "error": "No se aceptaron los resultados del OCR; revise el acta y vuelva a cargarla.",
            "errores_validacion": list(dict.fromkeys(errores)),
            "conteos": [],
        }
    return {
        "numero_mesa": numero_mesa,
        "electores_habilitados": electores_habilitados,
        "conteos": conteos,
        "errores_validacion": [],
    }
