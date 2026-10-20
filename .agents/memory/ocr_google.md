---
name: OCR y almacenamiento Google
description: Decisión del usuario sobre proveedores y conservación de actas originales.
---

El usuario indicó que no puede usar nada de Emergent. Eligió Google Cloud
Document AI Custom Extractor para leer actas y Google Cloud Storage para
conservar los originales. GCS sustituyó una propuesta previa de OCI.

**Why:** el usuario solicitó eliminar la dependencia de Emergent y confirmó
conservar originales, guardar solo referencias/metadatos en la base y admitir
fotografías y PDF.

**How to apply:** no reintroducir servicios de Emergent ni almacenamiento en
OCI. Las credenciales deben permanecer en el backend; entregar enlaces
temporales y resultados estructurados validados, con revisión humana.
