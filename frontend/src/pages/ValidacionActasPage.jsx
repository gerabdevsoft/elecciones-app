import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatearError, normalizarRutaApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ordenarCandidatosPorNumeroLista } from "@/lib/sorting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
  ImageOff,
} from "lucide-react";

const fechaCorta = (valor) => {
  if (!valor) return "Sin registro";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
};

const esIdentificadorTecnico = (valor) => {
  const texto = String(valor ?? "").trim().replace(/^#/, "");
  return /^(?:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}|[0-9a-f]{24})$/i.test(texto);
};

const textoVisible = (valor, alternativo = "—") => {
  const texto = String(valor ?? "").trim();
  return texto && !esIdentificadorTecnico(texto) ? texto : alternativo;
};

const horaRelativa = (valor) => {
  if (!valor) return "Hora de envío no disponible";
  const ms = Date.now() - new Date(valor).getTime();
  if (!Number.isFinite(ms)) return fechaCorta(valor);
  const minutos = Math.max(0, Math.floor(ms / 60000));
  if (minutos < 1) return "Hace menos de un minuto";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  return fechaCorta(valor);
};

const BADGE_TIPO_VOTO = {
  nominal: "bg-blue-50 text-blue-700",
  lista: "bg-amber-50 text-amber-800",
  plancha_recta: "bg-emerald-50 text-emerald-700",
  estamentario: "bg-purple-50 text-purple-700",
};

function obtenerListaConteos(acta) {
  const conteos = acta?.conteos;
  if (Array.isArray(conteos)) return conteos;
  if (conteos && typeof conteos === "object") {
    return Object.entries(conteos).map(([id_franja, valores]) => ({ id_franja, ...valores }));
  }
  return [];
}

function SkeletonDetalle() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Cargando acta">
      <div className="h-7 w-2/5 rounded bg-slate-200" />
      <div className="h-4 w-3/5 rounded bg-slate-100" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-xl bg-slate-100" />
        <div className="h-24 rounded-xl bg-slate-100" />
      </div>
      <div className="h-56 rounded-xl bg-slate-100" />
    </div>
  );
}

export default function ValidacionActasPage() {
  const { procesoActivo } = useAuth();
  const [permisos, setPermisos] = useState(null);
  const [errorPermisos, setErrorPermisos] = useState("");
  const [cola, setCola] = useState([]);
  const [cargandoCola, setCargandoCola] = useState(true);
  const [errorCola, setErrorCola] = useState("");
  const [seleccionada, setSeleccionada] = useState(null);
  const [colaContraida, setColaContraida] = useState(false);
  const [acta, setActa] = useState(null);
  const [cargandoActa, setCargandoActa] = useState(false);
  const [errorActa, setErrorActa] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [consolidando, setConsolidando] = useState(false);
  const [imagenBlob, setImagenBlob] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotacion, setRotacion] = useState(0);
  const solicitudRef = useRef(0);

  const idEleccion = procesoActivo?.id_eleccion;
  const puedeValidar = Boolean(permisos?.puede_validar || permisos?.es_admin);
  const conteos = useMemo(() => obtenerListaConteos(acta), [acta]);
  const conteosPorFranja = useMemo(
    () => Object.fromEntries(conteos.map((conteo) => [conteo.id_franja, conteo])),
    [conteos],
  );
  const papeletasActivas = useMemo(() => {
    const ids = seleccionada?.id_papeletas || [];
    return (procesoActivo?.papeletas || []).filter((papeleta) => ids.includes(papeleta.id_papeleta));
  }, [procesoActivo?.papeletas, seleccionada?.id_papeletas]);
  const tipoVotoSeleccionado = procesoActivo?.tipo === "universitaria"
    ? { docente: "Docente", estudiante: "Estudiante" }[acta?.tipo_mesa || seleccionada?.tipo_mesa]
    : null;
  const cantidadVotantesHabilitados = Number.isInteger(seleccionada?.cantidad_votantes)
    ? seleccionada.cantidad_votantes
    : null;
  const totalPorFranja = (franja) => {
    const conteo = conteosPorFranja[franja.id_franja] || {};
    const validos = Object.values(conteo.votos_por_candidato || {})
      .reduce((suma, valor) => suma + (Number(valor) || 0), 0);
    const blancos = Number(conteo.votos_blancos) || 0;
    const nulos = Number(conteo.votos_nulos) || 0;
    return { validos, total: validos + blancos + nulos };
  };

  const cargarCola = useCallback(async () => {
    if (!idEleccion) {
      setCola([]);
      setCargandoCola(false);
      return;
    }
    setCargandoCola(true);
    setErrorCola("");
    try {
      const { data } = await api.get(
        `/operacion/procesos/${idEleccion}/actas-pendientes-validacion`,
      );
      const items = Array.isArray(data) ? data : (data?.actas || data?.items || []);
      setCola(Array.isArray(items) ? items : []);
    } catch (error) {
      setErrorCola(formatearError(error?.response?.data?.detail) || "No se pudo cargar la bandeja.");
    } finally {
      setCargandoCola(false);
    }
  }, [idEleccion]);

  useEffect(() => {
    if (!idEleccion) return undefined;
    let activa = true;
    setPermisos(null);
    setErrorPermisos("");
    setErrorCola("");
    setCola([]);
    setCargandoCola(true);
    api.get(`/operacion/procesos/${idEleccion}/permisos`)
      .then(async ({ data }) => {
        if (!activa) return;
        setPermisos(data);
        if (data?.puede_validar || data?.es_admin) {
          await cargarCola();
        } else {
          setCola([]);
          setCargandoCola(false);
        }
      })
      .catch((error) => {
        if (!activa) return;
        setErrorPermisos(formatearError(error?.response?.data?.detail) || "No fue posible verificar tus permisos.");
        setPermisos({ puede_validar: false, puede_cargar: false, es_admin: false });
        setCargandoCola(false);
      });
    return () => { activa = false; };
  }, [idEleccion, cargarCola]);

  useEffect(() => {
    if (!puedeValidar) return undefined;
    const intervalo = window.setInterval(cargarCola, 30000);
    return () => window.clearInterval(intervalo);
  }, [puedeValidar, cargarCola]);

  useEffect(() => {
    if (!acta?.url_imagen) {
      setImagenBlob(null);
      return undefined;
    }
    let urlTemporal = null;
    let activa = true;
    setImagenBlob(null);
    api.get(normalizarRutaApi(acta.url_imagen), { responseType: "blob" })
      .then(({ data }) => {
        urlTemporal = URL.createObjectURL(data);
        if (activa) setImagenBlob(urlTemporal);
      })
      .catch(() => { if (activa) setImagenBlob("error"); });
    return () => {
      activa = false;
      if (urlTemporal) URL.revokeObjectURL(urlTemporal);
    };
  }, [acta?.url_imagen]);

  const seleccionarActa = async (item) => {
    const solicitud = solicitudRef.current + 1;
    solicitudRef.current = solicitud;
    setSeleccionada(item);
    setColaContraida(true);
    setActa(null);
    setZoom(1);
    setRotacion(0);
    setErrorActa("");
    setCargandoActa(true);
    try {
      const { data } = await api.get(`/actas/${item.id}`);
      if (solicitudRef.current === solicitud) setActa(data);
    } catch (error) {
      if (solicitudRef.current === solicitud) {
        setErrorActa(formatearError(error?.response?.data?.detail) || "No se pudo abrir el detalle del acta.");
      }
    } finally {
      if (solicitudRef.current === solicitud) setCargandoActa(false);
    }
  };

  const confirmarConsolidacion = async () => {
    if (!seleccionada?.id || !puedeValidar) return;
    setConsolidando(true);
    try {
      await api.post("/centro-computo/bloquear", { id_acta: seleccionada.id });
      toast.success("Acta consolidada y bloqueada.");
      setModalAbierto(false);
      setSeleccionada(null);
      setActa(null);
      setColaContraida(false);
      await cargarCola();
    } catch (error) {
      toast.error(formatearError(error?.response?.data?.detail) || "No se pudo consolidar el acta.");
    } finally {
      setConsolidando(false);
    }
  };

  const primerEnCola = cola[0];
  const tieneImagen = Boolean(acta?.url_imagen);

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-slate-100 px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[1440px]">
        <section className="mb-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-data uppercase tracking-widest text-blue-700">
                <ShieldCheck className="h-4 w-4 text-blue-700" />
                STRE / Control de actas
              </div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Validación de actas</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Revisa el registro recibido y consolida cada resultado con trazabilidad.
              </p>
              <p className="mt-4 text-xs font-medium text-slate-600">
                Elección <span className="mx-2 text-slate-300">/</span>
                {procesoActivo?.nombre || "sin proceso"}
              </p>
            </div>
            <div className="flex items-center gap-3 self-start rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 lg:self-auto">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-white">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="font-data text-2xl font-semibold leading-none text-blue-900">{cargandoCola ? "—" : cola.length}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">En espera</div>
              </div>
            </div>
          </div>
        </section>

        {errorPermisos ? (
          <section className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><strong className="block">No se pudieron verificar los permisos</strong>{errorPermisos}</div>
          </section>
        ) : null}
        {permisos && !puedeValidar && !errorPermisos ? (
          <section className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong className="block">Acceso de solo consulta</strong>
              Tu perfil no tiene permiso para consolidar actas de este proceso.
            </div>
          </section>
        ) : null}

        <div className={`grid items-start gap-5 ${colaContraida ? "lg:grid-cols-[104px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(240px,0.65fr)_minmax(0,2fr)]"}`}>
          {colaContraida ? (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setColaContraida(false)}
                aria-label="Mostrar bandeja de pendientes"
                title="Mostrar bandeja de pendientes"
                className="flex h-auto w-full items-center justify-between gap-2 px-3 py-3 text-xs text-slate-700 hover:bg-blue-50 lg:flex-col lg:justify-center lg:py-5"
              >
                <span className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 rotate-180 text-blue-700" />
                  <span className="lg:hidden">Mostrar bandeja</span>
                  <span className="hidden lg:inline">Bandeja</span>
                </span>
                <span className="font-data text-lg font-bold text-blue-900">{cola.length}</span>
              </Button>
            </section>
          ) : (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500">Bandeja de ingreso</p>
                <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-slate-900">Pendientes</h2>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Actualizar bandeja"
                title="Actualizar bandeja"
                onClick={cargarCola}
                disabled={cargandoCola || !puedeValidar}
                className="h-9 w-9 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className={`h-4 w-4 ${cargandoCola ? "animate-spin" : ""}`} />
              </Button>
            </header>
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-600 sm:px-5">
              <ArrowDown className="h-3.5 w-3.5 text-blue-700" />
              Orden cronológico · primero el envío más antiguo
            </div>
            {errorCola ? (
              <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex gap-3 text-sm text-red-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{errorCola}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={cargarCola} className="mt-3 border-red-200 text-red-800">
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </Button>
              </div>
            ) : cargandoCola ? (
              <div className="space-y-3 p-4" aria-label="Cargando bandeja">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="animate-pulse rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 h-3 w-20 rounded bg-slate-200" />
                    <div className="mb-2 h-4 w-3/5 rounded bg-slate-200" />
                    <div className="h-3 w-2/5 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : cola.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold text-slate-900">Bandeja al día</h3>
                <p className="mx-auto mt-1 max-w-[240px] text-sm leading-5 text-slate-600">
                  No hay actas pendientes de validación para este proceso.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {cola.map((item, index) => {
                  const activa = seleccionada?.id === item.id;
                  const tipoVotoItem = procesoActivo?.tipo === "universitaria"
                    ? { docente: "Docente", estudiante: "Estudiante" }[item.tipo_mesa]
                    : null;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => seleccionarActa(item)}
                      aria-current={activa ? "true" : undefined}
                      className={`group relative block w-full px-4 py-4 text-left transition-colors duration-150 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:px-5 ${activa ? "bg-blue-50" : "bg-transparent"}`}
                    >
                      <span className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-r ${index === 0 ? "bg-amber-500" : activa ? "bg-blue-700" : "bg-transparent"}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-md px-2 py-1 font-data text-[10px] font-semibold ${index === 0 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                              {index === 0 ? "MÁS ANTIGUA" : `EN COLA ${String(index + 1).padStart(2, "0")}`}
                            </span>
                            {tipoVotoItem && <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Tipo de voto: {tipoVotoItem}</span>}
                          </div>
                          <h3 className="truncate font-display text-[15px] font-semibold text-slate-900">
                            Mesa {item.numero_mesa ?? "—"}
                            {item.numero_anfora ? <span className="font-normal text-slate-600"> · Ánfora {item.numero_anfora}</span> : null}
                          </h3>
                          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-600">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-700" />
                            {[textoVisible(item.recinto, ""), textoVisible(item.ambiente, "")].filter(Boolean).join(" · ") || "Ubicación no especificada"}
                          </p>
                        </div>
                        <ArrowRight className={`mt-1 h-4 w-4 shrink-0 transition-transform ${activa ? "translate-x-0.5 text-blue-700" : "text-slate-400 group-hover:translate-x-0.5 group-hover:text-blue-700"}`} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" />
                          {horaRelativa(item.enviado_en)}
                        </span>
                        <span className="shrink-0 font-data text-[10px]">{fechaCorta(item.enviado_en)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {primerEnCola && !cargandoCola && !errorCola ? (
              <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[10px] text-slate-500">
                La posición en la bandeja refleja el orden de envío recibido.
              </footer>
            ) : null}
          </section>
          )}

          <section className="min-h-[440px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {!seleccionada ? (
              <div className="flex min-h-[440px] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-blue-700">
                  <FileText className="h-7 w-7" />
                  <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-700 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                </div>
                <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Detalle de revisión</p>
                <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-slate-900">Selecciona un acta</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                  Elige un registro de la bandeja para revisar su ubicación, datos capturados y respaldo documental.
                </p>
              </div>
            ) : (
              <>
                <header className="flex flex-col gap-4 border-b border-blue-200 bg-blue-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[10px] font-data font-bold uppercase tracking-[0.17em] text-blue-700">Acta en revisión</p>
                    <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-slate-900">
                      Mesa {seleccionada.numero_mesa ?? "—"}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Enviada {fechaCorta(seleccionada.enviado_en)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800 sm:self-auto">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Pendiente de validación
                  </div>
                </header>

                <div className="p-4 sm:p-6">
                  {cargandoActa ? <SkeletonDetalle /> : errorActa ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                      <div className="flex gap-3 text-sm text-red-800">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div><strong className="block">No se pudo cargar el acta</strong>{errorActa}</div>
                      </div>
                      <Button type="button" variant="outline" onClick={() => seleccionarActa(seleccionada)} className="mt-4 border-red-200 text-red-800">
                        <RefreshCw className="h-4 w-4" /> Reintentar
                      </Button>
                    </div>
                  ) : acta ? (
                    <div className="animate-fade-up space-y-5">
                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <section className="flex h-[720px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-inner" data-testid="panel-imagen-validacion">
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
                            {imagenBlob === "error" ? (
                              <div className="text-center text-slate-300">
                                <ImageOff className="mx-auto mb-4 h-16 w-16 opacity-60" />
                                <div className="font-data text-xs uppercase tracking-widest">No se pudo cargar la imagen</div>
                              </div>
                            ) : imagenBlob ? (
                              <img
                                src={imagenBlob}
                                alt="Acta electoral"
                                style={{ transform: `scale(${zoom}) rotate(${rotacion}deg)`, transition: "transform 200ms ease" }}
                                className="max-w-full origin-center border border-slate-700 shadow-2xl"
                                data-testid="acta-imagen-validacion"
                              />
                            ) : !tieneImagen ? (
                              <div className="text-center text-slate-500">
                                <ImageOff className="mx-auto mb-4 h-16 w-16 opacity-60" />
                                <div className="font-data text-xs uppercase tracking-widest">Sin acta cargada</div>
                              </div>
                            ) : (
                              <div className="h-8 w-8 animate-pulse rounded-full bg-slate-600" aria-label="Cargando imagen del acta" />
                            )}
                          </div>
                        </section>

                        <section className="h-[720px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="panel-formulario-validacion">
                          <div className="mb-6 border border-blue-200 bg-blue-50 p-4" data-testid="cabecera-anfora-validacion">
                            <div className="text-[10px] font-data uppercase tracking-widest text-blue-700">Ánfora seleccionada</div>
                            <div className="mt-2 text-lg font-bold text-slate-900">
                              Ánfora {textoVisible(acta.numero_anfora ?? seleccionada.numero_anfora)}
                            </div>
                            <div className="text-sm text-slate-600">{textoVisible(seleccionada.nombre_anfora, "")}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs font-data text-slate-600">
                              <span>Mesa {textoVisible(acta.numero_mesa ?? seleccionada.numero_mesa)}</span>
                              <span>·</span>
                              <span>{textoVisible(acta.recinto ?? seleccionada.recinto, "Recinto no especificado")}</span>
                              {tipoVotoSeleccionado ? (
                                <>
                                  <span>·</span>
                                  <span className="stre-badge bg-blue-50 text-blue-700" data-testid="tipo-voto-universitario">
                                    Tipo de voto: {tipoVotoSeleccionado}
                                  </span>
                                </>
                              ) : null}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-blue-200 pt-3" data-testid="votantes-habilitados-anfora">
                              <span className="text-xs font-semibold uppercase tracking-wide text-blue-800">Votantes habilitados en esta ánfora</span>
                              {cantidadVotantesHabilitados == null ? (
                                <span className="text-sm font-bold text-red-700">Cantidad sin registrar</span>
                              ) : (
                                <span className="font-data text-xl font-bold text-blue-900">{cantidadVotantesHabilitados}</span>
                              )}
                            </div>
                            {cantidadVotantesHabilitados == null ? (
                              <p className="mt-2 text-xs text-red-700" data-testid="votantes-habilitados-faltantes">
                                La estructura electoral no tiene registrada la cantidad de votantes para esta ánfora.
                              </p>
                            ) : null}
                          </div>

                          {acta.observacion_validacion || seleccionada.observacion_validacion ? (
                            <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                              <strong className="mr-1">Observación:</strong>
                              {acta.observacion_validacion || seleccionada.observacion_validacion}
                            </div>
                          ) : null}

                          {papeletasActivas.length ? (
                            <Tabs key={seleccionada.id} defaultValue={papeletasActivas[0]?.id_papeleta}>
                              <TabsList className="h-auto w-full flex-wrap" data-testid="tabs-papeletas-validacion">
                                {papeletasActivas.map((papeleta) => (
                                  <TabsTrigger key={papeleta.id_papeleta} value={papeleta.id_papeleta} className="text-xs">
                                    {papeleta.nombre}
                                  </TabsTrigger>
                                ))}
                              </TabsList>
                              {papeletasActivas.map((papeleta) => (
                                <TabsContent key={papeleta.id_papeleta} value={papeleta.id_papeleta} className="mt-4 space-y-6">
                                  {(papeleta.franjas || []).map((franja) => {
                                    const conteo = conteosPorFranja[franja.id_franja] || {};
                                    const votosPorCandidato = conteo.votos_por_candidato || {};
                                    const totalFranja = totalPorFranja(franja);
                                    return (
                                      <div key={franja.id_franja} className="overflow-hidden rounded-lg border border-slate-200" data-testid={`seccion-franja-validacion-${franja.id_franja}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-2" style={{ background: franja.color_franja || "#F8FAFC" }}>
                                          <div className="text-sm font-bold text-slate-900">{textoVisible(franja.titulo, "Franja")}</div>
                                          <div className="flex items-center gap-1">
                                            <span className={`stre-badge ${BADGE_TIPO_VOTO[franja.tipo_voto] || "bg-slate-100 text-slate-600"}`}>
                                              {(franja.tipo_voto || "nominal").replaceAll("_", " ")}
                                            </span>
                                            <span className="font-data text-[10px] text-slate-500">
                                              {franja.calcular_porcentaje_sobre?.replaceAll("_", " ")}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="space-y-2 p-3">
                                          {ordenarCandidatosPorNumeroLista(franja.candidatos).map((candidato, indice) => (
                                            <div key={candidato.id_candidato} className="flex items-center gap-3 rounded-md border border-slate-100 p-2">
                                              <div className="h-8 w-2 shrink-0 rounded-sm" style={{ background: candidato.color_hex || "#94A3B8" }} />
                                              <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium text-slate-900">{textoVisible(candidato.nombre, `Candidato ${indice + 1}`)}</div>
                                                {candidato.partido ? (
                                                  <div className="font-data text-[10px] uppercase tracking-widest text-slate-500">
                                                    {textoVisible(candidato.sigla || candidato.partido, "")}
                                                  </div>
                                                ) : null}
                                              </div>
                                              <Input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={Number(votosPorCandidato[candidato.id_candidato]) || 0}
                                                disabled
                                                readOnly
                                                className="w-24 text-right font-data font-bold"
                                                data-testid={`franja-vote-input-validacion-${candidato.id_candidato}`}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 p-3 pt-0">
                                          {franja.permite_blancos !== false ? (
                                            <div>
                                              <Label className="font-data text-[10px] uppercase tracking-widest text-slate-500">Votos Blancos</Label>
                                              <Input type="number" min="0" step="1" value={Number(conteo.votos_blancos) || 0} disabled readOnly className="font-data font-bold" />
                                            </div>
                                          ) : null}
                                          {franja.permite_nulos !== false ? (
                                            <div>
                                              <Label className="font-data text-[10px] uppercase tracking-widest text-slate-500">Votos Nulos</Label>
                                              <Input type="number" min="0" step="1" value={Number(conteo.votos_nulos) || 0} disabled readOnly className="font-data font-bold" />
                                            </div>
                                          ) : null}
                                        </div>
                                        <div className="mx-3 mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 font-data text-sm">
                                          <div>
                                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Válidos franja</div>
                                            <div className="text-lg font-bold">{totalFranja.validos}</div>
                                          </div>
                                          <div>
                                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Total / habilitados</div>
                                            <div className={`text-lg font-bold ${cantidadVotantesHabilitados != null && totalFranja.total > cantidadVotantesHabilitados ? "text-red-700" : ""}`}>
                                              {totalFranja.total} / {cantidadVotantesHabilitados ?? "—"}
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Regla</div>
                                            <div className="text-[10px]">{franja.calcular_porcentaje_sobre?.replaceAll("_", " ")}</div>
                                          </div>
                                        </div>
                                        {cantidadVotantesHabilitados != null && totalFranja.total > cantidadVotantesHabilitados ? (
                                          <div className="mx-3 mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-800">
                                            Los votos de esta franja superan los {cantidadVotantesHabilitados} votantes habilitados.
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                  {(!papeleta.franjas || papeleta.franjas.length === 0) ? (
                                    <div className="py-6 text-center font-data text-sm text-slate-400">Esta boleta no tiene franjas configuradas.</div>
                                  ) : null}
                                </TabsContent>
                              ))}
                            </Tabs>
                          ) : (
                            <div className="border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                              Esta ánfora no tiene papeletas asignadas para mostrar.
                            </div>
                          )}

                          <div className="mt-6 flex flex-col justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
                            <p className="max-w-md text-[11px] leading-5 text-slate-500">
                              Al consolidar, el acta queda bloqueada y se incorpora al resultado del proceso.
                            </p>
                            <Button
                              type="button"
                              onClick={() => setModalAbierto(true)}
                              disabled={!puedeValidar || consolidando}
                              className="h-11 w-full bg-[#059669] px-5 font-semibold text-white shadow-sm transition-colors hover:bg-[#047857] sm:w-auto"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Consolidar y bloquear
                            </Button>
                          </div>
                        </section>
                      </div>

                    </div>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-medium tracking-wide text-[#8c968d]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Registro operativo con trazabilidad de envío
        </div>
      </div>

      <Dialog open={modalAbierto} onOpenChange={(abierto) => !consolidando && setModalAbierto(abierto)}>
        <DialogContent className="border-[#dfe3d9] bg-[#fbfbf7] sm:max-w-md">
          <DialogHeader>
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-[#f6ecd9] text-[#8e692f]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-[#203a30]">Confirmar consolidación</DialogTitle>
            <DialogDescription className="text-[#718078]">
              Vas a consolidar y bloquear el acta de la mesa {seleccionada?.numero_mesa ?? "—"}. Esta acción cambia su estado para el proceso.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-[#e8e2d4] bg-[#f8f5ed] px-3.5 py-3 text-xs text-[#6f6757]">
            Revisa que la ubicación, los conteos y el respaldo correspondan al acta recibida.
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setModalAbierto(false)} disabled={consolidando} className="border-[#d9dfd5] text-[#53635a]">
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button type="button" onClick={confirmarConsolidacion} disabled={consolidando} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {consolidando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {consolidando ? "Consolidando…" : "Sí, consolidar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
