# STRE en Replit

Este repositorio conserva su estructura original: React con CRACO en `frontend/` y FastAPI con MongoDB en `backend/`.

## Arranque

El workflow **Iniciar STRE** ejecuta `bash start.sh`. El frontend escucha en el puerto 5000 y reenvía `/api` (incluidos WebSockets) al backend local en el puerto 8000. El navegador usa rutas del mismo origen, sin URL de backend externa.

Si necesitas reinstalar las dependencias, ejecuta `cd frontend && yarn install --frozen-lockfile` y `python -m pip install -r backend/requirements.txt`. No uses un entorno virtual.

## Configuración

- Secretos obligatorios: `MONGO_URL` (MongoDB de desarrollo), `JWT_SECRET` y `ADMIN_PASSWORD`.
- Variables: `DB_NAME` (nombre de la base de desarrollo), `ADMIN_EMAIL` y `CORS_ORIGINS` (configurado para el servidor local; el frontend utiliza el proxy).
- El arranque crea los índices necesarios y la cuenta administradora si no existe. La página pública estará vacía si la base no contiene procesos.
- `SEED_DEMO_DATA` está desactivada por defecto. **No la actives en una base con datos existentes:** la rutina original de demostración puede eliminar procesos y actas con estructura antigua. Si quieres probarla, utiliza una base vacía y separada.

El almacenamiento de imágenes utiliza el servicio original de Emergent y requiere `EMERGENT_LLM_KEY` y acceso a ese servicio. El OCR además depende de `emergentintegrations`, paquete que no está disponible en el registro de este entorno; se excluyó de la instalación para permitir arrancar el resto de la aplicación. Esas funciones no están habilitadas con esta configuración. No se han sustituido por otro proveedor ni se han inventado credenciales.
