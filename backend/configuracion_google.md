# OCR y almacenamiento en Google Cloud

El backend conserva el archivo original en un bucket privado de GCS y envía los
mismos bytes a Document AI. La base de datos guarda referencias, nunca archivos
ni enlaces firmados. Los enlaces temporales son de lectura y duran 15 minutos.
El límite de carga es de 20 MB; se admiten JPG, PNG, WEBP y PDF.

## Configuración

Variables no secretas:

- `GOOGLE_ID_PROYECTO`
- `GOOGLE_REGION_DOCUMENT_AI`
- `GOOGLE_ID_PROCESADOR_DOCUMENT_AI`
- `GOOGLE_BUCKET_ACTAS`

Secreto privado del backend:

- `GOOGLE_CREDENCIALES_SERVICIO_JSON`: JSON completo de una cuenta de servicio.
  No debe ponerse en archivos, chat, código React ni variables `REACT_APP_*`.

La cuenta necesita permiso para procesar documentos con Document AI y, en el
bucket, `storage.objects.create` y `storage.objects.get`. Puede concederlos con
un rol personalizado limitado al bucket; no se necesita acceso público ni
permisos para borrar objetos. Activar las API de Document AI y Cloud Storage en
el proyecto y desplegar una versión del Custom Extractor antes de probar.

La firma de las URL se realiza en el backend con la clave de la cuenta de
servicio; React nunca la recibe.

## Etiquetas del Custom Extractor

Los grupos `franja` y `candidato` son entidades repetidas; los demás son campos
individuales dentro de su grupo:

```text
numero_mesa                  texto
electores_habilitados         número entero
franja                       grupo repetido
  nombre_franja               texto
  nombre_papeleta             texto opcional; desambigua títulos repetidos
  candidato                  grupo repetido
    nombre_candidato          texto
    votos_candidato           número entero
  votos_validos               número entero
  votos_blancos               número entero
  votos_nulos                 número entero
  total_emitidos              número entero
```

Los nombres de franja y candidato deben corresponder a los configurados en la
elección. Se permite normalizar mayúsculas, espacios y tildes, pero no se adivinan
coincidencias ambiguas ni cifras ilegibles.

Se comprueba el número de mesa, la presencia de todas las candidaturas y franjas
asignadas al ánfora, las sumas y el límite de electores habilitados. Cada campo
individual debe tener al menos 90 % de confianza del extractor. Ese porcentaje
no garantiza exactitud: se mantiene la revisión humana antes de consolidar.
Si hay errores se devuelve la referencia del archivo y los motivos, sin
autocompletar conteos parciales.

Las imágenes existentes en el almacenamiento anterior no se trasladan
automáticamente a GCS. No se borran objetos ni datos antiguos.

## Pruebas sin servicios externos

```bash
python -m unittest backend.pruebas_google
```
