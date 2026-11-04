import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatearError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
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
  FileImage,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
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

function obtenerListaConteos(acta) {
  const conteos = acta?.conteos;
  if (Array.isArray(conteos)) return conteos;
  if (conteos && typeof conteos === "object") {
    return Object.entries(conteos).map(([id_franja, valores]) => ({ id_franja, ...valores }));
  }
  return [];
}

function contarVotos(conteo) {
  const candidatos = conteo?.votos_por_candidato;
  const votosCandidatos = candidatos && typeof candidatos === "object"
    ? Object.values(candidatos).reduce((suma, valor) => suma + (Number(valor) || 0), 0)
    : 0;
  return votosCandidatos + (Number(conteo?.votos_blancos) || 0) + (Number(conteo?.votos_nulos) || 0);
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
  const [acta, setActa] = useState(null);
  const [cargandoActa, setCargandoActa] = useState(false);
  const [errorActa, setErrorActa] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [consolidando, setConsolidando] = useState(false);
  const [imagenBlob, setImagenBlob] = useState(null);
  const solicitudRef = useRef(0);

  const idEleccion = procesoActivo?.id_eleccion;
  const puedeValidar = Boolean(permisos?.puede_validar || permisos?.es_admin);
  const conteos = useMemo(() => obtenerListaConteos(acta), [acta]);
  const franjasPorId = useMemo(() => {
    const franjas = {};
    (procesoActivo?.papeletas || []).forEach((papeleta) => {
      (papeleta.franjas || []).forEach((franja) => {
        franjas[franja.id_franja] = { ...franja, nombre_papeleta: papeleta.nombre };
      });
    });
    return franjas;
  }, [procesoActivo?.papeletas]);
  const totalVotos = useMemo(() => conteos.reduce((suma, item) => suma + contarVotos(item), 0), [conteos]);
  const totalCandidaturas = useMemo(() => conteos.reduce((suma, item) => {
    const candidatos = item?.votos_por_candidato;
    return suma + (candidatos && typeof candidatos === "object" ? Object.keys(candidatos).length : 0);
  }, 0), [conteos]);

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
    api.get(acta.url_imagen, { responseType: "blob" })
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
    setActa(null);
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
        <section className="relative mb-6 overflow-hidden rounded-2xl bg-[#163c35] px-5 py-6 text-[#f5f4ec] shadow-[0_14px_36px_rgba(24,57,49,0.13)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-2 -top-8 h-48 w-48 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#c3d5b7]">
                <ShieldCheck className="h-4 w-4" />
                STRE / Control de actas
              </div>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[2.65rem]">Validación de actas</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d1ddd2] sm:text-base">
                Revisa el registro recibido y consolida cada resultado con trazabilidad.
              </p>
              <p className="mt-4 text-xs font-medium text-[#c3d5b7]">
                Elección <span className="mx-2 text-white/35">/</span>
                {procesoActivo?.nombre || "sin proceso"}
              </p>
            </div>
            <div className="flex items-center gap-3 self-start rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 md:self-auto">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#d3a95e] text-[#183b34]">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="font-data text-2xl font-semibold leading-none">{cargandoCola ? "—" : cola.length}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#d1ddd2]">En espera</div>
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

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(330px,0.82fr)_minmax(0,1.55fr)]">
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
                            {textoVisible(item.tipo_mesa, "") && <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{textoVisible(item.tipo_mesa, "")}</span>}
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
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:col-span-4" data-testid="contexto-anfora-validacion">
                          <p className="text-[10px] font-data uppercase tracking-widest text-blue-700">Contexto confirmado</p>
                          <p className="mt-2 font-data text-lg font-bold text-slate-900">
                            Ánfora {textoVisible(acta.numero_anfora ?? seleccionada.numero_anfora)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-data text-slate-600">
                            <span>Mesa {textoVisible(acta.numero_mesa ?? seleccionada.numero_mesa)}</span>
                            <span>·</span>
                            <span>{textoVisible(acta.recinto ?? seleccionada.recinto, "Recinto no especificado")}</span>
                            {(acta.tipo_mesa || seleccionada.tipo_mesa) ? (
                              <>
                                <span>·</span>
                                <span className="stre-badge bg-blue-100 text-blue-800">
                                  Tipo de mesa: {textoVisible(acta.tipo_mesa || seleccionada.tipo_mesa)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Tipo de mesa</p>
                          <p className="mt-1.5 truncate text-sm font-semibold capitalize text-slate-900">{textoVisible(acta.tipo_mesa || seleccionada.tipo_mesa)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Conteos</p>
                          <p className="mt-1.5 font-data text-base font-semibold text-blue-900">{conteos.length}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:col-span-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Votos registrados</p>
                          <p className="mt-1.5 font-data text-base font-semibold text-blue-900">{totalVotos.toLocaleString("es-BO")}</p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(250px,1.1fr)]">
                        <section className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-blue-700" />
                            <h3 className="font-display text-sm font-semibold text-slate-900">Ubicación registrada</h3>
                          </div>
                          <dl className="space-y-2.5 text-xs">
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">Mesa</dt><dd className="text-right font-medium text-slate-900">{textoVisible(acta.numero_mesa || seleccionada.numero_mesa, "No especificada")}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">Recinto</dt><dd className="text-right font-medium text-slate-900">{textoVisible(acta.recinto || seleccionada.recinto, "No especificado")}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">Ambiente</dt><dd className="text-right font-medium text-slate-900">{textoVisible(acta.ambiente || seleccionada.ambiente, "No especificado")}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">Última actualización</dt><dd className="text-right font-medium text-slate-900">{fechaCorta(acta.actualizado_en || seleccionada.actualizado_en)}</dd></div>
                          </dl>
                          {acta.observacion_validacion || seleccionada.observacion_validacion ? (
                            <div className="mt-4 border-t border-slate-200 pt-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Observación</p>
                              <p className="mt-1.5 text-xs leading-5 text-slate-600">{acta.observacion_validacion || seleccionada.observacion_validacion}</p>
                            </div>
                          ) : null}
                        </section>

                        <section className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <FileImage className="h-4 w-4 text-blue-700" />
                              <h3 className="font-display text-sm font-semibold text-slate-900">Imagen del acta</h3>
                            </div>
                          </div>
                          {tieneImagen ? (
                            imagenBlob === "error" ? (
                              <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-xs text-slate-600">
                                <AlertCircle className="mb-2 h-5 w-5" />
                                No se pudo cargar la imagen con tu sesión.
                              </div>
                            ) : imagenBlob ? (
                              <a href={imagenBlob} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Abrir imagen del acta en una pestaña nueva">
                                <img src={imagenBlob} alt="Imagen del acta enviada" className="max-h-64 w-full object-contain" />
                              </a>
                            ) : (
                              <div className="flex min-h-36 items-center justify-center rounded-lg bg-slate-100">
                                <div className="h-7 w-7 animate-pulse rounded-full bg-slate-300" />
                              </div>
                            )
                          ) : (
                            <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-xs text-slate-500">
                              <FileImage className="mb-2 h-5 w-5" />
                              No se adjuntó una imagen para esta acta.
                            </div>
                          )}
                        </section>
                      </div>

                      <section className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                          <div>
                            <h3 className="font-display text-sm font-semibold text-slate-900">Resumen de conteos</h3>
                            <p className="mt-0.5 text-[11px] text-slate-500">Datos recibidos para revisión</p>
                          </div>
                          <span className="font-data text-xs text-slate-600">{totalCandidaturas} candidaturas</span>
                        </div>
                        {conteos.length ? (
                          <div className="divide-y divide-slate-200">
                            {conteos.map((conteo, index) => {
                              const franja = franjasPorId[conteo.id_franja];
                              const candidatos = franja?.candidatos || Object.keys(conteo.votos_por_candidato || {}).map((id) => ({ id_candidato: id }));
                              const tituloFranja = textoVisible(
                                franja?.titulo || conteo.nombre_franja || conteo.franja || conteo.nombre,
                                `Franja ${index + 1}`,
                              );
                              return (
                                <div key={conteo.id_franja ?? index} className="px-4 py-3">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-semibold text-slate-900">{tituloFranja}</p>
                                      {textoVisible(franja?.nombre_papeleta, "") && <p className="mt-0.5 text-[10px] text-slate-500">{textoVisible(franja.nombre_papeleta, "")}</p>}
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <span className="font-data text-sm font-semibold text-blue-900">{contarVotos(conteo).toLocaleString("es-BO")}</span>
                                      <span className="ml-1 text-[10px] text-slate-500">votos</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 divide-y divide-slate-200 rounded-lg bg-slate-50 px-3">
                                    {candidatos.map((candidato, candidatoIndex) => (
                                      <div key={candidato.id_candidato} className="flex justify-between gap-3 py-2 text-[11px]">
                                        <span className="min-w-0 truncate text-slate-600">{textoVisible(candidato.nombre, `Candidato ${candidatoIndex + 1}`)}</span>
                                        <strong className="font-data text-blue-900">{Number(conteo.votos_por_candidato?.[candidato.id_candidato]) || 0}</strong>
                                      </div>
                                    ))}
                                    <div className="flex justify-between gap-3 py-2 text-[10px] text-slate-500">
                                      <span>Blancos · {Number(conteo.votos_blancos) || 0}</span>
                                      <span>Nulos · {Number(conteo.votos_nulos) || 0}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="px-4 py-5 text-xs text-slate-500">El detalle no incluye conteos registrados.</p>
                        )}
                      </section>

                      <div className="flex flex-col justify-between gap-3 border-t border-[#e7e9e1] pt-4 sm:flex-row sm:items-center">
                        <p className="max-w-md text-[11px] leading-5 text-[#89938a]">
                          Al consolidar, el acta queda bloqueada y se incorpora al resultado del proceso.
                        </p>
                        <Button
                          type="button"
                          onClick={() => setModalAbierto(true)}
                          disabled={!puedeValidar || consolidando}
                          className="h-11 w-full bg-[#315f4b] px-5 font-semibold text-white shadow-sm transition-colors hover:bg-[#284f3d] sm:w-auto"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Consolidar y bloquear
                        </Button>
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
            <Button type="button" onClick={confirmarConsolidacion} disabled={consolidando} className="bg-[#315f4b] text-white hover:bg-[#284f3d]">
              {consolidando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {consolidando ? "Consolidando…" : "Sí, consolidar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
