# PRD — Sistema de Transmisión de Resultados Electorales (STRE)

## Problema
App full-stack (React + FastAPI + MongoDB) para digitalizar actas electorales, OCR de dígitos manuscritos vía LLM de visión, doble columna imagen/formulario, bloqueo/desbloqueo con bitácora inmutable.

## Personas
- Digitador / Operador: sube foto, corrige valores OCR, consolida acta.
- Auditor / Admin: revisa bitácora, desbloquea actas con motivo textual.

## Requerimientos Core (estáticos)
1. Modelo dinámico de Anfora con papeletas configurables (Nacional Franja Superior/Inferior; Municipal; Independientes).
2. Auth JWT bcrypt (admin / operador).
3. Compresión cliente 1024x1024 escala grises antes de subir.
4. OCR vía GPT-5.4-mini con Structured Outputs, prompt en español.
5. Object Storage — URL en Mongo, no binario.
6. Endpoints: /procesar-ocr, /guardar-acta, /centro-computo/bloquear, /admin/desbloquear.
7. UI en español; contexto de "Proceso Electoral Activo" con lock.
8. Doble columna: imagen zoom + formulario editable (disabled por defecto).

## Implementado (Feb 2026)
- Auth JWT bcrypt + seed admin gerabdevsoft@gmail.com
- Modelos Pydantic + colecciones Mongo (procesos_electorales, actas, bitacora_auditoria)
- Data demo Bolivia: Elecciones Generales, Subnacionales, Universitarias
- Endpoints CRUD de procesos electorales
- Endpoint /procesar-ocr con emergentintegrations
- Endpoint /guardar-acta, /bloquear, /desbloquear
- Frontend: Login, Selector Proceso, Centro Cómputo (split), Bitácora, Resumen
- Compresión cliente 1024x1024 grayscale (canvas)
- Ánforas universitarias: tipo de mesa obligatorio (`docente` o `estudiante`),
  visible en el árbol electoral; no aplica a otros tipos de elección.
- Diseñador de boletas independiente: cada papeleta conserva su propio lienzo,
  franjas y sectores redimensionables de candidatura con campos configurables.
- Impresión adaptada para generar una página por cada boleta configurada.
- Franjas universitarias: conservan la regla "% se calcula sobre" sin estamento
  propio; el estamento se identifica exclusivamente mediante el tipo de mesa del ánfora.
- Cómputo universitario: endpoint de resultados por mesa Docente/Estudiante, con
  umbral de primera vuelta de 50% + 1 voto según la base configurada en cada franja.
- Centro de cómputo: localizador previo de ánfora por número o estructura jerárquica;
  la selección limita las boletas y franjas visibles al contenido de esa ánfora.
- Diseñador: ubicación, tamaño y tipografía configurables para foto, nombre,
  sigla/partido, casilla, encabezado y pie; espaciado configurable entre candidaturas.
- Rol `resultados` de solo lectura, compartido con `admin` para ver el tablero consolidado.
- Tablero de resultados con canal persistente WebSocket: actualiza al bloquear actas,
  muestra actas recientes y métricas de ánforas totales, escrutadas y faltantes.
- TREP público sin autenticación: consulta exclusivamente actas consolidadas y bloqueadas
  por elección, estructura geográfica o número de ánfora, con imagen y datos de solo lectura.
- Resultados públicos con actualización WebSocket, gráficos de barras, torta y líneas,
  avance de escrutinio y ganadores provisionales según umbrales y base de cálculo.
- Asignaciones operativas por elección: ámbitos acumulables y dinámicos por nodo final,
  recinto o ánfora para funciones separadas de carga y validación de actas.
- Flujo de actas: borrador, enviado, observado y bloqueado; separación de funciones que
  impide validar o bloquear al creador/remitente de la misma acta.
- Seguridad: autorización dinámica por ámbito verificada mediante pentest; actas privadas
  e imágenes de borrador protegidas por autorización de backend, CORS con allowlist y
  revocación de sesión JWT al cerrar sesión.
- Validación completada: pruebas de flujo operativo, BOLA/IDOR, escalación de privilegios,
  revocación JWT, límite de intentos y WebSocket autenticado en navegador. Reportes en
  `/app/test_reports/iteration_1.json` a `/app/test_reports/iteration_6.json`.
- Carga demo USFX preparada para `UNIV-2026-BO-01`: 16 facultades de Sucre, sedes de
  Monteagudo/Muyupampa, recinto docente Derecho Histórico y 1.038 ánforas demo.
- Carga demo USFX verificada: 19 recintos, 519 mesas, 1.038 ánforas demo (1.028
  generales y 10 docentes); 1.040 ánforas visibles incluyendo 2 registros preexistentes.
- TREP público: filtros jerárquicos dinámicos por nivel, recinto, mesa y ánfora; el
  número de ánfora dentro de estructura se combina estrictamente con el ámbito elegido.
  La búsqueda superior permanece independiente y las consultas no alteran datos electorales.
- Carga de resultados demo USFX preparada: conteos reproducibles por candidatura, con
  participación diferenciada para mesas estudiantiles/docentes y mezcla de actas bloqueadas/borrador.
- Resultados demo cargados y verificados: 1.038 actas demo (851 bloqueadas, 187 borradores),
  con reparación idempotente de 519 actas de Vicerrector y agregación deduplicada por ánfora.
- Identificadores electorales: ánfora y mesa únicos a nivel de elección; recinto único por
  nombre a nivel de elección. La carga demo se normaliza a números globales y actualiza sus actas vinculadas.
- Unicidad verificada en `UNIV-2026-BO-01`: 1.040 ánforas y 520 mesas sin duplicados;
  1.042 actas vinculadas mantienen número de ánfora, mesa y recinto sincronizados.
- Centro de Cómputo: localizador encadenado Nivel → Recinto → Mesa → Ánfora, consulta de
  acta por ánfora y protección de edición durante carga o para actas consolidadas.
- Centro de Cómputo: estados visibles por ánfora (sin datos, borrador, validación,
  observada y consolidada), barra de acciones responsive y diálogo formal para observaciones.
- Resumen Nacional retirado de la interfaz y redirigido a Resultados Públicos para evitar
  duplicar la consulta consolidada.

## Backlog
- P1: Cálculo automático de escaños proporcionales (D'Hondt) para Senadores
- P1: Export CSV de resultados consolidados
- P2: WebSocket para actualización en vivo de conteo
- P2: Firma digital criptográfica (SHA-256) del acta consolidada
