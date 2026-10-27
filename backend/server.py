"""
STRE - Sistema de Transmisión de Resultados Electorales
Backend FastAPI - Todo en español
"""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import json
import logging
import base64
import asyncio
import requests
import re
import unicodedata
import random
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Any
from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Depends,
    Header,
    UploadFile,
    File,
    Form,
    WebSocket,
    WebSocketDisconnect,
    Request,
)
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("stre")

# ------------- Configuración -------------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = 'HS256'
APP_NAME = os.environ.get('APP_NAME', 'stre-electoral')
GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "").strip()
GCS_SERVICE_ACCOUNT_JSON = os.environ.get("GCS_SERVICE_ACCOUNT_JSON", "")
DOCUMENT_AI_PROCESSOR_ID = os.environ.get("DOCUMENT_AI_PROCESSOR_ID", "").strip()
DOCUMENT_AI_LOCATION = os.environ.get("DOCUMENT_AI_LOCATION", "").strip()

# ------------- DB -------------
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

# ------------- App -------------
app = FastAPI(title="STRE - Backend Electoral", version="1.0.0")
api = APIRouter(prefix="/api")


class GestorResultadosEnVivo:
    def __init__(self):
        self.conexiones: dict[str, set[WebSocket]] = {}

    async def conectar(
        self,
        id_eleccion: str,
        websocket: WebSocket,
        subprotocolo: Optional[str] = None,
    ) -> None:
        await websocket.accept(subprotocol=subprotocolo)
        self.conexiones.setdefault(id_eleccion, set()).add(websocket)

    def desconectar(self, id_eleccion: str, websocket: WebSocket) -> None:
        conexiones = self.conexiones.get(id_eleccion, set())
        conexiones.discard(websocket)
        if not conexiones:
            self.conexiones.pop(id_eleccion, None)

    async def publicar(self, id_eleccion: str, evento: dict) -> None:
        conexiones = list(self.conexiones.get(id_eleccion, set()))
        for websocket in conexiones:
            try:
                await websocket.send_json(evento)
            except Exception:
                self.desconectar(id_eleccion, websocket)


gestor_resultados_en_vivo = GestorResultadosEnVivo()

# ------------- Almacenamiento en Google Cloud Storage -------------
_gcs_bucket: Any = None


def obtener_bucket_gcs():
    """Devuelve el bucket privado configurado usando la credencial del proyecto."""
    global _gcs_bucket
    if _gcs_bucket is not None:
        return _gcs_bucket
    if not GCS_BUCKET_NAME or not GCS_SERVICE_ACCOUNT_JSON:
        raise HTTPException(
            503,
            "Configura GCS_BUCKET_NAME y GCS_SERVICE_ACCOUNT_JSON para almacenar imágenes.",
        )
    try:
        from google.cloud import storage

        datos_cuenta = json.loads(GCS_SERVICE_ACCOUNT_JSON)
        cliente = storage.Client.from_service_account_info(datos_cuenta)
        _gcs_bucket = cliente.bucket(GCS_BUCKET_NAME)
        return _gcs_bucket
    except Exception as e:
        logger.error("No se pudo configurar Google Cloud Storage: %s", type(e).__name__)
        raise HTTPException(
            503,
            "No se pudo configurar el acceso al bucket de Google Cloud Storage.",
        ) from e

def subir_objeto(ruta: str, datos: bytes, tipo_contenido: str) -> dict:
    try:
        blob = obtener_bucket_gcs().blob(ruta)
        blob.upload_from_string(datos, content_type=tipo_contenido)
        return {"path": ruta}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("No se pudo subir la imagen a Google Cloud Storage: %s", type(e).__name__)
        raise HTTPException(
            503,
            "No se pudo guardar la imagen en el bucket de Google Cloud Storage.",
        ) from e

def obtener_objeto(ruta: str) -> tuple[bytes, str]:
    from google.api_core.exceptions import NotFound

    try:
        blob = obtener_bucket_gcs().blob(ruta)
        blob.reload()
        return blob.download_as_bytes(), blob.content_type or "image/jpeg"
    except NotFound as e:
        raise HTTPException(404, "Imagen no encontrada") from e
    except HTTPException:
        raise
    except Exception as e:
        logger.error("No se pudo leer la imagen de Google Cloud Storage: %s", type(e).__name__)
        raise HTTPException(
            503,
            "No se pudo leer la imagen desde el bucket de Google Cloud Storage.",
        ) from e


def _procesar_document_ai(contenido: bytes, tipo_mime: str) -> dict:
    """Procesa con Document AI la imagen leída desde el bucket de Google Cloud."""
    if not DOCUMENT_AI_PROCESSOR_ID or not DOCUMENT_AI_LOCATION:
        raise RuntimeError(
            "Configura DOCUMENT_AI_PROCESSOR_ID y DOCUMENT_AI_LOCATION para habilitar el OCR."
        )
    if not re.fullmatch(r"[a-z0-9-]+", DOCUMENT_AI_LOCATION):
        raise RuntimeError("La ubicación del procesador Document AI no es válida.")
    if not re.fullmatch(r"[a-zA-Z0-9-]+", DOCUMENT_AI_PROCESSOR_ID):
        raise RuntimeError("El ID del procesador Document AI no es válido.")

    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        from google.oauth2 import service_account

        datos_cuenta = json.loads(GCS_SERVICE_ACCOUNT_JSON)
        credenciales = service_account.Credentials.from_service_account_info(
            datos_cuenta,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        if not credenciales.project_id:
            raise RuntimeError("La cuenta de servicio no incluye el ID del proyecto.")
        credenciales.refresh(GoogleAuthRequest())

        endpoint = (
            f"https://{DOCUMENT_AI_LOCATION}-documentai.googleapis.com/v1/"
            f"projects/{credenciales.project_id}/locations/{DOCUMENT_AI_LOCATION}/"
            f"processors/{DOCUMENT_AI_PROCESSOR_ID}:process"
        )
        solicitud = {
            "rawDocument": {
                "content": base64.b64encode(contenido).decode("ascii"),
                "mimeType": tipo_mime,
            },
        }
        respuesta = requests.post(
            endpoint,
            headers={"Authorization": f"Bearer {credenciales.token}"},
            json=solicitud,
            timeout=120,
        )
        if respuesta.status_code >= 400:
            logger.error("Document AI respondió con HTTP %s durante el OCR", respuesta.status_code)
            if respuesta.status_code == 403:
                detalle = " Verifica que la API esté habilitada y que la cuenta de servicio tenga acceso al procesador."
            elif respuesta.status_code == 404:
                detalle = " Verifica el proyecto, la ubicación y el ID del procesador."
            else:
                detalle = ""
            raise RuntimeError(
                f"Document AI respondió con HTTP {respuesta.status_code}.{detalle}"
            )
        documento = respuesta.json().get("document")
        if not isinstance(documento, dict):
            raise RuntimeError("Document AI no devolvió un documento procesado.")
        return documento
    except RuntimeError:
        raise
    except Exception as e:
        logger.error("No se pudo completar el OCR con Document AI: %s", type(e).__name__)
        raise RuntimeError(
            "No se pudo conectar con Document AI. Verifica la configuración y los permisos "
            "de la cuenta de servicio de Google Cloud."
        ) from e


def _normalizar_texto_ocr(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", texto or "")
    return re.sub(r"[^a-z0-9]+", " ", sin_acentos.encode("ascii", "ignore").decode().lower()).strip()


def _texto_de_layout(layout: dict, texto_completo: str) -> str:
    segmentos = layout.get("textAnchor", {}).get("textSegments", [])
    partes = []
    for segmento in segmentos:
        inicio = int(segmento.get("startIndex", 0))
        fin = int(segmento.get("endIndex", inicio))
        if fin > inicio:
            partes.append(texto_completo[inicio:fin])
    return " ".join(partes).strip()


def _valor_entero(texto: str) -> Optional[int]:
    numeros = re.findall(r"(?<!\d)\d{1,6}(?!\d)", texto or "")
    if len(numeros) != 1:
        return None
    try:
        return int(numeros[0])
    except ValueError:
        return None


def _extraer_conteos_document_ai(documento: dict, franjas: list[dict]) -> tuple[list[dict], list[dict]]:
    """Mapea campos y filas reconocidas cuando el nombre del candidato es explícito."""
    texto_completo = documento.get("text", "")
    paginas = documento.get("pages", [])
    conteos = {
        franja["id_franja"]: {
            "id_franja": franja["id_franja"],
            "votos_por_candidato": {},
            "votos_blancos": None,
            "votos_nulos": None,
        }
        for franja in franjas
    }
    campos_detectados = []

    def asignar_valor(etiqueta: str, valor: str) -> None:
        etiqueta_norm = _normalizar_texto_ocr(etiqueta)
        valor_numero = _valor_entero(valor)
        if valor_numero is None:
            return
        for franja in franjas:
            for candidato in franja.get("candidatos", []):
                nombre = _normalizar_texto_ocr(candidato.get("nombre", ""))
                if len(nombre) >= 3 and nombre in etiqueta_norm:
                    conteos[franja["id_franja"]]["votos_por_candidato"].setdefault(
                        candidato["id_candidato"], valor_numero
                    )
                    return
        es_blanco = "blanco" in etiqueta_norm
        es_nulo = "nulo" in etiqueta_norm
        if not (es_blanco or es_nulo):
            return
        franjas_coincidentes = [
            franja for franja in franjas
            if any(
                indicador and indicador in etiqueta_norm
                for indicador in (
                    _normalizar_texto_ocr(franja.get("titulo", "")),
                    _normalizar_texto_ocr(franja.get("nombre_papeleta", "")),
                )
            )
        ]
        if not franjas_coincidentes and len(franjas) == 1:
            franjas_coincidentes = franjas
        if len(franjas_coincidentes) == 1:
            conteo = conteos[franjas_coincidentes[0]["id_franja"]]
            clave = "votos_blancos" if es_blanco else "votos_nulos"
            if conteo[clave] is None:
                conteo[clave] = valor_numero

    for pagina in paginas:
        for campo in pagina.get("formFields", []):
            nombre = _texto_de_layout(campo.get("fieldName", {}), texto_completo)
            valor = _texto_de_layout(campo.get("fieldValue", {}), texto_completo)
            if nombre or valor:
                campos_detectados.append({
                    "nombre": nombre,
                    "valor": valor,
                    "confianza": campo.get("fieldValue", {}).get("confidence"),
                })
                asignar_valor(nombre, valor)

        for tabla in pagina.get("tables", []):
            encabezados = []
            for fila in tabla.get("headerRows", []):
                encabezados.append([
                    _texto_de_layout(celda.get("layout", {}), texto_completo)
                    for celda in fila.get("cells", [])
                ])
            encabezado = encabezados[-1] if encabezados else []
            columnas_votos = [
                indice for indice, celda in enumerate(encabezado)
                if any(palabra in _normalizar_texto_ocr(celda) for palabra in ("voto", "total", "conteo"))
            ]
            for fila in tabla.get("bodyRows", []):
                celdas = [
                    _texto_de_layout(celda.get("layout", {}), texto_completo)
                    for celda in fila.get("cells", [])
                ]
                fila_texto = " ".join(celdas)
                if not fila_texto.strip():
                    continue
                for franja in franjas:
                    salida = conteos[franja["id_franja"]]
                    for candidato in franja.get("candidatos", []):
                        nombre = _normalizar_texto_ocr(candidato.get("nombre", ""))
                        if not nombre or len(nombre) < 3:
                            continue
                        celda_candidato = next(
                            (i for i, celda in enumerate(celdas) if nombre in _normalizar_texto_ocr(celda)),
                            None,
                        )
                        if celda_candidato is None:
                            continue
                        candidatos_valor = [
                            columnas_votos[0]
                        ] if columnas_votos else [
                            i for i, celda in enumerate(celdas)
                            if i != celda_candidato and _valor_entero(celda) is not None
                        ]
                        if len(candidatos_valor) == 1:
                            indice_valor = candidatos_valor[0]
                            if indice_valor < len(celdas):
                                numero = _valor_entero(celdas[indice_valor])
                                if numero is not None:
                                    salida["votos_por_candidato"][candidato["id_candidato"]] = numero

                etiqueta = celdas[0] if celdas else ""
                if any(palabra in _normalizar_texto_ocr(etiqueta) for palabra in ("blanco", "nulo")):
                    valor_celda = next(
                        (celdas[i] for i in columnas_votos if i < len(celdas)),
                        "",
                    )
                    if not valor_celda:
                        numeros = [celda for celda in celdas[1:] if _valor_entero(celda) is not None]
                        valor_celda = numeros[0] if len(numeros) == 1 else ""
                    asignar_valor(etiqueta, valor_celda)

    # Respaldo: algunas plantillas entregan el texto detectado sin tabla ni campos KVP.
    for linea in texto_completo.splitlines():
        for franja in franjas:
            for candidato in franja.get("candidatos", []):
                nombre = _normalizar_texto_ocr(candidato.get("nombre", ""))
                if len(nombre) >= 3 and nombre in _normalizar_texto_ocr(linea):
                    numero = _valor_entero(linea)
                    if numero is not None:
                        conteos[franja["id_franja"]]["votos_por_candidato"].setdefault(
                            candidato["id_candidato"], numero
                        )
            asignar_valor(linea, linea)

    return list(conteos.values()), campos_detectados


# ------------- Auth Utils -------------
def hashear_contrasena(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verificar_contrasena(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def crear_token(id_usuario: str, email: str, rol: str) -> str:
    payload = {
        "sub": id_usuario,
        "email": email,
        "rol": rol,
        "jti": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def usuario_actual(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Token no proporcionado")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")
    if payload.get("jti"):
        revocado = await db.sesiones_revocadas.find_one({"jti": payload["jti"]}, {"_id": 0})
        if revocado:
            raise HTTPException(401, "Sesión revocada")
    u = await db.usuarios.find_one({"id": payload["sub"]})
    if not u:
        raise HTTPException(401, "Usuario no encontrado")
    u.pop("_id", None)
    u.pop("hash_contrasena", None)
    return u

async def requerir_admin(usuario: dict = Depends(usuario_actual)) -> dict:
    if usuario.get("rol") != "admin":
        raise HTTPException(403, "Requiere privilegios de administrador")
    return usuario


async def requerir_resultados(usuario: dict = Depends(usuario_actual)) -> dict:
    if usuario.get("rol") not in {"admin", "resultados"}:
        raise HTTPException(403, "Requiere rol de resultados o administrador")
    return usuario

# ------------- Modelos -------------
class Usuario(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    nombre_completo: str
    rol: Literal["admin", "operador", "auditor", "resultados"] = "operador"
    creado_en: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LoginReq(BaseModel):
    email: EmailStr
    contrasena: str

class RegistrarReq(BaseModel):
    email: EmailStr
    contrasena: str
    nombre_completo: str
    rol: Literal["admin", "operador", "auditor", "resultados"] = "operador"

class Candidato(BaseModel):
    id_candidato: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nombre: str
    partido: Optional[str] = None
    sigla: Optional[str] = None
    color_hex: Optional[str] = None
    foto_url: Optional[str] = None
    numero_lista: Optional[int] = None

class Franja(BaseModel):
    """Franja dentro de una boleta. Cada franja tiene su propio recuento independiente."""
    id_franja: str = Field(default_factory=lambda: str(uuid.uuid4()))
    titulo: str  # "Presidente", "Vicepresidente", "Gobernador", "Decano", "Director de Carrera", etc.
    tipo_voto: Literal["nominal", "lista", "plancha_recta", "estamentario"] = "nominal"
    calcular_porcentaje_sobre: Literal["solo_validos", "validos_mas_blancos", "emitidos_totales"] = "solo_validos"
    candidatos: List[Candidato] = []
    candidatos_renunciantes: List[dict] = []
    permite_blancos: bool = True
    permite_nulos: bool = True
    orden: int = 0
    color_franja: Optional[str] = None
    descripcion: Optional[str] = None

class Papeleta(BaseModel):
    """Boleta imprimible: contiene 1..N franjas. Una boleta va a UNA ánfora."""
    id_papeleta: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nombre: str  # Ej: "Boleta Nacional", "Boleta Gobernación", "Boleta Rectorado"
    color_hex: Optional[str] = None
    orden: int = 0
    franjas: List[Franja] = []

class ProcesoElectoral(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    id_eleccion: str  # Único legible
    nombre: str
    pais: str = "Bolivia"
    tipo: Literal["nacional", "municipal", "departamental", "universitaria", "sindical", "otro"] = "nacional"
    fecha_eleccion: str  # ISO date
    activo: bool = True
    papeletas: List[Papeleta] = []
    creado_en: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ConteoFranja(BaseModel):
    """Recuento independiente por franja (válidos por candidato, blancos, nulos)."""
    id_franja: str
    votos_por_candidato: dict = {}  # {id_candidato: int}
    votos_blancos: int = 0
    votos_nulos: int = 0

class EntradaBitacora(BaseModel):
    id_admin: str
    email_admin: str
    accion: str  # "desbloqueo", "modificacion", "bloqueo"
    motivo_textual: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Acta(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    id_eleccion: str
    pais: str = "Bolivia"
    departamento: str
    ciudad: str
    recinto: str
    ambiente: str
    numero_anfora: str
    id_anfora: Optional[str] = None
    id_mesa: Optional[str] = None
    id_recinto: Optional[str] = None
    tipo_mesa: Optional[Literal["docente", "estudiante"]] = None
    id_operador: Optional[str] = None
    id_creador: Optional[str] = None
    id_enviado_por: Optional[str] = None
    id_validador: Optional[str] = None
    estado: Literal["borrador", "enviado", "observado", "bloqueado"] = "borrador"
    observacion_validacion: Optional[str] = None
    url_imagen: Optional[str] = None
    ruta_storage: Optional[str] = None
    conteos: List[ConteoFranja] = []
    esta_bloqueada: bool = False
    ocr_resultado: Optional[dict] = None
    bitacora: List[EntradaBitacora] = []
    creado_en: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    actualizado_en: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GuardarActaReq(BaseModel):
    id_acta: Optional[str] = None
    id_eleccion: str
    departamento: str
    ciudad: str
    recinto: str
    ambiente: str
    numero_anfora: str
    id_anfora: Optional[str] = None
    url_imagen: Optional[str] = None
    ruta_storage: Optional[str] = None
    conteos: List[ConteoFranja] = []

class DesbloquearReq(BaseModel):
    id_acta: str
    motivo_textual: str

class BloquearReq(BaseModel):
    id_acta: str


class EnviarActaReq(BaseModel):
    id_acta: str


class ObservarActaReq(BaseModel):
    id_acta: str
    observacion: str

# ------------- Fase 1: Árbol Jerárquico Dinámico + Recintos + Mesas Schema-less -------------

class NodoJerarquico(BaseModel):
    """
    Nodo abstracto del árbol jurisdiccional. Agnóstico: el usuario define el nombre
    del nivel (Departamento, Circunscripción, Facultad, Carrera, etc.) y la profundidad.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    id_eleccion: str
    id_padre: Optional[str] = None          # None = nodo raíz
    nombre_nivel: str                        # etiqueta del NIVEL (ej. "Departamento", "Facultad")
    nombre_nodo: str                         # nombre concreto del nodo (ej. "Cochabamba", "Derecho")
    codigo: Optional[str] = None
    profundidad: int = 0                     # 0 = raíz
    path_ancestros: List[dict] = []          # [{"id": "...", "nombre_nivel": "...", "nombre_nodo": "..."}]
    path_texto: str = ""                     # "Cochabamba/C-20/Asiento Centro"  (materialized path)
    es_hoja_configurada: bool = False        # marcado cuando el usuario declara este nivel como el último → aloja Recintos
    metadatos: dict = Field(default_factory=dict)
    creado_en: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RecintoElectoral(BaseModel):
    """
    Contenedor físico obligatorio bajo el último nodo jerárquico (nodo hoja).
    Guarda un materialized path completo del linaje para agregaciones NoSQL nativas.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    id_eleccion: str
    id_nodo_padre: str                       # apunta al nodo hoja (es_hoja_configurada=True)
    nombre: str
    codigo: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    path_ancestros: List[dict] = []          # linaje completo copiado del nodo padre
    path_texto: str = ""                     # ej: "Cochabamba/C-20/Asiento Centro"
    metadatos: dict = Field(default_factory=dict)
    creado_en: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DefinicionCampoMesa(BaseModel):
    """
    Definición reutilizable de un campo dinámico que la Mesa puede almacenar.
    El usuario declara por elección qué claves adicionales llenará cada mesa.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    id_eleccion: str
    clave: str                               # ej. "facultad", "carrera", "año"
    etiqueta: str                            # visible en UI: "Facultad"
    tipo_dato: Literal["texto", "numero", "seleccion", "booleano", "fecha"] = "texto"
    opciones: List[str] = []                 # solo para tipo_dato="seleccion"
    requerido: bool = False
    orden: int = 0


class MesaSufragio(BaseModel):
    """
    Entidad Schema-less: campos fijos mínimos (id, numero_mesa) + mapa dinámico
    'metadatos' con pares clave-valor definidos por DefinicionCampoMesa.
    Ejemplos:
      - Nacional: metadatos = {}
      - Universitario: metadatos = {"facultad": "Derecho", "carrera": "Ciencias Jurídicas", "año": "3ro"}
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    id_eleccion: str
    id_recinto: str
    numero_mesa: str                         # único dentro del recinto
    codigo: Optional[str] = None
    path_ancestros: List[dict] = []          # copia del linaje del recinto (para agregaciones)
    path_texto: str = ""
    metadatos: dict = Field(default_factory=dict)   # atributos flexibles clave-valor
    creado_en: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CrearUsuarioOperativoReq(BaseModel):
    email: EmailStr
    contrasena: str = Field(min_length=10)
    nombre_completo: str = Field(min_length=3, max_length=120)


class AsignacionOperativaReq(BaseModel):
    id_usuario: str
    funcion: Literal["carga", "validacion"]
    id_nodos: List[str] = Field(default_factory=list)
    id_recintos: List[str] = Field(default_factory=list)
    id_anforas: List[str] = Field(default_factory=list)

# ------------- Endpoints Auth -------------
@api.post("/auth/login")
async def login(req: LoginReq, request: Request):
    email = req.email.lower()
    ahora = datetime.now(timezone.utc)
    ventana = ahora - timedelta(minutes=15)
    intentos = await db.intentos_login.count_documents(
        {"email": email, "creado_en": {"$gte": ventana}},
    )
    if intentos >= 5:
        raise HTTPException(429, "Demasiados intentos. Intente nuevamente en 15 minutos")
    u = await db.usuarios.find_one({"email": email})
    if not u or not verificar_contrasena(req.contrasena, u["hash_contrasena"]):
        await db.intentos_login.insert_one(
            {
                "email": email,
                "ip": request.client.host if request.client else "desconocida",
                "creado_en": ahora,
            },
        )
        raise HTTPException(401, "Credenciales inválidas")
    await db.intentos_login.delete_many({"email": email})
    token = crear_token(u["id"], u["email"], u["rol"])
    return {
        "token": token,
        "usuario": {"id": u["id"], "email": u["email"], "nombre_completo": u["nombre_completo"], "rol": u["rol"]}
    }

@api.post("/auth/registrar")
async def registrar(req: RegistrarReq, admin: dict = Depends(requerir_admin)):
    if await db.usuarios.find_one({"email": req.email.lower()}):
        raise HTTPException(409, "Email ya registrado")
    u = Usuario(email=req.email.lower(), nombre_completo=req.nombre_completo, rol=req.rol)
    doc = u.model_dump()
    doc["hash_contrasena"] = hashear_contrasena(req.contrasena)
    doc["creado_en"] = doc["creado_en"].isoformat()
    await db.usuarios.insert_one(doc)
    return {"ok": True, "id": u.id}

@api.get("/auth/me")
async def me(usuario: dict = Depends(usuario_actual)):
    return usuario

@api.post("/auth/logout")
async def logout(
    authorization: Optional[str] = Header(None),
    usuario: dict = Depends(usuario_actual),
):
    token = (authorization or "")[7:]
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    if payload.get("jti"):
        await db.sesiones_revocadas.update_one(
            {"jti": payload["jti"]},
            {
                "$setOnInsert": {
                    "jti": payload["jti"],
                    "expira_en": datetime.fromtimestamp(payload["exp"], timezone.utc),
                },
            },
            upsert=True,
        )
    return {"ok": True}

# ------------- Procesos Electorales -------------
@api.get("/procesos")
async def listar_procesos(usuario: dict = Depends(usuario_actual)):
    consulta = {}
    if usuario.get("rol") != "admin":
        asignaciones = await db.asignaciones_operativas.find(
            {"id_usuario": usuario["id"]},
            {"_id": 0, "id_eleccion": 1},
        ).to_list(500)
        consulta["id_eleccion"] = {"$in": list({item["id_eleccion"] for item in asignaciones})}
    procs = await db.procesos_electorales.find(consulta, {"_id": 0}).to_list(200)
    return procs

@api.get("/procesos/{id_proceso}")
async def obtener_proceso(id_proceso: str, usuario: dict = Depends(usuario_actual)):
    p = await db.procesos_electorales.find_one({"id_eleccion": id_proceso}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Proceso electoral no encontrado")
    if usuario.get("rol") != "admin":
        asignacion = await db.asignaciones_operativas.find_one(
            {"id_usuario": usuario["id"], "id_eleccion": id_proceso},
            {"_id": 0, "id": 1},
        )
        if not asignacion:
            raise HTTPException(404, "Proceso electoral no disponible")
    return p

# ------------- Actas -------------
async def _asignaciones_operativas_usuario(
    id_usuario: str,
    id_eleccion: str,
    funcion: Optional[str] = None,
) -> List[dict]:
    consulta = {"id_usuario": id_usuario, "id_eleccion": id_eleccion}
    if funcion:
        consulta["funcion"] = funcion
    return await db.asignaciones_operativas.find(consulta, {"_id": 0}).to_list(500)


def _filtro_anforas_asignadas(asignaciones: List[dict]) -> dict:
    nodos = set()
    recintos = set()
    anforas = set()
    for asignacion in asignaciones:
        nodos.update(asignacion.get("id_nodos", []))
        recintos.update(asignacion.get("id_recintos", []))
        anforas.update(asignacion.get("id_anforas", []))
    condiciones = []
    if nodos:
        condiciones.append({"path_ancestros.id": {"$in": list(nodos)}})
    if recintos:
        condiciones.append({"id_recinto": {"$in": list(recintos)}})
    if anforas:
        condiciones.append({"id": {"$in": list(anforas)}})
    return {"$or": condiciones} if condiciones else {"id": {"$in": []}}


async def _autorizar_anfora_operativa(
    usuario: dict,
    id_eleccion: str,
    id_anfora: str,
    accion: str,
    acta: Optional[dict] = None,
) -> dict:
    anfora = await db.anforas_mesa.find_one(
        {"id": id_anfora, "id_eleccion": id_eleccion},
        {"_id": 0},
    )
    if not anfora:
        raise HTTPException(404, "Ánfora no encontrada")
    if usuario.get("rol") == "admin":
        return anfora
    funcion = "carga" if accion == "enviar" else "validacion"
    if accion == "guardar":
        asignaciones = await _asignaciones_operativas_usuario(usuario["id"], id_eleccion)
    else:
        asignaciones = await _asignaciones_operativas_usuario(usuario["id"], id_eleccion, funcion)
    filtro = _filtro_anforas_asignadas(asignaciones)
    autorizada = await db.anforas_mesa.find_one(
        {"id": id_anfora, "id_eleccion": id_eleccion, **filtro},
        {"_id": 0},
    )
    if not autorizada:
        raise HTTPException(404, "Ánfora no disponible para su asignación")
    if accion in {"validar", "bloquear"} and acta:
        autores = {acta.get("id_creador"), acta.get("id_operador"), acta.get("id_enviado_por")}
        if usuario["id"] in autores:
            raise HTTPException(403, "No puede validar ni bloquear un acta que cargó o envió")
    return anfora


async def _permisos_operativos(usuario: dict, id_eleccion: str) -> dict:
    if usuario.get("rol") == "admin":
        return {"puede_cargar": True, "puede_validar": True, "es_admin": True}
    carga = await _asignaciones_operativas_usuario(usuario["id"], id_eleccion, "carga")
    validacion = await _asignaciones_operativas_usuario(usuario["id"], id_eleccion, "validacion")
    return {
        "puede_cargar": bool(_filtro_anforas_asignadas(carga).get("$or")),
        "puede_validar": bool(_filtro_anforas_asignadas(validacion).get("$or")),
        "es_admin": False,
    }


async def _obtener_contexto_anfora(id_eleccion: str, id_anfora: Optional[str]) -> dict:
    if not id_anfora:
        return {}
    anfora = await db.anforas_mesa.find_one(
        {"id": id_anfora, "id_eleccion": id_eleccion},
        {"_id": 0},
    )
    if not anfora:
        raise HTTPException(404, "Ánfora no encontrada para la elección activa")
    mesa = await db.mesas_sufragio.find_one(
        {"id": anfora["id_mesa"], "id_eleccion": id_eleccion},
        {"_id": 0},
    )
    recinto = await db.recintos_electorales.find_one(
        {"id": anfora["id_recinto"], "id_eleccion": id_eleccion},
        {"_id": 0},
    )
    if not mesa or not recinto:
        raise HTTPException(409, "La estructura asociada al ánfora está incompleta")
    return {
        "id_anfora": anfora["id"],
        "id_mesa": mesa["id"],
        "id_recinto": recinto["id"],
        "numero_anfora": anfora["numero_anfora"],
        "tipo_mesa": anfora.get("tipo_mesa"),
        "recinto": recinto["nombre"],
        "ambiente": f"Mesa {mesa['numero_mesa']}",
        "departamento": (mesa.get("path_ancestros") or [{}])[0].get("nombre_nodo", ""),
        "ciudad": recinto.get("path_texto", ""),
    }


@api.post("/guardar-acta")
async def guardar_acta(req: GuardarActaReq, usuario: dict = Depends(usuario_actual)):
    ahora = datetime.now(timezone.utc).isoformat()
    if not req.id_anfora:
        raise HTTPException(400, "Debe seleccionar un ánfora")
    contexto_anfora = await _obtener_contexto_anfora(req.id_eleccion, req.id_anfora)
    if req.id_acta:
        existente = await db.actas.find_one(
            {"id": req.id_acta, "id_eleccion": req.id_eleccion},
        )
        if not existente:
            raise HTTPException(404, "Acta no encontrada")
        await _autorizar_anfora_operativa(
            usuario,
            req.id_eleccion,
            req.id_anfora,
            "guardar",
            existente,
        )
        if existente.get("esta_bloqueada"):
            raise HTTPException(423, "Acta bloqueada — se requiere desbloqueo administrativo")
        permisos = await _permisos_operativos(usuario, req.id_eleccion)
        estado = existente.get("estado", "borrador")
        es_validador = permisos["puede_validar"] or permisos["es_admin"]
        es_creador = usuario["id"] in {existente.get("id_creador"), existente.get("id_operador")}
        if not es_validador and (not permisos["puede_cargar"] or not es_creador):
            raise HTTPException(403, "Solo el operador creador puede editar este borrador")
        if not es_validador and estado not in {"borrador", "observado"}:
            raise HTTPException(403, "El operador no puede editar un acta enviada a validación")
        update = {
            "conteos": [c.model_dump() for c in req.conteos],
            "departamento": contexto_anfora.get("departamento", req.departamento),
            "ciudad": contexto_anfora.get("ciudad", req.ciudad),
            "recinto": contexto_anfora.get("recinto", req.recinto),
            "ambiente": contexto_anfora.get("ambiente", req.ambiente),
            "numero_anfora": contexto_anfora.get("numero_anfora", req.numero_anfora),
            "actualizado_en": ahora,
        }
        if estado == "observado" and not es_validador:
            update["estado"] = "borrador"
            update["observacion_validacion"] = None
        update.update({
            key: value
            for key, value in contexto_anfora.items()
            if key in {"id_anfora", "id_mesa", "id_recinto", "tipo_mesa"}
        })
        if req.url_imagen: update["url_imagen"] = req.url_imagen
        if req.ruta_storage: update["ruta_storage"] = req.ruta_storage
        await db.actas.update_one({"id": req.id_acta}, {"$set": update})
        return await db.actas.find_one({"id": req.id_acta}, {"_id": 0})
    # nueva
    await _autorizar_anfora_operativa(
        usuario,
        req.id_eleccion,
        req.id_anfora,
        "guardar",
    )
    existente_anfora = await db.actas.find_one(
        {"id_eleccion": req.id_eleccion, "id_anfora": req.id_anfora},
        {"_id": 0, "id": 1, "esta_bloqueada": 1},
    )
    if existente_anfora:
        estado_anfora = "bloqueada" if existente_anfora.get("esta_bloqueada") else "en borrador"
        raise HTTPException(409, f"Ya existe un acta {estado_anfora} para esta ánfora")
    a = Acta(
        id_eleccion=req.id_eleccion,
        departamento=contexto_anfora.get("departamento", req.departamento),
        ciudad=contexto_anfora.get("ciudad", req.ciudad),
        recinto=contexto_anfora.get("recinto", req.recinto),
        ambiente=contexto_anfora.get("ambiente", req.ambiente),
        numero_anfora=contexto_anfora.get("numero_anfora", req.numero_anfora),
        id_anfora=contexto_anfora.get("id_anfora"),
        id_mesa=contexto_anfora.get("id_mesa"),
        id_recinto=contexto_anfora.get("id_recinto"),
        tipo_mesa=contexto_anfora.get("tipo_mesa"),
        url_imagen=req.url_imagen, ruta_storage=req.ruta_storage,
        conteos=req.conteos,
        id_operador=usuario["id"],
        id_creador=usuario["id"],
        estado="borrador",
    )
    doc = a.model_dump()
    doc["creado_en"] = doc["creado_en"].isoformat()
    doc["actualizado_en"] = doc["actualizado_en"].isoformat()
    await db.actas.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/actas")
async def listar_actas(
    id_eleccion: Optional[str] = None,
    id_anfora: Optional[str] = None,
    usuario: dict = Depends(usuario_actual),
):
    q = {}
    if usuario.get("rol") != "admin":
        asignaciones = await db.asignaciones_operativas.find(
            {"id_usuario": usuario["id"]},
            {"_id": 0},
        ).to_list(500)
        if id_eleccion:
            asignaciones = [
                asignacion
                for asignacion in asignaciones
                if asignacion["id_eleccion"] == id_eleccion
            ]
        elecciones = list({asignacion["id_eleccion"] for asignacion in asignaciones})
        anforas_permitidas = []
        for eleccion in elecciones:
            asignaciones_eleccion = [
                asignacion
                for asignacion in asignaciones
                if asignacion["id_eleccion"] == eleccion
            ]
            filtro = _filtro_anforas_asignadas(asignaciones_eleccion)
            anforas = await db.anforas_mesa.find(
                {"id_eleccion": eleccion, **filtro},
                {"_id": 0, "id": 1},
            ).to_list(20000)
            anforas_permitidas.extend(anfora["id"] for anfora in anforas)
        q["id_eleccion"] = {"$in": elecciones}
        q["id_anfora"] = {"$in": anforas_permitidas}
    elif id_eleccion:
        q["id_eleccion"] = id_eleccion
    if id_anfora:
        if usuario.get("rol") != "admin":
            if id_anfora not in anforas_permitidas:
                raise HTTPException(404, "Ánfora no disponible para su asignación")
        q["id_anfora"] = id_anfora
    actas = await db.actas.find(q, {"_id": 0}).sort("actualizado_en", -1).to_list(20000)
    return actas

@api.get("/actas/{id_acta}")
async def obtener_acta(id_acta: str, usuario: dict = Depends(usuario_actual)):
    a = await db.actas.find_one({"id": id_acta}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Acta no encontrada")
    if usuario.get("rol") != "admin":
        await _autorizar_anfora_operativa(
            usuario,
            a["id_eleccion"],
            a.get("id_anfora", ""),
            "guardar",
            a,
        )
    return a

@api.post("/centro-computo/bloquear")
async def bloquear_acta(req: BloquearReq, usuario: dict = Depends(usuario_actual)):
    a = await db.actas.find_one({"id": req.id_acta})
    if not a:
        raise HTTPException(404, "Acta no encontrada")
    if a.get("esta_bloqueada"):
        raise HTTPException(423, "El acta ya se encuentra bloqueada")
    await _autorizar_anfora_operativa(
        usuario,
        a["id_eleccion"],
        a.get("id_anfora", ""),
        "bloquear",
        a,
    )
    entrada = EntradaBitacora(
        id_admin=usuario["id"], email_admin=usuario["email"],
        accion="consolidar_bloquear", motivo_textual="Consolidación por validador autorizado"
    ).model_dump()
    entrada["timestamp"] = entrada["timestamp"].isoformat()
    await db.actas.update_one(
        {"id": req.id_acta},
        {"$set": {"esta_bloqueada": True, "estado": "bloqueado", "id_validador": usuario["id"], "actualizado_en": datetime.now(timezone.utc).isoformat()},
         "$push": {"bitacora": entrada}}
    )
    await gestor_resultados_en_vivo.publicar(
        a["id_eleccion"],
        {"evento": "acta_consolidada"},
    )
    return {"ok": True, "id_acta": req.id_acta, "esta_bloqueada": True}


@api.post("/centro-computo/enviar")
async def enviar_acta_validacion(req: EnviarActaReq, usuario: dict = Depends(usuario_actual)):
    acta = await db.actas.find_one({"id": req.id_acta}, {"_id": 0})
    if not acta:
        raise HTTPException(404, "Acta no encontrada")
    if acta.get("esta_bloqueada"):
        raise HTTPException(423, "El acta ya se encuentra bloqueada")
    await _autorizar_anfora_operativa(
        usuario,
        acta["id_eleccion"],
        acta.get("id_anfora", ""),
        "enviar",
        acta,
    )
    if usuario.get("rol") != "admin" and usuario["id"] not in {
        acta.get("id_creador"),
        acta.get("id_operador"),
    }:
        raise HTTPException(403, "Solo el operador creador puede enviar el acta")
    if acta.get("estado", "borrador") not in {"borrador", "observado"}:
        raise HTTPException(409, "El acta no se encuentra disponible para envío")
    await db.actas.update_one(
        {"id": req.id_acta},
        {
            "$set": {
                "estado": "enviado",
                "id_enviado_por": usuario["id"],
                "observacion_validacion": None,
                "actualizado_en": datetime.now(timezone.utc).isoformat(),
            },
        },
    )
    return {"ok": True, "estado": "enviado"}


@api.post("/centro-computo/observar")
async def observar_acta(req: ObservarActaReq, usuario: dict = Depends(usuario_actual)):
    if len(req.observacion.strip()) < 10:
        raise HTTPException(400, "La observación debe tener al menos 10 caracteres")
    acta = await db.actas.find_one({"id": req.id_acta}, {"_id": 0})
    if not acta:
        raise HTTPException(404, "Acta no encontrada")
    if acta.get("esta_bloqueada"):
        raise HTTPException(423, "El acta ya se encuentra bloqueada")
    await _autorizar_anfora_operativa(
        usuario,
        acta["id_eleccion"],
        acta.get("id_anfora", ""),
        "validar",
        acta,
    )
    await db.actas.update_one(
        {"id": req.id_acta},
        {
            "$set": {
                "estado": "observado",
                "id_validador": usuario["id"],
                "observacion_validacion": req.observacion.strip(),
                "actualizado_en": datetime.now(timezone.utc).isoformat(),
            },
        },
    )
    return {"ok": True, "estado": "observado"}


@api.get("/operacion/procesos/{id_eleccion}/permisos")
async def permisos_operacion(id_eleccion: str, usuario: dict = Depends(usuario_actual)):
    return await _permisos_operativos(usuario, id_eleccion)


@api.get("/admin/usuarios-operativos")
async def listar_usuarios_operativos(admin: dict = Depends(requerir_admin)):
    return await db.usuarios.find(
        {"rol": {"$ne": "admin"}},
        {"_id": 0, "id": 1, "email": 1, "nombre_completo": 1, "rol": 1},
    ).sort("nombre_completo", 1).to_list(2000)


@api.post("/admin/usuarios-operativos")
async def crear_usuario_operativo(
    req: CrearUsuarioOperativoReq,
    admin: dict = Depends(requerir_admin),
):
    email = req.email.lower()
    if await db.usuarios.find_one({"email": email}, {"_id": 0, "id": 1}):
        raise HTTPException(409, "Email ya registrado")
    cuenta = Usuario(email=email, nombre_completo=req.nombre_completo, rol="operador")
    documento = cuenta.model_dump()
    documento["hash_contrasena"] = hashear_contrasena(req.contrasena)
    documento["creado_en"] = documento["creado_en"].isoformat()
    await db.usuarios.insert_one(documento)
    return {"id": cuenta.id, "email": cuenta.email, "nombre_completo": cuenta.nombre_completo}


@api.get("/admin/procesos/{id_eleccion}/asignaciones-operativas")
async def listar_asignaciones_operativas(
    id_eleccion: str,
    admin: dict = Depends(requerir_admin),
):
    return await db.asignaciones_operativas.find(
        {"id_eleccion": id_eleccion},
        {"_id": 0},
    ).sort("creado_en", -1).to_list(5000)


@api.post("/admin/procesos/{id_eleccion}/asignaciones-operativas")
async def guardar_asignacion_operativa(
    id_eleccion: str,
    req: AsignacionOperativaReq,
    admin: dict = Depends(requerir_admin),
):
    if not (req.id_nodos or req.id_recintos or req.id_anforas):
        raise HTTPException(400, "Seleccione al menos un nodo, recinto o ánfora")
    usuario = await db.usuarios.find_one({"id": req.id_usuario}, {"_id": 0, "id": 1})
    if not usuario:
        raise HTTPException(404, "Usuario no encontrado")
    validaciones = [
        ("nodos_jerarquicos", req.id_nodos),
        ("recintos_electorales", req.id_recintos),
        ("anforas_mesa", req.id_anforas),
    ]
    for coleccion, ids in validaciones:
        if ids:
            cantidad = await db[coleccion].count_documents({"id_eleccion": id_eleccion, "id": {"$in": ids}})
            if cantidad != len(set(ids)):
                raise HTTPException(400, "El ámbito contiene elementos ajenos a la elección")
    ahora = datetime.now(timezone.utc).isoformat()
    documento = {
        "id": str(uuid.uuid4()),
        "id_eleccion": id_eleccion,
        "id_usuario": req.id_usuario,
        "funcion": req.funcion,
        "id_nodos": list(dict.fromkeys(req.id_nodos)),
        "id_recintos": list(dict.fromkeys(req.id_recintos)),
        "id_anforas": list(dict.fromkeys(req.id_anforas)),
        "asignado_por": admin["id"],
        "creado_en": ahora,
    }
    await db.asignaciones_operativas.insert_one(documento)
    documento.pop("_id", None)
    return documento


@api.delete("/admin/asignaciones-operativas/{id_asignacion}")
async def eliminar_asignacion_operativa(
    id_asignacion: str,
    admin: dict = Depends(requerir_admin),
):
    resultado = await db.asignaciones_operativas.delete_one({"id": id_asignacion})
    if not resultado.deleted_count:
        raise HTTPException(404, "Asignación no encontrada")
    return {"ok": True}


FACULTADES_USFX_DEMO = [
    "Facultad de Derecho, Ciencias Políticas y Sociales",
    "Facultad de Ciencia y Tecnología",
    "Facultad de Medicina",
    "Facultad de Odontología",
    "Facultad de Ciencias Químico Farmacéuticas y Bioquímicas",
    "Facultad de Contaduría Pública y Ciencias Financieras",
    "Facultad de Ciencias Económicas y Empresariales",
    "Facultad de Ciencias Agrarias",
    "Facultad de Humanidades y Ciencias de la Educación",
    "Facultad Técnica",
    "Facultad de Ciencias de Enfermería y Obstetricia",
    "Facultad de Ciencias y Tecnologías de la Salud",
    "Facultad de Ingeniería Mecánica - Eléctrica - Electrónica",
    "Facultad de Arquitectura y Ciencias del Hábitat",
    "Facultad de Ingeniería Civil",
    "Facultad Integral Defensores del Chaco",
]


async def _preparar_boletas_rector_vicerrector(id_eleccion: str) -> tuple[str, str]:
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "papeletas": 1},
    )
    if not proceso:
        raise HTTPException(404, "Proceso electoral no encontrado")
    papeletas = proceso.get("papeletas", [])
    rector = next((papeleta for papeleta in papeletas if "rector" in papeleta.get("nombre", "").lower() and "vice" not in papeleta.get("nombre", "").lower()), None)
    vicerrector = next((papeleta for papeleta in papeletas if "vicerrector" in papeleta.get("nombre", "").lower()), None)
    if rector and vicerrector:
        return rector["id_papeleta"], vicerrector["id_papeleta"]
    compartida = next(
        (
            papeleta
            for papeleta in papeletas
            if any("rector" in franja.get("titulo", "").lower() for franja in papeleta.get("franjas", []))
        ),
        None,
    )
    if not compartida:
        raise HTTPException(409, "La elección no tiene franjas de Rector y Vicerrector")
    franja_rector = next(
        (
            franja
            for franja in compartida.get("franjas", [])
            if "vicerrector" not in franja.get("titulo", "").lower()
            and "rector" in franja.get("titulo", "").lower()
        ),
        None,
    )
    franja_vicerrector = next(
        (
            franja
            for franja in compartida.get("franjas", [])
            if "vicerrector" in franja.get("titulo", "").lower()
        ),
        None,
    )
    if not franja_rector or not franja_vicerrector:
        raise HTTPException(409, "No se pudieron separar Rector y Vicerrector")
    compartida["nombre"] = "Boleta Rector"
    compartida["franjas"] = [franja_rector]
    boleta_vice = {
        **compartida,
        "id_papeleta": str(uuid.uuid4()),
        "nombre": "Boleta Vicerrector",
        "orden": compartida.get("orden", 1) + 1,
        "franjas": [franja_vicerrector],
    }
    papeletas.append(boleta_vice)
    await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion},
        {"$set": {"papeletas": papeletas}},
    )
    return compartida["id_papeleta"], boleta_vice["id_papeleta"]


@api.post("/admin/procesos/{id_eleccion}/carga-demo-usfx")
async def carga_demo_usfx(
    id_eleccion: str,
    admin: dict = Depends(requerir_admin),
):
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion, "tipo": "universitaria"},
        {"_id": 0, "id_eleccion": 1},
    )
    if not proceso:
        raise HTTPException(400, "La carga USFX requiere una elección universitaria existente")
    existente = await db.nodos_jerarquicos.count_documents(
        {"id_eleccion": id_eleccion, "codigo": "USFX-DEMO-SUCRE"},
    )
    if existente:
        total_mesas = await db.mesas_sufragio.count_documents(
            {"id_eleccion": id_eleccion, "metadatos.demo_usfx": True},
        )
        total_anforas = await db.anforas_mesa.count_documents(
            {"id_eleccion": id_eleccion, "metadatos.demo_usfx": True},
        )
        return {
            "ok": True,
            "reutilizada": True,
            "mesas": total_mesas,
            "anforas": total_anforas,
        }

    id_rector, id_vicerrector = await _preparar_boletas_rector_vicerrector(id_eleccion)
    ahora = datetime.now(timezone.utc).isoformat()
    sedes = []
    for codigo, nombre in [
        ("USFX-DEMO-SUCRE", "Sede Sucre"),
        ("USFX-DEMO-MONTEAGUDO", "Sede Monteagudo"),
        ("USFX-DEMO-MUYUPAMPA", "Sede Muyupampa"),
    ]:
        id_sede = str(uuid.uuid4())
        sedes.append({
            "id": id_sede,
            "id_eleccion": id_eleccion,
            "id_padre": None,
            "nombre_nivel": "Sede",
            "nombre_nodo": nombre,
            "codigo": codigo,
            "metadatos": {"demo_usfx": True},
            "profundidad": 0,
            "path_ancestros": [],
            "path_texto": "",
            "es_hoja_configurada": True,
            "creado_en": ahora,
        })
    await db.nodos_jerarquicos.insert_many(sedes)
    sede_sucre = sedes[0]
    sede_monteagudo = sedes[1]
    sede_muyupampa = sedes[2]
    path_sucre = [{
        "id": sede_sucre["id"],
        "nombre_nivel": sede_sucre["nombre_nivel"],
        "nombre_nodo": sede_sucre["nombre_nodo"],
    }]
    path_monteagudo = [{
        "id": sede_monteagudo["id"],
        "nombre_nivel": sede_monteagudo["nombre_nivel"],
        "nombre_nodo": sede_monteagudo["nombre_nodo"],
    }]
    path_muyupampa = [{
        "id": sede_muyupampa["id"],
        "nombre_nivel": sede_muyupampa["nombre_nivel"],
        "nombre_nodo": sede_muyupampa["nombre_nodo"],
    }]
    recintos = []
    for indice, facultad in enumerate(FACULTADES_USFX_DEMO, start=1):
        recintos.append({
            "id": str(uuid.uuid4()),
            "id_eleccion": id_eleccion,
            "id_nodo_padre": sede_sucre["id"],
            "nombre": facultad,
            "codigo": f"USFX-FAC-{indice:02d}",
            "direccion": "Sucre, Chuquisaca",
            "metadatos": {"demo_usfx": True, "tipo_electorado": "estudiante"},
            "path_ancestros": path_sucre,
            "path_texto": "Sede Sucre",
            "creado_en": ahora,
        })
    derecho_historico = {
        "id": str(uuid.uuid4()),
        "id_eleccion": id_eleccion,
        "id_nodo_padre": sede_sucre["id"],
        "nombre": "Derecho Histórico",
        "codigo": "USFX-DOC-DER-HIST",
        "direccion": "Sede Sucre, Campus Histórico",
        "metadatos": {"demo_usfx": True, "tipo_electorado": "docente"},
        "path_ancestros": path_sucre,
        "path_texto": "Sede Sucre",
        "creado_en": ahora,
    }
    recintos.extend([
        derecho_historico,
        {
            "id": str(uuid.uuid4()),
            "id_eleccion": id_eleccion,
            "id_nodo_padre": sede_monteagudo["id"],
            "nombre": "Recinto de Prueba Monteagudo",
            "codigo": "USFX-DEMO-MON-01",
            "direccion": "Monteagudo, Chuquisaca",
            "metadatos": {"demo_usfx": True, "tipo_electorado": "estudiante"},
            "path_ancestros": path_monteagudo,
            "path_texto": "Sede Monteagudo",
            "creado_en": ahora,
        },
        {
            "id": str(uuid.uuid4()),
            "id_eleccion": id_eleccion,
            "id_nodo_padre": sede_muyupampa["id"],
            "nombre": "Recinto de Prueba Muyupampa",
            "codigo": "USFX-DEMO-MUY-01",
            "direccion": "Muyupampa, Chuquisaca",
            "metadatos": {"demo_usfx": True, "tipo_electorado": "estudiante"},
            "path_ancestros": path_muyupampa,
            "path_texto": "Sede Muyupampa",
            "creado_en": ahora,
        },
    ])
    await db.recintos_electorales.insert_many(recintos)
    mesas = []
    anforas = []

    def agregar_mesas(recinto: dict, cantidad: int, tipo_mesa: str) -> None:
        for numero in range(1, cantidad + 1):
            id_mesa = str(uuid.uuid4())
            codigo = f"{recinto['codigo']}-M{numero:03d}"
            mesa = {
                "id": id_mesa,
                "id_eleccion": id_eleccion,
                "id_recinto": recinto["id"],
                "numero_mesa": f"M-{numero:03d}",
                "codigo": codigo,
                "metadatos": {
                    "demo_usfx": True,
                    "facultad": recinto["nombre"],
                    "tipo_electorado": tipo_mesa,
                },
                "path_ancestros": recinto["path_ancestros"],
                "path_texto": recinto["path_texto"],
                "creado_en": ahora,
            }
            mesas.append(mesa)
            for numero_anfora, nombre, id_papeleta, color in [
                (1, "Rector", id_rector, "#1E3A8A"),
                (2, "Vicerrector", id_vicerrector, "#7C3AED"),
            ]:
                anforas.append({
                    "id": str(uuid.uuid4()),
                    "id_eleccion": id_eleccion,
                    "id_mesa": id_mesa,
                    "id_recinto": recinto["id"],
                    "numero_anfora": numero_anfora,
                    "nombre": nombre,
                    "id_papeletas": [id_papeleta],
                    "color_hex": color,
                    "tipo_mesa": tipo_mesa,
                    "path_ancestros": recinto["path_ancestros"],
                    "metadatos": {"demo_usfx": True},
                    "creado_en": ahora,
                })

    for indice, recinto in enumerate(recintos[:16]):
        agregar_mesas(recinto, 35 if indice < 4 else 31, "estudiante")
    agregar_mesas(derecho_historico, 5, "docente")
    agregar_mesas(recintos[-2], 1, "estudiante")
    agregar_mesas(recintos[-1], 1, "estudiante")
    await db.mesas_sufragio.insert_many(mesas)
    for inicio in range(0, len(anforas), 500):
        await db.anforas_mesa.insert_many(anforas[inicio:inicio + 500])
    return {
        "ok": True,
        "reutilizada": False,
        "facultades_sucre": len(FACULTADES_USFX_DEMO),
        "recintos": len(recintos),
        "mesas": len(mesas),
        "anforas": len(anforas),
        "anforas_derecho_historico": 10,
        "anforas_generales": len(anforas) - 10,
    }


def _repartir_votos_aleatorios(total: int, cantidad: int, generador: random.Random) -> List[int]:
    if cantidad <= 0:
        raise ValueError("No se pueden repartir votos sin candidaturas")
    if cantidad == 1:
        return [total]
    pesos = [generador.uniform(0.4, 1.6) for _ in range(cantidad)]
    suma = sum(pesos)
    votos = [int(total * peso / suma) for peso in pesos]
    for indice in range(total - sum(votos)):
        votos[indice % cantidad] += 1
    return votos


@api.post("/admin/procesos/{id_eleccion}/carga-demo-resultados-usfx")
async def carga_demo_resultados_usfx(
    id_eleccion: str,
    admin: dict = Depends(requerir_admin),
):
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion, "tipo": "universitaria"},
        {"_id": 0, "papeletas": 1},
    )
    if not proceso:
        raise HTTPException(400, "La carga de resultados requiere una elección universitaria")
    anforas = await db.anforas_mesa.find(
        {"id_eleccion": id_eleccion, "metadatos.demo_usfx": True},
        {"_id": 0},
    ).sort("id", 1).to_list(20000)
    if not anforas:
        raise HTTPException(409, "Primero debe crear la carga demo USFX")
    ids_anfora = [anfora["id"] for anfora in anforas]
    existentes = await db.actas.count_documents(
        {"id_eleccion": id_eleccion, "id_anfora": {"$in": ids_anfora}},
    )
    if existentes:
        return {
            "ok": True,
            "reutilizada": True,
            "actas_existentes": existentes,
        }
    papeletas = {papeleta["id_papeleta"]: papeleta for papeleta in proceso.get("papeletas", [])}
    mesas = await db.mesas_sufragio.find(
        {"id_eleccion": id_eleccion, "id": {"$in": list({anfora["id_mesa"] for anfora in anforas})}},
        {"_id": 0, "id": 1, "numero_mesa": 1, "path_ancestros": 1},
    ).to_list(20000)
    recintos = await db.recintos_electorales.find(
        {"id_eleccion": id_eleccion, "id": {"$in": list({anfora["id_recinto"] for anfora in anforas})}},
        {"_id": 0, "id": 1, "nombre": 1, "path_texto": 1},
    ).to_list(5000)
    mesas_por_id = {mesa["id"]: mesa for mesa in mesas}
    recintos_por_id = {recinto["id"]: recinto for recinto in recintos}
    generador = random.Random(20260206)
    ahora = datetime.now(timezone.utc).isoformat()
    actas = []
    total_bloqueadas = 0
    total_borradores = 0
    for indice, anfora in enumerate(anforas):
        papeleta = papeletas.get((anfora.get("id_papeletas") or [""])[0])
        if not papeleta:
            raise HTTPException(409, "Ánfora demo sin papeleta válida")
        es_docente = anfora.get("tipo_mesa") == "docente"
        participacion = generador.randint(8, 45) if es_docente else generador.randint(80, 350)
        blancos = generador.randint(0, max(1, participacion // 25))
        nulos = generador.randint(0, max(1, participacion // 50))
        validos = max(1, participacion - blancos - nulos)
        conteos = []
        for franja in papeleta.get("franjas", []):
            candidatos = franja.get("candidatos", [])
            if not candidatos:
                raise HTTPException(
                    409,
                    f"La franja '{franja['titulo']}' no tiene candidaturas para generar resultados",
                )
            distribucion = _repartir_votos_aleatorios(validos, len(candidatos), generador)
            conteos.append({
                "id_franja": franja["id_franja"],
                "votos_por_candidato": {
                    candidato["id_candidato"]: distribucion[posicion]
                    for posicion, candidato in enumerate(candidatos)
                },
                "votos_blancos": blancos,
                "votos_nulos": nulos,
            })
        bloqueada = indice < int(len(anforas) * 0.82)
        mesa = mesas_por_id[anfora["id_mesa"]]
        recinto = recintos_por_id[anfora["id_recinto"]]
        estado = "bloqueado" if bloqueada else "borrador"
        actas.append({
            "id": str(uuid.uuid4()),
            "id_eleccion": id_eleccion,
            "departamento": (mesa.get("path_ancestros") or [{}])[0].get("nombre_nodo", ""),
            "ciudad": recinto.get("path_texto", ""),
            "recinto": recinto["nombre"],
            "ambiente": f"Mesa {mesa['numero_mesa']}",
            "numero_anfora": anfora["numero_anfora"],
            "id_anfora": anfora["id"],
            "id_mesa": mesa["id"],
            "id_recinto": recinto["id"],
            "tipo_mesa": anfora.get("tipo_mesa"),
            "url_imagen": None,
            "ruta_storage": None,
            "conteos": conteos,
            "id_operador": admin["id"],
            "id_creador": admin["id"],
            "id_validador": admin["id"] if bloqueada else None,
            "estado": estado,
            "esta_bloqueada": bloqueada,
            "bitacora": [],
            "metadatos": {"demo_usfx_resultados": True},
            "creado_en": ahora,
            "actualizado_en": ahora,
        })
        if bloqueada:
            total_bloqueadas += 1
        else:
            total_borradores += 1
    for inicio in range(0, len(actas), 500):
        await db.actas.insert_many(actas[inicio:inicio + 500])
    return {
        "ok": True,
        "reutilizada": False,
        "actas": len(actas),
        "bloqueadas": total_bloqueadas,
        "borradores": total_borradores,
    }


@api.post("/admin/procesos/{id_eleccion}/reparar-demo-vicerrector-usfx")
async def reparar_demo_vicerrector_usfx(
    id_eleccion: str,
    admin: dict = Depends(requerir_admin),
):
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion, "tipo": "universitaria"},
        {"_id": 0, "papeletas": 1},
    )
    if not proceso:
        raise HTTPException(404, "Elección universitaria no encontrada")
    papeletas = proceso.get("papeletas", [])
    papeleta_vice = next(
        (papeleta for papeleta in papeletas if "vicerrector" in papeleta.get("nombre", "").lower()),
        None,
    )
    if not papeleta_vice or not papeleta_vice.get("franjas"):
        raise HTTPException(409, "No existe una boleta de Vicerrector para reparar")
    franja = papeleta_vice["franjas"][0]
    anforas = await db.anforas_mesa.find(
        {
            "id_eleccion": id_eleccion,
            "metadatos.demo_usfx": True,
            "id_papeletas": papeleta_vice["id_papeleta"],
        },
        {"_id": 0, "id": 1, "tipo_mesa": 1},
    ).sort("id", 1).to_list(10000)
    if not anforas:
        raise HTTPException(409, "No hay ánforas demo de Vicerrector para reparar")
    actas = await db.actas.find(
        {
            "id_eleccion": id_eleccion,
            "id_anfora": {"$in": [anfora["id"] for anfora in anforas]},
            "metadatos.demo_usfx_resultados": True,
        },
        {"_id": 0, "id": 1, "id_anfora": 1, "reparado_demo_usfx": 1},
    ).sort("id", 1).to_list(10000)
    if len(actas) != len(anforas):
        raise HTTPException(409, "Las actas demo de Vicerrector están incompletas")
    if all(acta.get("reparado_demo_usfx") for acta in actas):
        return {"ok": True, "reutilizada": True, "actas_vicerrector_reparadas": len(actas)}
    if not franja.get("candidatos"):
        franja["candidatos"] = [
            Candidato(
                nombre="Lic. Elena Torrico",
                partido="Frente Académico",
                sigla="FA",
                color_hex="#1E3A8A",
                numero_lista=1,
            ).model_dump(),
            Candidato(
                nombre="Ing. Marco Salazar",
                partido="Renovación Universitaria",
                sigla="RU",
                color_hex="#DC2626",
                numero_lista=2,
            ).model_dump(),
        ]
        await db.procesos_electorales.update_one(
            {"id_eleccion": id_eleccion},
            {"$set": {"papeletas": papeletas}},
        )
    tipo_por_anfora = {anfora["id"]: anfora.get("tipo_mesa") for anfora in anforas}
    generador = random.Random(20260207)
    actualizaciones = 0
    for acta in actas:
        es_docente = tipo_por_anfora.get(acta["id_anfora"]) == "docente"
        participacion = generador.randint(8, 45) if es_docente else generador.randint(80, 350)
        blancos = generador.randint(0, max(1, participacion // 25))
        nulos = generador.randint(0, max(1, participacion // 50))
        validos = max(1, participacion - blancos - nulos)
        distribucion = _repartir_votos_aleatorios(
            validos,
            len(franja["candidatos"]),
            generador,
        )
        conteo = {
            "id_franja": franja["id_franja"],
            "votos_por_candidato": {
                candidato["id_candidato"]: distribucion[indice]
                for indice, candidato in enumerate(franja["candidatos"])
            },
            "votos_blancos": blancos,
            "votos_nulos": nulos,
        }
        await db.actas.update_one(
            {"id": acta["id"]},
            {
                "$set": {
                    "conteos": [conteo],
                    "actualizado_en": datetime.now(timezone.utc).isoformat(),
                    "reparado_demo_usfx": True,
                },
            },
        )
        actualizaciones += 1
    await gestor_resultados_en_vivo.publicar(id_eleccion, {"evento": "demo_reparada"})
    return {"ok": True, "actas_vicerrector_reparadas": actualizaciones}

@api.post("/admin/desbloquear")
async def desbloquear_acta(req: DesbloquearReq, admin: dict = Depends(requerir_admin)):
    if not req.motivo_textual or len(req.motivo_textual.strip()) < 10:
        raise HTTPException(400, "El motivo textual debe tener al menos 10 caracteres")
    a = await db.actas.find_one({"id": req.id_acta})
    if not a:
        raise HTTPException(404, "Acta no encontrada")
    entrada = EntradaBitacora(
        id_admin=admin["id"], email_admin=admin["email"],
        accion="desbloqueo_admin", motivo_textual=req.motivo_textual.strip()
    ).model_dump()
    entrada["timestamp"] = entrada["timestamp"].isoformat()
    await db.actas.update_one(
        {"id": req.id_acta},
        {"$set": {"esta_bloqueada": False, "actualizado_en": datetime.now(timezone.utc).isoformat()},
         "$push": {"bitacora": entrada}}
    )
    return {"ok": True, "id_acta": req.id_acta, "esta_bloqueada": False}

@api.get("/bitacora")
async def bitacora_global(admin: dict = Depends(requerir_admin)):
    actas = await db.actas.find({"bitacora.0": {"$exists": True}}, {"_id": 0}).to_list(1000)
    salida = []
    for a in actas:
        for entrada in a.get("bitacora", []):
            salida.append({
                "id_acta": a["id"], "numero_anfora": a["numero_anfora"],
                "id_eleccion": a["id_eleccion"], **entrada
            })
    salida.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return salida

# ------------- OCR con Document AI -------------
@api.post("/procesar-ocr")
async def procesar_ocr(
    id_eleccion: str = Form(...),
    id_anfora: str = Form(...),
    id_papeleta: Optional[str] = Form(None),
    archivo: UploadFile = File(...),
    usuario: dict = Depends(usuario_actual),
):
    proc = await db.procesos_electorales.find_one({"id_eleccion": id_eleccion})
    if not proc:
        raise HTTPException(404, "Proceso electoral no existe")
    await _autorizar_anfora_operativa(usuario, id_eleccion, id_anfora, "guardar")

    contenido = await archivo.read()
    if len(contenido) == 0:
        raise HTTPException(400, "Archivo vacío")

    # Guardar la fotografía del acta en Google Cloud Storage.
    ext = (archivo.filename or "acta.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        ext = "jpg"
    ruta = f"{APP_NAME}/actas/{usuario['id']}/{uuid.uuid4()}.{ext}"
    tipo_mime = f"image/{'jpeg' if ext=='jpg' else ext}"
    try:
        result = subir_objeto(ruta, contenido, tipo_mime)
        ruta_final = result["path"]
    except Exception as e:
        logger.error(f"Fallo subir imagen: {e}")
        raise HTTPException(500, f"No se pudo almacenar la imagen: {e}")

    url_publica = f"/api/imagenes/{ruta_final}"

    # El OCR procesa la copia persistida en el bucket con Document AI.
    ocr_data = {}
    try:
        # Estructura esperada: candidatos por franja, blancos y nulos.
        franjas = []
        for p in proc.get("papeletas", []):
            if id_papeleta and p["id_papeleta"] != id_papeleta:
                continue
            for f in p.get("franjas", []):
                franjas.append({**f, "nombre_papeleta": p.get("nombre", "")})

        contenido_guardado, mime_guardado = obtener_objeto(ruta_final)
        documento = await asyncio.to_thread(
            _procesar_document_ai,
            contenido_guardado,
            mime_guardado,
        )
        conteos_detectados, campos_detectados = _extraer_conteos_document_ai(documento, franjas)
        cantidad_asignada = sum(
            len(conteo["votos_por_candidato"])
            + int(conteo["votos_blancos"] is not None)
            + int(conteo["votos_nulos"] is not None)
            for conteo in conteos_detectados
        )
        ocr_data = {
            "conteos": conteos_detectados,
            "conteos_detectados": cantidad_asignada,
            "campos_detectados": campos_detectados[:100],
            "texto_detectado": documento.get("text", "")[:12000],
        }
        if cantidad_asignada == 0:
            ocr_data["aviso"] = (
                "Document AI reconoció el acta, pero no pudo relacionar automáticamente "
                "los campos con los candidatos. Revise el texto detectado y complete los votos."
            )
    except Exception as e:
        logger.error("Error OCR Document AI: %s", type(e).__name__)
        ocr_data = {"error": str(e), "conteos": []}

    return {
        "url_imagen": url_publica,
        "ruta_storage": ruta_final,
        "ocr": ocr_data,
    }

@api.get("/imagenes/{path:path}")
async def servir_imagen(path: str, authorization: Optional[str] = Header(None)):
    if not path.startswith(f"{APP_NAME}/") or ".." in path.split("/"):
        raise HTTPException(404, "Imagen no encontrada")
    try:
        if path.startswith(f"{APP_NAME}/actas/"):
            acta = await db.actas.find_one({"ruta_storage": path}, {"_id": 0})
            if not acta:
                raise HTTPException(404, "Imagen no encontrada")
            if not acta.get("esta_bloqueada"):
                usuario = await usuario_actual(authorization)
                await _autorizar_anfora_operativa(
                    usuario,
                    acta["id_eleccion"],
                    acta.get("id_anfora", ""),
                    "guardar",
                    acta,
                )
        data, mime = obtener_objeto(path)
        from fastapi import Response
        return Response(content=data, media_type=mime)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Imagen no disponible: %s", e)
        raise HTTPException(404, "Imagen no encontrada")

# ------------- Resumen -------------
@api.get("/resumen/{id_eleccion}")
async def resumen_eleccion(id_eleccion: str, usuario: dict = Depends(requerir_resultados)):
    proc = await db.procesos_electorales.find_one({"id_eleccion": id_eleccion}, {"_id": 0})
    if not proc:
        raise HTTPException(404, "Proceso no encontrado")
    actas = await db.actas.find(
        {"id_eleccion": id_eleccion, "esta_bloqueada": True},
        {"_id": 0},
    ).sort("actualizado_en", -1).to_list(5000)
    actas = _actas_unicas_por_anfora(actas)

    resultado_por_franja = {}
    for p in proc.get("papeletas", []):
        for f in p.get("franjas", []):
            resultado_por_franja[f["id_franja"]] = {
                "titulo": f["titulo"],
                "nombre_papeleta": p.get("nombre", ""),
                "tipo_voto": f.get("tipo_voto"),
                "candidatos": {c["id_candidato"]: {"nombre": c["nombre"], "partido": c.get("partido"), "sigla": c.get("sigla"), "color_hex": c.get("color_hex"), "votos": 0} for c in f.get("candidatos", [])},
                "votos_blancos": 0, "votos_nulos": 0, "total_validos": 0,
            }

    total_actas = len(actas)
    actas_bloqueadas = 0
    for a in actas:
        if a.get("esta_bloqueada"): actas_bloqueadas += 1
        for c in a.get("conteos", []):
            idf = c.get("id_franja")
            if idf not in resultado_por_franja: continue
            for id_cand, v in (c.get("votos_por_candidato") or {}).items():
                if id_cand in resultado_por_franja[idf]["candidatos"] and isinstance(v, (int, float)):
                    resultado_por_franja[idf]["candidatos"][id_cand]["votos"] += int(v)
                    resultado_por_franja[idf]["total_validos"] += int(v)
            resultado_por_franja[idf]["votos_blancos"] += int(c.get("votos_blancos") or 0)
            resultado_por_franja[idf]["votos_nulos"] += int(c.get("votos_nulos") or 0)

    return {
        "proceso": proc,
        "total_actas": total_actas,
        "actas_consolidadas": actas_bloqueadas,
        "porcentaje_avance": round((actas_bloqueadas / total_actas * 100) if total_actas else 0, 2),
        "resultados": resultado_por_franja,
    }


@api.get("/procesos/{id_eleccion}/estado-resultados")
async def estado_resultados(
    id_eleccion: str,
    usuario: dict = Depends(requerir_resultados),
):
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "id_eleccion": 1, "nombre": 1, "tipo": 1},
    )
    if not proceso:
        raise HTTPException(404, "Proceso electoral no encontrado")
    total_anforas = await db.anforas_mesa.count_documents({"id_eleccion": id_eleccion})
    actas = await db.actas.find(
        {
            "id_eleccion": id_eleccion,
            "id_anfora": {"$exists": True, "$ne": None},
            "esta_bloqueada": True,
        },
        {"_id": 0},
    ).sort("actualizado_en", -1).to_list(20000)
    actas = _actas_unicas_por_anfora(actas)
    anforas_escrutadas = {acta["id_anfora"] for acta in actas if acta.get("id_anfora")}
    total_escrutadas = len(anforas_escrutadas)
    total_faltantes = max(0, total_anforas - total_escrutadas)
    porcentaje = lambda cantidad: round((cantidad / total_anforas * 100) if total_anforas else 0, 2)
    recientes = []
    for acta in actas[:10]:
        recientes.append({
            "id_acta": acta["id"],
            "id_anfora": acta.get("id_anfora"),
            "numero_anfora": acta.get("numero_anfora"),
            "recinto": acta.get("recinto"),
            "ambiente": acta.get("ambiente"),
            "tipo_mesa": acta.get("tipo_mesa"),
            "actualizado_en": acta.get("actualizado_en"),
        })
    return {
        "proceso": proceso,
        "actas_recientes": recientes,
        "anforas": {
            "total": total_anforas,
            "escrutadas": total_escrutadas,
            "faltantes": total_faltantes,
            "porcentaje_total": porcentaje(total_anforas),
            "porcentaje_escrutadas": porcentaje(total_escrutadas),
            "porcentaje_faltantes": porcentaje(total_faltantes),
        },
    }


def _base_y_umbral(resultado: dict, base_calculo: str) -> tuple[int, int]:
    validos = resultado["total_validos"]
    if base_calculo == "validos_mas_blancos":
        base = validos + resultado["votos_blancos"]
    elif base_calculo == "emitidos_totales":
        base = validos + resultado["votos_blancos"] + resultado["votos_nulos"]
    else:
        base = validos
    return base, (base // 2) + 1


def _actas_unicas_por_anfora(actas: List[dict]) -> List[dict]:
    por_anfora = {}
    sin_anfora = []
    for acta in actas:
        id_anfora = acta.get("id_anfora")
        if not id_anfora:
            sin_anfora.append(acta)
            continue
        actual = por_anfora.get(id_anfora)
        if not actual:
            por_anfora[id_anfora] = acta
            continue
        puntaje = lambda documento: (
            bool(documento.get("conteos")),
            bool(documento.get("esta_bloqueada")),
            documento.get("actualizado_en", ""),
        )
        if puntaje(acta) > puntaje(actual):
            por_anfora[id_anfora] = acta
    return [*por_anfora.values(), *sin_anfora]


async def _consolidado_publico(id_eleccion: str) -> dict:
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion, "activo": True},
        {"_id": 0},
    )
    if not proceso:
        raise HTTPException(404, "Elección pública no encontrada")
    actas = await db.actas.find(
        {
            "id_eleccion": id_eleccion,
            "id_anfora": {"$exists": True, "$ne": None},
            "esta_bloqueada": True,
        },
        {"_id": 0, "id_anfora": 1, "conteos": 1},
    ).sort("actualizado_en", -1).to_list(20000)
    actas = _actas_unicas_por_anfora(actas)
    resultados = {}
    for papeleta in proceso.get("papeletas", []):
        for franja in papeleta.get("franjas", []):
            resultados[franja["id_franja"]] = {
                "titulo": franja["titulo"],
                "nombre_papeleta": papeleta.get("nombre", ""),
                "tipo_voto": franja.get("tipo_voto"),
                "base_calculo": franja.get("calcular_porcentaje_sobre", "solo_validos"),
                "candidatos": {
                    candidato["id_candidato"]: {
                        "nombre": candidato["nombre"],
                        "partido": candidato.get("partido"),
                        "sigla": candidato.get("sigla"),
                        "color_hex": candidato.get("color_hex"),
                        "votos": 0,
                    }
                    for candidato in franja.get("candidatos", [])
                },
                "votos_blancos": 0,
                "votos_nulos": 0,
                "total_validos": 0,
            }
    for acta in actas:
        for conteo in acta.get("conteos", []):
            resultado = resultados.get(conteo.get("id_franja"))
            if not resultado:
                continue
            for id_candidato, votos in (conteo.get("votos_por_candidato") or {}).items():
                if id_candidato in resultado["candidatos"]:
                    votos_enteros = int(votos or 0)
                    resultado["candidatos"][id_candidato]["votos"] += votos_enteros
                    resultado["total_validos"] += votos_enteros
            resultado["votos_blancos"] += int(conteo.get("votos_blancos") or 0)
            resultado["votos_nulos"] += int(conteo.get("votos_nulos") or 0)
    for resultado in resultados.values():
        base, umbral = _base_y_umbral(resultado, resultado["base_calculo"])
        resultado["base_votos"] = base
        resultado["umbral_primera_vuelta"] = umbral
        resultado["ganadores_provisionales"] = [
            id_candidato
            for id_candidato, candidato in resultado["candidatos"].items()
            if candidato["votos"] >= umbral
        ]
    return {
        "proceso": {
            "id_eleccion": proceso["id_eleccion"],
            "nombre": proceso["nombre"],
            "tipo": proceso["tipo"],
        },
        "resultados": resultados,
    }


@api.get("/publico/procesos")
async def listar_procesos_publicos():
    return await db.procesos_electorales.find(
        {"activo": True},
        {"_id": 0, "id_eleccion": 1, "nombre": 1, "tipo": 1, "fecha_eleccion": 1},
    ).sort("fecha_eleccion", -1).to_list(500)


@api.get("/publico/procesos/{id_eleccion}/localizador")
async def localizador_publico_actas(id_eleccion: str):
    await _consolidado_publico(id_eleccion)
    actas = await db.actas.find(
        {
            "id_eleccion": id_eleccion,
            "id_anfora": {"$exists": True, "$ne": None},
            "esta_bloqueada": True,
        },
        {"_id": 0, "id_anfora": 1},
    ).sort("actualizado_en", -1).to_list(20000)
    actas = _actas_unicas_por_anfora(actas)
    ids_anfora = list({acta["id_anfora"] for acta in actas})
    anforas = await db.anforas_mesa.find(
        {"id_eleccion": id_eleccion, "id": {"$in": ids_anfora}},
        {
            "_id": 0,
            "id": 1,
            "id_mesa": 1,
            "id_recinto": 1,
            "numero_anfora": 1,
            "nombre": 1,
            "tipo_mesa": 1,
            "path_ancestros": 1,
        },
    ).sort("numero_anfora", 1).to_list(20000)
    ids_mesa = list({anfora["id_mesa"] for anfora in anforas})
    ids_recinto = list({anfora["id_recinto"] for anfora in anforas})
    mesas = await db.mesas_sufragio.find(
        {"id_eleccion": id_eleccion, "id": {"$in": ids_mesa}},
        {"_id": 0, "id": 1, "id_recinto": 1, "numero_mesa": 1, "path_ancestros": 1},
    ).to_list(20000)
    recintos = await db.recintos_electorales.find(
        {"id_eleccion": id_eleccion, "id": {"$in": ids_recinto}},
        {"_id": 0, "id": 1, "id_nodo_padre": 1, "nombre": 1, "path_ancestros": 1},
    ).to_list(5000)
    nodos = await db.nodos_jerarquicos.find(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "id": 1, "id_padre": 1, "nombre_nivel": 1, "nombre_nodo": 1},
    ).to_list(5000)
    return {"nodos": nodos, "recintos": recintos, "mesas": mesas, "anforas": anforas}


@api.get("/publico/procesos/{id_eleccion}/actas/{id_anfora}")
async def acta_publica(id_eleccion: str, id_anfora: str):
    acta = await db.actas.find_one(
        {
            "id_eleccion": id_eleccion,
            "id_anfora": id_anfora,
            "esta_bloqueada": True,
        },
        {"_id": 0},
    )
    if not acta:
        raise HTTPException(404, "Acta consolidada no encontrada")
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion, "activo": True},
        {"_id": 0, "papeletas": 1},
    )
    if not proceso:
        raise HTTPException(404, "Elección pública no encontrada")
    franjas = {}
    for papeleta in proceso.get("papeletas", []):
        for franja in papeleta.get("franjas", []):
            franjas[franja["id_franja"]] = (papeleta, franja)
    conteos = []
    for conteo in acta.get("conteos", []):
        referencia = franjas.get(conteo.get("id_franja"))
        if not referencia:
            continue
        papeleta, franja = referencia
        votos = conteo.get("votos_por_candidato") or {}
        conteos.append({
            "papeleta": papeleta.get("nombre", ""),
            "franja": franja["titulo"],
            "candidatos": [
                {"nombre": candidato["nombre"], "votos": int(votos.get(candidato["id_candidato"], 0))}
                for candidato in franja.get("candidatos", [])
            ],
            "votos_blancos": int(conteo.get("votos_blancos") or 0),
            "votos_nulos": int(conteo.get("votos_nulos") or 0),
        })
    return {
        "numero_anfora": acta.get("numero_anfora"),
        "recinto": acta.get("recinto"),
        "ambiente": acta.get("ambiente"),
        "tipo_mesa": acta.get("tipo_mesa"),
        "actualizado_en": acta.get("actualizado_en"),
        "imagen_url": acta.get("url_imagen"),
        "conteos": conteos,
    }


@api.get("/publico/procesos/{id_eleccion}/resultados")
async def resultados_publicos(id_eleccion: str):
    consolidado = await _consolidado_publico(id_eleccion)
    total_anforas = await db.anforas_mesa.count_documents({"id_eleccion": id_eleccion})
    actas = await db.actas.find(
        {
            "id_eleccion": id_eleccion,
            "id_anfora": {"$exists": True, "$ne": None},
            "esta_bloqueada": True,
        },
        {"_id": 0, "id_anfora": 1, "numero_anfora": 1, "actualizado_en": 1},
    ).sort("actualizado_en", -1).to_list(20000)
    escrutadas = len({acta["id_anfora"] for acta in actas})
    faltantes = max(0, total_anforas - escrutadas)
    porcentaje = lambda valor: round((valor / total_anforas * 100) if total_anforas else 0, 2)
    consolidado["anforas"] = {
        "total": total_anforas,
        "escrutadas": escrutadas,
        "faltantes": faltantes,
        "porcentaje_escrutadas": porcentaje(escrutadas),
        "porcentaje_faltantes": porcentaje(faltantes),
    }
    if consolidado["proceso"]["tipo"] == "universitaria":
        consolidado["universitario"] = await _calcular_resultado_universitario(id_eleccion)
    return consolidado

# ------------- Admin: Gestión de Elecciones (CRUD dinámico) -------------
TIPO_A_PREFIJO = {
    "nacional": "PRES",
    "departamental": "DEP",
    "municipal": "MUN",
    "universitaria": "UNIV",
    "sindical": "SIND",
    "otro": "OTRO",
}

async def generar_id_eleccion(tipo: str, fecha: str, segunda_vuelta: bool) -> str:
    prefijo = TIPO_A_PREFIJO.get(tipo, "OTRO")
    anio = (fecha or "")[:4] or str(datetime.now(timezone.utc).year)
    contador = 2 if segunda_vuelta else 1
    while True:
        candidato = f"{prefijo}-{anio}-BO-{contador:02d}"
        if not await db.procesos_electorales.find_one({"id_eleccion": candidato}):
            return candidato
        contador += 1

class CrearProcesoReq(BaseModel):
    id_eleccion: Optional[str] = None  # auto-generado si no se envía
    nombre: str
    pais: str = "Bolivia"
    tipo: Literal["nacional", "municipal", "departamental", "universitaria", "sindical", "otro"] = "nacional"
    fecha_eleccion: str
    activo: bool = True
    es_segunda_vuelta: bool = False

class ActualizarProcesoReq(BaseModel):
    nombre: Optional[str] = None
    pais: Optional[str] = None
    tipo: Optional[str] = None
    fecha_eleccion: Optional[str] = None
    activo: Optional[bool] = None

class CrearPapeletaReq(BaseModel):
    nombre: str
    color_hex: Optional[str] = None
    orden: int = 0

class ActualizarPapeletaReq(BaseModel):
    nombre: Optional[str] = None
    color_hex: Optional[str] = None
    orden: Optional[int] = None

class CrearFranjaReq(BaseModel):
    titulo: str
    tipo_voto: Literal["nominal", "lista", "plancha_recta", "estamentario"] = "nominal"
    calcular_porcentaje_sobre: Literal["solo_validos", "validos_mas_blancos", "emitidos_totales"] = "solo_validos"
    permite_blancos: bool = True
    permite_nulos: bool = True
    orden: int = 0
    color_franja: Optional[str] = None
    descripcion: Optional[str] = None

class CrearCandidatoReq(BaseModel):
    nombre: str
    partido: Optional[str] = None
    sigla: Optional[str] = None
    color_hex: Optional[str] = None
    foto_url: Optional[str] = None
    logo_partido_url: Optional[str] = None
    numero_lista: Optional[int] = None

@api.post("/admin/procesos")
async def admin_crear_proceso(req: CrearProcesoReq, admin: dict = Depends(requerir_admin)):
    id_final = req.id_eleccion or await generar_id_eleccion(req.tipo, req.fecha_eleccion, req.es_segunda_vuelta)
    if await db.procesos_electorales.find_one({"id_eleccion": id_final}):
        raise HTTPException(409, "id_eleccion ya existe")
    datos = req.model_dump(exclude={"es_segunda_vuelta", "id_eleccion"})
    datos["pais"] = "Bolivia"
    p = ProcesoElectoral(id_eleccion=id_final, **datos, papeletas=[])
    doc = p.model_dump()
    doc["es_segunda_vuelta"] = req.es_segunda_vuelta
    doc["creado_en"] = doc["creado_en"].isoformat()
    await db.procesos_electorales.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/procesos/{id_eleccion}")
async def admin_actualizar_proceso(id_eleccion: str, req: ActualizarProcesoReq, admin: dict = Depends(requerir_admin)):
    upd = {k: v for k, v in req.model_dump().items() if v is not None}
    if not upd: raise HTTPException(400, "Nada que actualizar")
    r = await db.procesos_electorales.update_one({"id_eleccion": id_eleccion}, {"$set": upd})
    if r.matched_count == 0: raise HTTPException(404, "Proceso no encontrado")
    return await db.procesos_electorales.find_one({"id_eleccion": id_eleccion}, {"_id": 0})

@api.delete("/admin/procesos/{id_eleccion}")
async def admin_eliminar_proceso(id_eleccion: str, admin: dict = Depends(requerir_admin)):
    if await db.actas.count_documents({"id_eleccion": id_eleccion}) > 0:
        raise HTTPException(409, "No se puede eliminar: tiene actas registradas")
    r = await db.procesos_electorales.delete_one({"id_eleccion": id_eleccion})
    if r.deleted_count == 0: raise HTTPException(404, "Proceso no encontrado")
    return {"ok": True}

@api.post("/admin/procesos/{id_eleccion}/papeletas")
async def admin_crear_papeleta(id_eleccion: str, req: CrearPapeletaReq, admin: dict = Depends(requerir_admin)):
    if not await db.procesos_electorales.find_one({"id_eleccion": id_eleccion}):
        raise HTTPException(404, "Proceso no encontrado")
    nueva = Papeleta(**req.model_dump(), franjas=[]).model_dump()
    await db.procesos_electorales.update_one({"id_eleccion": id_eleccion}, {"$push": {"papeletas": nueva}})
    return nueva

@api.put("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}")
async def admin_actualizar_papeleta(id_eleccion: str, id_papeleta: str, req: ActualizarPapeletaReq, admin: dict = Depends(requerir_admin)):
    upd = {f"papeletas.$.{k}": v for k, v in req.model_dump().items() if v is not None}
    if not upd: raise HTTPException(400, "Nada que actualizar")
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion, "papeletas.id_papeleta": id_papeleta},
        {"$set": upd}
    )
    if r.matched_count == 0: raise HTTPException(404, "Papeleta no encontrada")
    return {"ok": True}

@api.delete("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}")
async def admin_eliminar_papeleta(id_eleccion: str, id_papeleta: str, admin: dict = Depends(requerir_admin)):
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion},
        {"$pull": {"papeletas": {"id_papeleta": id_papeleta}}}
    )
    if r.modified_count == 0: raise HTTPException(404, "Papeleta no encontrada")
    return {"ok": True}

# --- Franjas dentro de una papeleta ---
@api.post("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}/franjas")
async def admin_crear_franja(id_eleccion: str, id_papeleta: str, req: CrearFranjaReq, admin: dict = Depends(requerir_admin)):
    franja = Franja(**req.model_dump(), candidatos=[]).model_dump()
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion, "papeletas.id_papeleta": id_papeleta},
        {"$push": {"papeletas.$.franjas": franja}}
    )
    if r.matched_count == 0: raise HTTPException(404, "Papeleta no encontrada")
    return franja

@api.put("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}/franjas/{id_franja}")
async def admin_actualizar_franja(id_eleccion: str, id_papeleta: str, id_franja: str, req: CrearFranjaReq, admin: dict = Depends(requerir_admin)):
    upd = {f"papeletas.$[p].franjas.$[f].{k}": v for k, v in req.model_dump().items()}
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion},
        {"$set": upd},
        array_filters=[{"p.id_papeleta": id_papeleta}, {"f.id_franja": id_franja}]
    )
    if r.matched_count == 0: raise HTTPException(404, "Franja no encontrada")
    return {"ok": True}

@api.delete("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}/franjas/{id_franja}")
async def admin_eliminar_franja(id_eleccion: str, id_papeleta: str, id_franja: str, admin: dict = Depends(requerir_admin)):
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion, "papeletas.id_papeleta": id_papeleta},
        {"$pull": {"papeletas.$.franjas": {"id_franja": id_franja}}}
    )
    if r.modified_count == 0: raise HTTPException(404, "Franja no encontrada")
    return {"ok": True}

# --- Candidatos por franja ---
@api.post("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}/franjas/{id_franja}/candidatos")
async def admin_agregar_candidato(id_eleccion: str, id_papeleta: str, id_franja: str, req: CrearCandidatoReq, admin: dict = Depends(requerir_admin)):
    cand = Candidato(**req.model_dump()).model_dump()
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion},
        {"$push": {"papeletas.$[p].franjas.$[f].candidatos": cand}},
        array_filters=[{"p.id_papeleta": id_papeleta}, {"f.id_franja": id_franja}]
    )
    if r.matched_count == 0: raise HTTPException(404, "Franja no encontrada")
    return cand

@api.put("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}/franjas/{id_franja}/candidatos/{id_candidato}")
async def admin_actualizar_candidato(id_eleccion: str, id_papeleta: str, id_franja: str, id_candidato: str, req: CrearCandidatoReq, admin: dict = Depends(requerir_admin)):
    upd = {f"papeletas.$[p].franjas.$[f].candidatos.$[c].{k}": v for k, v in req.model_dump().items() if v is not None}
    if not upd: raise HTTPException(400, "Nada que actualizar")
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion},
        {"$set": upd},
        array_filters=[{"p.id_papeleta": id_papeleta}, {"f.id_franja": id_franja}, {"c.id_candidato": id_candidato}]
    )
    if r.matched_count == 0: raise HTTPException(404, "Candidato no encontrado")
    return {"ok": True}

@api.delete("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}/franjas/{id_franja}/candidatos/{id_candidato}")
async def admin_eliminar_candidato(id_eleccion: str, id_papeleta: str, id_franja: str, id_candidato: str, admin: dict = Depends(requerir_admin)):
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion},
        {"$pull": {"papeletas.$[p].franjas.$[f].candidatos": {"id_candidato": id_candidato}}},
        array_filters=[{"p.id_papeleta": id_papeleta}, {"f.id_franja": id_franja}]
    )
    if r.matched_count == 0: raise HTTPException(404, "Candidato no encontrado")
    return {"ok": True}

# --- Sorteo por franja ---
@api.post("/admin/procesos/{id_eleccion}/papeletas/{id_papeleta}/franjas/{id_franja}/sorteo")
async def admin_sorteo_posiciones(id_eleccion: str, id_papeleta: str, id_franja: str, admin: dict = Depends(requerir_admin)):
    import random
    p = await db.procesos_electorales.find_one({"id_eleccion": id_eleccion})
    if not p: raise HTTPException(404, "Proceso no encontrado")
    papeleta = next((x for x in p["papeletas"] if x["id_papeleta"] == id_papeleta), None)
    if not papeleta: raise HTTPException(404, "Papeleta no encontrada")
    franja = next((x for x in papeleta.get("franjas", []) if x["id_franja"] == id_franja), None)
    if not franja: raise HTTPException(404, "Franja no encontrada")
    candidatos = list(franja.get("candidatos", []))
    if not candidatos: raise HTTPException(400, "Sin candidatos para sortear")
    random.shuffle(candidatos)
    for idx, c in enumerate(candidatos):
        c["numero_lista"] = idx + 1
    await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion},
        {"$set": {"papeletas.$[p].franjas.$[f].candidatos": candidatos}},
        array_filters=[{"p.id_papeleta": id_papeleta}, {"f.id_franja": id_franja}]
    )
    entrada = {
        "id_admin": admin["id"], "email_admin": admin["email"],
        "accion": "sorteo_franja", "id_papeleta": id_papeleta, "id_franja": id_franja,
        "resultado": [{"pos": c["numero_lista"], "nombre": c["nombre"]} for c in candidatos],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.sorteos.insert_one({**entrada, "id_eleccion": id_eleccion})
    return {"ok": True, "orden": [{"posicion": c["numero_lista"], "id_candidato": c["id_candidato"], "nombre": c["nombre"]} for c in candidatos]}

@api.get("/admin/sorteos")
async def admin_listar_sorteos(admin: dict = Depends(requerir_admin)):
    s = await db.sorteos.find({}, {"_id": 0}).sort("timestamp", -1).to_list(200)
    return s

@api.post("/admin/upload-imagen")
async def admin_upload_imagen(archivo: UploadFile = File(...), tipo: str = Form("candidato"), admin: dict = Depends(requerir_admin)):
    contenido = await archivo.read()
    if len(contenido) == 0: raise HTTPException(400, "Archivo vacío")
    ext = (archivo.filename or "img.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"): ext = "jpg"
    ruta = f"{APP_NAME}/{tipo}s/{uuid.uuid4()}.{ext}"
    tipo_mime = f"image/{'jpeg' if ext=='jpg' else ext}"
    result = subir_objeto(ruta, contenido, tipo_mime)
    return {"url": f"/api/imagenes/{result['path']}", "ruta_storage": result["path"]}

# ------------- Diseño independiente por boleta -------------
class DisenoPapeletaReq(BaseModel):
    """Cada boleta mantiene un lienzo y franjas independientes."""
    boletas: List[dict] = Field(default_factory=list)

@api.put("/admin/procesos/{id_eleccion}/diseno")
async def admin_guardar_diseno(id_eleccion: str, req: DisenoPapeletaReq, admin: dict = Depends(requerir_admin)):
    r = await db.procesos_electorales.update_one(
        {"id_eleccion": id_eleccion},
        {"$set": {"diseno": req.model_dump()}}
    )
    if r.matched_count == 0: raise HTTPException(404, "Proceso no encontrado")
    return {"ok": True}

@api.get("/procesos/{id_eleccion}/diseno")
async def obtener_diseno(id_eleccion: str, usuario: dict = Depends(usuario_actual)):
    p = await db.procesos_electorales.find_one({"id_eleccion": id_eleccion}, {"_id": 0})
    if not p: raise HTTPException(404, "Proceso no encontrado")
    if usuario.get("rol") != "admin":
        asignacion = await db.asignaciones_operativas.find_one(
            {"id_usuario": usuario["id"], "id_eleccion": id_eleccion},
            {"_id": 0, "id": 1},
        )
        if not asignacion:
            raise HTTPException(404, "Diseño no disponible")
    anforas = await db.anforas_mesa.find({"id_eleccion": id_eleccion}, {"_id": 0}).to_list(20000)
    anfora_de_papeleta = {}
    for a in anforas:
        for idp in a.get("id_papeletas", []):
            anfora_de_papeleta[idp] = {"numero_anfora": a.get("numero_anfora"), "nombre": a.get("nombre"), "color_hex": a.get("color_hex")}
    return {"diseno": p.get("diseno"), "papeletas": p.get("papeletas", []), "nombre": p.get("nombre"), "anfora_de_papeleta": anfora_de_papeleta}

# ------------- Fase 2: Lógica de Agregación (Nodos, Recintos, Mesas, Campos) -------------

class CrearNodoReq(BaseModel):
    id_padre: Optional[str] = None
    nombre_nivel: str
    nombre_nodo: str
    codigo: Optional[str] = None
    metadatos: dict = Field(default_factory=dict)

class ActualizarNodoReq(BaseModel):
    nombre_nivel: Optional[str] = None
    nombre_nodo: Optional[str] = None
    codigo: Optional[str] = None
    metadatos: Optional[dict] = None

class MarcarHojaReq(BaseModel):
    es_hoja_configurada: bool = True

class CrearRecintoReq(BaseModel):
    id_nodo_padre: str
    nombre: str
    codigo: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    metadatos: dict = Field(default_factory=dict)

class ActualizarRecintoReq(BaseModel):
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    metadatos: Optional[dict] = None

class CrearMesaReq(BaseModel):
    id_recinto: str
    numero_mesa: str
    codigo: Optional[str] = None
    metadatos: dict = Field(default_factory=dict)

class ActualizarMesaReq(BaseModel):
    numero_mesa: Optional[str] = None
    codigo: Optional[str] = None
    metadatos: Optional[dict] = None

class CrearCampoMesaReq(BaseModel):
    clave: str
    etiqueta: str
    tipo_dato: Literal["texto", "numero", "seleccion", "booleano", "fecha"] = "texto"
    opciones: List[str] = []
    requerido: bool = False
    orden: int = 0


async def _validar_proceso(id_eleccion: str):
    p = await db.procesos_electorales.find_one({"id_eleccion": id_eleccion})
    if not p:
        raise HTTPException(404, "Proceso electoral no encontrado")
    return p

async def _armar_path_desde_padre(id_eleccion: str, id_padre: Optional[str]) -> tuple[list, str, int]:
    """Devuelve (path_ancestros, path_texto, profundidad) para un nuevo hijo del padre indicado."""
    if id_padre is None:
        return [], "", 0
    padre = await db.nodos_jerarquicos.find_one({"id": id_padre, "id_eleccion": id_eleccion})
    if not padre:
        raise HTTPException(400, "Nodo padre no existe en esta elección")
    ancestros = list(padre.get("path_ancestros", []))
    ancestros.append({
        "id": padre["id"],
        "nombre_nivel": padre.get("nombre_nivel", ""),
        "nombre_nodo": padre.get("nombre_nodo", ""),
    })
    path_texto = "/".join([a["nombre_nodo"] for a in ancestros])
    return ancestros, path_texto, padre.get("profundidad", 0) + 1


# ---------- Nodos jerárquicos ----------

@api.post("/admin/procesos/{id_eleccion}/nodos")
async def admin_crear_nodo(id_eleccion: str, req: CrearNodoReq, admin: dict = Depends(requerir_admin)):
    await _validar_proceso(id_eleccion)
    ancestros, path_texto, profundidad = await _armar_path_desde_padre(id_eleccion, req.id_padre)
    # si el padre ya era hoja configurada, dejaría de serlo — regla: un nodo con hijos no es hoja
    if req.id_padre:
        await db.nodos_jerarquicos.update_one(
            {"id": req.id_padre, "id_eleccion": id_eleccion},
            {"$set": {"es_hoja_configurada": False}}
        )
    nodo = NodoJerarquico(
        id_eleccion=id_eleccion, id_padre=req.id_padre,
        nombre_nivel=req.nombre_nivel, nombre_nodo=req.nombre_nodo,
        codigo=req.codigo, metadatos=req.metadatos,
        profundidad=profundidad, path_ancestros=ancestros, path_texto=path_texto,
    )
    doc = nodo.model_dump()
    doc["creado_en"] = doc["creado_en"].isoformat()
    await db.nodos_jerarquicos.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/procesos/{id_eleccion}/nodos/{id_nodo}")
async def admin_actualizar_nodo(id_eleccion: str, id_nodo: str, req: ActualizarNodoReq, admin: dict = Depends(requerir_admin)):
    nodo = await db.nodos_jerarquicos.find_one({"id": id_nodo, "id_eleccion": id_eleccion})
    if not nodo: raise HTTPException(404, "Nodo no encontrado")
    upd = {k: v for k, v in req.model_dump().items() if v is not None}
    if not upd: raise HTTPException(400, "Nada que actualizar")
    await db.nodos_jerarquicos.update_one({"id": id_nodo}, {"$set": upd})

    # Si cambió el nombre_nodo o nombre_nivel, propagar a descendientes y recintos/mesas
    if "nombre_nodo" in upd or "nombre_nivel" in upd:
        nuevo_nombre = upd.get("nombre_nodo", nodo["nombre_nodo"])
        nuevo_nivel = upd.get("nombre_nivel", nodo["nombre_nivel"])
        descendientes = await db.nodos_jerarquicos.find(
            {"id_eleccion": id_eleccion, "path_ancestros.id": id_nodo}
        ).to_list(5000)
        for d in descendientes:
            nuevos_ancestros = []
            for a in d.get("path_ancestros", []):
                if a["id"] == id_nodo:
                    a = {**a, "nombre_nodo": nuevo_nombre, "nombre_nivel": nuevo_nivel}
                nuevos_ancestros.append(a)
            nuevo_path = "/".join([x["nombre_nodo"] for x in nuevos_ancestros])
            await db.nodos_jerarquicos.update_one(
                {"id": d["id"]},
                {"$set": {"path_ancestros": nuevos_ancestros, "path_texto": nuevo_path}}
            )
        # Recintos y mesas descendientes
        for coleccion in ("recintos_electorales", "mesas_sufragio"):
            items = await db[coleccion].find(
                {"id_eleccion": id_eleccion, "path_ancestros.id": id_nodo}
            ).to_list(20000)
            for it in items:
                nuevos = []
                for a in it.get("path_ancestros", []):
                    if a["id"] == id_nodo:
                        a = {**a, "nombre_nodo": nuevo_nombre, "nombre_nivel": nuevo_nivel}
                    nuevos.append(a)
                await db[coleccion].update_one(
                    {"id": it["id"]},
                    {"$set": {"path_ancestros": nuevos, "path_texto": "/".join([x["nombre_nodo"] for x in nuevos])}}
                )
    return {"ok": True}

@api.delete("/admin/procesos/{id_eleccion}/nodos/{id_nodo}")
async def admin_eliminar_nodo(id_eleccion: str, id_nodo: str, admin: dict = Depends(requerir_admin)):
    if await db.nodos_jerarquicos.count_documents({"id_padre": id_nodo, "id_eleccion": id_eleccion}) > 0:
        raise HTTPException(409, "El nodo tiene hijos; elimínelos primero")
    if await db.recintos_electorales.count_documents({"id_nodo_padre": id_nodo, "id_eleccion": id_eleccion}) > 0:
        raise HTTPException(409, "El nodo tiene recintos asociados")
    r = await db.nodos_jerarquicos.delete_one({"id": id_nodo, "id_eleccion": id_eleccion})
    if r.deleted_count == 0: raise HTTPException(404, "Nodo no encontrado")
    return {"ok": True}

@api.post("/admin/procesos/{id_eleccion}/nodos/{id_nodo}/marcar-hoja")
async def admin_marcar_hoja(id_eleccion: str, id_nodo: str, req: MarcarHojaReq, admin: dict = Depends(requerir_admin)):
    nodo = await db.nodos_jerarquicos.find_one({"id": id_nodo, "id_eleccion": id_eleccion})
    if not nodo: raise HTTPException(404, "Nodo no encontrado")
    if req.es_hoja_configurada and await db.nodos_jerarquicos.count_documents({"id_padre": id_nodo, "id_eleccion": id_eleccion}) > 0:
        raise HTTPException(409, "El nodo tiene hijos; no puede marcarse como hoja")
    await db.nodos_jerarquicos.update_one({"id": id_nodo}, {"$set": {"es_hoja_configurada": req.es_hoja_configurada}})
    return {"ok": True, "es_hoja_configurada": req.es_hoja_configurada}

@api.get("/procesos/{id_eleccion}/nodos")
async def listar_nodos(id_eleccion: str, id_padre: Optional[str] = None, admin: dict = Depends(requerir_admin)):
    q = {"id_eleccion": id_eleccion}
    if id_padre is not None:
        q["id_padre"] = None if id_padre == "raiz" else id_padre
    nodos = await db.nodos_jerarquicos.find(q, {"_id": 0}).sort([("profundidad", 1), ("nombre_nodo", 1)]).to_list(5000)
    return nodos


# ---------- Recintos Electorales ----------

def _normalizar_valor_unico(valor: object) -> str:
    return str(valor or "").strip().casefold()


async def _validar_unico_en_eleccion(
    coleccion: str,
    id_eleccion: str,
    campo: str,
    valor: object,
    etiqueta: str,
    id_excluir: Optional[str] = None,
) -> None:
    normalizado = _normalizar_valor_unico(valor)
    if not normalizado:
        raise HTTPException(422, f"{etiqueta} es obligatorio")
    campo_normalizado = f"{campo}_normalizado"
    consulta = {"id_eleccion": id_eleccion, campo_normalizado: normalizado}
    if id_excluir:
        consulta["id"] = {"$ne": id_excluir}
    conflicto = await db[coleccion].find_one(consulta, {"_id": 0, "id": 1})
    if conflicto:
        raise HTTPException(409, f"{etiqueta} ya existe en esta elección")


@api.post("/admin/procesos/{id_eleccion}/normalizar-identificadores-demo")
async def normalizar_identificadores_demo(
    id_eleccion: str,
    admin: dict = Depends(requerir_admin),
):
    await _validar_proceso(id_eleccion)
    anforas = await db.anforas_mesa.find(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "id": 1},
    ).sort([("creado_en", 1), ("id", 1)]).to_list(50000)
    mesas = await db.mesas_sufragio.find(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "id": 1},
    ).sort([("creado_en", 1), ("id", 1)]).to_list(50000)
    recintos = await db.recintos_electorales.find(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "id": 1, "nombre": 1},
    ).sort([("creado_en", 1), ("id", 1)]).to_list(10000)
    for indice, anfora in enumerate(anforas, start=1):
        numero = str(indice)
        await db.anforas_mesa.update_one(
            {"id": anfora["id"]},
            {"$set": {"numero_anfora": numero, "numero_anfora_normalizado": numero}},
        )
        await db.actas.update_many({"id_anfora": anfora["id"]}, {"$set": {"numero_anfora": numero}})
    for indice, mesa in enumerate(mesas, start=1):
        numero = str(indice)
        await db.mesas_sufragio.update_one(
            {"id": mesa["id"]},
            {"$set": {"numero_mesa": numero, "numero_mesa_normalizado": numero}},
        )
        await db.actas.update_many({"id_mesa": mesa["id"]}, {"$set": {"ambiente": f"Mesa {numero}"}})
    usados = {}
    recintos_renombrados = 0
    for recinto in recintos:
        base = str(recinto.get("nombre") or "Recinto").strip()
        clave = _normalizar_valor_unico(base)
        usados[clave] = usados.get(clave, 0) + 1
        nombre = base if usados[clave] == 1 else f"{base} ({usados[clave]})"
        if usados[clave] > 1:
            recintos_renombrados += 1
        await db.recintos_electorales.update_one(
            {"id": recinto["id"]},
            {"$set": {"nombre": nombre, "nombre_normalizado": _normalizar_valor_unico(nombre)}},
        )
        await db.actas.update_many({"id_recinto": recinto["id"]}, {"$set": {"recinto": nombre}})
    prefijo = re.sub(r"[^a-zA-Z0-9]", "_", id_eleccion)
    await db.anforas_mesa.create_index(
        [("id_eleccion", 1), ("numero_anfora", 1)],
        unique=True,
        name=f"uniq_anfora_{prefijo}",
        partialFilterExpression={"id_eleccion": id_eleccion},
    )
    await db.mesas_sufragio.create_index(
        [("id_eleccion", 1), ("numero_mesa", 1)],
        unique=True,
        name=f"uniq_mesa_{prefijo}",
        partialFilterExpression={"id_eleccion": id_eleccion},
    )
    await db.recintos_electorales.create_index(
        [("id_eleccion", 1), ("nombre_normalizado", 1)],
        unique=True,
        name=f"uniq_recinto_norm_{prefijo}",
        partialFilterExpression={"id_eleccion": id_eleccion},
    )
    await db.mesas_sufragio.create_index(
        [("id_eleccion", 1), ("numero_mesa_normalizado", 1)],
        unique=True,
        name=f"uniq_mesa_norm_{prefijo}",
        partialFilterExpression={"id_eleccion": id_eleccion},
    )
    await db.anforas_mesa.create_index(
        [("id_eleccion", 1), ("numero_anfora_normalizado", 1)],
        unique=True,
        name=f"uniq_anfora_norm_{prefijo}",
        partialFilterExpression={"id_eleccion": id_eleccion},
    )
    return {
        "ok": True,
        "anforas_renumeradas": len(anforas),
        "mesas_renumeradas": len(mesas),
        "recintos_renombrados": recintos_renombrados,
    }

@api.post("/admin/procesos/{id_eleccion}/recintos")
async def admin_crear_recinto(id_eleccion: str, req: CrearRecintoReq, admin: dict = Depends(requerir_admin)):
    await _validar_proceso(id_eleccion)
    nodo = await db.nodos_jerarquicos.find_one({"id": req.id_nodo_padre, "id_eleccion": id_eleccion})
    if not nodo: raise HTTPException(400, "Nodo padre inexistente")
    if not nodo.get("es_hoja_configurada"):
        raise HTTPException(409, "El nodo padre no está marcado como último eslabón (hoja). Los recintos solo cuelgan de nodos hoja")
    await _validar_unico_en_eleccion(
        "recintos_electorales",
        id_eleccion,
        "nombre",
        req.nombre,
        "El nombre del recinto",
    )
    nombre = req.nombre.strip()
    # linaje completo = ancestros del nodo + el nodo mismo
    ancestros = list(nodo.get("path_ancestros", []))
    ancestros.append({"id": nodo["id"], "nombre_nivel": nodo["nombre_nivel"], "nombre_nodo": nodo["nombre_nodo"]})
    path_texto = "/".join([a["nombre_nodo"] for a in ancestros])
    rec = RecintoElectoral(
        id_eleccion=id_eleccion, id_nodo_padre=req.id_nodo_padre,
        nombre=nombre, codigo=req.codigo, direccion=req.direccion,
        latitud=req.latitud, longitud=req.longitud, metadatos=req.metadatos,
        path_ancestros=ancestros, path_texto=path_texto,
    )
    doc = rec.model_dump()
    doc["nombre_normalizado"] = _normalizar_valor_unico(nombre)
    doc["creado_en"] = doc["creado_en"].isoformat()
    await db.recintos_electorales.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/procesos/{id_eleccion}/recintos/{id_recinto}")
async def admin_actualizar_recinto(id_eleccion: str, id_recinto: str, req: ActualizarRecintoReq, admin: dict = Depends(requerir_admin)):
    upd = {k: v for k, v in req.model_dump().items() if v is not None}
    if not upd: raise HTTPException(400, "Nada que actualizar")
    actual = await db.recintos_electorales.find_one({"id": id_recinto, "id_eleccion": id_eleccion}, {"_id": 0})
    if not actual: raise HTTPException(404, "Recinto no encontrado")
    if "nombre" in upd:
        upd["nombre"] = str(upd["nombre"]).strip()
        await _validar_unico_en_eleccion(
            "recintos_electorales",
            id_eleccion,
            "nombre",
            upd["nombre"],
            "El nombre del recinto",
            id_recinto,
        )
        upd["nombre_normalizado"] = _normalizar_valor_unico(upd["nombre"])
    r = await db.recintos_electorales.update_one({"id": id_recinto, "id_eleccion": id_eleccion}, {"$set": upd})
    if "nombre" in upd:
        await db.actas.update_many({"id_recinto": id_recinto}, {"$set": {"recinto": upd["nombre"]}})
    return {"ok": True}

@api.delete("/admin/procesos/{id_eleccion}/recintos/{id_recinto}")
async def admin_eliminar_recinto(id_eleccion: str, id_recinto: str, admin: dict = Depends(requerir_admin)):
    if await db.mesas_sufragio.count_documents({"id_recinto": id_recinto, "id_eleccion": id_eleccion}) > 0:
        raise HTTPException(409, "El recinto tiene mesas asociadas")
    r = await db.recintos_electorales.delete_one({"id": id_recinto, "id_eleccion": id_eleccion})
    if r.deleted_count == 0: raise HTTPException(404, "Recinto no encontrado")
    return {"ok": True}


# ---------- Definiciones de campos dinámicos ----------

@api.post("/admin/procesos/{id_eleccion}/campos-mesa")
async def admin_crear_campo_mesa(id_eleccion: str, req: CrearCampoMesaReq, admin: dict = Depends(requerir_admin)):
    await _validar_proceso(id_eleccion)
    if await db.definiciones_campo_mesa.find_one({"id_eleccion": id_eleccion, "clave": req.clave}):
        raise HTTPException(409, "Ya existe un campo con esa clave")
    campo = DefinicionCampoMesa(id_eleccion=id_eleccion, **req.model_dump())
    doc = campo.model_dump()
    await db.definiciones_campo_mesa.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/procesos/{id_eleccion}/campos-mesa/{id_campo}")
async def admin_actualizar_campo_mesa(id_eleccion: str, id_campo: str, req: CrearCampoMesaReq, admin: dict = Depends(requerir_admin)):
    r = await db.definiciones_campo_mesa.update_one(
        {"id": id_campo, "id_eleccion": id_eleccion},
        {"$set": req.model_dump()}
    )
    if r.matched_count == 0: raise HTTPException(404, "Campo no encontrado")
    return {"ok": True}

@api.delete("/admin/procesos/{id_eleccion}/campos-mesa/{id_campo}")
async def admin_eliminar_campo_mesa(id_eleccion: str, id_campo: str, admin: dict = Depends(requerir_admin)):
    r = await db.definiciones_campo_mesa.delete_one({"id": id_campo, "id_eleccion": id_eleccion})
    if r.deleted_count == 0: raise HTTPException(404, "Campo no encontrado")
    return {"ok": True}


# ---------- Mesas de Sufragio (schema-less) ----------

@api.post("/admin/procesos/{id_eleccion}/mesas")
async def admin_crear_mesa(id_eleccion: str, req: CrearMesaReq, admin: dict = Depends(requerir_admin)):
    recinto = await db.recintos_electorales.find_one({"id": req.id_recinto, "id_eleccion": id_eleccion})
    if not recinto: raise HTTPException(400, "Recinto inexistente")
    await _validar_unico_en_eleccion(
        "mesas_sufragio",
        id_eleccion,
        "numero_mesa",
        req.numero_mesa,
        "El número de mesa",
    )
    numero_mesa = req.numero_mesa.strip()
    # validar campos requeridos según definiciones
    definiciones = await db.definiciones_campo_mesa.find({"id_eleccion": id_eleccion}).to_list(500)
    faltantes = [d["clave"] for d in definiciones if d.get("requerido") and d["clave"] not in (req.metadatos or {})]
    if faltantes:
        raise HTTPException(422, f"Campos requeridos ausentes en metadatos: {', '.join(faltantes)}")
    mesa = MesaSufragio(
        id_eleccion=id_eleccion, id_recinto=req.id_recinto,
        numero_mesa=numero_mesa, codigo=req.codigo, metadatos=req.metadatos,
        path_ancestros=recinto.get("path_ancestros", []),
        path_texto=recinto.get("path_texto", ""),
    )
    doc = mesa.model_dump()
    doc["numero_mesa_normalizado"] = _normalizar_valor_unico(numero_mesa)
    doc["creado_en"] = doc["creado_en"].isoformat()
    await db.mesas_sufragio.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/procesos/{id_eleccion}/mesas/{id_mesa}")
async def admin_actualizar_mesa(id_eleccion: str, id_mesa: str, req: ActualizarMesaReq, admin: dict = Depends(requerir_admin)):
    upd = {k: v for k, v in req.model_dump().items() if v is not None}
    if not upd: raise HTTPException(400, "Nada que actualizar")
    actual = await db.mesas_sufragio.find_one({"id": id_mesa, "id_eleccion": id_eleccion}, {"_id": 0})
    if not actual: raise HTTPException(404, "Mesa no encontrada")
    if "numero_mesa" in upd:
        upd["numero_mesa"] = str(upd["numero_mesa"]).strip()
        await _validar_unico_en_eleccion(
            "mesas_sufragio",
            id_eleccion,
            "numero_mesa",
            upd["numero_mesa"],
            "El número de mesa",
            id_mesa,
        )
        upd["numero_mesa_normalizado"] = _normalizar_valor_unico(upd["numero_mesa"])
    r = await db.mesas_sufragio.update_one({"id": id_mesa, "id_eleccion": id_eleccion}, {"$set": upd})
    if "numero_mesa" in upd:
        await db.actas.update_many({"id_mesa": id_mesa}, {"$set": {"ambiente": f"Mesa {upd['numero_mesa']}"}})
    return {"ok": True}

@api.delete("/admin/procesos/{id_eleccion}/mesas/{id_mesa}")
async def admin_eliminar_mesa(id_eleccion: str, id_mesa: str, admin: dict = Depends(requerir_admin)):
    r = await db.mesas_sufragio.delete_one({"id": id_mesa, "id_eleccion": id_eleccion})
    if r.deleted_count == 0: raise HTTPException(404, "Mesa no encontrada")
    return {"ok": True}


# ------------- Ánforas por Mesa (papeleta → ánfora, N ánforas por mesa) -------------

class AnforaMesa(BaseModel):
    """Contenedor físico dentro de una mesa. Cada papeleta de la elección va a UNA ánfora.
    Una mesa puede tener N ánforas (ej. Presidencial + Gobernador; Rector + Decano)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    id_eleccion: str
    id_mesa: str
    id_recinto: str
    numero_anfora: str
    nombre: str
    id_papeletas: List[str] = []
    color_hex: Optional[str] = None
    tipo_mesa: Optional[Literal["docente", "estudiante"]] = None
    path_ancestros: List[dict] = []
    path_texto: str = ""
    creado_en: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CrearAnforaReq(BaseModel):
    id_mesa: str
    numero_anfora: str
    nombre: str
    id_papeletas: List[str] = []
    color_hex: Optional[str] = None
    tipo_mesa: Optional[Literal["docente", "estudiante"]] = None

class ActualizarAnforaReq(BaseModel):
    numero_anfora: Optional[str] = None
    nombre: Optional[str] = None
    id_papeletas: Optional[List[str]] = None
    color_hex: Optional[str] = None
    tipo_mesa: Optional[Literal["docente", "estudiante"]] = None


async def _validar_tipo_mesa_anfora(
    id_eleccion: str,
    tipo_mesa: Optional[str],
) -> bool:
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "tipo": 1},
    )
    if not proceso:
        raise HTTPException(404, "Proceso electoral no encontrado")
    es_universitaria = proceso.get("tipo") == "universitaria"
    if es_universitaria and tipo_mesa not in {"docente", "estudiante"}:
        raise HTTPException(
            422,
            "En elecciones universitarias, el tipo de mesa debe ser Docente o Estudiante.",
        )
    return es_universitaria


async def _validar_papeletas_unicas_por_mesa(id_eleccion: str, id_mesa: str, id_papeletas: list, id_anfora_excluir: Optional[str] = None):
    if not id_papeletas: return
    q = {"id_eleccion": id_eleccion, "id_mesa": id_mesa, "id_papeletas": {"$in": id_papeletas}}
    if id_anfora_excluir: q["id"] = {"$ne": id_anfora_excluir}
    conflicto = await db.anforas_mesa.find_one(q)
    if conflicto:
        raise HTTPException(409, f"Ya existe otra ánfora en la misma mesa que contiene una de las papeletas: {conflicto['nombre']}")

@api.post("/admin/procesos/{id_eleccion}/anforas")
async def admin_crear_anfora(id_eleccion: str, req: CrearAnforaReq, admin: dict = Depends(requerir_admin)):
    mesa = await db.mesas_sufragio.find_one({"id": req.id_mesa, "id_eleccion": id_eleccion})
    if not mesa: raise HTTPException(400, "Mesa inexistente")
    es_universitaria = await _validar_tipo_mesa_anfora(id_eleccion, req.tipo_mesa)
    await _validar_unico_en_eleccion(
        "anforas_mesa",
        id_eleccion,
        "numero_anfora",
        req.numero_anfora,
        "El número de ánfora",
    )
    numero_anfora = req.numero_anfora.strip()
    await _validar_papeletas_unicas_por_mesa(id_eleccion, req.id_mesa, req.id_papeletas)
    anf = AnforaMesa(
        id_eleccion=id_eleccion, id_mesa=req.id_mesa, id_recinto=mesa["id_recinto"],
        numero_anfora=numero_anfora, nombre=req.nombre,
        id_papeletas=req.id_papeletas, color_hex=req.color_hex,
        tipo_mesa=req.tipo_mesa if es_universitaria else None,
        path_ancestros=mesa.get("path_ancestros", []),
        path_texto=mesa.get("path_texto", ""),
    )
    doc = anf.model_dump()
    doc["numero_anfora_normalizado"] = _normalizar_valor_unico(numero_anfora)
    doc["creado_en"] = doc["creado_en"].isoformat()
    await db.anforas_mesa.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/procesos/{id_eleccion}/anforas/{id_anfora}")
async def admin_actualizar_anfora(id_eleccion: str, id_anfora: str, req: ActualizarAnforaReq, admin: dict = Depends(requerir_admin)):
    anf = await db.anforas_mesa.find_one({"id": id_anfora, "id_eleccion": id_eleccion})
    if not anf: raise HTTPException(404, "Ánfora no encontrada")
    upd = {k: v for k, v in req.model_dump().items() if v is not None}
    if not upd: raise HTTPException(400, "Nada que actualizar")
    if "numero_anfora" in upd:
        upd["numero_anfora"] = str(upd["numero_anfora"]).strip()
        await _validar_unico_en_eleccion(
            "anforas_mesa",
            id_eleccion,
            "numero_anfora",
            upd["numero_anfora"],
            "El número de ánfora",
            id_anfora,
        )
        upd["numero_anfora_normalizado"] = _normalizar_valor_unico(upd["numero_anfora"])
    tipo_mesa = upd.get("tipo_mesa", anf.get("tipo_mesa"))
    es_universitaria = await _validar_tipo_mesa_anfora(id_eleccion, tipo_mesa)
    if not es_universitaria:
        upd.pop("tipo_mesa", None)
    if "id_papeletas" in upd:
        await _validar_papeletas_unicas_por_mesa(id_eleccion, anf["id_mesa"], upd["id_papeletas"], id_anfora)
    await db.anforas_mesa.update_one({"id": id_anfora}, {"$set": upd})
    if "numero_anfora" in upd:
        await db.actas.update_many({"id_anfora": id_anfora}, {"$set": {"numero_anfora": upd["numero_anfora"]}})
    return {"ok": True}

@api.delete("/admin/procesos/{id_eleccion}/anforas/{id_anfora}")
async def admin_eliminar_anfora(id_eleccion: str, id_anfora: str, admin: dict = Depends(requerir_admin)):
    r = await db.anforas_mesa.delete_one({"id": id_anfora, "id_eleccion": id_eleccion})
    if r.deleted_count == 0: raise HTTPException(404, "Ánfora no encontrada")
    return {"ok": True}

@api.get("/procesos/{id_eleccion}/anforas")
async def listar_anforas(
    id_eleccion: str,
    id_mesa: Optional[str] = None,
    id_ancestro: Optional[str] = None,
    numero_anfora: Optional[str] = None,
    usuario: dict = Depends(usuario_actual),
):
    q = {"id_eleccion": id_eleccion}
    if usuario.get("rol") != "admin":
        asignaciones = await _asignaciones_operativas_usuario(usuario["id"], id_eleccion)
        q.update(_filtro_anforas_asignadas(asignaciones))
    if id_mesa: q["id_mesa"] = id_mesa
    if id_ancestro: q["path_ancestros.id"] = id_ancestro
    if numero_anfora:
        termino = re.escape(numero_anfora.strip()[:80])
        q["numero_anfora"] = {"$regex": termino, "$options": "i"}
    anforas = await db.anforas_mesa.find(q, {"_id": 0}).sort("numero_anfora", 1).to_list(20000)
    return anforas


@api.get("/procesos/{id_eleccion}/localizador-anforas")
async def obtener_localizador_anforas(
    id_eleccion: str,
    usuario: dict = Depends(usuario_actual),
):
    await _validar_proceso(id_eleccion)
    filtro_anforas = {"id_eleccion": id_eleccion}
    if usuario.get("rol") != "admin":
        asignaciones = await _asignaciones_operativas_usuario(usuario["id"], id_eleccion)
        filtro_anforas.update(_filtro_anforas_asignadas(asignaciones))
    anforas = await db.anforas_mesa.find(
        filtro_anforas,
        {"_id": 0},
    ).sort("numero_anfora", 1).to_list(20000)
    actas = await db.actas.find(
        {"id_eleccion": id_eleccion, "id_anfora": {"$in": [anfora["id"] for anfora in anforas]}},
        {"_id": 0, "id_anfora": 1, "estado": 1, "esta_bloqueada": 1, "conteos": 1, "actualizado_en": 1},
    ).sort("actualizado_en", -1).to_list(20000)
    actas_canonicas = {acta["id_anfora"]: acta for acta in _actas_unicas_por_anfora(actas) if acta.get("id_anfora")}
    for anfora in anforas:
        acta = actas_canonicas.get(anfora["id"])
        if not acta:
            anfora["estado_acta"] = "sin_datos"
        elif acta.get("esta_bloqueada"):
            anfora["estado_acta"] = "consolidada"
        else:
            anfora["estado_acta"] = acta.get("estado") or "borrador"
    ids_recinto = list({anfora["id_recinto"] for anfora in anforas})
    ids_mesa = list({anfora["id_mesa"] for anfora in anforas})
    recintos = await db.recintos_electorales.find(
        {"id_eleccion": id_eleccion, "id": {"$in": ids_recinto}},
        {"_id": 0},
    ).to_list(5000)
    mesas = await db.mesas_sufragio.find(
        {"id_eleccion": id_eleccion, "id": {"$in": ids_mesa}},
        {"_id": 0},
    ).to_list(20000)
    ids_nodo = set()
    for recinto in recintos:
        ids_nodo.add(recinto.get("id_nodo_padre"))
        ids_nodo.update(nodo.get("id") for nodo in recinto.get("path_ancestros", []))
    nodos = await db.nodos_jerarquicos.find(
        {"id_eleccion": id_eleccion, "id": {"$in": list(ids_nodo - {None})}},
        {"_id": 0},
    ).to_list(5000)
    return {
        "nodos": nodos,
        "recintos": recintos,
        "mesas": mesas,
        "anforas": anforas,
    }


async def _calcular_resultado_universitario(id_eleccion: str) -> dict:
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "tipo": 1, "papeletas": 1},
    )
    if not proceso:
        raise HTTPException(404, "Proceso electoral no encontrado")
    if proceso.get("tipo") != "universitaria":
        raise HTTPException(400, "Este cálculo solo aplica a elecciones universitarias")

    franjas = {}
    for papeleta in proceso.get("papeletas", []):
        for franja in papeleta.get("franjas", []):
            franjas[franja["id_franja"]] = franja
    actas = await db.actas.find(
        {"id_eleccion": id_eleccion, "esta_bloqueada": True},
        {"_id": 0, "id_anfora": 1, "tipo_mesa": 1, "conteos": 1},
    ).sort("actualizado_en", -1).to_list(20000)
    actas = _actas_unicas_por_anfora(actas)
    resultados = {}
    for tipo_mesa in ("docente", "estudiante"):
        resultados[tipo_mesa] = {}
        for id_franja, franja in franjas.items():
            resultados[tipo_mesa][id_franja] = {
                "titulo": franja["titulo"],
                "base_calculo": franja.get("calcular_porcentaje_sobre", "solo_validos"),
                "candidatos": {
                    candidato["id_candidato"]: {
                        "nombre": candidato["nombre"],
                        "votos": 0,
                    }
                    for candidato in franja.get("candidatos", [])
                },
                "votos_blancos": 0,
                "votos_nulos": 0,
            }
    for acta in actas:
        tipo_mesa = acta.get("tipo_mesa")
        if tipo_mesa not in resultados:
            continue
        for conteo in acta.get("conteos", []):
            resultado = resultados[tipo_mesa].get(conteo.get("id_franja"))
            if not resultado:
                continue
            for id_candidato, votos in (conteo.get("votos_por_candidato") or {}).items():
                if id_candidato in resultado["candidatos"]:
                    resultado["candidatos"][id_candidato]["votos"] += int(votos or 0)
            resultado["votos_blancos"] += int(conteo.get("votos_blancos") or 0)
            resultado["votos_nulos"] += int(conteo.get("votos_nulos") or 0)
    for estamento in resultados.values():
        for resultado in estamento.values():
            validos = sum(item["votos"] for item in resultado["candidatos"].values())
            base_calculo = resultado["base_calculo"]
            if base_calculo == "validos_mas_blancos":
                base = validos + resultado["votos_blancos"]
            elif base_calculo == "emitidos_totales":
                base = validos + resultado["votos_blancos"] + resultado["votos_nulos"]
            else:
                base = validos
            umbral = (base // 2) + 1
            resultado["base_votos"] = base
            resultado["umbral_primera_vuelta"] = umbral
            resultado["ganadores_primera_vuelta"] = [
                id_candidato
                for id_candidato, candidato in resultado["candidatos"].items()
                if candidato["votos"] >= umbral
            ]
    por_franja = {}
    for id_franja, resultado_docente in resultados["docente"].items():
        resultado_estudiante = resultados["estudiante"].get(id_franja)
        ganadores_docentes = set(resultado_docente.get("ganadores_primera_vuelta", []))
        ganadores_estudiantes = set(
            (resultado_estudiante or {}).get("ganadores_primera_vuelta", []),
        )
        ganadores_comunes = sorted(ganadores_docentes & ganadores_estudiantes)
        por_franja[id_franja] = {
            "ganadores_primera_vuelta": ganadores_comunes,
            "ganadores_nombres": [
                resultado_docente["candidatos"][id_candidato]["nombre"]
                for id_candidato in ganadores_comunes
                if id_candidato in resultado_docente["candidatos"]
            ],
        }
    return {"por_estamento": resultados, "por_franja": por_franja}


@api.get("/procesos/{id_eleccion}/resultado-universitario")
async def resultado_universitario(
    id_eleccion: str,
    usuario: dict = Depends(requerir_resultados),
):
    return await _calcular_resultado_universitario(id_eleccion)


@app.websocket("/api/ws/resultados/{id_eleccion}")
async def websocket_resultados(websocket: WebSocket, id_eleccion: str):
    try:
        token = websocket.headers.get("sec-websocket-protocol", "").split(",")[0].strip()
        if not token:
            await websocket.close(code=1008)
            return
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("jti") and await db.sesiones_revocadas.find_one({"jti": payload["jti"]}):
            await websocket.close(code=1008)
            return
        usuario = await db.usuarios.find_one({"id": payload["sub"]}, {"_id": 0})
        if not usuario or usuario.get("rol") not in {"admin", "resultados"}:
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return
    await gestor_resultados_en_vivo.conectar(id_eleccion, websocket, token)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        gestor_resultados_en_vivo.desconectar(id_eleccion, websocket)


@app.websocket("/api/ws/publico/{id_eleccion}")
async def websocket_publico(websocket: WebSocket, id_eleccion: str):
    proceso = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion, "activo": True},
        {"_id": 0, "id_eleccion": 1},
    )
    if not proceso:
        await websocket.close(code=1008)
        return
    await gestor_resultados_en_vivo.conectar(id_eleccion, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        gestor_resultados_en_vivo.desconectar(id_eleccion, websocket)

# ------------- Fase 3: Consultas y Agregaciones por Materialized Path -------------

@api.get("/procesos/{id_eleccion}/recintos")
async def listar_recintos(
    id_eleccion: str,
    id_nodo_padre: Optional[str] = None,
    id_ancestro: Optional[str] = None,
    usuario: dict = Depends(requerir_admin),
):
    q: dict = {"id_eleccion": id_eleccion}
    if id_nodo_padre: q["id_nodo_padre"] = id_nodo_padre
    if id_ancestro:   q["path_ancestros.id"] = id_ancestro
    recintos = await db.recintos_electorales.find(q, {"_id": 0}).sort("nombre", 1).to_list(5000)
    return recintos

@api.get("/procesos/{id_eleccion}/mesas")
async def listar_mesas(
    id_eleccion: str,
    id_recinto: Optional[str] = None,
    id_ancestro: Optional[str] = None,
    filtro_metadatos: Optional[str] = None,   # ej: "facultad=Derecho,año=3ro"
    usuario: dict = Depends(requerir_admin),
):
    q: dict = {"id_eleccion": id_eleccion}
    if id_recinto:  q["id_recinto"] = id_recinto
    if id_ancestro: q["path_ancestros.id"] = id_ancestro
    if filtro_metadatos:
        for par in filtro_metadatos.split(","):
            if "=" in par:
                k, v = par.split("=", 1)
                q[f"metadatos.{k.strip()}"] = v.strip()
    mesas = await db.mesas_sufragio.find(q, {"_id": 0}).sort("numero_mesa", 1).to_list(20000)
    return mesas

@api.get("/procesos/{id_eleccion}/campos-mesa")
async def listar_campos_mesa(id_eleccion: str, usuario: dict = Depends(requerir_admin)):
    campos = await db.definiciones_campo_mesa.find({"id_eleccion": id_eleccion}, {"_id": 0}).sort("orden", 1).to_list(500)
    return campos

@api.get("/procesos/{id_eleccion}/estructura")
async def obtener_estructura_completa(id_eleccion: str, admin: dict = Depends(requerir_admin)):
    """Devuelve el árbol jerárquico completo + recintos + conteo de mesas por recinto y nodo."""
    await _validar_proceso(id_eleccion)
    nodos = await db.nodos_jerarquicos.find({"id_eleccion": id_eleccion}, {"_id": 0}).to_list(5000)
    recintos = await db.recintos_electorales.find({"id_eleccion": id_eleccion}, {"_id": 0}).to_list(5000)
    conteo_mesas_por_recinto = {}
    async for doc in db.mesas_sufragio.aggregate([
        {"$match": {"id_eleccion": id_eleccion}},
        {"$group": {"_id": "$id_recinto", "total": {"$sum": 1}}},
    ]):
        conteo_mesas_por_recinto[doc["_id"]] = doc["total"]
    for r in recintos:
        r["total_mesas"] = conteo_mesas_por_recinto.get(r["id"], 0)
    campos = await db.definiciones_campo_mesa.find({"id_eleccion": id_eleccion}, {"_id": 0}).sort("orden", 1).to_list(500)
    anforas = await db.anforas_mesa.find({"id_eleccion": id_eleccion}, {"_id": 0}).sort("numero_anfora", 1).to_list(20000)
    proc = await db.procesos_electorales.find_one(
        {"id_eleccion": id_eleccion},
        {"_id": 0, "papeletas": 1, "tipo": 1},
    )
    papeletas_proc = (proc or {}).get("papeletas", [])
    return {
        "nodos": nodos,
        "recintos": recintos,
        "campos_mesa": campos,
        "anforas": anforas,
        "papeletas": papeletas_proc,
        "tipo": (proc or {}).get("tipo"),
    }

@api.get("/procesos/{id_eleccion}/agregacion")
async def agregacion_por_nivel(
    id_eleccion: str,
    id_ancestro: Optional[str] = None,
    agrupar_por_metadato: Optional[str] = None,
    admin: dict = Depends(requerir_admin),
):
    """
    Agrega mesas por un ancestro del path o por un metadato dinámico.
    - id_ancestro: agrupa mesas cuyo path contiene ese nodo.
    - agrupar_por_metadato: ej. "facultad" → agrupa por metadatos.facultad.
    """
    match: dict = {"id_eleccion": id_eleccion}
    if id_ancestro:
        match["path_ancestros.id"] = id_ancestro
    if agrupar_por_metadato:
        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": f"$metadatos.{agrupar_por_metadato}",
                "total_mesas": {"$sum": 1},
                "recintos": {"$addToSet": "$id_recinto"},
            }},
            {"$project": {"valor": "$_id", "_id": 0, "total_mesas": 1, "total_recintos": {"$size": "$recintos"}}},
            {"$sort": {"total_mesas": -1}},
        ]
    else:
        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": "$path_texto",
                "total_mesas": {"$sum": 1},
                "recintos": {"$addToSet": "$id_recinto"},
            }},
            {"$project": {"path_texto": "$_id", "_id": 0, "total_mesas": 1, "total_recintos": {"$size": "$recintos"}}},
            {"$sort": {"total_mesas": -1}},
        ]
    resultados = [r async for r in db.mesas_sufragio.aggregate(pipeline)]
    return {"criterio": agrupar_por_metadato or "path_texto", "id_ancestro": id_ancestro, "resultados": resultados}

# ------------- Health -------------
@api.get("/")
async def raiz():
    return {"servicio": "STRE Backend", "estado": "activo", "version": "1.0.0"}

# ------------- Startup: seeds -------------
async def seed_admin_y_operador():
    admin_email = (os.environ.get("ADMIN_EMAIL") or "").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD") or ""
    if not admin_email or not admin_pw:
        logger.error("ADMIN_EMAIL y ADMIN_PASSWORD son obligatorios para inicializar STRE")
        return
    if not await db.usuarios.find_one({"email": admin_email}):
        u = Usuario(email=admin_email, nombre_completo="Administrador STRE", rol="admin")
        doc = u.model_dump()
        doc["hash_contrasena"] = hashear_contrasena(admin_pw)
        doc["creado_en"] = doc["creado_en"].isoformat()
        await db.usuarios.insert_one(doc)
        logger.info(f"Admin sembrado: {admin_email}")

@app.on_event("startup")
async def al_iniciar():
    await db.usuarios.create_index("email", unique=True)
    await db.procesos_electorales.create_index("id_eleccion", unique=True)
    await db.actas.create_index("id_eleccion")
    await db.actas.create_index("numero_anfora")
    # Fase 2: índices para árbol jerárquico y agregaciones NoSQL
    await db.nodos_jerarquicos.create_index([("id_eleccion", 1), ("id_padre", 1)])
    await db.nodos_jerarquicos.create_index([("id_eleccion", 1), ("path_ancestros.id", 1)])
    await db.nodos_jerarquicos.create_index("id", unique=True)
    await db.recintos_electorales.create_index([("id_eleccion", 1), ("id_nodo_padre", 1)])
    await db.recintos_electorales.create_index([("id_eleccion", 1), ("path_ancestros.id", 1)])
    await db.recintos_electorales.create_index("id", unique=True)
    await db.mesas_sufragio.create_index([("id_recinto", 1), ("numero_mesa", 1)], unique=True)
    await db.mesas_sufragio.create_index([("id_eleccion", 1), ("path_ancestros.id", 1)])
    await db.mesas_sufragio.create_index("id", unique=True)
    await db.definiciones_campo_mesa.create_index([("id_eleccion", 1), ("clave", 1)], unique=True)
    await db.anforas_mesa.create_index([("id_mesa", 1), ("numero_anfora", 1)], unique=True)
    await db.anforas_mesa.create_index([("id_eleccion", 1), ("path_ancestros.id", 1)])
    await db.anforas_mesa.create_index("id", unique=True)
    await db.asignaciones_operativas.create_index(
        [("id_usuario", 1), ("id_eleccion", 1), ("funcion", 1)],
    )
    await db.asignaciones_operativas.create_index("id", unique=True)
    await db.actas.create_index([("id_eleccion", 1), ("id_anfora", 1), ("estado", 1)])
    await db.sesiones_revocadas.create_index("jti", unique=True)
    await db.sesiones_revocadas.create_index("expira_en", expireAfterSeconds=0)
    await db.intentos_login.create_index("email")
    await db.intentos_login.create_index("creado_en", expireAfterSeconds=900)
    # El arranque conserva la creación del administrador y no carga procesos de demostración.
    await seed_admin_y_operador()
    logger.info("STRE backend listo")

@app.on_event("shutdown")
async def al_cerrar():
    mongo_client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ["CORS_ORIGINS"].split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
