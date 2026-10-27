import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BadgeCheck, Radio, RefreshCw, Trophy } from "lucide-react";

function etiquetaBase(base) {
  const etiquetas = {
    solo_validos: "votos válidos",
    validos_mas_blancos: "válidos + blancos",
    emitidos_totales: "emitidos totales",
  };
  return etiquetas[base] || base;
}

function PanelEstamento({ nombre, resultado }) {
  if (!resultado) {
    return <div className="border border-slate-200 p-4 text-sm text-slate-400">Sin franjas registradas.</div>;
  }
  const candidatos = Object.entries(resultado.candidatos || {})
    .map(([id, candidato]) => ({ id, ...candidato }))
    .sort((a, b) => b.votos - a.votos);
  const superaUmbral = candidatos.find((candidato) => (
    (resultado.ganadores_primera_vuelta || []).includes(candidato.id)
  ));

  return (
    <div className="border border-slate-200 bg-white p-4" data-testid={`panel-estamento-${nombre.toLowerCase()}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Estamento</div>
          <div className="mt-1 font-display text-lg font-bold capitalize">{nombre}</div>
        </div>
        <div className="text-right font-data text-xs text-slate-500">
          <div>Base: {resultado.base_votos}</div>
          <div>Umbral: {resultado.umbral_primera_vuelta}</div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {candidatos.map((candidato) => (
          <div key={candidato.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{candidato.nombre}</div>
              {superaUmbral?.id === candidato.id && <div className="mt-0.5 text-[10px] font-data uppercase text-emerald-700">Supera el umbral de este estamento</div>}
            </div>
            <div className="font-data text-lg font-bold">{candidato.votos}</div>
          </div>
        ))}
        {candidatos.length === 0 && <div className="text-sm text-slate-400">Sin candidaturas configuradas.</div>}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Este resultado debe coincidir en ambos estamentos para definir primera vuelta.</div>
    </div>
  );
}

export default function ResultadosPage() {
  const { usuario, procesoActivo } = useAuth();
  const [estado, setEstado] = useState(null);
  const [consolidado, setConsolidado] = useState(null);
  const [conexion, setConexion] = useState("conectando");
  const socketRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!procesoActivo) return;
    const { data: estadoActual } = await api.get(
      `/procesos/${procesoActivo.id_eleccion}/estado-resultados`,
    );
    setEstado(estadoActual);
    const ruta = estadoActual.proceso.tipo === "universitaria"
      ? `/procesos/${procesoActivo.id_eleccion}/resultado-universitario`
      : `/resumen/${procesoActivo.id_eleccion}`;
    const { data } = await api.get(ruta);
    setConsolidado(data);
  }, [procesoActivo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!procesoActivo || !usuario) return undefined;
    const token = localStorage.getItem("stre_token");
    const base = (process.env.REACT_APP_BACKEND_URL || window.location.origin).replace(/^http/, "ws");
    const socket = new WebSocket(
      `${base}/api/ws/resultados/${procesoActivo.id_eleccion}`,
      token ? [token] : [],
    );
    socketRef.current = socket;
    socket.onopen = () => setConexion("conectado");
    socket.onmessage = () => cargar();
    socket.onclose = () => setConexion("desconectado");
    socket.onerror = () => setConexion("desconectado");
    const pulso = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send("pulso");
    }, 25000);
    return () => {
      window.clearInterval(pulso);
      socket.close();
    };
  }, [cargar, procesoActivo, usuario]);

  if (!usuario || !["admin", "resultados"].includes(usuario.rol)) {
    return <Navigate to="/seleccionar-proceso" replace />;
  }
  if (!procesoActivo) return <Navigate to="/seleccionar-proceso" replace />;
  if (!estado || !consolidado) {
    return <div className="p-8 font-data text-sm text-slate-400" data-testid="cargando-resultados">Cargando consolidado…</div>;
  }

  const esUniversitaria = estado.proceso.tipo === "universitaria";
  const resultadosUniversitarios = consolidado.por_estamento || {};
  const ganadoresPorFranja = consolidado.por_franja || {};
  const franjas = Object.entries(resultadosUniversitarios.docente || {});

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8" data-testid="resultados-page">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="stre-badge bg-[#EFF6FF] text-[#1E3A8A] font-data">{procesoActivo.id_eleccion}</span>
            <span className={`stre-badge ${conexion === "conectado" ? "bg-[#ECFDF5] text-[#047857]" : "bg-[#FEF3C7] text-[#92400E]"}`} data-testid="estado-conexion-resultados">
              <Radio className="w-3 h-3" /> {conexion}
            </span>
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold text-slate-900">Resultados consolidados</h1>
          <p className="mt-1 text-slate-500">{estado.proceso.nombre} · actualización al bloquear cada acta.</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-2 self-start border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500" data-testid="actualizar-resultados">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-5" data-testid="consolidado-principal">
          {esUniversitaria ? (
            franjas.map(([idFranja, docente]) => (
              <article key={idFranja} className="border border-slate-200 bg-slate-50 p-4 sm:p-5" data-testid={`resultado-franja-${idFranja}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Franja universitaria</div>
                    <h2 className="mt-1 font-display text-xl font-bold">{docente.titulo}</h2>
                  </div>
                  <div className="text-xs font-data text-slate-500">Base: {etiquetaBase(docente.base_calculo)}</div>
                </div>
                <GanadorUniversitario resultado={ganadoresPorFranja[idFranja]} />
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <PanelEstamento nombre="Docente" resultado={docente} />
                  <PanelEstamento nombre="Estudiante" resultado={resultadosUniversitarios.estudiante?.[idFranja]} />
                </div>
              </article>
            ))
          ) : (
            Object.entries(consolidado.resultados || {}).map(([idFranja, resultado]) => {
              const candidatos = Object.values(resultado.candidatos || {}).sort((a, b) => b.votos - a.votos);
              return (
                <article key={idFranja} className="border border-slate-200 bg-white p-5" data-testid={`resultado-general-${idFranja}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div><div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{resultado.nombre_papeleta}</div><h2 className="mt-1 font-display text-xl font-bold">{resultado.titulo}</h2></div>
                    <div className="font-data text-xs text-slate-500">Válidos {resultado.total_validos}</div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {candidatos.map((candidato) => <div key={candidato.nombre} className="flex justify-between border-t border-slate-100 pt-2 text-sm"><span>{candidato.nombre}</span><strong className="font-data">{candidato.votos}</strong></div>)}
                  </div>
                </article>
              );
            })
          )}
        </section>

        <aside className="border border-slate-200 bg-white p-4 sm:p-5" data-testid="actas-consolidadas-recientes">
          <div className="flex items-center gap-2"><BadgeCheck className="w-5 h-5 text-emerald-600" /><h2 className="font-display text-lg font-bold">Actas recién consolidadas</h2></div>
          <div className="mt-4 space-y-3">
            {estado.actas_recientes.map((acta) => <div key={acta.id_acta} className="border-l-2 border-emerald-500 pl-3" data-testid={`acta-reciente-${acta.id_acta}`}><div className="font-data text-xs font-bold">Ánfora {acta.numero_anfora}</div><div className="mt-1 text-sm text-slate-700">{acta.recinto} · {acta.ambiente}</div>{acta.tipo_mesa && <div className="mt-1 text-[10px] font-data uppercase text-blue-700">Mesa {acta.tipo_mesa}</div>}<div className="mt-1 text-[10px] text-slate-400">{acta.actualizado_en}</div></div>)}
            {estado.actas_recientes.length === 0 && <div className="text-sm text-slate-400">Aún no existen actas consolidadas.</div>}
          </div>
        </aside>
      </div>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="metricas-escrutinio-anforas">
        <Metrica titulo="Ánforas totales" cantidad={estado.anforas.total} porcentaje={estado.anforas.porcentaje_total} color="#1E3A8A" />
        <Metrica titulo="Ánforas escrutadas" cantidad={estado.anforas.escrutadas} porcentaje={estado.anforas.porcentaje_escrutadas} color="#059669" />
        <Metrica titulo="Ánforas faltantes" cantidad={estado.anforas.faltantes} porcentaje={estado.anforas.porcentaje_faltantes} color="#D97706" />
      </section>
    </div>
  );
}

function GanadorUniversitario({ resultado }) {
  const nombres = resultado?.ganadores_nombres || [];
  if (nombres.length) {
    return <div className="mt-3 border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="ganador-universitario-primera-vuelta"><Trophy className="mr-2 inline h-4 w-4" />Gana en primera vuelta: {nombres.join(", ")}. Superó el umbral en Docentes y Estudiantes.</div>;
  }
  return <div className="mt-3 border-l-4 border-slate-400 bg-slate-100 p-3 text-sm text-slate-700" data-testid="sin-ganador-universitario-primera-vuelta">Sin ganador de primera vuelta: una candidatura debe superar el 50% + 1 voto tanto en Docentes como en Estudiantes.</div>;
}

function Metrica({ titulo, cantidad, porcentaje, color }) {
  return (
    <div className="border border-slate-200 bg-white p-5" data-testid={`metrica-${titulo.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{titulo}</div>
      <div className="mt-2 flex items-end justify-between"><div className="font-data text-3xl font-bold" style={{ color }}>{cantidad}</div><div className="font-data text-sm text-slate-500">{porcentaje}%</div></div>
    </div>
  );
}