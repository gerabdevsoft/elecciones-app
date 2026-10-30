import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Layers, MapPin, Calendar, ArrowRight, Settings2, ShieldCheck, BarChart3 } from "lucide-react";

const iconoTipo = {
  nacional: "🇧🇴",
  municipal: "🏛️",
  universitaria: "🎓",
};

export default function SeleccionProcesoPage() {
  const [procesos, setProcesos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const { seleccionarProceso, usuario } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/procesos").then((r) => setProcesos(r.data)).finally(() => setCargando(false));
  }, []);

  const elegir = (p) => {
    seleccionarProceso(p);
    navigate(usuario?.rol === "resultados" ? "/resultados" : "/centro-computo");
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-10" data-testid="seleccion-proceso-page">
      <div className="stre-badge bg-[#FEF3C7] text-[#B45309] mb-4">
        Selección de proceso requerida
      </div>
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">Proceso Electoral Activo</h1>
      <p className="text-slate-500 mt-2 max-w-2xl">
        Hola, <span className="font-semibold text-slate-800">{usuario?.nombre_completo}</span>. Selecciona el proceso electoral sobre el cual operarás. El proceso elegido permanecerá activo hasta que cierres sesión o regreses a esta pantalla.
      </p>

      {usuario?.rol === "admin" && (
        <div className="mt-6 flex flex-wrap items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-[#EFF6FF] to-[#F5F3FF] border border-[#DDD6FE]" data-testid="admin-quick-links">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#1E3A8A]">Accesos Admin:</div>
          <Link to="/gestion-electoral" data-testid="quick-gestion">
            <Button size="sm" className="bg-[#1E3A8A] hover:bg-[#1E40AF]">
              <Settings2 className="w-4 h-4 mr-2" /> Gestión Electoral
            </Button>
          </Link>
          <Link to="/bitacora" data-testid="quick-bitacora">
            <Button size="sm" variant="outline">
              <ShieldCheck className="w-4 h-4 mr-2" /> Bitácora de Auditoría
            </Button>
          </Link>
        </div>
      )}

      {cargando ? (
        <div className="mt-10 text-slate-400 font-data text-sm">Cargando procesos electorales…</div>
      ) : (
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {procesos.map((p, idx) => (
            <button
              key={p.id_eleccion}
              onClick={() => elegir(p)}
              data-testid={`electoral-process-selector-${p.id_eleccion}`}
              className="stre-card p-6 text-left group animate-fade-up"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="text-3xl">{iconoTipo[p.tipo] || "🗳️"}</div>
                <span className="stre-badge bg-slate-100 text-slate-600 font-data">{p.id_eleccion}</span>
              </div>
              <h3 className="mt-4 font-display font-bold text-lg text-slate-900 leading-tight">{p.nombre}</h3>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {p.pais}</span>
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {p.fecha_eleccion}</span>
                <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> {p.papeletas?.length || 0} papeletas</span>
              </div>
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[10px] font-data uppercase tracking-widest text-slate-400">Tipo · {p.tipo}</div>
                <span className="text-[#1E3A8A] font-semibold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                  Seleccionar <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
