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
      <div className="h-7 w-2/5 rounded bg-[#e9ece5]" />
      <div className="h-4 w-3/5 rounded bg-[#eef0eb]" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-xl bg-[#eef0eb]" />
        <div className="h-24 rounded-xl bg-[#eef0eb]" />
      </div>
      <div className="h-56 rounded-xl bg-[#eef0eb]" />
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
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f3f4ee] px-3 py-5 text-[#1d302c] sm:px-6 sm:py-8">
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
                Elección {idEleccion || "sin proceso"} <span className="mx-2 text-white/35">/</span>
                {procesoActivo?.nombre || "Proceso activo"}
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
          <section className="mb-5 flex items-start gap-3 rounded-xl border border-[#e8c9a2] bg-[#fff8e9] p-4 text-sm text-[#704d26]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><strong className="block">No se pudieron verificar los permisos</strong>{errorPermisos}</div>
          </section>
        ) : null}
        {permisos && !puedeValidar && !errorPermisos ? (
          <section className="mb-5 flex items-start gap-3 rounded-xl border border-[#e6c9a4] bg-[#fff9ed] p-4 text-sm text-[#704d26]">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong className="block">Acceso de solo consulta</strong>
              Tu perfil no tiene permiso para consolidar actas de este proceso.
            </div>
          </section>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(330px,0.82fr)_minmax(0,1.55fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#dfe3d9] bg-[#fbfbf7] shadow-[0_5px_18px_rgba(33,54,46,0.045)]">
            <header className="flex items-center justify-between border-b border-[#e6e8e0] px-4 py-4 sm:px-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#708078]">Bandeja de ingreso</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Pendientes</h2>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Actualizar bandeja"
                title="Actualizar bandeja"
                onClick={cargarCola}
                disabled={cargandoCola || !puedeValidar}
                className="h-9 w-9 border-[#d9dfd5] bg-[#fbfbf7] text-[#3d5d51] hover:bg-[#edf1e9]"
              >
                <RefreshCw className={`h-4 w-4 ${cargandoCola ? "animate-spin" : ""}`} />
              </Button>
            </header>
            <div className="flex items-center gap-2 border-b border-[#e6e8e0] bg-[#f5f6f0] px-4 py-2.5 text-[11px] text-[#75827a] sm:px-5">
              <ArrowDown className="h-3.5 w-3.5 text-[#a47839]" />
              Orden cronológico · primero el envío más antiguo
            </div>
            {errorCola ? (
              <div className="m-4 rounded-xl border border-[#edd2c9] bg-[#fff5f1] p-4">
                <div className="flex gap-3 text-sm text-[#7b4436]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{errorCola}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={cargarCola} className="mt-3 border-[#dcb9aa] text-[#7b4436]">
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </Button>
              </div>
            ) : cargandoCola ? (
              <div className="space-y-3 p-4" aria-label="Cargando bandeja">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="animate-pulse rounded-xl border border-[#e7e9e1] p-4">
                    <div className="mb-3 h-3 w-20 rounded bg-[#e9ece5]" />
                    <div className="mb-2 h-4 w-3/5 rounded bg-[#e9ece5]" />
                    <div className="h-3 w-2/5 rounded bg-[#eef0eb]" />
                  </div>
                ))}
              </div>
            ) : cola.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf1e8] text-[#4d7560]">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-semibold">Bandeja al día</h3>
                <p className="mx-auto mt-1 max-w-[240px] text-sm leading-5 text-[#78837b]">
                  No hay actas pendientes de validación para este proceso.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#e8eae3]">
                {cola.map((item, index) => {
                  const activa = seleccionada?.id === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => seleccionarActa(item)}
                      aria-current={activa ? "true" : undefined}
                      className={`group relative block w-full px-4 py-4 text-left transition-colors duration-150 hover:bg-[#f4f6ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#527a62] sm:px-5 ${activa ? "bg-[#edf2e9]" : "bg-transparent"}`}
                    >
                      <span className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-r ${index === 0 ? "bg-[#bd9250]" : activa ? "bg-[#47705a]" : "bg-transparent"}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-md px-2 py-1 font-data text-[10px] font-semibold ${index === 0 ? "bg-[#f6ecd9] text-[#88612b]" : "bg-[#edf0ea] text-[#69776e]"}`}>
                              {index === 0 ? "MÁS ANTIGUA" : `EN COLA ${String(index + 1).padStart(2, "0")}`}
                            </span>
                            {item.tipo_mesa && <span className="text-[10px] font-semibold uppercase tracking-wider text-[#748078]">{item.tipo_mesa}</span>}
                          </div>
                          <h3 className="truncate text-[15px] font-semibold text-[#233a32]">
                            Mesa {item.numero_mesa ?? "—"}
                            {item.numero_anfora ? <span className="font-normal text-[#758078]"> · Ánfora {item.numero_anfora}</span> : null}
                          </h3>
                          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-[#758078]">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {[item.recinto, item.ambiente].filter(Boolean).join(" · ") || "Ubicación no especificada"}
                          </p>
                        </div>
                        <ArrowRight className={`mt-1 h-4 w-4 shrink-0 transition-transform ${activa ? "translate-x-0.5 text-[#47705a]" : "text-[#aab2a8] group-hover:translate-x-0.5 group-hover:text-[#47705a]"}`} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#e4e8df] pt-3 text-[11px] text-[#7b867e]">
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
              <footer className="border-t border-[#e6e8e0] bg-[#f8f9f4] px-5 py-3 text-[10px] text-[#89928a]">
                La posición en la bandeja refleja el orden de envío recibido.
              </footer>
            ) : null}
          </section>

          <section className="min-h-[440px] overflow-hidden rounded-2xl border border-[#dfe3d9] bg-[#fbfbf7] shadow-[0_5px_18px_rgba(33,54,46,0.045)]">
            {!seleccionada ? (
              <div className="flex min-h-[440px] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-[20px] border border-[#dce3d8] bg-[#f0f3eb] text-[#52745c]">
                  <FileText className="h-7 w-7" />
                  <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#fbfbf7] bg-[#d8b46d] text-[#294238]">
                    <Check className="h-3 w-3" />
                  </span>
                </div>
                <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a958a]">Detalle de revisión</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Selecciona un acta</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[#7a857d]">
                  Elige un registro de la bandeja para revisar su ubicación, datos capturados y respaldo documental.
                </p>
              </div>
            ) : (
              <>
                <header className="flex flex-col gap-4 border-b border-[#e6e8e0] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#78857b]">Acta en revisión</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">
                      Mesa {seleccionada.numero_mesa ?? "—"}
                      <span className="ml-2 font-data text-sm font-medium text-[#78857b]">#{seleccionada.id}</span>
                    </h2>
                    <p className="mt-1 text-xs text-[#7c877f]">
                      Enviada {fechaCorta(seleccionada.enviado_en)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start rounded-full border border-[#e5d8bb] bg-[#fbf4e5] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#89632f] sm:self-auto">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#bd9250]" />
                    Pendiente de validación
                  </div>
                </header>

                <div className="p-4 sm:p-6">
                  {cargandoActa ? <SkeletonDetalle /> : errorActa ? (
                    <div className="rounded-xl border border-[#edd2c9] bg-[#fff5f1] p-5">
                      <div className="flex gap-3 text-sm text-[#7b4436]">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div><strong className="block">No se pudo cargar el acta</strong>{errorActa}</div>
                      </div>
                      <Button type="button" variant="outline" onClick={() => seleccionarActa(seleccionada)} className="mt-4 border-[#dcb9aa] text-[#7b4436]">
                        <RefreshCw className="h-4 w-4" /> Reintentar
                      </Button>
                    </div>
                  ) : acta ? (
                    <div className="animate-fade-up space-y-5">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-[#e4e8df] bg-[#f7f8f3] p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#89938a]">Ánfora</p>
                            <p className="mt-1.5 font-data text-base font-semibold text-[#30463b]">{acta.numero_anfora ?? seleccionada.numero_anfora ?? "—"}</p>
                        </div>
                        <div className="rounded-xl border border-[#e4e8df] bg-[#f7f8f3] p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#89938a]">Tipo de mesa</p>
                          <p className="mt-1.5 truncate text-sm font-semibold capitalize text-[#30463b]">{acta.tipo_mesa || seleccionada.tipo_mesa || "—"}</p>
                        </div>
                        <div className="rounded-xl border border-[#e4e8df] bg-[#f7f8f3] p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#89938a]">Conteos</p>
                          <p className="mt-1.5 font-data text-base font-semibold text-[#30463b]">{conteos.length}</p>
                        </div>
                        <div className="rounded-xl border border-[#e4e8df] bg-[#f7f8f3] p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#89938a]">Votos registrados</p>
                          <p className="mt-1.5 font-data text-base font-semibold text-[#30463b]">{totalVotos.toLocaleString("es-BO")}</p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(250px,1.1fr)]">
                        <section className="rounded-xl border border-[#e4e8df] bg-[#f8f9f5] p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-[#65806c]" />
                            <h3 className="text-sm font-semibold">Ubicación registrada</h3>
                          </div>
                          <dl className="space-y-2.5 text-xs">
                             <div className="flex justify-between gap-3"><dt className="text-[#879188]">Mesa</dt><dd className="text-right font-medium text-[#364a3f]">{acta.numero_mesa || seleccionada.numero_mesa || "No especificada"}</dd></div>
                             <div className="flex justify-between gap-3"><dt className="text-[#879188]">Recinto</dt><dd className="text-right font-medium text-[#364a3f]">{acta.recinto || seleccionada.recinto || "No especificado"}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-[#879188]">Ambiente</dt><dd className="text-right font-medium text-[#364a3f]">{acta.ambiente || seleccionada.ambiente || "No especificado"}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-[#879188]">Última actualización</dt><dd className="text-right font-medium text-[#364a3f]">{fechaCorta(acta.actualizado_en || seleccionada.actualizado_en)}</dd></div>
                          </dl>
                          {acta.observacion_validacion || seleccionada.observacion_validacion ? (
                            <div className="mt-4 border-t border-[#e4e8df] pt-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#89938a]">Observación</p>
                              <p className="mt-1.5 text-xs leading-5 text-[#53645a]">{acta.observacion_validacion || seleccionada.observacion_validacion}</p>
                            </div>
                          ) : null}
                        </section>

                        <section className="rounded-xl border border-[#e4e8df] bg-[#f8f9f5] p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <FileImage className="h-4 w-4 text-[#65806c]" />
                              <h3 className="text-sm font-semibold">Imagen del acta</h3>
                            </div>
                            {acta.ruta_storage ? <span className="max-w-[45%] truncate font-data text-[9px] text-[#96a097]" title={acta.ruta_storage}>{acta.ruta_storage}</span> : null}
                          </div>
                          {tieneImagen ? (
                            imagenBlob === "error" ? (
                              <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-[#d7ddd3] bg-[#f2f4ee] px-4 text-center text-xs text-[#7c877e]">
                                <AlertCircle className="mb-2 h-5 w-5" />
                                No se pudo cargar la imagen con tu sesión.
                              </div>
                            ) : imagenBlob ? (
                              <a href={imagenBlob} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-[#dfe4dc] bg-[#e8e9e2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#527a62]" aria-label="Abrir imagen del acta en una pestaña nueva">
                                <img src={imagenBlob} alt="Imagen del acta enviada" className="max-h-64 w-full object-contain" />
                              </a>
                            ) : (
                              <div className="flex min-h-36 items-center justify-center rounded-lg bg-[#eef0eb]">
                                <div className="h-7 w-7 animate-pulse rounded-full bg-[#dbe1d7]" />
                              </div>
                            )
                          ) : (
                            <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-[#d7ddd3] bg-[#f2f4ee] px-4 text-center text-xs text-[#89938a]">
                              <FileImage className="mb-2 h-5 w-5" />
                              No se adjuntó una imagen para esta acta.
                            </div>
                          )}
                        </section>
                      </div>

                      <section className="overflow-hidden rounded-xl border border-[#e4e8df]">
                        <div className="flex items-center justify-between gap-3 bg-[#f0f3ec] px-4 py-3">
                          <div>
                            <h3 className="text-sm font-semibold">Resumen de conteos</h3>
                            <p className="mt-0.5 text-[11px] text-[#7d897f]">Datos recibidos para revisión</p>
                          </div>
                          <span className="font-data text-xs text-[#748076]">{totalCandidaturas} candidaturas</span>
                        </div>
                        {conteos.length ? (
                          <div className="divide-y divide-[#e9ebe5]">
                            {conteos.map((conteo, index) => {
                              const franja = franjasPorId[conteo.id_franja];
                              const candidatos = franja?.candidatos || Object.keys(conteo.votos_por_candidato || {}).map((id) => ({ id_candidato: id, nombre: id }));
                              return (
                                <div key={conteo.id_franja ?? index} className="px-4 py-3">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-semibold text-[#3b5044]">
                                        {franja?.titulo || conteo.nombre_franja || conteo.franja || conteo.nombre || `Franja ${index + 1}`}
                                      </p>
                                      {franja?.nombre_papeleta && <p className="mt-0.5 text-[10px] text-[#879188]">{franja.nombre_papeleta}</p>}
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <span className="font-data text-sm font-semibold text-[#30463b]">{contarVotos(conteo).toLocaleString("es-BO")}</span>
                                      <span className="ml-1 text-[10px] text-[#89938a]">votos</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 divide-y divide-[#eff0eb] rounded-lg bg-[#f8f9f5] px-3">
                                    {candidatos.map((candidato) => (
                                      <div key={candidato.id_candidato} className="flex justify-between gap-3 py-2 text-[11px]">
                                        <span className="min-w-0 truncate text-[#69776e]">{candidato.nombre || candidato.id_candidato}</span>
                                        <strong className="font-data text-[#30463b]">{Number(conteo.votos_por_candidato?.[candidato.id_candidato]) || 0}</strong>
                                      </div>
                                    ))}
                                    <div className="flex justify-between gap-3 py-2 text-[10px] text-[#879188]">
                                      <span>Blancos · {Number(conteo.votos_blancos) || 0}</span>
                                      <span>Nulos · {Number(conteo.votos_nulos) || 0}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="px-4 py-5 text-xs text-[#879188]">El detalle no incluye conteos registrados.</p>
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
