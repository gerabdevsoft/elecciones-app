import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatearError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Grip, Plus, Printer, Save, Trash2 } from "lucide-react";

const FRANJA_DEFAULT = {
  x: 24,
  y: 72,
  w: 650,
  h: 360,
  fondo_color: "#FFFFFF",
  fondo_url: "",
  columnas: 3,
  ancho_candidato: 150,
  alto_candidato: 210,
  espaciado_candidatos: 8,
  tamano_foto: 76,
  titulo_visible: true,
  campos_candidato: ["foto", "nombre", "sigla", "casilla"],
  componentes_candidato: {
    foto: { x: 37, y: 10, w: 76, h: 76, font_size: 8, font_family: "sans-serif" },
    nombre: { x: 8, y: 94, w: 134, h: 26, font_size: 11, font_family: "sans-serif" },
    sigla: { x: 8, y: 123, w: 134, h: 21, font_size: 9, font_family: "sans-serif" },
    casilla: { x: 55, y: 155, w: 40, h: 40, font_size: 8, font_family: "sans-serif" },
  },
};

const PX_POR_MM = 3.78;
const CAMPOS_CANDIDATO = [
  { id: "foto", nombre: "Foto" },
  { id: "nombre", nombre: "Nombre" },
  { id: "sigla", nombre: "Sigla / partido" },
  { id: "casilla", nombre: "Casilla de marcado" },
];

const crearFranja = (franja, indice) => ({
  ...FRANJA_DEFAULT,
  id_franja: franja.id_franja,
  x: 24,
  y: 72 + indice * 385,
  fondo_color: franja.color_franja || "#F8FAFC",
});

const crearBoleta = (papeleta, indice) => ({
  id_papeleta: papeleta.id_papeleta,
  orientacion: "vertical",
  ancho_mm: 210,
  alto_mm: 297,
  fondo_color: "#FFFFFF",
  fondo_url: "",
  encabezado: papeleta.nombre,
  encabezado_config: { x: 24, y: 14, w: 650, h: 38, font_size: 16, font_family: "sans-serif" },
  pie: "",
  pie_config: { x: 24, y: 1065, w: 650, h: 24, font_size: 11, font_family: "monospace" },
  franjas: (papeleta.franjas || []).map(crearFranja),
  orden: indice,
});

function normalizarFranja(franja, indice) {
  return {
    ...FRANJA_DEFAULT,
    ...franja,
    y: franja.y ?? 72 + indice * 385,
    campos_candidato: franja.campos_candidato || FRANJA_DEFAULT.campos_candidato,
    componentes_candidato: {
      ...FRANJA_DEFAULT.componentes_candidato,
      ...(franja.componentes_candidato || {}),
    },
  };
}

function normalizarBoleta(guardada, papeleta, indice) {
  const base = crearBoleta(papeleta, indice);
  return {
    ...base,
    ...guardada,
    encabezado_config: { ...base.encabezado_config, ...(guardada?.encabezado_config || {}) },
    pie_config: { ...base.pie_config, ...(guardada?.pie_config || {}) },
    franjas: (guardada?.franjas || base.franjas).map(normalizarFranja),
  };
}

function normalizarDiseno(disenoGuardado, papeletas) {
  if (disenoGuardado?.boletas?.length) {
    return {
      boletas: papeletas.map((papeleta, indice) => {
        const guardada = disenoGuardado.boletas.find(
          (boleta) => boleta.id_papeleta === papeleta.id_papeleta,
        );
        return normalizarBoleta(guardada, papeleta, indice);
      }),
    };
  }

  if (disenoGuardado?.franjas) {
    return {
      boletas: papeletas.map((papeleta, indice) => normalizarBoleta({
        orientacion: disenoGuardado.orientacion || "vertical",
        ancho_mm: disenoGuardado.ancho_mm || 210,
        alto_mm: disenoGuardado.alto_mm || 297,
        fondo_color: disenoGuardado.fondo_color || "#FFFFFF",
        fondo_url: disenoGuardado.fondo_url || "",
        encabezado: disenoGuardado.encabezado || papeleta.nombre,
        pie: disenoGuardado.pie || "",
        franjas: disenoGuardado.franjas.filter(
          (franja) => franja.id_papeleta === papeleta.id_papeleta,
        ),
      }, papeleta, indice)),
    };
  }

  return { boletas: papeletas.map(crearBoleta) };
}

export function renderCandidato(c, f, interaccion = {}) {
  const campos = f.campos_candidato || FRANJA_DEFAULT.campos_candidato;
  const color = c.color_hex || "#94A3B8";
  const foto = c.foto_url ? `${process.env.REACT_APP_BACKEND_URL}${c.foto_url}` : null;
  const componentes = {
    ...FRANJA_DEFAULT.componentes_candidato,
    ...(f.componentes_candidato || {}),
  };
  const campo = (id, contenido) => {
    if (!campos.includes(id)) return null;
    const config = componentes[id];
    const seleccionado = interaccion.componenteSeleccionado === id;
    return (
      <div
        key={id}
        onMouseDown={(evento) => interaccion.onIniciarCampo?.(evento, id, "mover")}
        style={{
          position: "absolute",
          left: config.x,
          top: config.y,
          width: config.w,
          height: config.h,
          fontSize: config.font_size,
          fontFamily: config.font_family,
          cursor: interaccion.onIniciarCampo ? "move" : "default",
          outline: seleccionado ? "2px solid #2563EB" : "none",
          overflow: "hidden",
        }}
        data-testid={`campo-candidato-${id}-${c.id_candidato}`}
      >
        {contenido}
        {seleccionado && (
          <div
            onMouseDown={(evento) => interaccion.onIniciarCampo?.(evento, id, "redimensionar")}
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 9,
              height: 9,
              background: "#2563EB",
              cursor: "nwse-resize",
            }}
            data-testid={`redimensionar-campo-${id}`}
          />
        )}
      </div>
    );
  };
  return (
    <div
      key={c.id_candidato}
      style={{
        border: `2px solid ${color}`,
        background: "white",
        position: "relative",
        minWidth: 0,
        textAlign: "center",
      }}
    >
      {campo("foto", foto ? (
          <img
            src={foto}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: "#E2E8F0",
              color: "#64748B",
              display: "grid",
              fontSize: 8,
              placeItems: "center",
            }}
          >
            FOTO
          </div>
        ))}
      {campo("nombre", <div style={{ color: "#0F172A", fontSize: "inherit", fontWeight: 800, lineHeight: 1.1 }}>
          {c.nombre}
        </div>)}
      {campo("sigla", <div style={{ color: "#475569", fontSize: "inherit", fontWeight: 700, lineHeight: 1.1 }}>
          {c.sigla || c.partido || "SIN SIGLA"}
        </div>)}
      {campo("casilla", (
        <div
          style={{
            width: "100%",
            height: "100%",
            border: "2px solid #0F172A",
            display: "grid",
            fontSize: 8,
            fontWeight: 800,
            placeItems: "center",
          }}
        >
          MARCAR
        </div>
      ))}
    </div>
  );
}

export default function DisenoPapeletaPage() {
  const { id_eleccion } = useParams();
  const [proc, setProc] = useState(null);
  const [diseno, setDiseno] = useState({ boletas: [] });
  const [idPapeleta, setIdPapeleta] = useState("");
  const [seleccionada, setSeleccionada] = useState(null);
  const [componenteSeleccionado, setComponenteSeleccionado] = useState(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    api.get(`/procesos/${id_eleccion}/diseno`).then(({ data }) => {
      setProc({ nombre: data.nombre, papeletas: data.papeletas });
      const siguienteDiseno = normalizarDiseno(data.diseno, data.papeletas || []);
      setDiseno(siguienteDiseno);
      setIdPapeleta(siguienteDiseno.boletas[0]?.id_papeleta || "");
    });
  }, [id_eleccion]);

  const boletaActual = diseno.boletas.find((boleta) => boleta.id_papeleta === idPapeleta);
  const papeletaActual = proc?.papeletas.find((papeleta) => papeleta.id_papeleta === idPapeleta);
  const canvasW = boletaActual?.orientacion === "vertical"
    ? (boletaActual?.ancho_mm || 210) * PX_POR_MM
    : (boletaActual?.alto_mm || 297) * PX_POR_MM;
  const canvasH = boletaActual?.orientacion === "vertical"
    ? (boletaActual?.alto_mm || 297) * PX_POR_MM
    : (boletaActual?.ancho_mm || 210) * PX_POR_MM;

  const actualizarBoleta = (patch) => {
    setDiseno((anterior) => ({
      ...anterior,
      boletas: anterior.boletas.map((boleta) => (
        boleta.id_papeleta === idPapeleta ? { ...boleta, ...patch } : boleta
      )),
    }));
  };
  const actualizarFranja = (idFranja, patch) => {
    actualizarBoleta({
      franjas: (boletaActual?.franjas || []).map((franja) => (
        franja.id_franja === idFranja ? { ...franja, ...patch } : franja
      )),
    });
  };
  const actualizarComponente = (idFranja, idComponente, patch) => {
    const franja = boletaActual?.franjas.find((item) => item.id_franja === idFranja);
    actualizarFranja(idFranja, {
      componentes_candidato: {
        ...FRANJA_DEFAULT.componentes_candidato,
        ...(franja?.componentes_candidato || {}),
        [idComponente]: {
          ...FRANJA_DEFAULT.componentes_candidato[idComponente],
          ...(franja?.componentes_candidato?.[idComponente] || {}),
          ...patch,
        },
      },
    });
  };
  const agregarFranja = (idF) => {
    if (boletaActual?.franjas.some((franja) => franja.id_franja === idF)) return;
    const franja = papeletaActual?.franjas.find((item) => item.id_franja === idF);
    if (!franja) return;
    actualizarBoleta({
      franjas: [
        ...(boletaActual?.franjas || []),
        crearFranja(franja, boletaActual?.franjas.length || 0),
      ],
    });
  };
  const quitarFranja = (idF) => {
    actualizarBoleta({
      franjas: (boletaActual?.franjas || []).filter((franja) => franja.id_franja !== idF),
    });
    if (seleccionada === idF) setSeleccionada(null);
    setComponenteSeleccionado(null);
  };

  const iniciarDrag = (e, idF, modo) => {
    e.stopPropagation();
    const franja = boletaActual?.franjas.find((item) => item.id_franja === idF);
    if (!franja) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = { id: idF, modo, startX: e.clientX, startY: e.clientY, orig: { ...franja }, rect };
    setSeleccionada(idF);
    window.addEventListener("mousemove", enDrag);
    window.addEventListener("mouseup", finDrag);
  };
  const iniciarDragComponente = (evento, idFranja, idComponente, modo) => {
    evento.stopPropagation();
    const franja = boletaActual?.franjas.find((item) => item.id_franja === idFranja);
    const componente = {
      ...FRANJA_DEFAULT.componentes_candidato[idComponente],
      ...(franja?.componentes_candidato?.[idComponente] || {}),
    };
    dragRef.current = {
      tipo: "componente",
      idFranja,
      idComponente,
      modo,
      startX: evento.clientX,
      startY: evento.clientY,
      orig: componente,
    };
    setSeleccionada(idFranja);
    setComponenteSeleccionado(idComponente);
    window.addEventListener("mousemove", enDrag);
    window.addEventListener("mouseup", finDrag);
  };
  const iniciarDragTexto = (evento, texto, modo) => {
    evento.stopPropagation();
    const clave = texto === "encabezado" ? "encabezado_config" : "pie_config";
    dragRef.current = {
      tipo: "texto",
      texto,
      modo,
      startX: evento.clientX,
      startY: evento.clientY,
      orig: boletaActual?.[clave],
    };
    setSeleccionada(null);
    setComponenteSeleccionado(texto);
    window.addEventListener("mousemove", enDrag);
    window.addEventListener("mouseup", finDrag);
  };
  const enDrag = (e) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.startX; const dy = e.clientY - d.startY;
    if (d.tipo === "componente") {
      const patch = d.modo === "mover"
        ? { x: Math.max(0, d.orig.x + dx), y: Math.max(0, d.orig.y + dy) }
        : { w: Math.max(20, d.orig.w + dx), h: Math.max(16, d.orig.h + dy) };
      actualizarComponente(d.idFranja, d.idComponente, patch);
      return;
    }
    if (d.tipo === "texto") {
      const clave = d.texto === "encabezado" ? "encabezado_config" : "pie_config";
      const patch = d.modo === "mover"
        ? { x: Math.max(0, d.orig.x + dx), y: Math.max(0, d.orig.y + dy) }
        : { w: Math.max(60, d.orig.w + dx), h: Math.max(18, d.orig.h + dy) };
      actualizarBoleta({ [clave]: { ...d.orig, ...patch } });
      return;
    }
    if (d.modo === "mover") {
      actualizarFranja(d.id, { x: Math.max(0, d.orig.x + dx), y: Math.max(0, d.orig.y + dy) });
    } else if (d.modo === "resize") {
      actualizarFranja(d.id, { w: Math.max(80, d.orig.w + dx), h: Math.max(60, d.orig.h + dy) });
    }
  };
  const finDrag = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", enDrag);
    window.removeEventListener("mouseup", finDrag);
  };

  const guardar = async () => {
    try { await api.put(`/admin/procesos/${id_eleccion}/diseno`, diseno); toast.success("Diseño guardado"); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const imprimir = () => window.open(`/papeleta/${id_eleccion}/imprimir`, "_blank");

  if (!proc) return <div className="p-8 font-data text-slate-400">Cargando diseño…</div>;

  const franjaSel = boletaActual?.franjas.find((franja) => franja.id_franja === seleccionada);
  const franjaDatos = papeletaActual?.franjas.find((franja) => franja.id_franja === seleccionada);
  const agregarCampo = (campo) => {
    if (!franjaSel || franjaSel.campos_candidato?.includes(campo)) return;
    actualizarFranja(seleccionada, {
      campos_candidato: [...(franjaSel.campos_candidato || []), campo],
    });
  };
  const esTextoSeleccionado = ["encabezado", "pie"].includes(componenteSeleccionado);
  const claveTextoSeleccionado = componenteSeleccionado === "encabezado"
    ? "encabezado_config"
    : "pie_config";
  const configuracionTexto = esTextoSeleccionado
    ? boletaActual?.[claveTextoSeleccionado]
    : null;
  const configuracionComponente = franjaSel && componenteSeleccionado && !esTextoSeleccionado
    ? {
      ...FRANJA_DEFAULT.componentes_candidato[componenteSeleccionado],
      ...(franjaSel.componentes_candidato?.[componenteSeleccionado] || {}),
    }
    : null;

  return (
    <div className="max-w-[1800px] mx-auto p-4 sm:p-6" data-testid="diseno-papeleta-page">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Link to="/gestion-electoral"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Volver</Button></Link>
          <div>
            <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">
              Diseñador independiente de boletas
            </div>
            <h1 className="font-display font-extrabold text-xl sm:text-2xl">{proc.nombre}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={imprimir} data-testid="btn-imprimir"><Printer className="w-4 h-4 mr-1" /> Imprimir</Button>
          <Button onClick={guardar} className="bg-[#059669] hover:bg-[#047857]" data-testid="btn-guardar-diseno"><Save className="w-4 h-4 mr-1" /> Guardar</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" data-testid="selector-boletas-diseno">
        {proc.papeletas.map((papeleta) => (
          <Button
            key={papeleta.id_papeleta}
            variant={idPapeleta === papeleta.id_papeleta ? "default" : "outline"}
            onClick={() => {
              setIdPapeleta(papeleta.id_papeleta);
              setSeleccionada(null);
              setComponenteSeleccionado(null);
            }}
            data-testid={`seleccionar-boleta-${papeleta.id_papeleta}`}
          >
            {papeleta.nombre}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr_310px] gap-4">
        <div className="stre-card p-3 h-[calc(100vh-180px)] overflow-y-auto">
          <div className="text-[10px] font-data uppercase tracking-widest text-slate-500 mb-2">
            Franjas de {papeletaActual?.nombre}
          </div>
          <div className="space-y-2">
            {(papeletaActual?.franjas || []).map((franja) => {
              const usada = boletaActual?.franjas.some((item) => item.id_franja === franja.id_franja);
              return (
                <div key={franja.id_franja} className="border border-slate-200 p-2 rounded-md">
                  <div className="text-sm font-semibold">{franja.titulo}</div>
                  <div className="text-[10px] font-data text-slate-500 uppercase">
                    {franja.candidatos?.length || 0} candidaturas
                  </div>
                  {!usada && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => agregarFranja(franja.id_franja)}
                      data-testid={`agregar-franja-${franja.id_franja}`}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Añadir
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200">
            <div className="text-[10px] font-data uppercase tracking-widest text-slate-500 mb-2">
              Lienzo de esta boleta
            </div>
            <Label className="text-xs">Orientación</Label>
            <Select value={boletaActual?.orientacion || "vertical"} onValueChange={(orientacion) => actualizarBoleta({ orientacion })}>
              <SelectTrigger data-testid="orientacion-boleta"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vertical">Vertical (A4)</SelectItem>
                <SelectItem value="horizontal">Horizontal (A4 apaisado)</SelectItem>
              </SelectContent>
            </Select>
            <Label className="text-xs mt-3 block">Color de fondo</Label>
            <div className="flex gap-2">
              <input type="color" value={boletaActual?.fondo_color || "#FFFFFF"} onChange={(e) => actualizarBoleta({ fondo_color: e.target.value })} className="w-12 h-9 rounded border" data-testid="color-fondo-boleta" />
              <Input value={boletaActual?.fondo_color || "#FFFFFF"} onChange={(e) => actualizarBoleta({ fondo_color: e.target.value })} className="font-data" data-testid="texto-color-fondo-boleta" />
            </div>
            <Label className="text-xs mt-3 block">Encabezado</Label>
            <Input value={boletaActual?.encabezado || ""} onChange={(e) => actualizarBoleta({ encabezado: e.target.value })} data-testid="encabezado-boleta" />
            <Label className="text-xs mt-3 block">Pie</Label>
            <Input value={boletaActual?.pie || ""} onChange={(e) => actualizarBoleta({ pie: e.target.value })} data-testid="pie-boleta" />
          </div>
        </div>

        <div className="bg-slate-100 rounded-xl border border-slate-200 h-[calc(100vh-180px)] overflow-auto p-6 flex justify-center items-start">
          <div ref={canvasRef}
            onMouseDown={() => {
              setSeleccionada(null);
              setComponenteSeleccionado(null);
            }}
            style={{
              width: canvasW, height: canvasH, position: "relative",
              background: boletaActual?.fondo_url ? `url(${process.env.REACT_APP_BACKEND_URL}${boletaActual.fondo_url}) center/cover no-repeat` : boletaActual?.fondo_color,
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            }}
            data-testid="lienzo-papeleta"
          >
            {boletaActual?.encabezado && (
              <div
                onMouseDown={(evento) => iniciarDragTexto(evento, "encabezado", "mover")}
                style={{
                  position: "absolute",
                  left: boletaActual.encabezado_config?.x,
                  top: boletaActual.encabezado_config?.y,
                  width: boletaActual.encabezado_config?.w,
                  height: boletaActual.encabezado_config?.h,
                  alignItems: "center",
                  background: "rgba(255,255,255,0.72)",
                  cursor: "move",
                  display: "flex",
                  fontFamily: boletaActual.encabezado_config?.font_family,
                  fontSize: boletaActual.encabezado_config?.font_size,
                  fontWeight: 800,
                  justifyContent: "center",
                  outline: componenteSeleccionado === "encabezado" ? "2px solid #2563EB" : "none",
                  textAlign: "center",
                }}
                data-testid="encabezado-lienzo"
              >
                {boletaActual.encabezado}
                {componenteSeleccionado === "encabezado" && (
                  <div
                    onMouseDown={(evento) => iniciarDragTexto(evento, "encabezado", "redimensionar")}
                    style={{ position: "absolute", right: 0, bottom: 0, width: 10, height: 10, background: "#2563EB", cursor: "nwse-resize" }}
                    data-testid="redimensionar-encabezado"
                  />
                )}
              </div>
            )}
            {(boletaActual?.franjas || []).map((f) => {
              const keyF = f.id_franja;
              const fr = papeletaActual?.franjas.find((item) => item.id_franja === keyF);
              if (!fr) return null;
              const activo = seleccionada === keyF;
              return (
                <div key={keyF}
                  onMouseDown={(e) => iniciarDrag(e, keyF, "mover")}
                  style={{
                    position: "absolute", left: f.x, top: f.y, width: f.w, height: f.h,
                    background: f.fondo_url ? `url(${process.env.REACT_APP_BACKEND_URL}${f.fondo_url}) center/cover no-repeat` : f.fondo_color,
                    border: activo ? "2px solid #2563EB" : "1px dashed #94A3B8",
                    padding: 6, overflow: "hidden", cursor: "move", userSelect: "none",
                  }}
                  data-testid={`franja-canvas-${keyF}`}
                >
                  {f.titulo_visible && (
                    <div className="text-[11px] font-bold uppercase tracking-widest mb-1 px-1" style={{ color: activo ? "#1E3A8A" : "#334155" }}>
                      {fr.titulo}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${f.columnas || 3}, minmax(${f.ancho_candidato || 150}px, 1fr))`, gridAutoRows: `${f.alto_candidato || 210}px`, gap: f.espaciado_candidatos || 8 }}>
                    {(fr.candidatos || []).map((c) => renderCandidato(c, f, {
                      componenteSeleccionado: seleccionada === keyF ? componenteSeleccionado : null,
                      onIniciarCampo: (evento, componente, modo) => iniciarDragComponente(evento, keyF, componente, modo),
                    }))}
                  </div>
                  <div onMouseDown={(e) => iniciarDrag(e, keyF, "resize")}
                    style={{ position: "absolute", right: 0, bottom: 0, width: 12, height: 12, background: "#2563EB", cursor: "nwse-resize" }} />
                </div>
              );
            })}
            {boletaActual?.pie && (
              <div
                onMouseDown={(evento) => iniciarDragTexto(evento, "pie", "mover")}
                style={{
                  position: "absolute",
                  left: boletaActual.pie_config?.x,
                  top: boletaActual.pie_config?.y,
                  width: boletaActual.pie_config?.w,
                  height: boletaActual.pie_config?.h,
                  alignItems: "center",
                  background: "rgba(255,255,255,0.72)",
                  cursor: "move",
                  display: "flex",
                  fontFamily: boletaActual.pie_config?.font_family,
                  fontSize: boletaActual.pie_config?.font_size,
                  justifyContent: "center",
                  outline: componenteSeleccionado === "pie" ? "2px solid #2563EB" : "none",
                  textAlign: "center",
                }}
                data-testid="pie-lienzo"
              >
                {boletaActual.pie}
                {componenteSeleccionado === "pie" && (
                  <div
                    onMouseDown={(evento) => iniciarDragTexto(evento, "pie", "redimensionar")}
                    style={{ position: "absolute", right: 0, bottom: 0, width: 10, height: 10, background: "#2563EB", cursor: "nwse-resize" }}
                    data-testid="redimensionar-pie"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="stre-card p-3 h-[calc(100vh-180px)] overflow-y-auto">
          <div className="text-[10px] font-data uppercase tracking-widest text-slate-500 mb-2">Franja y candidatura</div>
          {esTextoSeleccionado ? (
            <div className="space-y-3" data-testid="propiedades-texto-boleta">
              <div className="p-2 bg-blue-50 rounded text-sm font-semibold capitalize">
                {componenteSeleccionado}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px] uppercase">X</Label><Input type="number" value={Math.round(configuracionTexto?.x || 0)} onChange={(e) => actualizarBoleta({ [claveTextoSeleccionado]: { ...configuracionTexto, x: Number(e.target.value) } })} /></div>
                <div><Label className="text-[10px] uppercase">Y</Label><Input type="number" value={Math.round(configuracionTexto?.y || 0)} onChange={(e) => actualizarBoleta({ [claveTextoSeleccionado]: { ...configuracionTexto, y: Number(e.target.value) } })} /></div>
                <div><Label className="text-[10px] uppercase">Ancho</Label><Input type="number" value={Math.round(configuracionTexto?.w || 0)} onChange={(e) => actualizarBoleta({ [claveTextoSeleccionado]: { ...configuracionTexto, w: Number(e.target.value) } })} /></div>
                <div><Label className="text-[10px] uppercase">Alto</Label><Input type="number" value={Math.round(configuracionTexto?.h || 0)} onChange={(e) => actualizarBoleta({ [claveTextoSeleccionado]: { ...configuracionTexto, h: Number(e.target.value) } })} /></div>
              </div>
              <div><Label className="text-[10px] uppercase">Tamaño de letra</Label><Input type="number" min="8" value={configuracionTexto?.font_size || 12} onChange={(e) => actualizarBoleta({ [claveTextoSeleccionado]: { ...configuracionTexto, font_size: Number(e.target.value) } })} data-testid="tamano-letra-texto" /></div>
              <div>
                <Label className="text-[10px] uppercase">Tipo de letra</Label>
                <Select value={configuracionTexto?.font_family || "sans-serif"} onValueChange={(font_family) => actualizarBoleta({ [claveTextoSeleccionado]: { ...configuracionTexto, font_family } })}>
                  <SelectTrigger data-testid="tipo-letra-texto"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="sans-serif">Sans serif</SelectItem><SelectItem value="serif">Serif</SelectItem><SelectItem value="monospace">Monoespaciada</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          ) : !franjaSel ? (
            <div className="text-sm text-slate-400 p-4 text-center">Selecciona una franja en el lienzo</div>
          ) : (
            <div className="space-y-3">
              <div className="p-2 bg-blue-50 rounded text-sm font-semibold">
                {franjaDatos?.titulo}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px] uppercase tracking-widest">X</Label><Input type="number" value={Math.round(franjaSel.x)} onChange={(e) => actualizarFranja(seleccionada, { x: Number(e.target.value) })} /></div>
                <div><Label className="text-[10px] uppercase tracking-widest">Y</Label><Input type="number" value={Math.round(franjaSel.y)} onChange={(e) => actualizarFranja(seleccionada, { y: Number(e.target.value) })} /></div>
                <div><Label className="text-[10px] uppercase tracking-widest">Ancho</Label><Input type="number" value={Math.round(franjaSel.w)} onChange={(e) => actualizarFranja(seleccionada, { w: Number(e.target.value) })} /></div>
                <div><Label className="text-[10px] uppercase tracking-widest">Alto</Label><Input type="number" value={Math.round(franjaSel.h)} onChange={(e) => actualizarFranja(seleccionada, { h: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px] uppercase">Columnas</Label><Input type="number" min="1" max="6" value={franjaSel.columnas || 3} onChange={(e) => actualizarFranja(seleccionada, { columnas: Math.max(1, Number(e.target.value)) })} data-testid="columnas-candidatos" /></div>
                <div><Label className="text-[10px] uppercase">Foto (px)</Label><Input type="number" min="32" max="160" value={franjaSel.tamano_foto || 76} onChange={(e) => actualizarFranja(seleccionada, { tamano_foto: Math.max(32, Number(e.target.value)) })} data-testid="tamano-foto-candidato" /></div>
                <div><Label className="text-[10px] uppercase">Ancho sector</Label><Input type="number" min="90" value={franjaSel.ancho_candidato || 150} onChange={(e) => actualizarFranja(seleccionada, { ancho_candidato: Math.max(90, Number(e.target.value)) })} data-testid="ancho-sector-candidato" /></div>
                <div><Label className="text-[10px] uppercase">Alto sector</Label><Input type="number" min="130" value={franjaSel.alto_candidato || 210} onChange={(e) => actualizarFranja(seleccionada, { alto_candidato: Math.max(130, Number(e.target.value)) })} data-testid="alto-sector-candidato" /></div>
                <div className="col-span-2"><Label className="text-[10px] uppercase">Espaciado entre candidaturas</Label><Input type="number" min="0" value={franjaSel.espaciado_candidatos || 0} onChange={(e) => actualizarFranja(seleccionada, { espaciado_candidatos: Math.max(0, Number(e.target.value)) })} data-testid="espaciado-candidaturas" /></div>
              </div>
              {configuracionComponente && (
                <div className="border-t pt-3 space-y-2" data-testid="propiedades-campo-candidato">
                  <div className="text-[10px] font-data uppercase tracking-widest text-blue-700">Editar {componenteSeleccionado}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-[10px] uppercase">X</Label><Input type="number" value={Math.round(configuracionComponente.x)} onChange={(e) => actualizarComponente(seleccionada, componenteSeleccionado, { x: Number(e.target.value) })} /></div>
                    <div><Label className="text-[10px] uppercase">Y</Label><Input type="number" value={Math.round(configuracionComponente.y)} onChange={(e) => actualizarComponente(seleccionada, componenteSeleccionado, { y: Number(e.target.value) })} /></div>
                    <div><Label className="text-[10px] uppercase">Ancho</Label><Input type="number" value={Math.round(configuracionComponente.w)} onChange={(e) => actualizarComponente(seleccionada, componenteSeleccionado, { w: Number(e.target.value) })} /></div>
                    <div><Label className="text-[10px] uppercase">Alto</Label><Input type="number" value={Math.round(configuracionComponente.h)} onChange={(e) => actualizarComponente(seleccionada, componenteSeleccionado, { h: Number(e.target.value) })} /></div>
                  </div>
                  <div><Label className="text-[10px] uppercase">Tamaño de letra</Label><Input type="number" min="7" value={configuracionComponente.font_size || 9} onChange={(e) => actualizarComponente(seleccionada, componenteSeleccionado, { font_size: Number(e.target.value) })} /></div>
                  <div><Label className="text-[10px] uppercase">Tipo de letra</Label><Select value={configuracionComponente.font_family || "sans-serif"} onValueChange={(font_family) => actualizarComponente(seleccionada, componenteSeleccionado, { font_family })}><SelectTrigger data-testid="tipo-letra-campo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sans-serif">Sans serif</SelectItem><SelectItem value="serif">Serif</SelectItem><SelectItem value="monospace">Monoespaciada</SelectItem></SelectContent></Select></div>
                </div>
              )}
              <div className="border-t pt-3">
                <div className="text-[10px] font-data uppercase tracking-widest text-slate-500 mb-2">Campos del sector</div>
                <div className="space-y-2">
                  {CAMPOS_CANDIDATO.map((campo) => {
                    const activo = franjaSel.campos_candidato?.includes(campo.id);
                    return (
                      <div key={campo.id} className="flex items-center gap-2 text-xs">
                        <div className="flex-1 flex items-center gap-1 border border-dashed border-slate-300 p-2 bg-slate-50" draggable onDragStart={(e) => e.dataTransfer.setData("campo-candidato", campo.id)} data-testid={`arrastrar-campo-${campo.id}`}><Grip className="w-3 h-3" />{campo.nombre}</div>
                        {activo && <Button variant="outline" size="icon" onClick={() => actualizarFranja(seleccionada, { campos_candidato: franjaSel.campos_candidato.filter((item) => item !== campo.id) })} data-testid={`quitar-campo-${campo.id}`}><Trash2 className="w-3 h-3" /></Button>}
                      </div>
                    );
                  })}
                </div>
                <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => agregarCampo(e.dataTransfer.getData("campo-candidato"))} className="mt-3 border-2 border-dashed border-blue-300 bg-blue-50 p-3 text-center text-xs text-blue-700" data-testid="zona-soltar-campo-candidato">Arrastre aquí un campo para incorporarlo al sector de candidatura</div>
              </div>
              <Button variant="destructive" size="sm" className="w-full" onClick={() => quitarFranja(seleccionada)} data-testid="quitar-franja-lienzo">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Quitar del lienzo
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
