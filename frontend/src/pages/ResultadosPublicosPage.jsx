import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, MapPin, Radio, RefreshCw, Trophy } from "lucide-react";
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, formatearError } from "@/lib/api";
import { ordenarCandidatosPorNumeroLista } from "@/lib/sorting";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CabeceraPublica } from "@/pages/TrepPublicoPage";

const colores = ["#1E3A8A", "#059669", "#D97706", "#BE123C", "#7C3AED", "#0F766E"];

export default function ResultadosPublicosPage() {
  const [procesos, setProcesos] = useState([]);
  const [idEleccion, setIdEleccion] = useState("");
  const [datos, setDatos] = useState(null);
  const [tipoGrafica, setTipoGrafica] = useState("barras");
  const [conexion, setConexion] = useState("actualizando");
  const [errorCarga, setErrorCarga] = useState("");
  const actualizarRef = useRef(null);

  const cargarProcesos = useCallback(async () => {
    try {
      const { data } = await api.get("/publico/procesos");
      setProcesos(data);
      setIdEleccion((actual) => actual || data[0]?.id_eleccion || "");
      setErrorCarga("");
    } catch (error) {
      setErrorCarga(formatearError(error?.response?.data?.detail) || "No se pudieron cargar los procesos electorales.");
    }
  }, []);
  const cargar = useCallback(async (signal) => {
    // Los botones de reintento entregan un evento, no una señal de cancelación.
    if (!signal || typeof signal.addEventListener !== "function") {
      if (actualizarRef.current) return actualizarRef.current();
      signal = undefined;
    }
    if (!idEleccion) return false;
    try {
      const { data } = await api.get(`/publico/procesos/${idEleccion}/resultados`, { signal, timeout: 30000 });
      if (signal?.aborted) return false;
      setDatos(data);
      setErrorCarga("");
      return true;
    } catch (error) {
      if (signal?.aborted || error?.code === "ERR_CANCELED") return false;
      setErrorCarga(formatearError(error?.response?.data?.detail) || "No se pudieron actualizar los resultados.");
      return false;
    }
  }, [idEleccion]);

  useEffect(() => {
    cargarProcesos();
  }, [cargarProcesos]);
  useEffect(() => {
    if (!idEleccion) return undefined;
    let activa = true;
    let solicitudPendiente = false;
    let actualizacionEnCola = false;
    let eventos = null;
    let controladorSolicitud = null;

    setDatos(null);
    setConexion("actualizando");

    const actualizar = async () => {
      if (!activa || document.visibilityState === "hidden") return;
      if (solicitudPendiente) {
        actualizacionEnCola = true;
        return;
      }
      solicitudPendiente = true;
      controladorSolicitud = new AbortController();
      if (eventos?.readyState !== 1) setConexion("actualizando");
      const actualizado = await cargar(controladorSolicitud.signal);
      solicitudPendiente = false;
      controladorSolicitud = null;
      if (!activa || document.visibilityState === "hidden") return;
      const hora = new Date().toLocaleTimeString("es-BO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      if (actualizado) {
        setConexion(`${eventos?.readyState === 1 ? "en vivo" : "respaldo"} · actualizado ${hora}`);
      } else {
        setConexion(
          eventos?.readyState === 1
            ? "en vivo · actualización pendiente"
            : "reconectando; respaldo automático activo",
        );
      }
      if (actualizacionEnCola) {
        actualizacionEnCola = false;
        actualizar();
      }
    };

    const conectar = () => {
      if (!activa || document.visibilityState === "hidden" || typeof window.EventSource !== "function") return;
      if (eventos) return;
      const base = process.env.REACT_APP_BACKEND_URL || "";
      try {
        eventos = new EventSource(`${base}/api/publico/procesos/${encodeURIComponent(idEleccion)}/eventos`);
      } catch {
        setConexion("reconectando; respaldo automático activo");
        return;
      }
      eventos.addEventListener("conectado", () => {
        if (!activa) return;
        setConexion("en vivo");
        // También recupera cambios ocurridos durante una desconexión.
        actualizar();
      });
      eventos.addEventListener("acta_consolidada", actualizar);
      eventos.onerror = () => {
        if (!activa || document.visibilityState === "hidden") return;
        setConexion("reconectando; respaldo automático activo");
      };
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        actualizar();
        conectar();
      } else {
        controladorSolicitud?.abort();
        eventos?.close();
        eventos = null;
      }
    };
    const alEnfocarVentana = () => {
      if (document.visibilityState === "visible") actualizar();
    };

    actualizarRef.current = actualizar;
    actualizar();
    conectar();
    // Respaldo periódico incluso si una notificación no llega al navegador.
    const intervalo = window.setInterval(actualizar, 60000);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("focus", alEnfocarVentana);

    return () => {
      activa = false;
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("focus", alEnfocarVentana);
      controladorSolicitud?.abort();
      eventos?.close();
      if (actualizarRef.current === actualizar) actualizarRef.current = null;
    };
  }, [cargar, idEleccion]);

  const esUniversitaria = datos?.proceso?.tipo === "universitaria";
  return <div className="min-h-screen bg-slate-100" data-testid="resultados-publicos-page"><CabeceraPublica /><main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-data uppercase tracking-widest text-emerald-700"><Radio className="w-3 h-3" /> Actualización automática · {conexion}</div><h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900">Resultados electorales</h1><p className="mt-1 text-slate-600">Datos de actas consolidadas y bloqueadas.</p></div><div className="flex w-full flex-wrap gap-2 lg:w-auto"><Select value={idEleccion} onValueChange={setIdEleccion}><SelectTrigger className="w-full sm:w-[420px]" data-testid="seleccionar-eleccion-resultados-publicos"><SelectValue placeholder="Elección" /></SelectTrigger><SelectContent>{procesos.map((proceso) => <SelectItem key={proceso.id_eleccion} value={proceso.id_eleccion}>{proceso.nombre}</SelectItem>)}</SelectContent></Select><Select value={tipoGrafica} onValueChange={setTipoGrafica}><SelectTrigger className="w-full sm:w-[150px]" data-testid="tipo-grafica-publica"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="barras">Barras</SelectItem><SelectItem value="torta">Torta</SelectItem><SelectItem value="lineas">Líneas</SelectItem></SelectContent></Select></div></div>{errorCarga && datos ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status"><span><AlertCircle className="mr-2 inline h-4 w-4" />No se pudo actualizar ahora. Se reintentará automáticamente.</span><Button variant="outline" size="sm" onClick={cargar}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Button></div> : null}{!datos ? errorCarga ? <div className="mt-8 border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900" role="alert"><p>{errorCarga}</p><Button variant="outline" size="sm" className="mt-4" onClick={idEleccion ? cargar : cargarProcesos}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Button></div> : <div className="mt-8 border border-slate-200 bg-white p-8 text-sm text-slate-400" data-testid="cargando-resultados-publicos">Cargando resultados…</div> : <><section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="avance-publico-anforas"><TarjetaAvance titulo="Ánforas totales" valor={datos.anforas.total} porcentaje="100" color="#1E3A8A" /><TarjetaAvance titulo="Actas consolidadas" valor={datos.anforas.escrutadas} porcentaje={datos.anforas.porcentaje_escrutadas} color="#059669" /><TarjetaAvance titulo="Actas faltantes" valor={datos.anforas.faltantes} porcentaje={datos.anforas.porcentaje_faltantes} color="#D97706" /></section><section className="mt-8 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"><div className="min-w-0 space-y-5">{esUniversitaria ? <ResultadosUniversitarios datos={datos.universitario} tipoGrafica={tipoGrafica} /> : Object.entries(datos.resultados).map(([idFranja, resultado]) => <ResultadoGeneral key={idFranja} resultado={resultado} tipoGrafica={tipoGrafica} />)}</div><ActasRecientes actas={datos.actas_recientes || []} /></section></>}</main></div>;
}

function ActasRecientes({ actas }) {
  return <aside className="border border-slate-200 bg-white" data-testid="actas-recientes-consolidadas">
    <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span>
      <div><h2 className="font-display font-bold text-slate-900">Actas recién consolidadas</h2><p className="text-xs text-slate-500">Actualización en tiempo real</p></div>
    </div>
    {!actas.length ? <div className="p-5 text-sm text-slate-500">Aún no hay actas consolidadas.</div> : <ol className="divide-y divide-slate-100">
      {actas.map((acta) => <li key={acta.id || acta.id_anfora} className="px-4 py-4 transition-colors hover:bg-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-data text-sm font-bold text-slate-900">Ánfora {acta.numero_anfora || "—"}</div>
            <div className="mt-1 flex items-start gap-1.5 text-xs text-slate-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 break-words">{acta.recinto || "Recinto sin nombre"}{acta.ambiente ? ` · ${acta.ambiente}` : ""}</span></div>
          </div>
          {acta.tipo_mesa && <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase text-indigo-700">{acta.tipo_mesa}</span>}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><Clock3 className="h-3 w-3" />{acta.actualizado_en ? new Date(acta.actualizado_en).toLocaleString("es-BO") : "Fecha no disponible"}</div>
      </li>)}
    </ol>}
  </aside>;
}

function ResultadoGeneral({ resultado, tipoGrafica }) {
  const candidatos = ordenarCandidatosPorNumeroLista(Object.entries(resultado.candidatos || {}).map(([id, candidato], indice) => ({ id, ...candidato, color: candidato.color_hex || colores[indice % colores.length] })));
  const ganadores = resultado.ganadores_provisionales || [];
  return <article className="border border-slate-200 bg-white p-4 sm:p-6" data-testid={`grafica-publica-${resultado.titulo}`}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{resultado.nombre_papeleta}</div><h2 className="mt-1 font-display text-xl font-bold">{resultado.titulo}</h2><div className="mt-1 text-xs text-slate-500">Base {resultado.base_votos} · Umbral {resultado.umbral_primera_vuelta}</div></div><Ganador candidatos={candidatos} ganadores={ganadores} /></div><Grafica candidatos={candidatos} tipo={tipoGrafica} /><Listado candidatos={candidatos} /></article>;
}

function ResultadosUniversitarios({ datos, tipoGrafica }) {
  const franjas = Object.entries(datos?.por_estamento?.docente || {});
  return franjas.map(([id, docente]) => <article key={id} className="border border-slate-200 bg-white p-4 sm:p-6" data-testid={`resultado-universitario-publico-${id}`}><div className="flex flex-wrap justify-between gap-4"><div><div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Franja universitaria</div><h2 className="mt-1 font-display text-xl font-bold">{docente.titulo}</h2></div><div className="text-xs text-slate-500">Base: {docente.base_calculo?.replaceAll("_", " ")}</div></div><GanadorUniversitarioPublico resultado={datos?.por_franja?.[id]} /><div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2"><ResultadoEstamento nombre="Docentes" resultado={docente} tipoGrafica={tipoGrafica} /><ResultadoEstamento nombre="Estudiantes" resultado={datos?.por_estamento?.estudiante?.[id]} tipoGrafica={tipoGrafica} /></div></article>);
}

function ResultadoEstamento({ nombre, resultado, tipoGrafica }) {
  const candidatos = ordenarCandidatosPorNumeroLista(Object.entries(resultado?.candidatos || {}).map(([id, candidato], indice) => ({ id, ...candidato, color: colores[indice % colores.length] })));
  return <div className="border border-slate-200 bg-slate-50 p-4" data-testid={`resultado-estamento-publico-${nombre.toLowerCase()}`}><div className="flex justify-between gap-3"><div className="font-display font-bold">{nombre}</div><UmbralEstamento candidatos={candidatos} ganadores={resultado?.ganadores_primera_vuelta || []} /></div><div className="mt-2 text-xs text-slate-500">Base {resultado?.base_votos || 0} · Umbral {resultado?.umbral_primera_vuelta || 1}</div><Grafica candidatos={candidatos} tipo={tipoGrafica} compacto /><Listado candidatos={candidatos} /></div>;
}

function GanadorUniversitarioPublico({ resultado }) {
  const nombres = resultado?.ganadores_nombres || [];
  return nombres.length ? <div className="mt-4 border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="ganador-universitario-publico"><Trophy className="mr-1 inline h-4 w-4" />Gana en primera vuelta: {nombres.join(", ")}. Superó el umbral en ambos estamentos.</div> : <div className="mt-4 border-l-4 border-slate-400 bg-slate-100 p-3 text-sm text-slate-700" data-testid="sin-ganador-universitario-publico">Sin ganador de primera vuelta: se requiere superar el 50% + 1 voto en Docentes y Estudiantes.</div>;
}

function UmbralEstamento({ candidatos, ganadores }) {
  const candidato = candidatos.find((item) => ganadores.includes(item.id));
  return candidato ? <span className="text-right text-xs text-emerald-700">{candidato.nombre} supera este estamento</span> : <span className="text-right text-xs text-slate-500">Sin umbral en este estamento</span>;
}

function Ganador({ candidatos, ganadores }) {
  const ganador = candidatos.find((candidato) => ganadores.includes(candidato.id));
  return <div className="text-right text-xs">{ganador ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Trophy className="w-3.5 h-3.5" /> {ganador.nombre}</span> : <span className="text-slate-500">Sin ganador provisional</span>}</div>;
}

function Grafica({ candidatos, tipo, compacto = false }) {
  const alto = compacto ? 220 : 300;
  if (!candidatos.length) {
    return <div className="mt-5 grid place-items-center border border-dashed border-slate-300 text-sm text-slate-500" style={{ height: alto }} data-testid="grafica-sin-candidaturas">Sin candidaturas configuradas para esta franja.</div>;
  }
  return <div className="mt-5" style={{ width: "100%", minWidth: 1, height: alto, minHeight: alto }} data-testid={`grafica-${tipo}`}><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={alto}>{tipo === "torta" ? <PieChart><Pie data={candidatos} dataKey="votos" nameKey="nombre" outerRadius="75%">{candidatos.map((candidato) => <Cell key={candidato.id} fill={candidato.color} />)}</Pie><Tooltip /></PieChart> : tipo === "lineas" ? <LineChart data={candidatos}><XAxis dataKey="nombre" hide /><YAxis /><Tooltip /><Line type="monotone" dataKey="votos" stroke="#1E3A8A" strokeWidth={3} /></LineChart> : <BarChart data={candidatos}><XAxis dataKey="nombre" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Bar dataKey="votos">{candidatos.map((candidato) => <Cell key={candidato.id} fill={candidato.color} />)}</Bar></BarChart>}</ResponsiveContainer></div>;
}

function Listado({ candidatos }) { return <div className="mt-3 space-y-2">{candidatos.map((candidato) => <div key={candidato.id} className="flex justify-between border-t border-slate-200 pt-2 text-sm"><span>{candidato.nombre}</span><strong className="font-data">{candidato.votos}</strong></div>)}</div>; }
function TarjetaAvance({ titulo, valor, porcentaje, color }) { return <div className="border border-slate-200 bg-white p-5" data-testid={`avance-${titulo.toLowerCase().replaceAll(" ", "-")}`}><div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{titulo}</div><div className="mt-2 flex items-end justify-between"><div className="font-data text-3xl font-bold" style={{ color }}>{valor}</div><div className="font-data text-sm text-slate-500">{porcentaje}%</div></div></div>; }