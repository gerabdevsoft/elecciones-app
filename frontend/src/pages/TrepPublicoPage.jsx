import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { ordenarAnforasNumericamente } from "@/lib/sorting";
import {
  construirFiltrosEstructura,
  filtrarAnforasPorEstructura,
} from "@/lib/electoralFilters";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileImage,
  ImageOff,
  RotateCcw,
  ScanLine,
  Search,
  Vote,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const fechaLegible = (valor) => {
  if (!valor) return "Fecha no disponible";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(fecha);
};

const nombreTipoVoto = { docente: "Docente", estudiante: "Estudiante" };
const BADGE_TIPO_VOTO = {
  nominal: "bg-blue-50 text-blue-700",
  lista: "bg-amber-50 text-amber-800",
  plancha_recta: "bg-emerald-50 text-emerald-700",
  estamentario: "bg-purple-50 text-purple-700",
};

const totalesFranja = (conteo) => {
  const validos = (conteo.candidatos || []).reduce((suma, candidato) => suma + (Number(candidato.votos) || 0), 0);
  const blancos = Number(conteo.votos_blancos) || 0;
  const nulos = Number(conteo.votos_nulos) || 0;
  return { validos, total: validos + blancos + nulos };
};

export default function TrepPublicoPage() {
  const [procesos, setProcesos] = useState([]);
  const [idEleccion, setIdEleccion] = useState("");
  const [localizador, setLocalizador] = useState(null);
  const [numeroDirecto, setNumeroDirecto] = useState("");
  const [rutaNodos, setRutaNodos] = useState([]);
  const [idRecinto, setIdRecinto] = useState("");
  const [idMesa, setIdMesa] = useState("");
  const [acta, setActa] = useState(null);
  const [errorActa, setErrorActa] = useState("");
  const [cargandoActa, setCargandoActa] = useState(false);
  const [anforaSeleccionadaId, setAnforaSeleccionadaId] = useState("");
  const [listaContraida, setListaContraida] = useState(false);
  const solicitudActaRef = useRef(0);

  useEffect(() => {
    api.get("/publico/procesos").then(({ data }) => {
      setProcesos(data);
      setIdEleccion(data[0]?.id_eleccion || "");
    });
  }, []);

  useEffect(() => {
    if (!idEleccion) return;
    setActa(null);
    setNumeroDirecto("");
    setRutaNodos([]);
    setIdRecinto("");
    setIdMesa("");
    api.get(`/publico/procesos/${idEleccion}/localizador`).then(({ data }) => setLocalizador(data));
  }, [idEleccion]);

  useEffect(() => {
    solicitudActaRef.current += 1;
    setActa(null);
    setErrorActa("");
    setCargandoActa(false);
    setAnforaSeleccionadaId("");
    setListaContraida(false);
  }, [numeroDirecto, rutaNodos, idRecinto, idMesa]);

  const filtrosEstructura = useMemo(
    () => construirFiltrosEstructura(localizador || {}, rutaNodos, idRecinto),
    [localizador, rutaNodos, idRecinto],
  );
  const { niveles: nivelesNodos, idNodoTerminal, recintos, mesas } = filtrosEstructura;
  const anforas = useMemo(() => ordenarAnforasNumericamente(
    filtrarAnforasPorEstructura(localizador?.anforas || [], rutaNodos, idRecinto, idMesa)
      .filter((anfora) => {
        const coincideDirecta = numeroDirecto.trim()
          ? String(anfora.numero_anfora).toLowerCase().includes(numeroDirecto.trim().toLowerCase())
          : true;
        return coincideDirecta;
      }),
  ), [idMesa, idRecinto, localizador, numeroDirecto, rutaNodos]);

  const seleccionarNodo = (indice, idNodo) => {
    setRutaNodos((anterior) => [...anterior.slice(0, indice), idNodo]);
    setIdRecinto("");
    setIdMesa("");
    setNumeroDirecto("");
  };

  const abrirActa = async (anfora) => {
    const idSolicitud = solicitudActaRef.current + 1;
    solicitudActaRef.current = idSolicitud;
    setAnforaSeleccionadaId(anfora.id);
    setListaContraida(true);
    setActa(null);
    setErrorActa("");
    setCargandoActa(true);
    try {
      const { data } = await api.get(`/publico/procesos/${idEleccion}/actas/${anfora.id}`);
      if (solicitudActaRef.current === idSolicitud) setActa(data);
    } catch (error) {
      if (solicitudActaRef.current === idSolicitud) {
        setErrorActa("No fue posible cargar el acta consolidada.");
      }
    } finally {
      if (solicitudActaRef.current === idSolicitud) setCargandoActa(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100" data-testid="trep-publico-page">
      <CabeceraPublica />
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <section className="mb-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-data uppercase tracking-widest text-blue-700">
                <CheckCircle2 className="h-4 w-4 text-blue-700" />
                STRE / Consulta pública
              </div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Actas consolidadas</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                Consulte actas consolidadas, su imagen y los resultados transcritos.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 lg:self-auto">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-data text-2xl font-semibold leading-none text-blue-900">
                  {localizador ? localizador.anforas.length : "—"}
                </div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Actas consolidadas</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 border border-slate-200 bg-white p-4 sm:p-6" data-testid="filtros-publicos-actas">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
            <div>
              <Label className="text-[10px] font-data uppercase tracking-widest text-slate-500">Elección</Label>
              <Select value={idEleccion} onValueChange={setIdEleccion}>
                <SelectTrigger className="mt-1" data-testid="seleccionar-eleccion-publica"><SelectValue placeholder="Seleccione una elección" /></SelectTrigger>
                <SelectContent>{procesos.map((proceso) => <SelectItem key={proceso.id_eleccion} value={proceso.id_eleccion}>{proceso.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-data uppercase tracking-widest text-slate-500">Búsqueda directa por ánfora</Label>
              <Input
                value={numeroDirecto}
                onChange={(evento) => {
                  setNumeroDirecto(evento.target.value);
                  setRutaNodos([]);
                  setIdRecinto("");
                  setIdMesa("");
                }}
                className="mt-1 font-data"
                placeholder="Número de ánfora"
                data-testid="buscar-acta-publica"
              />
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="mb-2 text-[10px] font-data uppercase tracking-widest text-slate-500">O filtre por estructura electoral</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {nivelesNodos.map((nivel) => (
                <Select key={nivel.indice} value={rutaNodos[nivel.indice] || ""} onValueChange={(valor) => seleccionarNodo(nivel.indice, valor)}>
                  <SelectTrigger data-testid={`filtro-publico-nodo-${nivel.indice}`}><SelectValue placeholder={nivel.etiqueta} /></SelectTrigger>
                  <SelectContent>{nivel.nodos.map((nodo) => <SelectItem key={nodo.id} value={nodo.id}>{nodo.nombre_nodo}</SelectItem>)}</SelectContent>
                </Select>
              ))}
              <Select value={idRecinto} onValueChange={(valor) => { setIdRecinto(valor); setIdMesa(""); setNumeroDirecto(""); }} disabled={!idNodoTerminal}>
                <SelectTrigger data-testid="filtro-publico-recinto"><SelectValue placeholder="Recinto" /></SelectTrigger>
                <SelectContent>{recintos.map((recinto) => <SelectItem key={recinto.id} value={recinto.id}>{recinto.nombre}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={idMesa} onValueChange={(valor) => { setIdMesa(valor); setNumeroDirecto(""); }} disabled={!idRecinto}>
                <SelectTrigger data-testid="filtro-publico-mesa"><SelectValue placeholder="Mesa" /></SelectTrigger>
                <SelectContent>{mesas.map((mesa) => <SelectItem key={mesa.id} value={mesa.id}>Mesa {mesa.numero_mesa}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className={`mt-6 grid grid-cols-1 items-start gap-6 ${listaContraida ? "lg:grid-cols-[104px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(240px,0.65fr)_minmax(0,2fr)]"}`}>
          {listaContraida ? (
            <div className="overflow-hidden border border-slate-200 bg-white shadow-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setListaContraida(false)}
                aria-label="Mostrar actas consolidadas"
                title="Mostrar actas consolidadas"
                className="flex h-auto w-full items-center justify-between gap-2 px-3 py-3 text-xs text-slate-700 hover:bg-blue-50 lg:flex-col lg:justify-center lg:py-5"
              >
                <span className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 rotate-180 text-blue-700" />
                  <span className="lg:hidden">Mostrar actas</span>
                  <span className="hidden lg:inline">Actas</span>
                </span>
                <span className="font-data text-lg font-bold text-blue-900">{anforas.length}</span>
              </Button>
            </div>
          ) : (
            <section className="overflow-hidden border border-slate-200 bg-white shadow-sm" data-testid="lista-actas-publicas">
              <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500">Bandeja pública</p>
                  <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-slate-900">Actas consolidadas</h2>
                </div>
                <div className="flex items-center gap-2 font-data text-sm font-bold text-blue-900">
                  <Search className="h-4 w-4 text-blue-700" />
                  {anforas.length}
                </div>
              </header>
              <div className="max-h-[720px] divide-y divide-slate-200 overflow-y-auto">
                {anforas.map((anfora) => {
                  const mesa = (localizador?.mesas || []).find((item) => item.id === anfora.id_mesa);
                  const recinto = (localizador?.recintos || []).find((item) => item.id === anfora.id_recinto);
                  const tipoVoto = nombreTipoVoto[mesa?.tipo_mesa];
                  const activa = anforaSeleccionadaId === anfora.id;
                  return (
                    <button
                      key={anfora.id}
                      type="button"
                      onClick={() => abrirActa(anfora)}
                      aria-current={activa ? "true" : undefined}
                      className={`relative block w-full px-4 py-4 text-left transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:px-5 ${activa ? "bg-blue-50" : "bg-white"}`}
                      data-testid={`abrir-acta-publica-${anfora.id}`}
                    >
                      <span className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-r ${activa ? "bg-blue-700" : "bg-transparent"}`} />
                      <div className="font-data text-xs font-bold text-slate-900">Ánfora {anfora.numero_anfora}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{anfora.nombre}</div>
                      <div className="mt-1 text-xs text-slate-500">Mesa {mesa?.numero_mesa || "—"} · {recinto?.nombre || "—"}</div>
                      {tipoVoto ? <div className="mt-1 text-[10px] font-data uppercase text-blue-700">Tipo de voto: {tipoVoto}</div> : null}
                    </button>
                  );
                })}
                {localizador && anforas.length === 0 ? (
                  <div className="p-4 text-sm text-slate-400">No existen actas consolidadas con estos filtros.</div>
                ) : null}
              </div>
            </section>
          )}

          <DetalleActaPublica
            key={anforaSeleccionadaId || "sin-acta"}
            acta={acta}
            error={errorActa}
            cargando={cargandoActa}
          />
        </section>
      </main>
    </div>
  );
}

function DetalleActaPublica({ acta, error, cargando }) {
  const [zoom, setZoom] = useState(1);
  const [rotacion, setRotacion] = useState(0);

  if (error) {
    return <div className="border border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-800" data-testid="error-acta-publica">{error}</div>;
  }
  if (cargando) {
    return <div className="min-h-[440px] animate-pulse border border-slate-200 bg-white p-8" data-testid="cargando-acta-publica">
      <div className="h-7 w-2/5 rounded bg-slate-200" />
      <div className="mt-4 h-4 w-3/5 rounded bg-slate-100" />
      <div className="mt-8 h-64 rounded bg-slate-100" />
    </div>;
  }
  if (!acta) {
    return <div className="flex min-h-[440px] flex-col items-center justify-center border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400" data-testid="acta-publica-vacia">
      <FileImage className="mb-3 h-10 w-10 text-slate-300" />
      Seleccione un acta consolidada para ver la imagen y sus datos de solo lectura.
    </div>;
  }

  const conteos = acta.conteos || [];
  const papeletas = acta.papeletas?.length
    ? acta.papeletas
    : [...new Map(conteos.map((conteo) => [
      conteo.id_papeleta || conteo.papeleta,
      { id_papeleta: conteo.id_papeleta || conteo.papeleta, nombre: conteo.papeleta },
    ])).values()];
  const urlImagen = acta.imagen_url
    ? (/^https?:\/\//i.test(acta.imagen_url)
      ? acta.imagen_url
      : `${process.env.REACT_APP_BACKEND_URL || ""}${acta.imagen_url}`)
    : "";

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="detalle-acta-publica">
      <header className="flex flex-col gap-4 border-b border-blue-200 bg-blue-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-data font-bold uppercase tracking-[0.17em] text-blue-700">Acta consolidada</p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-slate-900">
            Mesa {acta.numero_mesa ?? "—"}
          </h2>
          <p className="mt-1 text-xs text-slate-600">Enviada {fechaLegible(acta.enviado_en || acta.actualizado_en)}</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800 sm:self-auto">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          Consolidada y bloqueada
        </div>
      </header>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="flex h-[720px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-inner" data-testid="panel-imagen-acta-publica">
            <div className="flex items-center justify-between border-b border-slate-800 p-3 text-white">
              <div className="flex items-center gap-2 text-xs font-data uppercase tracking-widest">
                <ScanLine className="h-4 w-4 text-blue-400" />
                Acta escaneada
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label="Reducir imagen" className="text-white hover:bg-white/10" onClick={() => setZoom((valor) => Math.max(0.4, valor - 0.2))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center font-data text-xs text-white">{Math.round(zoom * 100)}%</span>
                <Button type="button" size="icon" variant="ghost" aria-label="Ampliar imagen" className="text-white hover:bg-white/10" onClick={() => setZoom((valor) => Math.min(3, valor + 0.2))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Restablecer imagen" className="text-white hover:bg-white/10" onClick={() => { setZoom(1); setRotacion(0); }}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Girar imagen" className="text-white hover:bg-white/10" onClick={() => setRotacion((valor) => (valor + 90) % 360)}>
                  ↻
                </Button>
              </div>
            </div>
            <div className="acta-canvas relative flex flex-1 items-center justify-center overflow-auto p-6">
              {urlImagen ? (
                <img
                  src={urlImagen}
                  alt={`Acta consolidada de la mesa ${acta.numero_mesa ?? ""}`}
                  style={{ transform: `scale(${zoom}) rotate(${rotacion}deg)`, transition: "transform 200ms ease" }}
                  className="max-w-full origin-center border border-slate-700 shadow-2xl"
                  data-testid="imagen-acta-publica"
                />
              ) : (
                <div className="text-center text-slate-500">
                  <ImageOff className="mx-auto mb-4 h-16 w-16 opacity-60" />
                  <div className="font-data text-xs uppercase tracking-widest">Imagen no disponible</div>
                </div>
              )}
            </div>
          </section>

          <section className="h-[720px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="panel-votos-acta-publica">
            <div className="mb-6 border border-blue-200 bg-blue-50 p-4" data-testid="cabecera-anfora-publica">
              <div className="text-[10px] font-data uppercase tracking-widest text-blue-700">Ánfora seleccionada</div>
              <div className="mt-2 font-data text-lg font-bold text-slate-900">Ánfora {acta.numero_anfora ?? "—"}</div>
              <div className="mt-1 text-sm text-slate-600">{acta.nombre_anfora || ""}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-data text-slate-600">
                <span>Mesa {acta.numero_mesa ?? "—"}</span>
                <span>·</span>
                <span>{acta.recinto || "Recinto no especificado"}</span>
                {nombreTipoVoto[acta.tipo_mesa] ? (
                  <>
                    <span>·</span>
                    <span className="stre-badge bg-blue-50 text-blue-700" data-testid="tipo-voto-universitario-publico">
                      Tipo de voto: {nombreTipoVoto[acta.tipo_mesa]}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-blue-200 pt-3" data-testid="votantes-habilitados-publico">
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-800">Votantes habilitados en esta ánfora</span>
                {acta.cantidad_votantes == null ? (
                  <span className="text-sm font-bold text-red-700">Cantidad sin registrar</span>
                ) : (
                  <span className="font-data text-xl font-bold text-blue-900">{acta.cantidad_votantes}</span>
                )}
              </div>
            </div>

            {papeletas.length ? (
              <Tabs key={acta.id_anfora || acta.numero_anfora} defaultValue={papeletas[0]?.id_papeleta}>
                <TabsList className="h-auto w-full flex-wrap" data-testid="tabs-papeletas-publicas">
                  {papeletas.map((papeleta) => (
                    <TabsTrigger key={papeleta.id_papeleta} value={papeleta.id_papeleta} className="text-xs">
                      {papeleta.nombre}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {papeletas.map((papeleta) => {
                  const franjas = conteos.filter((conteo) => (
                    conteo.id_papeleta
                      ? conteo.id_papeleta === papeleta.id_papeleta
                      : conteo.papeleta === papeleta.nombre
                  ));
                  return (
                    <TabsContent key={papeleta.id_papeleta} value={papeleta.id_papeleta} className="mt-4 space-y-6">
                      {franjas.map((franja) => {
                        const totales = totalesFranja(franja);
                        const votantes = Number.isInteger(acta.cantidad_votantes) ? acta.cantidad_votantes : null;
                        return (
                          <div key={franja.id_franja || `${papeleta.id_papeleta}-${franja.franja}`} className="overflow-hidden rounded-lg border border-slate-200">
                            <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-2" style={{ background: franja.color_franja || "#F8FAFC" }}>
                              <div className="text-sm font-bold text-slate-900">{franja.franja}</div>
                              <div className="flex items-center gap-1">
                                <span className={`stre-badge ${BADGE_TIPO_VOTO[franja.tipo_voto] || "bg-slate-100 text-slate-600"}`}>
                                  {(franja.tipo_voto || "nominal").replaceAll("_", " ")}
                                </span>
                                <span className="font-data text-[10px] text-slate-500">{franja.calcular_porcentaje_sobre?.replaceAll("_", " ")}</span>
                              </div>
                            </div>
                            <div className="space-y-2 p-3">
                              {(franja.candidatos || []).map((candidato, indice) => (
                                <div key={candidato.id_candidato || `${franja.id_franja}-${indice}`} className="flex items-center gap-3 rounded-md border border-slate-100 p-2">
                                  <div className="h-8 w-2 shrink-0 rounded-sm" style={{ background: candidato.color_hex || "#94A3B8" }} />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-slate-900">{candidato.nombre}</div>
                                    {candidato.partido ? (
                                      <div className="font-data text-[10px] uppercase tracking-widest text-slate-500">{candidato.sigla || candidato.partido}</div>
                                    ) : null}
                                  </div>
                                  <Input type="number" value={Number(candidato.votos) || 0} disabled readOnly className="w-24 text-right font-data font-bold" />
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-3 p-3 pt-0">
                              {franja.permite_blancos !== false ? (
                                <div>
                                  <Label className="font-data text-[10px] uppercase tracking-widest text-slate-500">Votos Blancos</Label>
                                  <Input type="number" value={Number(franja.votos_blancos) || 0} disabled readOnly className="font-data font-bold" />
                                </div>
                              ) : null}
                              {franja.permite_nulos !== false ? (
                                <div>
                                  <Label className="font-data text-[10px] uppercase tracking-widest text-slate-500">Votos Nulos</Label>
                                  <Input type="number" value={Number(franja.votos_nulos) || 0} disabled readOnly className="font-data font-bold" />
                                </div>
                              ) : null}
                            </div>
                            <div className="mx-3 mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 font-data text-sm">
                              <div>
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Válidos franja</div>
                                <div className="text-lg font-bold">{totales.validos}</div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Total / habilitados</div>
                                <div className={`text-lg font-bold ${votantes != null && totales.total > votantes ? "text-red-700" : ""}`}>
                                  {totales.total} / {votantes ?? "—"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Regla</div>
                                <div className="text-[10px]">{franja.calcular_porcentaje_sobre?.replaceAll("_", " ")}</div>
                              </div>
                            </div>
                            {votantes != null && totales.total > votantes ? (
                              <div className="mx-3 mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-800">
                                Los votos de esta franja superan los {votantes} votantes habilitados.
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {franjas.length === 0 ? <div className="py-6 text-center font-data text-sm text-slate-400">Esta papeleta no tiene franjas registradas en el acta.</div> : null}
                    </TabsContent>
                  );
                })}
              </Tabs>
            ) : (
              <div className="border border-dashed border-slate-200 p-4 text-sm text-slate-500">Esta ánfora no tiene papeletas asignadas para mostrar.</div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

export function CabeceraPublica() {
  const location = useLocation();
  const enlaceClase = (ruta) => location.pathname === ruta
    ? "bg-[#1E3A8A] text-white"
    : "border border-slate-300 text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A]";
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/trep" className="flex items-center gap-3" data-testid="marca-trep-publico">
          <div className="grid h-10 w-10 place-items-center bg-[#1E3A8A] text-white">
            <Vote className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold">STRE · Bolivia</div>
            <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Consulta pública</div>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/trep" aria-current={location.pathname === "/trep" ? "page" : undefined} className={`${enlaceClase("/trep")} px-3 py-2 text-sm font-semibold`} data-testid="enlace-trep-publico">Actas TREP</Link>
          <Link to="/resultados-publicos" aria-current={location.pathname === "/resultados-publicos" ? "page" : undefined} className={`${enlaceClase("/resultados-publicos")} px-3 py-2 text-sm font-semibold`} data-testid="enlace-resultados-publicos">Resultados</Link>
          <Link to="/acceso" className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" data-testid="enlace-acceso-operativo">Acceso</Link>
        </nav>
      </div>
    </header>
  );
}