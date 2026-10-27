import { useCallback, useEffect, useState } from "react";
import { Radio, Trophy } from "lucide-react";
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CabeceraPublica } from "@/pages/TrepPublicoPage";

const colores = ["#1E3A8A", "#059669", "#D97706", "#BE123C", "#7C3AED", "#0F766E"];

export default function ResultadosPublicosPage() {
  const [procesos, setProcesos] = useState([]);
  const [idEleccion, setIdEleccion] = useState("");
  const [datos, setDatos] = useState(null);
  const [tipoGrafica, setTipoGrafica] = useState("barras");
  const [conexion, setConexion] = useState("conectando");

  const cargar = useCallback(async () => {
    if (!idEleccion) return;
    const { data } = await api.get(`/publico/procesos/${idEleccion}/resultados`);
    setDatos(data);
  }, [idEleccion]);

  useEffect(() => {
    api.get("/publico/procesos").then(({ data }) => {
      setProcesos(data);
      setIdEleccion(data[0]?.id_eleccion || "");
    });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!idEleccion) return undefined;
    const base = (process.env.REACT_APP_BACKEND_URL || window.location.origin).replace(/^http/, "ws");
    const socket = new WebSocket(`${base}/api/ws/publico/${idEleccion}`);
    socket.onopen = () => setConexion("en vivo");
    socket.onmessage = () => cargar();
    socket.onclose = () => setConexion("reconectando");
    socket.onerror = () => setConexion("reconectando");
    const pulso = window.setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send("pulso"); }, 25000);
    return () => { window.clearInterval(pulso); socket.close(); };
  }, [cargar, idEleccion]);

  const esUniversitaria = datos?.proceso?.tipo === "universitaria";
  return <div className="min-h-screen bg-slate-100" data-testid="resultados-publicos-page"><CabeceraPublica /><main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-data uppercase tracking-widest text-emerald-700"><Radio className="w-3 h-3" /> {conexion}</div><h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900">Resultados electorales</h1><p className="mt-1 text-slate-600">Datos de actas consolidadas y bloqueadas.</p></div><div className="flex w-full flex-wrap gap-2 lg:w-auto"><Select value={idEleccion} onValueChange={setIdEleccion}><SelectTrigger className="w-full sm:w-[420px]" data-testid="seleccionar-eleccion-resultados-publicos"><SelectValue placeholder="Elección" /></SelectTrigger><SelectContent>{procesos.map((proceso) => <SelectItem key={proceso.id_eleccion} value={proceso.id_eleccion}>{proceso.nombre}</SelectItem>)}</SelectContent></Select><Select value={tipoGrafica} onValueChange={setTipoGrafica}><SelectTrigger className="w-full sm:w-[150px]" data-testid="tipo-grafica-publica"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="barras">Barras</SelectItem><SelectItem value="torta">Torta</SelectItem><SelectItem value="lineas">Líneas</SelectItem></SelectContent></Select></div></div>{!datos ? <div className="mt-8 border border-slate-200 bg-white p-8 text-sm text-slate-400" data-testid="cargando-resultados-publicos">Cargando resultados…</div> : <><section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="avance-publico-anforas"><TarjetaAvance titulo="Ánforas totales" valor={datos.anforas.total} porcentaje="100" color="#1E3A8A" /><TarjetaAvance titulo="Actas consolidadas" valor={datos.anforas.escrutadas} porcentaje={datos.anforas.porcentaje_escrutadas} color="#059669" /><TarjetaAvance titulo="Actas faltantes" valor={datos.anforas.faltantes} porcentaje={datos.anforas.porcentaje_faltantes} color="#D97706" /></section><section className="mt-8 space-y-5">{esUniversitaria ? <ResultadosUniversitarios datos={datos.universitario} tipoGrafica={tipoGrafica} /> : Object.entries(datos.resultados).map(([idFranja, resultado]) => <ResultadoGeneral key={idFranja} resultado={resultado} tipoGrafica={tipoGrafica} />)}</section></>}</main></div>;
}

function ResultadoGeneral({ resultado, tipoGrafica }) {
  const candidatos = Object.entries(resultado.candidatos || {}).map(([id, candidato], indice) => ({ id, ...candidato, color: candidato.color_hex || colores[indice % colores.length] }));
  const ganadores = resultado.ganadores_provisionales || [];
  return <article className="border border-slate-200 bg-white p-4 sm:p-6" data-testid={`grafica-publica-${resultado.titulo}`}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{resultado.nombre_papeleta}</div><h2 className="mt-1 font-display text-xl font-bold">{resultado.titulo}</h2><div className="mt-1 text-xs text-slate-500">Base {resultado.base_votos} · Umbral {resultado.umbral_primera_vuelta}</div></div><Ganador candidatos={candidatos} ganadores={ganadores} /></div><Grafica candidatos={candidatos} tipo={tipoGrafica} /><Listado candidatos={candidatos} /></article>;
}

function ResultadosUniversitarios({ datos, tipoGrafica }) {
  const franjas = Object.entries(datos?.por_estamento?.docente || {});
  return franjas.map(([id, docente]) => <article key={id} className="border border-slate-200 bg-white p-4 sm:p-6" data-testid={`resultado-universitario-publico-${id}`}><div className="flex flex-wrap justify-between gap-4"><div><div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Franja universitaria</div><h2 className="mt-1 font-display text-xl font-bold">{docente.titulo}</h2></div><div className="text-xs text-slate-500">Base: {docente.base_calculo?.replaceAll("_", " ")}</div></div><GanadorUniversitarioPublico resultado={datos?.por_franja?.[id]} /><div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2"><ResultadoEstamento nombre="Docentes" resultado={docente} tipoGrafica={tipoGrafica} /><ResultadoEstamento nombre="Estudiantes" resultado={datos?.por_estamento?.estudiante?.[id]} tipoGrafica={tipoGrafica} /></div></article>);
}

function ResultadoEstamento({ nombre, resultado, tipoGrafica }) {
  const candidatos = Object.entries(resultado?.candidatos || {}).map(([id, candidato], indice) => ({ id, ...candidato, color: colores[indice % colores.length] }));
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