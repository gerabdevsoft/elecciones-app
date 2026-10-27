## AUTH TESTING PLAYBOOK — STRE
- Admin: gerabdevsoft@gmail.com / STRE_Admin_2026
- Operador: operador@stre.bo / Operador_2026
- POST /api/auth/login → returns {token, usuario}
- GET /api/auth/me con Authorization: Bearer <token>
- Verify bcrypt hash `$2b$` prefix in db.usuarios
- Verify unique index on usuarios.email
