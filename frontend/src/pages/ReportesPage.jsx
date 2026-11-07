import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatearError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  construirFiltrosEstructura,
  filtrarAnforasPorEstructura,
} from "@/lib/electoralFilters";
import {
  ordenarAnforasNumericamente,
  ordenarCandidatosPorNumeroLista,
} from "@/lib/sorting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, FileText, Printer, RefreshCw, Search } from "lucide-react";

const numero = (valor) => (
  valor === null || valor === undefined || valor === ""
    ? "—"
    : Number(valor).toLocaleString("es-BO")
);
const porcentaje = (valor) => (
  valor === null || valor === undefined || valor === ""
    ? "—"
    : `${Number(valor).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
);

function etiquetaBase(base) {
  return ({
    solo_validos: "Votos válidos",
    validos_mas_blancos: "Válidos + blancos",
    emitidos_totales: "Total emitido",
  })[base] || base || "No especificada";
}

function errorMensaje(error) {
  return formatearError(error?.response?.data?.detail) || error?.message || "No fue posible cargar la información.";
}

function TablaCandidatos({ candidatos = [], votosCampo = "votos", porcentajeCampo = "porcentaje", equivalencia = false }) {
  const ordenados = ordenarCandidatosPorNumeroLista(candidatos);
  return (
    <div className="overflow-x-auto">
      <table className="reportes-table w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-16">Lista</th>
            <th>Candidatura</th>
            {equivalencia && <th className="text-right">Docentes reales</th>}
            {equivalencia && <th className="text-right">Equivalente estudiantil</th>}
            {equivalencia && <th className="text-right">Estudiantes reales</th>}
            <th className="text-right">{equivalencia ? "Total ponderado" : "Votos"}</th>
            <th className="text-right">Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map((candidato, indice) => (
            <tr key={candidato.id_candidato ?? `${candidato.nombre}-${indice}`}>
              <td className="font-data">{candidato.numero_lista ?? "—"}</td>
              <td>
                <div className="font-semibold text-slate-900">{candidato.nombre || "Candidatura sin nombre"}</div>
                {(candidato.sigla || candidato.partido) && (
                  <div className="mt-0.5 text-xs text-slate-500">{[candidato.sigla, candidato.partido].filter(Boolean).join(" · ")}</div>
                )}
              </td>
              {equivalencia && <td className="text-right font-data">{numero(candidato.votos_docentes_reales)}</td>}
              {equivalencia && <td className="text-right font-data">{numero(candidato.votos_docentes_equivalentes)}</td>}
              {equivalencia && <td className="text-right font-data">{numero(candidato.votos_estudiantes_reales)}</td>}
              <td className="text-right font-data font-semibold">
                {numero(equivalencia ? candidato.votos_ponderados : candidato[votosCampo])}
              </td>
              <td className="text-right font-data">
                {porcentaje(equivalencia ? candidato.porcentaje_ponderado : candidato[porcentajeCampo])}
              </td>
            </tr>
          ))}
          {!ordenados.length && (
            <tr><td colSpan={equivalencia ? 7 : 4} className="py-5 text-center text-slate-500">No hay candidaturas registradas en esta franja.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResumenVotos({ resumen }) {
  const datos = [
    ["Votos válidos", resumen?.votos_validos, null],
    ["Votos blancos", resumen?.votos_blancos, resumen?.porcentaje_blancos],
    ["Votos nulos", resumen?.votos_nulos, resumen?.porcentaje_nulos],
    ["Total emitido", resumen?.total_emitidos, null],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-slate-200 py-4 sm:grid-cols-4">
      {datos.map(([titulo, valor, porcentajeValor]) => (
        <div key={titulo}>
          <dt className="text-[10px] font-data uppercase tracking-wider text-slate-500">{titulo}</dt>
          <dd className="mt-1 font-data text-lg font-bold text-slate-900">{numero(valor)}</dd>
          {porcentajeValor !== null && porcentajeValor !== undefined && (
            <dd className="font-data text-xs text-slate-500">{porcentaje(porcentajeValor)}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function TablaEstamento({ nombre, resultado }) {
  if (!resultado) {
    return <div className="border border-dashed border-slate-300 p-4 text-sm text-slate-500">No hay datos consolidados para este estamento.</div>;
  }
  const candidatos = ordenarCandidatosPorNumeroLista(resultado.candidatos || []);
  return (
    <section className="overflow-hidden border border-slate-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Resultados por estamento</div>
          <h3 className="font-display text-lg font-bold capitalize text-slate-900">{nombre}</h3>
        </div>
        <span className="font-data text-xs text-slate-500">Base: {etiquetaBase(resultado.base_calculo)}</span>
      </div>
      <TablaCandidatos candidatos={candidatos} />
      <div className="grid grid-cols-2 gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:grid-cols-3">
        <div><span className="text-slate-500">Válidos</span><strong className="ml-2 font-data">{numero(resultado.votos_validos)}</strong></div>
        <div><span className="text-slate-500">Blancos</span><strong className="ml-2 font-data">{numero(resultado.votos_blancos)}</strong><span className="ml-1 text-xs text-slate-500">({porcentaje(resultado.porcentaje_blancos)})</span></div>
        <div><span className="text-slate-500">Nulos</span><strong className="ml-2 font-data">{numero(resultado.votos_nulos)}</strong><span className="ml-1 text-xs text-slate-500">({porcentaje(resultado.porcentaje_nulos)})</span></div>
        <div><span className="text-slate-500">Emitidos</span><strong className="ml-2 font-data">{numero(resultado.total_emitidos)}</strong></div>
      </div>
    </section>
  );
}

export default function ReportesPage() {
  const { procesoActivo } = useAuth();
  const [localizador, setLocalizador] = useState(null);
  const [cargandoFiltros, setCargandoFiltros] = useState(true);
  const [errorFiltros, setErrorFiltros] = useState("");
  const [rutaNodos, setRutaNodos] = useState([]);
  const [idRecinto, setIdRecinto] = useState("");
  const [idMesa, setIdMesa] = useState("");
  const [numeroAnfora, setNumeroAnfora] = useState("");
  const [tipoReporte, setTipoReporte] = useState("ejecutivo");
  const [reporte, setReporte] = useState(null);
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [errorReporte, setErrorReporte] = useState("");

  const cargarFiltros = useCallback(async () => {
    if (!procesoActivo?.id_eleccion) return;
    setCargandoFiltros(true);
    setErrorFiltros("");
    try {
      const { data } = await api.get(`/procesos/${encodeURIComponent(procesoActivo.id_eleccion)}/localizador-anforas`);
      setLocalizador(data);
    } catch (error) {
      setErrorFiltros(errorMensaje(error));
    } finally {
      setCargandoFiltros(false);
    }
  }, [procesoActivo?.id_eleccion]);

  useEffect(() => { cargarFiltros(); }, [cargarFiltros]);

  const estructura = useMemo(
    () => construirFiltrosEstructura(localizador || {}, rutaNodos, idRecinto),
    [localizador, rutaNodos, idRecinto],
  );
  const anforasFiltradas = useMemo(() => {
    if (!localizador) return [];
    const anforas = numeroAnfora.trim()
      ? (localizador.anforas || []).filter((item) => String(item.numero_anfora).toLowerCase().includes(numeroAnfora.trim().toLowerCase()))
      : filtrarAnforasPorEstructura(localizador.anforas || [], rutaNodos, idRecinto, idMesa);
    return ordenarAnforasNumericamente(anforas);
  }, [localizador, numeroAnfora, rutaNodos, idRecinto, idMesa]);

  const limpiarReporte = () => {
    setReporte(null);
    setErrorReporte("");
  };
  const aplicarBusquedaDirecta = (valor) => {
    limpiarReporte();
    setNumeroAnfora(valor);
    setRutaNodos([]);
    setIdRecinto("");
    setIdMesa("");
  };
  const cambiarNodo = (indice, valor) => {
    limpiarReporte();
    setNumeroAnfora("");
    setRutaNodos((actual) => [...actual.slice(0, indice), valor]);
    setIdRecinto("");
    setIdMesa("");
  };
  const cambiarRecinto = (valor) => {
    limpiarReporte();
    setNumeroAnfora("");
    setIdRecinto(valor);
    setIdMesa("");
  };
  const cambiarMesa = (valor) => {
    limpiarReporte();
    setNumeroAnfora("");
    setIdMesa(valor);
  };

  const filtroIds = useMemo(() => {
    if (numeroAnfora.trim()) return `Ánfora: ${numeroAnfora.trim()}`;
    const nombresNodos = rutaNodos.map((id) => localizador?.nodos?.find((nodo) => nodo.id === id)?.nombre_nodo).filter(Boolean);
    const recinto = localizador?.recintos?.find((item) => item.id === idRecinto)?.nombre;
    const mesa = localizador?.mesas?.find((item) => item.id === idMesa)?.numero_mesa;
    return [...nombresNodos, recinto, mesa ? `Mesa ${mesa}` : null].filter(Boolean).join(" / ") || "Todas las ánforas";
  }, [numeroAnfora, rutaNodos, localizador, idRecinto, idMesa]);

  const generarReporte = async () => {
    if (!procesoActivo?.id_eleccion) return;
    setCargandoReporte(true);
    setErrorReporte("");
    setReporte(null);
    try {
      const params = new URLSearchParams();
      if (!numeroAnfora.trim()) rutaNodos.forEach((id) => params.append("id_nodos", id));
      if (!numeroAnfora.trim() && idRecinto) params.append("id_recinto", idRecinto);
      if (!numeroAnfora.trim() && idMesa) params.append("id_mesa", idMesa);
      if (numeroAnfora.trim()) params.append("numero_anfora", numeroAnfora.trim());
      const query = params.toString();
      const { data } = await api.get(`/admin/procesos/${encodeURIComponent(procesoActivo.id_eleccion)}/reportes${query ? `?${query}` : ""}`);
      setReporte(data);
      if (data?.proceso?.tipo !== "universitaria" && tipoReporte !== "ejecutivo") setTipoReporte("ejecutivo");
    } catch (error) {
      setErrorReporte(errorMensaje(error));
    } finally {
      setCargandoReporte(false);
    }
  };

  const esUniversitaria = (reporte?.proceso?.tipo || procesoActivo?.tipo) === "universitaria";
  const imprimir = () => window.print();

  return (
    <div className="reportes-page mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8" data-testid="reportes-page">
      <div className="reportes-controls">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="stre-badge bg-[#EFF6FF] font-data text-[#1E3A8A]">{procesoActivo?.id_eleccion}</span>
              <span className="text-xs font-data uppercase tracking-wider text-slate-500">Informes de consolidación</span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-slate-900">Reportes</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Consulte resultados consolidados con filtros trazables por estructura, recinto, mesa o número de ánfora.</p>
          </div>
          <Button variant="outline" onClick={cargarFiltros} disabled={cargandoFiltros} data-testid="actualizar-filtros-reportes">
            <RefreshCw className={`h-4 w-4 ${cargandoFiltros ? "animate-spin" : ""}`} /> Actualizar filtros
          </Button>
        </header>

        <section className="mt-5 border border-slate-200 bg-white p-4 sm:p-5" aria-label="Filtros de reportes">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[#1E3A8A]" />
            <h2 className="font-display text-base font-bold text-slate-900">Alcance del reporte</h2>
          </div>
          {cargandoFiltros ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="cargando-filtros-reportes">
              {[1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse bg-slate-100" />)}
            </div>
          ) : errorFiltros ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="error-filtros-reportes">
              <span>{errorFiltros}</span><Button variant="outline" size="sm" onClick={cargarFiltros}>Reintentar</Button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-semibold text-slate-600">
                  Búsqueda directa por ánfora
                  <Input className="mt-1 h-10 font-data" value={numeroAnfora} onChange={(event) => aplicarBusquedaDirecta(event.target.value)} placeholder="Número de ánfora" data-testid="buscar-numero-anfora-reportes" />
                </label>
                {estructura.niveles.map((nivel) => (
                  <label key={nivel.indice} className="text-xs font-semibold text-slate-600">
                    {nivel.etiqueta}
                    <Select value={rutaNodos[nivel.indice] || ""} onValueChange={(valor) => cambiarNodo(nivel.indice, valor)} disabled={Boolean(numeroAnfora.trim())}>
                      <SelectTrigger className="mt-1 h-10" data-testid={nivel.indice === 0 ? "filtro-nodo-reportes" : `filtro-nodo-reportes-${nivel.indice}`}><SelectValue placeholder={nivel.etiqueta} /></SelectTrigger>
                      <SelectContent>{nivel.nodos.map((nodo) => <SelectItem key={nodo.id} value={nodo.id}>{nodo.nombre_nodo}</SelectItem>)}</SelectContent>
                    </Select>
                  </label>
                ))}
                <label className="text-xs font-semibold text-slate-600">
                  Recinto
                  <Select value={idRecinto} onValueChange={cambiarRecinto} disabled={!estructura.idNodoTerminal || Boolean(numeroAnfora.trim())}>
                    <SelectTrigger className="mt-1 h-10" data-testid="filtro-recinto-reportes"><SelectValue placeholder="Todos los recintos" /></SelectTrigger>
                    <SelectContent>{estructura.recintos.map((recinto) => <SelectItem key={recinto.id} value={recinto.id}>{recinto.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Mesa
                  <Select value={idMesa} onValueChange={cambiarMesa} disabled={!idRecinto || Boolean(numeroAnfora.trim())}>
                    <SelectTrigger className="mt-1 h-10" data-testid="filtro-mesa-reportes"><SelectValue placeholder="Todas las mesas" /></SelectTrigger>
                    <SelectContent>{estructura.mesas.map((mesa) => <SelectItem key={mesa.id} value={mesa.id}>Mesa {mesa.numero_mesa}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>{numero(anforasFiltradas.length)} ánforas coinciden con el filtro actual.</span>
                {numeroAnfora.trim() && <span className="font-medium text-[#1E3A8A]">La búsqueda directa reemplaza los filtros jerárquicos.</span>}
              </div>
            </>
          )}
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de reporte">
            {[
              ["ejecutivo", "Resumen ejecutivo"],
              ...(esUniversitaria ? [["estamentos", "Votos por estamento"], ["equivalencia", "Equivalencia docente-estudiante"]] : []),
            ].map(([tipo, texto]) => (
              <button key={tipo} type="button" onClick={() => setTipoReporte(tipo)} className={`border px-3 py-2 text-sm font-semibold transition ${tipoReporte === tipo ? "border-[#1E3A8A] bg-[#1E3A8A] text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"}`} aria-pressed={tipoReporte === tipo} data-testid={`tipo-reporte-${tipo}`}>
                {texto}
              </button>
            ))}
          </div>
          <Button onClick={generarReporte} disabled={cargandoReporte || cargandoFiltros || Boolean(errorFiltros)} data-testid="generar-reporte">
            <FileText className="h-4 w-4" /> {cargandoReporte ? "Generando…" : "Generar reporte"}
          </Button>
        </div>
      </div>

      {errorReporte && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert" data-testid="error-reporte">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{errorReporte}</div>
          <Button variant="outline" size="sm" onClick={generarReporte}>Reintentar</Button>
        </div>
      )}
      {cargandoReporte && (
        <div className="mt-6 space-y-3" aria-live="polite" data-testid="cargando-reporte">
          <div className="h-8 w-1/3 animate-pulse bg-slate-200" />
          <div className="h-32 animate-pulse bg-white" />
          <div className="h-48 animate-pulse bg-white" />
        </div>
      )}
      {!reporte && !cargandoReporte && !errorReporte && (
        <div className="mt-6 border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center" data-testid="estado-inicial-reporte">
          <FileText className="mx-auto h-7 w-7 text-slate-400" />
          <h2 className="mt-3 font-display text-lg font-bold text-slate-800">Reporte aún no generado</h2>
          <p className="mt-1 text-sm text-slate-500">Confirme el alcance y genere un informe con los datos consolidados disponibles.</p>
        </div>
      )}

      {reporte && !cargandoReporte && (
        <div className="reportes-print-area mt-6" data-testid="contenido-reporte">
          <div className="reportes-print-heading">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#1E3A8A] pb-4">
              <div>
                <div className="text-[10px] font-data uppercase tracking-[0.18em] text-[#1E3A8A]">STRE · Sistema de Trazabilidad de Resultados Electorales</div>
                <h2 className="mt-2 font-display text-2xl font-extrabold text-slate-900">{reporte.proceso?.nombre || procesoActivo?.nombre || "Elección"}</h2>
                <div className="mt-1 text-sm text-slate-600">Elección {reporte.proceso?.id_eleccion || procesoActivo?.id_eleccion} · {tipoReporte === "ejecutivo" ? "Resumen ejecutivo" : tipoReporte === "estamentos" ? "Votos por estamento" : "Equivalencia docente-estudiante"}</div>
              </div>
              <Button variant="outline" onClick={imprimir} className="reportes-print-button"><Printer className="h-4 w-4" /> Imprimir / Guardar como PDF</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
              <span><strong className="text-slate-800">Filtros:</strong> {filtroIds}</span>
              <span><strong className="text-slate-800">Ánforas encontradas:</strong> {numero(reporte.filtros?.anforas_encontradas)}</span>
              <span><strong className="text-slate-800">Actas consolidadas:</strong> {numero(reporte.filtros?.actas_consolidadas)}</span>
              <span><strong className="text-slate-800">Ánforas faltantes:</strong> {numero(reporte.filtros?.anforas_faltantes)}</span>
            </div>
          </div>

          {Number(reporte.filtros?.actas_consolidadas || 0) === 0 && (
            <div className="my-4 flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="sin-actas-consolidadas">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div><strong>No hay actas consolidadas para este alcance.</strong> Se muestran los valores entregados por el servicio; no se han sustituido ni estimado resultados.</div>
            </div>
          )}

          {!reporte.franjas?.length && (
            <div className="my-4 border border-dashed border-slate-300 p-5 text-sm text-slate-600" data-testid="sin-franjas-reporte">
              El servicio no devolvió franjas para estos filtros. Revise el alcance o la disponibilidad de actas consolidadas.
            </div>
          )}

          <div className="mt-5 space-y-5">
            {(reporte.franjas || []).map((franja) => {
              const resumen = franja.resumen || {};
              const ponderacion = franja.ponderacion;
              return (
                <article key={franja.id_franja} className="reportes-franja border border-slate-200 bg-white" data-testid={`franja-reporte-${franja.id_franja}`}>
                  <header className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{franja.nombre_papeleta || "Papeleta"} · {franja.tipo_voto || "Tipo de voto no indicado"}</div>
                        <h3 className="mt-1 font-display text-lg font-bold text-slate-900">{franja.titulo || "Franja electoral"}</h3>
                      </div>
                      <div className="text-right text-xs text-slate-600">
                        <div>Base configurada</div><strong className="font-data text-slate-900">{etiquetaBase(franja.base_calculo || resumen.base_calculo)}</strong>
                      </div>
                    </div>
                  </header>

                  {tipoReporte === "ejecutivo" && (
                    <div className="space-y-4 p-4 sm:p-5">
                      {esUniversitaria ? (
                        <div className="border-l-2 border-[#1E3A8A] bg-[#EFF6FF] px-3 py-2 text-sm text-slate-700">
                          Resultado ponderado para igualar los votos emitidos por ambos estamentos. Los votos y porcentajes corresponden a la ponderación configurada para esta franja.
                        </div>
                      ) : null}
                      {esUniversitaria && ponderacion?.votos_estudiantes_por_voto_docente == null && (
                        <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid={`ponderacion-no-disponible-resumen-${franja.id_franja}`}>
                          {ponderacion?.mensaje || "La equivalencia no puede calcularse hasta que ambos estamentos tengan votos emitidos."}
                        </div>
                      )}
                      <TablaCandidatos
                        candidatos={esUniversitaria ? (ponderacion?.candidatos || []) : (resumen.candidatos || [])}
                        votosCampo={esUniversitaria ? "votos_ponderados" : "votos"}
                        porcentajeCampo={esUniversitaria ? "porcentaje_ponderado" : "porcentaje"}
                        equivalencia={esUniversitaria}
                      />
                      <ResumenVotos resumen={resumen} />
                      <div className="text-xs text-slate-500">Base de cálculo configurada: <strong className="text-slate-700">{etiquetaBase(franja.base_calculo || resumen.base_calculo)}</strong>{resumen.base_votos !== undefined && <> · Base de votos reportada: <strong className="font-data text-slate-700">{numero(resumen.base_votos)}</strong></>}</div>
                    </div>
                  )}

                  {tipoReporte === "estamentos" && esUniversitaria && (
                    <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-2">
                      <TablaEstamento nombre="Docentes" resultado={franja.por_estamento?.docente} />
                      <TablaEstamento nombre="Estudiantes" resultado={franja.por_estamento?.estudiante} />
                    </div>
                  )}

                  {tipoReporte === "equivalencia" && esUniversitaria && (
                    <div className="space-y-4 p-4 sm:p-5">
                      {ponderacion?.votos_estudiantes_por_voto_docente == null ? (
                        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid={`ponderacion-no-disponible-${franja.id_franja}`}>
                          {ponderacion?.mensaje || "La equivalencia docente-estudiante no está configurada para esta franja. No se puede mostrar un factor ni calcular equivalencias."}
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 gap-3 border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-3">
                            <div><div className="text-xs text-slate-500">Factor estudiantes por voto docente</div><strong className="font-data text-lg">{numero(ponderacion.votos_estudiantes_por_voto_docente)}</strong></div>
                            <div><div className="text-xs text-slate-500">Votos emitidos docentes</div><strong className="font-data text-lg">{numero(ponderacion.votos_emitidos_docentes)}</strong></div>
                            <div><div className="text-xs text-slate-500">Votos emitidos estudiantes</div><strong className="font-data text-lg">{numero(ponderacion.votos_emitidos_estudiantes)}</strong></div>
                          </div>
                          {ponderacion.regla && <p className="text-sm text-slate-600">{ponderacion.regla}{ponderacion.unidad ? ` · Unidad: ${ponderacion.unidad}` : ""}</p>}
                          <TablaCandidatos candidatos={ponderacion.candidatos || []} equivalencia />
                          {ponderacion.base_votos_ponderada !== undefined && <p className="text-xs text-slate-500">Base ponderada: <strong className="font-data text-slate-800">{numero(ponderacion.base_votos_ponderada)}</strong></p>}
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <footer className="mt-5 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
            Informe de consulta · STRE · Los valores corresponden al consolidado devuelto para el alcance indicado.
          </footer>
        </div>
      )}
    </div>
  );
}
