import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ShieldCheck, Clock, User, FileWarning } from "lucide-react";

export default function BitacoraPage() {
  const { usuario } = useAuth();
  const [entradas, setEntradas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/bitacora")
      .then((r) => setEntradas(r.data))
      .catch((e) => setError(e?.response?.data?.detail || "Requiere admin"))
      .finally(() => setCargando(false));
  }, []);

  if (usuario?.rol !== "admin") {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <FileWarning className="w-12 h-12 mx-auto text-amber-500 mb-4" />
        <h1 className="font-display font-bold text-2xl text-slate-900">Acceso restringido</h1>
        <p className="text-slate-500 mt-2">La bitácora de auditoría es exclusiva del rol administrador.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8" data-testid="bitacora-page">
      <div className="stre-badge bg-[#EFF6FF] text-[#1E3A8A] mb-3"><ShieldCheck className="w-3 h-3" /> Registro Inmutable</div>
      <h1 className="font-display font-extrabold text-3xl text-slate-900 tracking-tight">Bitácora de Auditoría</h1>
      <p className="text-slate-500 mt-1 max-w-2xl">Cada consolidación y desbloqueo administrativo queda registrado con marca temporal, actor y motivo textual.</p>

      <div className="mt-8 stre-card overflow-hidden" data-testid="audit-log-table">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-data">
              <th className="text-left p-3">Timestamp</th>
              <th className="text-left p-3">Acción</th>
              <th className="text-left p-3">Administrador</th>
              <th className="text-left p-3">Ánfora</th>
              <th className="text-left p-3">Elección</th>
              <th className="text-left p-3">Motivo Textual</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan="6" className="p-8 text-center text-slate-400 font-data">Cargando…</td></tr>}
            {!cargando && entradas.length === 0 && (
              <tr><td colSpan="6" className="p-8 text-center text-slate-400">Sin registros aún</td></tr>
            )}
            {entradas.map((e, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50" data-testid={`bitacora-row-${i}`}>
                <td className="p-3 font-data text-xs text-slate-600 whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 inline mr-1 opacity-50" />
                  {new Date(e.timestamp).toLocaleString("es-BO")}
                </td>
                <td className="p-3">
                  <span className={`stre-badge ${e.accion === "desbloqueo_admin" ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#ECFDF5] text-[#059669]"}`}>
                    {e.accion.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="p-3 text-slate-800"><User className="w-3.5 h-3.5 inline mr-1 opacity-50" />{e.email_admin}</td>
                <td className="p-3 font-data font-bold">{e.numero_anfora}</td>
                <td className="p-3 font-data text-xs text-slate-500">{e.id_eleccion}</td>
                <td className="p-3 text-slate-700 max-w-md">{e.motivo_textual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
