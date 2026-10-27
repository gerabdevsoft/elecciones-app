# Credenciales de Prueba - STRE

## Cuenta Administrador Principal (Owner)
- Email: gerabdevsoft@gmail.com
- Contraseña: STRE_Admin_2026
- Rol: admin

## Cuenta Operador de Prueba (controlada)
- Email: operador@stre.bo
- Contraseña: Operador_2026
- Rol: operador

## Cuenta Validador de Prueba (controlada)
- Email: validador@stre.bo
- Contraseña: Validador_2026
- Rol global: operador
- Función por elección: validador (se asigna desde Administración Operativa)

## Endpoints de Autenticación
- POST /api/auth/login
- POST /api/auth/registrar (solo admin)
- GET  /api/auth/me
- POST /api/auth/logout
- POST /api/admin/usuarios-operativos
- POST /api/admin/procesos/{id_eleccion}/asignaciones-operativas
