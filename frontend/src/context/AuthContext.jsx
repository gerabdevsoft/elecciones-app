import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatearError } from "@/lib/api";
import { toast } from "sonner";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(undefined); // undefined = cargando
  const [procesoActivo, setProcesoActivo] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("stre_token");
    if (!token) { setUsuario(null); return; }
    api.get("/auth/me").then((r) => {
      setUsuario(r.data);
      const p = localStorage.getItem("stre_proceso_activo");
      if (p) { try { setProcesoActivo(JSON.parse(p)); } catch {} }
    }).catch(() => setUsuario(null));
  }, []);

  const iniciarSesion = useCallback(async (email, contrasena) => {
    try {
      const { data } = await api.post("/auth/login", { email, contrasena });
      localStorage.setItem("stre_token", data.token);
      localStorage.setItem("stre_usuario", JSON.stringify(data.usuario));
      setUsuario(data.usuario);
      toast.success(`Bienvenido, ${data.usuario.nombre_completo}`);
      return true;
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail) || "Credenciales inválidas");
      return false;
    }
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      localStorage.removeItem("stre_token");
      localStorage.removeItem("stre_usuario");
      localStorage.removeItem("stre_proceso_activo");
      setUsuario(null);
      setProcesoActivo(null);
      toast.info("Sesión cerrada. Contexto electoral destruido.");
    }
  }, []);

  const seleccionarProceso = useCallback((proc) => {
    setProcesoActivo(proc);
    localStorage.setItem("stre_proceso_activo", JSON.stringify(proc));
  }, []);

  const liberarProceso = useCallback(() => {
    setProcesoActivo(null);
    localStorage.removeItem("stre_proceso_activo");
  }, []);

  return (
    <AuthCtx.Provider value={{ usuario, procesoActivo, iniciarSesion, cerrarSesion, seleccionarProceso, liberarProceso }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
