import { useEffect, useState, useRef } from "react";
import { api, formatearError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { comprimirImagenActa } from "@/lib/imageCompress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Upload, ZoomIn, ZoomOut, RotateCcw, Lock, Unlock, ScanLine,
  AlertTriangle, ImageOff, MapPin, Save, Search, ShieldAlert, Sparkles
} from "lucide-react";

const BADGE_TIPO_VOTO = {
  nominal: "bg-blue-50 text-blue-700",
  lista: "bg-amber-50 text-amber-800",
  plancha_recta: "bg-emerald-50 text-emerald-700",
  estamentario: "bg-purple-50 text-purple-700",
};

const ESTADO_ANFORA = {
  sin_datos: { etiqueta: "Sin datos", clase: "bg-slate-100 text-slate-600" },
  borrador: { etiqueta: "Borrador", clase: "bg-amber-50 text-amber-800" },
  enviado: { etiqueta: "En validación", clase: "bg-blue-50 text-blue-700" },
  observado: { etiqueta: "Observada", clase: "bg-red-50 text-red-700" },
  consolidada: { etiqueta: "Consolidada", clase: "bg-emerald-50 text-emerald-700" },
};

function franjasPlanasDe(proceso, papeletas = proceso?.papeletas || []) {
  return papeletas.flatMap((p) =>
    (p.franjas || []).map((fr) => ({ ...fr, id_papeleta: p.id_papeleta, nombre_papeleta: p.nombre }))
  );
}

function conteosIniciales(proceso, papeletas) {
  const c = {};
  franjasPlanasDe(proceso, papeletas).forEach((fr) => {
    c[fr.id_franja] = { votos_por_candidato: {}, votos_blancos: 0, votos_nulos: 0 };
    (fr.candidatos || []).forEach((cand) => { c[fr.id_franja].votos_por_candidato[cand.id_candidato] = 0; });
  });
  return c;
}

export default function CentroComputoPage() {
  const { usuario, procesoActivo } = useAuth();
  const [permisos, setPermisos] = useState(null);
  const [localizador, setLocalizador] = useState(null);
  const [anforaSeleccionada, setAnforaSeleccionada] = useState(null);
  const [actaActual, setActaActual] = useState(null);
  const [meta, setMeta] = useState({ departamento: "La Paz", ciudad: "La Paz", recinto: "", ambiente: "", numero_anfora: "" });
  const [urlImagen, setUrlImagen] = useState(null);
  const [imagenSeguraBlob, setImagenSeguraBlob] = useState(null);
  const [rutaStorage, setRutaStorage] = useState(null);
  const [conteos, setConteos] = useState({});
  const [zoom, setZoom] = useState(1);
  const [rotacion, setRotacion] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [cargandoActa, setCargandoActa] = useState(false);
  const [ocrResumen, setOcrResumen] = useState(null);
  const [modalObservacion, setModalObservacion] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [observando, setObservando] = useState(false);
  const inputFile = useRef(null);
  const solicitudAnforaRef = useRef(0);

  const esBloqueado = actaActual?.esta_bloqueada || false;
  const puedeCargar = permisos?.puede_cargar || false;
  const puedeValidar = permisos?.puede_validar || false;
  const puedeEditar = !cargandoActa && !esBloqueado && (permisos?.es_admin || puedeCargar || puedeValidar);
  const claveEstadoActual = esBloqueado ? "consolidada" : (actaActual?.estado || "sin_datos");
  const estadoActual = ESTADO_ANFORA[claveEstadoActual] || {
    etiqueta: String(claveEstadoActual).replaceAll("_", " "),
    clase: "bg-slate-100 text-slate-700",
  };
  const [modalDesbloqueo, setModalDesbloqueo] = useState(false);
  const [motivoTextual, setMotivoTextual] = useState("");
  const [desbloqueando, setDesbloqueando] = useState(false);

  const papeletasActivas = (procesoActivo?.papeletas || []).filter((papeleta) => (
    anforaSeleccionada?.id_papeletas?.includes(papeleta.id_papeleta)
  ));
  useEffect(() => {
    if (!urlImagen) {
      setImagenSeguraBlob(null);
      return undefined;
    }
    let urlTemporal = null;
    let activa = true;
    api.get(urlImagen, { responseType: "blob" })
      .then(({ data }) => {
        urlTemporal = URL.createObjectURL(data);
        if (activa) setImagenSeguraBlob(urlTemporal);
      })
      .catch(() => {
        if (activa) setImagenSeguraBlob(null);
      });
    return () => {
      activa = false;
      if (urlTemporal) URL.revokeObjectURL(urlTemporal);
    };
  }, [urlImagen]);
  useEffect(() => {
    if (!procesoActivo) return;
    setConteos({});
    setAnforaSeleccionada(null);
    setActaActual(null);
    cargarLocalizador();
    cargarPermisos();
  }, [procesoActivo?.id_eleccion]);

  const cargarPermisos = async () => {
    try {
      const { data } = await api.get(`/operacion/procesos/${procesoActivo.id_eleccion}/permisos`);
      setPermisos(data);
    } catch (e) {
      setPermisos({ puede_cargar: false, puede_validar: false, es_admin: false });
    }
  };

  const cargarLocalizador = async () => {
    try {
      const { data } = await api.get(
        `/procesos/${procesoActivo.id_eleccion}/localizador-anforas`,
      );
      setLocalizador(data);
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    }
  };

  const seleccionarAnfora = async (anfora) => {
    const idSolicitud = solicitudAnforaRef.current + 1;
    solicitudAnforaRef.current = idSolicitud;
    setAnforaSeleccionada(anfora);
    setActaActual(null);
    setCargandoActa(true);
    setUrlImagen(null); setRutaStorage(null);
    setMeta({ departamento: "", ciudad: "", recinto: "", ambiente: "", numero_anfora: anfora.numero_anfora });
    setConteos(conteosIniciales(procesoActivo, (procesoActivo.papeletas || []).filter((papeleta) => anfora.id_papeletas?.includes(papeleta.id_papeleta))));
    setOcrResumen(null);
    setZoom(1); setRotacion(0);
    try {
      const { data } = await api.get(
        `/actas?id_eleccion=${procesoActivo.id_eleccion}&id_anfora=${anfora.id}`,
      );
      const existente = [...data].sort((primera, segunda) => {
        const puntaje = (acta) => [
          Number(Boolean(acta.conteos?.length)),
          Number(Boolean(acta.esta_bloqueada)),
          acta.actualizado_en || "",
        ];
        const [conteosA, bloqueadaA, fechaA] = puntaje(primera);
        const [conteosB, bloqueadaB, fechaB] = puntaje(segunda);
        if (conteosB !== conteosA) return conteosB - conteosA;
        if (bloqueadaB !== bloqueadaA) return bloqueadaB - bloqueadaA;
        return fechaB.localeCompare(fechaA);
      })[0];
      if (solicitudAnforaRef.current !== idSolicitud) return;
      if (existente) cargarActa(existente, anfora);
      else setActaActual(null);
      setCargandoActa(false);
    } catch (e) {
      if (solicitudAnforaRef.current !== idSolicitud) return;
      setActaActual(null);
      setCargandoActa(false);
      toast.error("No fue posible recuperar el acta del ánfora seleccionada.");
    }
  };

  const limpiarSeleccionAnfora = () => {
    solicitudAnforaRef.current += 1;
    setAnforaSeleccionada(null);
    setActaActual(null);
    setUrlImagen(null);
    setRutaStorage(null);
    setConteos({});
    setOcrResumen(null);
    setMeta({ departamento: "", ciudad: "", recinto: "", ambiente: "", numero_anfora: "" });
    setZoom(1);
    setRotacion(0);
    setCargandoActa(false);
  };

  const cargarActa = (a, anfora = anforaSeleccionada) => {
    setActaActual(a);
    setUrlImagen(a.url_imagen);
    setRutaStorage(a.ruta_storage);
    setMeta({
      departamento: a.departamento, ciudad: a.ciudad, recinto: a.recinto,
      ambiente: a.ambiente, numero_anfora: a.numero_anfora,
    });
    const papeletas = (procesoActivo.papeletas || []).filter((papeleta) => (
      anfora?.id_papeletas?.includes(papeleta.id_papeleta)
    ));
    const c = conteosIniciales(procesoActivo, papeletas);
    (a.conteos || []).forEach((ex) => {
      if (c[ex.id_franja]) {
        c[ex.id_franja] = {
          votos_por_candidato: { ...c[ex.id_franja].votos_por_candidato, ...(ex.votos_por_candidato || {}) },
          votos_blancos: ex.votos_blancos || 0,
          votos_nulos: ex.votos_nulos || 0,
        };
      }
    });
    setConteos(c);
    setZoom(1); setRotacion(0);
  };

  const subirArchivo = async (archivo) => {
    if (!archivo) return;
    if (!anforaSeleccionada) {
      toast.warning("Seleccione un ánfora antes de cargar un acta.");
      return;
    }
    try {
      setSubiendo(true);
      toast.info("Comprimiendo acta a 1024×1024 escala grises…");
      const comprimida = await comprimirImagenActa(archivo);
      const fd = new FormData();
      fd.append("id_eleccion", procesoActivo.id_eleccion);
      fd.append("id_anfora", anforaSeleccionada.id);
      fd.append("archivo", comprimida);
      const { data } = await api.post("/procesar-ocr", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setUrlImagen(data.url_imagen);
      setRutaStorage(data.ruta_storage);
      if (data.ocr?.conteos) {
        const nuevo = { ...conteos };
        data.ocr.conteos.forEach((oc) => {
          if (nuevo[oc.id_franja]) {
            Object.entries(oc.votos_por_candidato || {}).forEach(([idc, v]) => {
              if (v != null && !isNaN(v)) nuevo[oc.id_franja].votos_por_candidato[idc] = Number(v);
            });
            if (oc.votos_blancos != null) nuevo[oc.id_franja].votos_blancos = Number(oc.votos_blancos);
            if (oc.votos_nulos != null) nuevo[oc.id_franja].votos_nulos = Number(oc.votos_nulos);
          }
        });
        setConteos(nuevo);
      }
      setOcrResumen(data.ocr);
      if (data.ocr?.error) {
        toast.warning("La imagen se guardó, pero falló el reconocimiento OCR.");
      } else if (data.ocr?.conteos_detectados === 0) {
        toast.warning("OCR completado. Revise el texto detectado y complete los votos.");
      } else {
        toast.success("OCR completado. Revise los valores antes de consolidar.");
      }
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail) || "Fallo al procesar OCR");
    } finally { setSubiendo(false); }
  };

  const guardar = async () => {
    try {
      const payload = {
        id_acta: actaActual?.id,
        id_eleccion: procesoActivo.id_eleccion,
        ...meta,
        id_anfora: anforaSeleccionada?.id,
        url_imagen: urlImagen, ruta_storage: rutaStorage,
        conteos: Object.entries(conteos).map(([id_franja, c]) => ({ id_franja, ...c })),
      };
      const { data } = await api.post("/guardar-acta", payload);
      setActaActual(data);
      toast.success("Acta guardada (borrador).");
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail) || "Error al guardar");
    } finally {
      cargarLocalizador();
    }
  };

  const consolidarBloquear = async () => {
    if (!actaActual) { toast.warning("Guarde el acta antes de consolidar."); return; }
    if (!window.confirm("¿Consolidar y bloquear? Solo un administrador podrá desbloquear con motivo textual.")) return;
    try {
      await api.post("/centro-computo/bloquear", { id_acta: actaActual.id });
      toast.success("Acta consolidada y bloqueada.");
      const { data } = await api.get(`/actas/${actaActual.id}`);
      setActaActual(data);
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    } finally {
      cargarLocalizador();
    }
  };

  const enviarValidacion = async () => {
    if (!actaActual) {
      toast.warning("Guarde el borrador antes de enviarlo.");
      return;
    }
    try {
      await api.post("/centro-computo/enviar", { id_acta: actaActual.id });
      toast.success("Acta enviada a validación.");
      const { data } = await api.get(`/actas/${actaActual.id}`);
      setActaActual(data);
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    } finally {
      cargarLocalizador();
    }
  };

  const confirmarObservacion = async () => {
    if (!actaActual || observacion.trim().length < 10) {
      toast.warning("La observación debe tener al menos 10 caracteres.");
      return;
    }
    setObservando(true);
    try {
      await api.post("/centro-computo/observar", { id_acta: actaActual.id, observacion: observacion.trim() });
      toast.success("Acta observada y devuelta al operador.");
      setModalObservacion(false);
      setObservacion("");
      const { data } = await api.get(`/actas/${actaActual.id}`);
      setActaActual(data);
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    } finally {
      setObservando(false);
      cargarLocalizador();
    }
  };

  const desbloquear = async () => {
    if (motivoTextual.trim().length < 10) {
      toast.warning("Motivo textual mínimo 10 caracteres.");
      return;
    }
    setDesbloqueando(true);
    try {
      await api.post("/admin/desbloquear", { id_acta: actaActual.id, motivo_textual: motivoTextual.trim() });
      toast.success("Acta desbloqueada. Registrado en bitácora inmutable.");
      setModalDesbloqueo(false); setMotivoTextual("");
      const { data } = await api.get(`/actas/${actaActual.id}`);
      setActaActual(data);
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    } finally {
      setDesbloqueando(false);
      cargarLocalizador();
    }
  };

  const setVotoCandidato = (idF, idC, v) => {
    setConteos((prev) => ({
      ...prev,
      [idF]: { ...prev[idF], votos_por_candidato: { ...prev[idF].votos_por_candidato, [idC]: Math.max(0, Number(v) || 0) } }
    }));
  };
  const setBlancos = (idF, v) => setConteos((p) => ({ ...p, [idF]: { ...p[idF], votos_blancos: Math.max(0, Number(v) || 0) } }));
  const setNulos = (idF, v) => setConteos((p) => ({ ...p, [idF]: { ...p[idF], votos_nulos: Math.max(0, Number(v) || 0) } }));

  const totalPorFranja = (idF) => {
    const c = conteos[idF]; if (!c) return { validos: 0, total: 0 };
    const validos = Object.values(c.votos_por_candidato).reduce((a, b) => a + (Number(b) || 0), 0);
    return { validos, total: validos + (c.votos_blancos || 0) + (c.votos_nulos || 0) };
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8" data-testid="centro-computo-page">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="stre-badge bg-[#F5F3FF] text-[#7C3AED] font-data">{procesoActivo.id_eleccion}</span>
            {anforaSeleccionada && !cargandoActa && (
              <span className={`stre-badge ${estadoActual.clase}`} data-testid="estado-acta-operativa">
                {esBloqueado ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {estadoActual.etiqueta}
              </span>
            )}
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
            {procesoActivo.nombre}
          </h1>
        </div>
      </div>

      <LocalizadorAnfora
        key={procesoActivo.id_eleccion}
        data={localizador}
        anforaSeleccionada={anforaSeleccionada}
        onSeleccionar={seleccionarAnfora}
        onLimpiarSeleccion={limpiarSeleccionAnfora}
      />

      {anforaSeleccionada && cargandoActa && (
        <div className="mt-6 border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800" data-testid="cargando-acta-seleccionada">
          Cargando el acta consolidada del ánfora seleccionada…
        </div>
      )}

      {anforaSeleccionada && !cargandoActa && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Columna izquierda: imagen */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-inner flex flex-col h-[720px] overflow-hidden" data-testid="panel-imagen">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between text-white">
            <div className="flex items-center gap-2 text-xs font-data uppercase tracking-widest">
              <ScanLine className="w-4 h-4 text-[#7C3AED]" /> Acta escaneada · 1024×1024 · grises
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))} data-testid="acta-image-zoom-out"><ZoomOut className="w-4 h-4" /></Button>
              <span className="text-white font-data text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} data-testid="acta-image-zoom-in"><ZoomIn className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={() => { setZoom(1); setRotacion(0); }}><RotateCcw className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setRotacion((r) => (r + 90) % 360)}>↻</Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto acta-canvas flex items-center justify-center p-6 relative">
            {imagenSeguraBlob ? (
              <img
                src={imagenSeguraBlob}
                alt="Acta electoral"
                style={{ transform: `scale(${zoom}) rotate(${rotacion}deg)`, transition: "transform 200ms ease" }}
                className="max-w-full origin-center shadow-2xl border border-slate-700"
                data-testid="acta-imagen"
              />
            ) : (
              <div className="text-center text-slate-500">
                <ImageOff className="w-16 h-16 mx-auto mb-4 opacity-60" />
                <div className="font-data text-xs uppercase tracking-widest">Sin acta cargada</div>
                <Button className="mt-6 bg-[#7C3AED] hover:bg-[#6D28D9]" onClick={() => inputFile.current?.click()} disabled={subiendo || !puedeEditar} data-testid="subir-acta-btn">
                  <Upload className="w-4 h-4 mr-2" /> {subiendo ? "Procesando…" : "Subir foto del acta"}
                </Button>
                <div className="text-[10px] font-data mt-3 text-slate-600">La imagen se comprime en el navegador antes de enviarse al servidor.</div>
              </div>
            )}
            <input ref={inputFile} type="file" accept="image/*" hidden onChange={(e) => subirArchivo(e.target.files?.[0])} data-testid="input-acta-archivo" />
          </div>
          {urlImagen && (
            <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-data">
              <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-[#7C3AED]" /> Cliente-side compression aplicada</span>
              <button className="text-[#7C3AED] hover:text-[#A78BFA]" onClick={() => inputFile.current?.click()} data-testid="ocr-preview-button">Reemplazar / OCR de nuevo</button>
            </div>
          )}
        </div>

        {/* Columna derecha: formulario */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-[720px] overflow-y-auto p-6" data-testid="panel-formulario">
          {esBloqueado && (
            <div className="mb-4 p-3 rounded-md bg-[#FEF2F2] border border-red-200 flex items-start gap-3 text-red-800">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold">Acta consolidada</div>
                <div className="text-xs">Edición deshabilitada. {usuario.rol === "admin" ? "Puede desbloquear con motivo textual." : "Solicite desbloqueo administrativo."}</div>
                {usuario.rol === "admin" && (
                  <Button size="sm" variant="destructive" className="mt-2" onClick={() => setModalDesbloqueo(true)} data-testid="admin-unblock-trigger-button">
                    <Unlock className="w-3.5 h-3.5 mr-1" /> Desbloquear con justificación
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="mb-6 border border-blue-200 bg-blue-50 p-4" data-testid="contexto-anfora-confirmado">
            <div className="text-[10px] font-data uppercase tracking-widest text-blue-700">Contexto confirmado</div>
            <div className="mt-2 text-lg font-bold text-slate-900">Ánfora {anforaSeleccionada.numero_anfora}</div>
            <div className="text-sm text-slate-600">{anforaSeleccionada.nombre}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-data text-slate-600">
              <span>Mesa {anforaSeleccionada.numero_mesa}</span>
              <span>·</span>
              <span>{anforaSeleccionada.nombre_recinto}</span>
              {anforaSeleccionada.tipo_mesa && <><span>·</span><span>Mesa {anforaSeleccionada.tipo_mesa}</span></>}
            </div>
          </div>

          {/* Boletas → Franjas (recuento independiente por franja) */}
          <Tabs defaultValue={papeletasActivas[0]?.id_papeleta}>
            <TabsList className="w-full flex-wrap h-auto" data-testid="tabs-papeletas">
              {papeletasActivas.map((p) => (
                <TabsTrigger key={p.id_papeleta} value={p.id_papeleta} className="text-xs">{p.nombre}</TabsTrigger>
              ))}
            </TabsList>
            {papeletasActivas.map((p) => (
              <TabsContent key={p.id_papeleta} value={p.id_papeleta} className="mt-4 space-y-6">
                {(p.franjas || []).sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((fr) => {
                  const tot = totalPorFranja(fr.id_franja);
                  return (
                    <div key={fr.id_franja} className="border border-slate-200 rounded-lg overflow-hidden" data-testid={`seccion-franja-${fr.id_franja}`}>
                      <div className="px-3 py-2 flex items-center justify-between flex-wrap gap-1" style={{ background: fr.color_franja || "#F8FAFC" }}>
                        <div className="text-sm font-bold">{fr.titulo}</div>
                        <div className="flex items-center gap-1">
                          <span className={`stre-badge ${BADGE_TIPO_VOTO[fr.tipo_voto] || "bg-slate-100 text-slate-600"}`}>
                            {(fr.tipo_voto || "nominal").replaceAll("_", " ")}
                          </span>
                          <span className="text-[10px] font-data text-slate-500">
                            {fr.calcular_porcentaje_sobre?.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {(fr.candidatos || []).map((c) => (
                          <div key={c.id_candidato} className="flex items-center gap-3 p-2 rounded-md border border-slate-100 hover:border-slate-300 transition">
                            <div className="w-2 h-8 rounded-sm shrink-0" style={{ background: c.color_hex || "#94A3B8" }} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-900 truncate">{c.nombre}</div>
                              {c.partido && <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{c.sigla || c.partido}</div>}
                            </div>
                            <Input
                              type="number" min="0"
                              value={conteos[fr.id_franja]?.votos_por_candidato[c.id_candidato] ?? 0}
                              onChange={(e) => setVotoCandidato(fr.id_franja, c.id_candidato, e.target.value)}
                            disabled={!puedeEditar}
                              className="w-24 text-right font-data font-bold"
                              data-testid={`franja-vote-input-${c.id_candidato}`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="p-3 pt-0 grid grid-cols-2 gap-3">
                        {fr.permite_blancos !== false && (
                          <div>
                            <Label className="text-[10px] font-data uppercase tracking-widest text-slate-500">Votos Blancos</Label>
                            <Input type="number" min="0" value={conteos[fr.id_franja]?.votos_blancos ?? 0}
                              onChange={(e) => setBlancos(fr.id_franja, e.target.value)}
                              disabled={!puedeEditar} className="font-data font-bold" data-testid={`blancos-count-input-${fr.id_franja}`} />
                          </div>
                        )}
                        {fr.permite_nulos !== false && (
                          <div>
                            <Label className="text-[10px] font-data uppercase tracking-widest text-slate-500">Votos Nulos</Label>
                            <Input type="number" min="0" value={conteos[fr.id_franja]?.votos_nulos ?? 0}
                              onChange={(e) => setNulos(fr.id_franja, e.target.value)}
                              disabled={!puedeEditar} className="font-data font-bold" data-testid={`nulos-count-input-${fr.id_franja}`} />
                          </div>
                        )}
                      </div>
                      <div className="mx-3 mb-3 p-3 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between font-data text-sm">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-500">Válidos franja</div>
                          <div className="text-lg font-bold">{tot.validos}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-500">Total franja</div>
                          <div className="text-lg font-bold">{tot.total}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-widest text-slate-500">Regla</div>
                          <div className="text-[10px]">{fr.calcular_porcentaje_sobre?.replaceAll("_", " ")}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!p.franjas || p.franjas.length === 0) && (
                  <div className="text-center py-6 text-slate-400 text-sm font-data">Esta boleta no tiene franjas configuradas.</div>
                )}
              </TabsContent>
            ))}
          </Tabs>

          {ocrResumen?.error && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> OCR devolvió: {ocrResumen.error}
            </div>
          )}
          {ocrResumen?.aviso && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md flex gap-2" data-testid="ocr-aviso">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {ocrResumen.aviso}
            </div>
          )}
          {!!ocrResumen?.campos_detectados?.length && (
            <details className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-xs" data-testid="ocr-campos-detectados">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Campos detectados por Document AI ({ocrResumen.campos_detectados.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {ocrResumen.campos_detectados.map((campo, indice) => (
                  <li key={`${campo.nombre}-${indice}`} className="grid grid-cols-1 gap-1 border-t border-slate-100 pt-2 sm:grid-cols-2">
                    <span className="font-medium text-slate-600">{campo.nombre || "Campo"}</span>
                    <span className="font-data text-slate-800">{campo.valor || "Sin valor"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!!ocrResumen?.texto_detectado && (
            <details className="mt-2 rounded-md border border-slate-200 bg-white p-3 text-xs" data-testid="ocr-texto-detectado">
              <summary className="cursor-pointer font-semibold text-slate-700">Ver texto reconocido por Document AI</summary>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-data text-slate-600">
                {ocrResumen.texto_detectado}
              </pre>
            </details>
          )}

          <div className="mt-6 grid grid-cols-1 gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2" data-testid="barra-acciones-acta">
            <Button variant="outline" onClick={guardar} disabled={!puedeEditar} data-testid="acta-enable-edit-button" className="h-10 w-full justify-center">
              <Save className="w-4 h-4 mr-2" /> Guardar borrador
            </Button>
            {puedeCargar && (
              <Button onClick={enviarValidacion} disabled={esBloqueado || !actaActual || actaActual?.estado === "enviado"} className="h-10 w-full justify-center" data-testid="enviar-validacion-button">
                <Upload className="w-4 h-4 mr-2" /> Enviar a validación
              </Button>
            )}
            {puedeValidar && !esBloqueado && actaActual && (
              <Button variant="destructive" onClick={() => setModalObservacion(true)} className="h-10 w-full justify-center" data-testid="observar-acta-button">
                <AlertTriangle className="w-4 h-4 mr-2" /> Observar
              </Button>
            )}
            <Button onClick={consolidarBloquear} disabled={esBloqueado || !actaActual || !puedeValidar}
              className="h-10 w-full justify-center bg-[#059669] hover:bg-[#047857]" data-testid="acta-consolidate-block-button">
              <Lock className="w-4 h-4 mr-2" /> Consolidar y Bloquear
            </Button>
          </div>
        </div>
      </div>
      )}

      <Dialog open={modalDesbloqueo} onOpenChange={(abierto) => {
        if (desbloqueando) return;
        setModalDesbloqueo(abierto);
        if (!abierto) setMotivoTextual("");
      }}>
        <DialogContent data-testid="modal-desbloqueo">
          <DialogHeader>
            <DialogTitle>Solicitud de Desbloqueo de Acta Electoral</DialogTitle>
            <DialogDescription>Esta acción quedará registrada permanentemente en la bitácora inmutable de auditoría.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-widest text-slate-600">Motivo Textual (mín. 10 caracteres)</Label>
            <Textarea value={motivoTextual} onChange={(e) => setMotivoTextual(e.target.value)} rows={4}
              placeholder="Justificación técnica o legal detallada…" data-testid="audit-motivo-textual-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalDesbloqueo(false); setMotivoTextual(""); }} disabled={desbloqueando} data-testid="cancelar-desbloqueo-button">Cancelar</Button>
            <Button variant="destructive" onClick={desbloquear} disabled={desbloqueando || motivoTextual.trim().length < 10} data-testid="audit-confirm-unblock-button">
              <Unlock className="w-4 h-4 mr-2" /> {desbloqueando ? "Desbloqueando…" : "Confirmar Desbloqueo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalObservacion} onOpenChange={(abierto) => {
        if (observando) return;
        setModalObservacion(abierto);
        if (!abierto) setObservacion("");
      }}>
        <DialogContent data-testid="modal-observacion-acta">
          <DialogHeader>
            <DialogTitle>Observar acta para corrección</DialogTitle>
            <DialogDescription>
              La observación devolverá esta acta al operador de carga. Detalle claramente
              la corrección requerida antes de enviarla nuevamente a validación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Ánfora {anforaSeleccionada?.numero_anfora} · {anforaSeleccionada?.nombre}
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-slate-600">Observación para el operador</Label>
              <Textarea
                value={observacion}
                onChange={(evento) => setObservacion(evento.target.value)}
                rows={5}
                placeholder="Describa con precisión qué debe verificarse o corregirse…"
                data-testid="observacion-acta-textarea"
              />
              <div className="mt-1 text-right text-[10px] font-data text-slate-500">{observacion.trim().length}/10 caracteres mínimos</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalObservacion(false); setObservacion(""); }} disabled={observando} data-testid="cancelar-observacion-button">Cancelar</Button>
            <Button variant="destructive" onClick={confirmarObservacion} disabled={observando || observacion.trim().length < 10} data-testid="confirmar-observacion-button">
              <AlertTriangle className="w-4 h-4 mr-2" /> {observando ? "Enviando…" : "Devolver con observación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LocalizadorAnfora({
  data,
  anforaSeleccionada,
  onSeleccionar,
  onLimpiarSeleccion,
}) {
  const [numero, setNumero] = useState("");
  const [idNodo, setIdNodo] = useState("");
  const [idRecinto, setIdRecinto] = useState("");
  const [idMesa, setIdMesa] = useState("");

  if (!data) {
    return (
      <div className="border border-slate-200 bg-white p-6 text-sm text-slate-500" data-testid="cargando-localizador-anfora">
        Cargando localizador de ánforas…
      </div>
    );
  }

  const recintos = (data.recintos || []).filter((recinto) => (
    !idNodo ||
    recinto.id_nodo_padre === idNodo ||
    (recinto.path_ancestros || []).some((nodo) => nodo.id === idNodo)
  ));
  const mesas = (data.mesas || []).filter((mesa) => !idRecinto || mesa.id_recinto === idRecinto);
  const anforasJerarquia = (data.anforas || []).filter((anfora) => {
    const coincideNodo = !idNodo || (anfora.path_ancestros || []).some((nodo) => nodo.id === idNodo);
    const coincideRecinto = !idRecinto || anfora.id_recinto === idRecinto;
    const coincideMesa = !idMesa || anfora.id_mesa === idMesa;
    return coincideNodo && coincideRecinto && coincideMesa;
  });
  const anforasDirectas = (data.anforas || []).filter((anfora) => (
    String(anfora.numero_anfora).toLowerCase().includes(numero.trim().toLowerCase())
  ));
  const hayBusqueda = Boolean(numero.trim() || idNodo);
  const resultados = numero.trim() ? anforasDirectas : anforasJerarquia;

  const confirmar = (anfora) => {
    const mesa = (data.mesas || []).find((item) => item.id === anfora.id_mesa);
    const recinto = (data.recintos || []).find((item) => item.id === anfora.id_recinto);
    onSeleccionar({
      ...anfora,
      numero_mesa: mesa?.numero_mesa || "—",
      nombre_recinto: recinto?.nombre || "—",
    });
  };

  const buscarDirecto = (valor) => {
    onLimpiarSeleccion();
    setNumero(valor);
    setIdNodo("");
    setIdRecinto("");
    setIdMesa("");
  };

  const seleccionarNodo = (valor) => {
    onLimpiarSeleccion();
    setNumero("");
    setIdNodo(valor);
    setIdRecinto("");
    setIdMesa("");
  };

  const seleccionarRecinto = (valor) => {
    onLimpiarSeleccion();
    setNumero("");
    setIdRecinto(valor);
    setIdMesa("");
  };

  const seleccionarMesa = (valor) => {
    onLimpiarSeleccion();
    setNumero("");
    setIdMesa(valor);
  };

  return (
    <section className="border border-slate-200 bg-white p-4 sm:p-6" data-testid="localizador-anfora">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 bg-blue-50 p-2 text-blue-700"><Search className="w-5 h-5" /></div>
        <div>
          <div className="font-display text-lg font-bold">Identificar ánfora antes de transcribir</div>
          <div className="mt-1 text-sm text-slate-500">
            Busque por número directo o recorra la estructura electoral para confirmar mesa y recinto.
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-[210px]">
          <div className="mb-1 text-[10px] font-data uppercase tracking-widest text-slate-500">Búsqueda directa</div>
          <Input
            value={numero}
            onChange={(evento) => buscarDirecto(evento.target.value)}
            placeholder="Número de ánfora"
            className="h-10 font-data"
            data-testid="buscar-numero-anfora"
          />
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="mb-1 text-[10px] font-data uppercase tracking-widest text-slate-500">Búsqueda jerárquica</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={idNodo} onValueChange={seleccionarNodo}>
              <SelectTrigger className="h-10" data-testid="filtro-nodo-anfora"><SelectValue placeholder="Nivel" /></SelectTrigger>
              <SelectContent>{(data.nodos || []).map((nodo) => <SelectItem key={nodo.id} value={nodo.id}>{nodo.nombre_nodo}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={idRecinto} onValueChange={seleccionarRecinto} disabled={!idNodo}>
              <SelectTrigger className="h-10" data-testid="filtro-recinto-anfora"><SelectValue placeholder="Recinto" /></SelectTrigger>
              <SelectContent>{recintos.map((recinto) => <SelectItem key={recinto.id} value={recinto.id}>{recinto.nombre}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={idMesa} onValueChange={seleccionarMesa} disabled={!idRecinto}>
              <SelectTrigger className="h-10" data-testid="filtro-mesa-anfora"><SelectValue placeholder="Mesa" /></SelectTrigger>
              <SelectContent>{mesas.map((mesa) => <SelectItem key={mesa.id} value={mesa.id}>Mesa {mesa.numero_mesa}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {anforaSeleccionada ? (
        <div className="mt-5 border border-blue-200 bg-blue-50 p-4" data-testid="cabecera-anfora-seleccionada">
          <div className="text-[10px] font-data uppercase tracking-widest text-blue-700">Ánfora seleccionada</div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-data text-lg font-bold text-slate-900">Ánfora {anforaSeleccionada.numero_anfora}</div>
              <div className="text-sm text-slate-700">{anforaSeleccionada.nombre} · Mesa {anforaSeleccionada.numero_mesa} · {anforaSeleccionada.nombre_recinto}</div>
            </div>
            <Button variant="outline" size="sm" onClick={onLimpiarSeleccion} data-testid="cambiar-anfora-button">Cambiar ánfora</Button>
          </div>
        </div>
      ) : hayBusqueda ? (
        <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="resultados-localizador-anfora">
        {resultados.map((anfora) => {
          const mesa = (data.mesas || []).find((item) => item.id === anfora.id_mesa);
          const recinto = (data.recintos || []).find((item) => item.id === anfora.id_recinto);
          const activa = anforaSeleccionada?.id === anfora.id;
          const estado = ESTADO_ANFORA[anfora.estado_acta] || (
            anfora.estado_acta
              ? {
                etiqueta: String(anfora.estado_acta).replaceAll("_", " "),
                clase: "bg-slate-100 text-slate-700",
              }
              : ESTADO_ANFORA.sin_datos
          );
          return (
            <button
              key={anfora.id}
              type="button"
              onClick={() => confirmar(anfora)}
              className={`border p-3 text-left transition ${activa ? "border-blue-700 bg-blue-50" : "border-slate-200 hover:border-blue-400"}`}
              data-testid={`seleccionar-anfora-${anfora.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-data text-sm font-bold text-slate-900"><MapPin className="w-4 h-4 text-blue-700" />{anfora.numero_anfora}</div>
                <span className={`stre-badge shrink-0 ${estado.clase}`} data-testid={`estado-anfora-${anfora.id}`}>{estado.etiqueta}</span>
              </div>
              <div className="mt-2 text-sm">{anfora.nombre}</div>
              <div className="mt-2 text-[10px] font-data uppercase tracking-wider text-slate-500">Mesa {mesa?.numero_mesa || "—"} · {recinto?.nombre || "—"}</div>
              {anfora.tipo_mesa && <div className="mt-1 text-[10px] font-data uppercase text-blue-700">Mesa {anfora.tipo_mesa}</div>}
            </button>
          );
        })}
        {resultados.length === 0 && <div className="border border-dashed border-slate-200 p-4 text-sm text-slate-400">No se encontraron ánforas para estos filtros.</div>}
        </div>
      ) : (
        <div className="mt-5 border border-dashed border-slate-200 p-4 text-sm text-slate-500" data-testid="instruccion-busqueda-anfora">Seleccione un nivel o escriba un número de ánfora para iniciar la búsqueda.</div>
      )}
    </section>
  );
}
