import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("stre_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("stre_token");
      localStorage.removeItem("stre_usuario");
      localStorage.removeItem("stre_proceso_activo");
      if (window.location.pathname !== "/acceso") window.location.href = "/acceso";
    }
    return Promise.reject(err);
  }
);

export function formatearError(detail) {
  if (detail == null) return "Ocurrió un error inesperado";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}
