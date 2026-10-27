---
name: Datos de demostración
description: Decisión de seguridad al arrancar el proyecto electoral con una base importada.
---

El sembrado de procesos de demostración debe estar desactivado por defecto y solo activarse de forma consciente contra una base vacía y separada.

**Why:** La rutina original de demostración puede borrar procesos y actas con formato antiguo antes de crear ejemplos. Durante la importación se conectó una base aportada por el usuario; arrancar no debe causar esa eliminación.

**How to apply:** En futuros cambios de inicialización o despliegue, conservar el arranque sin sembrado destructivo. No interpretar una base vacía como permiso para cargar datos electorales de ejemplo.
