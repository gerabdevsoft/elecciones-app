import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function ResumenPage() {
  const { procesoActivo } = useAuth();
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    if (!procesoActivo) return;
    api.get(`/resumen/${procesoActivo.id_eleccion}`).then((r) => setResumen(r.data));
  }, [procesoActivo?.id_eleccion]);

  if (!resumen) return <div className="p-8 text-slate-400 font-data text-sm">Cargando resumen…</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8" data-testid="resumen-page">
      <h1 className="font-display font-extrabold text-3xl text-slate-900 tracking-tight">Resumen Consolidado</h1>
      <p className="text-slate-500 mt-1">{resumen.proceso.nombre}</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
        <MetricaTarjeta titulo="Mesas Procesadas" valor={`${resumen.actas_consolidadas} / ${resumen.total_actas}`} testid="metric-actas" />
        <MetricaTarjeta titulo="Avance de Cómputo" valor={`${resumen.porcentaje_avance}%`} accent="#059669" testid="metric-avance" />
        <MetricaTarjeta titulo="Papeletas Activas" valor={resumen.proceso.papeletas.length} testid="metric-papeletas" />
        <MetricaTarjeta titulo="Tipo de Elección" valor={resumen.proceso.tipo} testid="metric-tipo" />
      </div>

      <div className="mt-10 space-y-8">
        {Object.entries(resumen.resultados).map(([idP, r]) => {
          const data = Object.entries(r.candidatos).map(([id, c]) => ({ nombre: c.sigla || c.nombre.split(" ")[0], votos: c.votos, color: c.color_hex || "#64748B" }));
          const totalGeneral = r.total_validos + r.votos_blancos + r.votos_nulos;
          return (
            <div key={idP} className="stre-card p-6" data-testid={`papeleta-resultado-${idP}`}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-display font-bold text-xl text-slate-900">{r.nombre_papeleta ? `${r.nombre_papeleta} — ${r.titulo}` : r.titulo}</h3>
                <span className="text-xs font-data text-slate-500 uppercase tracking-widest">
                  Válidos {r.total_validos} · Blancos {r.votos_blancos} · Nulos {r.votos_nulos}
                </span>
              </div>
              <div className="mt-4 h-64">
                <ResponsiveContainer>
                  <BarChart data={data}>
                    <XAxis dataKey="nombre" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="votos" radius={[6, 6, 0, 0]}>
                      {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(r.candidatos).map(([id, c]) => {
                  const pct = totalGeneral ? ((c.votos / totalGeneral) * 100).toFixed(2) : "0.00";
                  return (
                    <div key={id} className="p-3 rounded-md border border-slate-100 flex items-center gap-3">
                      <div className="w-1.5 h-10 rounded-sm" style={{ background: c.color_hex || "#94A3B8" }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{c.nombre}</div>
                        <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{c.sigla || c.partido}</div>
                      </div>
                      <div className="text-right font-data">
                        <div className="text-lg font-bold">{c.votos}</div>
                        <div className="text-[10px] text-slate-500">{pct}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricaTarjeta({ titulo, valor, accent = "#1E3A8A", testid }) {
  return (
    <div className="stre-card p-5" data-testid={testid}>
      <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{titulo}</div>
      <div className="mt-2 font-data font-bold text-2xl sm:text-3xl" style={{ color: accent }}>{valor}</div>
    </div>
  );
}
