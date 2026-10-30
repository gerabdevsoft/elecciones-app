import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatearError } from "@/lib/api";
import { ordenarMesasNumericamente } from "@/lib/sorting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, ChevronRight, ChevronDown, Flag, Building2,
  Layers, Grid3x3, Network, Edit2, MapPin, CheckCircle2, AlertCircle, Package
} from "lucide-react";

const TIPOS_DATO = [
  { v: "texto", n: "Texto" },
  { v: "numero", n: "Número" },
  { v: "seleccion", n: "Selección" },
  { v: "booleano", n: "Booleano" },
  { v: "fecha", n: "Fecha" },
];

export default function EstructuraElectoralPage() {
  const { id_eleccion } = useParams();
  const [estructura, setEstructura] = useState({
    nodos: [],
    recintos: [],
    campos_mesa: [],
    tipo: "",
  });
  const [expandidos, setExpandidos] = useState({});
  const [seleccion, setSeleccion] = useState(null); // {tipo:"nodo"|"recinto", id}
  const [modalNodo, setModalNodo] = useState(null);
  const [modalRecinto, setModalRecinto] = useState(null);
  const [modalCampo, setModalCampo] = useState(null);
  const [modalMesa, setModalMesa] = useState(null);
  const [modalAnfora, setModalAnfora] = useState(null);
  const [mesasRecinto, setMesasRecinto] = useState({});
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true);
    try {
      const { data } = await api.get(`/procesos/${id_eleccion}/estructura`);
      setEstructura(data);
    } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, [id_eleccion]);

  const raiz = estructura.nodos.filter((n) => !n.id_padre);
  const hijosDe = (id) => estructura.nodos.filter((n) => n.id_padre === id).sort((a, b) => a.nombre_nodo.localeCompare(b.nombre_nodo));
  const recintosDe = (id_nodo) => estructura.recintos.filter((r) => r.id_nodo_padre === id_nodo);

  const cargarMesas = async (id_recinto) => {
    const { data } = await api.get(`/procesos/${id_eleccion}/mesas?id_recinto=${id_recinto}`);
    setMesasRecinto((prev) => ({ ...prev, [id_recinto]: data }));
  };

  const toggle = (id) => setExpandidos((e) => ({ ...e, [id]: !e[id] }));

  const eliminarNodo = async (id) => {
    if (!window.confirm("¿Eliminar este nodo? Debe no tener hijos ni recintos")) return;
    try { await api.delete(`/admin/procesos/${id_eleccion}/nodos/${id}`); toast.success("Nodo eliminado"); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const marcarHoja = async (nodo) => {
    try {
      await api.post(`/admin/procesos/${id_eleccion}/nodos/${nodo.id}/marcar-hoja`, { es_hoja_configurada: !nodo.es_hoja_configurada });
      toast.success(!nodo.es_hoja_configurada ? "Nodo marcado como último eslabón" : "Nodo desmarcado");
      cargar();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const eliminarRecinto = async (id) => {
    if (!window.confirm("¿Eliminar recinto? No debe tener mesas")) return;
    try { await api.delete(`/admin/procesos/${id_eleccion}/recintos/${id}`); toast.success("Recinto eliminado"); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const eliminarMesa = async (id_recinto, id_mesa) => {
    if (!window.confirm("¿Eliminar mesa?")) return;
    try { await api.delete(`/admin/procesos/${id_eleccion}/mesas/${id_mesa}`); toast.success("Mesa eliminada"); cargarMesas(id_recinto); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const eliminarCampo = async (id) => {
    if (!window.confirm("¿Eliminar definición de campo?")) return;
    try { await api.delete(`/admin/procesos/${id_eleccion}/campos-mesa/${id}`); toast.success("Campo eliminado"); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const eliminarAnfora = async (id) => {
    if (!window.confirm("¿Eliminar ánfora?")) return;
    try { await api.delete(`/admin/procesos/${id_eleccion}/anforas/${id}`); toast.success("Ánfora eliminada"); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const anforasDeMesa = (id_mesa) => (estructura.anforas || []).filter((a) => a.id_mesa === id_mesa);

  const renderNodo = (nodo, nivel = 0) => {
    const abierto = expandidos[nodo.id];
    const hijos = hijosDe(nodo.id);
    const recs = recintosDe(nodo.id);
    const activo = seleccion?.tipo === "nodo" && seleccion.id === nodo.id;
    return (
      <div key={nodo.id} className="animate-fade-up">
        <div className={`flex items-center gap-1 py-1.5 pr-2 rounded-md ${activo ? "bg-[#EFF6FF]" : "hover:bg-slate-50"}`}
             style={{ paddingLeft: nivel * 16 + 4 }}>
          <button onClick={() => toggle(nodo.id)} className="w-5 h-5 flex items-center justify-center text-slate-400">
            {(hijos.length || recs.length) ? (abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-1 h-1 bg-slate-300 rounded-full" />}
          </button>
          <button onClick={() => setSeleccion({ tipo: "nodo", id: nodo.id })} className="flex-1 flex items-center gap-2 text-left min-w-0">
            {nodo.es_hoja_configurada ? <Flag className="w-3.5 h-3.5 text-emerald-600" /> : <Network className="w-3.5 h-3.5 text-slate-400" />}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{nodo.nombre_nodo}</div>
              <div className="text-[10px] font-data uppercase tracking-wider text-slate-500">{nodo.nombre_nivel}</div>
            </div>
          </button>
          <div className="flex items-center gap-1">
            {!nodo.es_hoja_configurada && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setModalNodo({ id_padre: nodo.id })} title="Agregar sub-nivel" data-testid={`add-hijo-${nodo.id}`}>
                <Plus className="w-3 h-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => marcarHoja(nodo)}
              title={nodo.es_hoja_configurada ? "Desmarcar hoja" : "Marcar último eslabón (aloja recintos)"}>
              <Flag className={`w-3 h-3 ${nodo.es_hoja_configurada ? "text-emerald-600" : "text-slate-400"}`} />
            </Button>
            {nodo.es_hoja_configurada && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setModalRecinto({ id_nodo_padre: nodo.id })} title="Agregar recinto">
                <Building2 className="w-3 h-3 text-[#7C3AED]" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setModalNodo({ editar: nodo })}>
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => eliminarNodo(nodo.id)}>
              <Trash2 className="w-3 h-3 text-red-500" />
            </Button>
          </div>
        </div>
        {abierto && (
          <div>
            {hijos.map((h) => renderNodo(h, nivel + 1))}
            {recs.map((r) => renderRecinto(r, nivel + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderRecinto = (rec, nivel) => {
    const abierto = expandidos[`r-${rec.id}`];
    const activo = seleccion?.tipo === "recinto" && seleccion.id === rec.id;
    const mesas = ordenarMesasNumericamente(mesasRecinto[rec.id] || []);
    return (
      <div key={rec.id}>
        <div className={`flex items-center gap-1 py-1.5 pr-2 rounded-md ${activo ? "bg-[#F5F3FF]" : "hover:bg-slate-50"}`}
             style={{ paddingLeft: nivel * 16 + 4 }}>
          <button onClick={() => { setExpandidos((e) => ({ ...e, [`r-${rec.id}`]: !e[`r-${rec.id}`] })); if (!abierto && !mesasRecinto[rec.id]) cargarMesas(rec.id); }} className="w-5 h-5 flex items-center justify-center text-slate-400">
            {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button onClick={() => setSeleccion({ tipo: "recinto", id: rec.id })} className="flex-1 flex items-center gap-2 text-left min-w-0">
            <Building2 className="w-3.5 h-3.5 text-[#7C3AED]" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{rec.nombre}</div>
              <div className="text-[10px] font-data uppercase tracking-wider text-slate-500">
                {rec.codigo || "sin código"} · {rec.total_mesas || 0} mesas
              </div>
            </div>
          </button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setModalMesa({ id_recinto: rec.id })} title="Añadir mesa">
            <Plus className="w-3 h-3 text-[#059669]" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setModalRecinto({ editar: rec })}>
            <Edit2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => eliminarRecinto(rec.id)}>
            <Trash2 className="w-3 h-3 text-red-500" />
          </Button>
        </div>
        {abierto && mesas.map((m) => {
          const anforas = anforasDeMesa(m.id);
          const mAbierto = expandidos[`m-${m.id}`];
          return (
            <div key={m.id}>
              <div className="flex items-center gap-2 py-1.5 pr-2 rounded-md hover:bg-slate-50" style={{ paddingLeft: (nivel + 1) * 16 + 4 }}>
                <button onClick={() => setExpandidos((e) => ({ ...e, [`m-${m.id}`]: !e[`m-${m.id}`] }))} className="w-5 h-5 flex items-center justify-center text-slate-400">
                  {mAbierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <Grid3x3 className="w-3.5 h-3.5 text-[#059669]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    Mesa {m.numero_mesa}
                    {m.tipo_mesa && <span className="ml-2 stre-badge bg-blue-50 text-blue-700">Mesa {m.tipo_mesa}</span>}
                    <span className="text-[10px] font-data text-slate-400"> · {anforas.length} ánforas</span>
                  </div>
                  <div className="text-[10px] font-data text-slate-500">
                    {Object.entries(m.metadatos || {}).map(([k, v]) => `${k}:${v}`).join(" · ") || "sin metadatos"}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setModalAnfora({ id_mesa: m.id, id_recinto: rec.id })} title="Añadir ánfora" data-testid={`add-anfora-${m.id}`}>
                  <Package className="w-3 h-3 text-[#D97706]" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setModalMesa({ editar: m, id_recinto: rec.id })}><Edit2 className="w-3 h-3" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => eliminarMesa(rec.id, m.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
              </div>
              {mAbierto && anforas.map((a) => {
                const papeletasNombres = (a.id_papeletas || []).map((idp) => {
                  const p = (estructura.papeletas || []).find((x) => x.id_papeleta === idp);
                  return p ? p.nombre : idp;
                });
                return (
                  <div key={a.id} className="flex items-center gap-2 py-1.5 pr-2 rounded-md hover:bg-amber-50" style={{ paddingLeft: (nivel + 2) * 16 + 4 }}>
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: a.color_hex || "#D97706" }}>
                      <Package className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        Ánfora {a.numero_anfora} · <span className="font-normal">{a.nombre}</span>
                      </div>
                      <div className="text-[10px] font-data text-slate-500">
                        {typeof a.cantidad_votantes === "number" ? `${a.cantidad_votantes} votantes` : "votantes sin registrar"}
                        {" · "}
                        {papeletasNombres.length ? papeletasNombres.join(" + ") : "sin papeletas asignadas"}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setModalAnfora({ editar: a, id_mesa: m.id, id_recinto: rec.id })}><Edit2 className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => eliminarAnfora(a.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8" data-testid="estructura-page">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link to="/gestion-electoral"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Volver</Button></Link>
          <div>
            <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Estructura Jurisdiccional</div>
            <h1 className="font-display font-extrabold text-2xl">{id_eleccion}</h1>
          </div>
        </div>
      </div>

      <Tabs defaultValue="arbol">
        <TabsList className="mb-4">
          <TabsTrigger value="arbol" data-testid="tab-arbol"><Network className="w-4 h-4 mr-1" /> Árbol Jerárquico</TabsTrigger>
          <TabsTrigger value="campos" data-testid="tab-campos"><Layers className="w-4 h-4 mr-1" /> Campos Dinámicos de Mesa</TabsTrigger>
        </TabsList>

        <TabsContent value="arbol">
          <div className="stre-card p-4 min-h-[600px]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Árbol de la elección</div>
              <Button size="sm" onClick={() => setModalNodo({ id_padre: null })} data-testid="btn-nodo-raiz">
                <Plus className="w-4 h-4 mr-1" /> Nodo Raíz
              </Button>
            </div>
            {cargando ? <div className="text-slate-400 text-sm font-data">Cargando…</div> :
              raiz.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
                  <Network className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                  <div className="text-slate-500 mb-4">Aún no hay estructura. Crea el primer nodo raíz (Ej: Departamento, Ciudad, Facultad).</div>
                  <Button onClick={() => setModalNodo({ id_padre: null })}><Plus className="w-4 h-4 mr-1" /> Crear primer nodo</Button>
                </div>
              ) : raiz.map((n) => renderNodo(n))
            }
            <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-md text-xs text-slate-700 flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-blue-500" />
              <div>
                Marca un nodo con <Flag className="w-3 h-3 inline text-emerald-600" /> para declararlo "último eslabón". Solo los nodos hoja pueden alojar recintos electorales, y cada recinto contiene sus mesas de sufragio con metadatos flexibles.
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="campos">
          <div className="stre-card p-4 min-h-[400px]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Campos dinámicos que cada mesa puede llenar</div>
                <div className="text-xs text-slate-500 mt-1">Ejemplo universitario: facultad, carrera, año</div>
              </div>
              <Button size="sm" onClick={() => setModalCampo({ nuevo: true })} data-testid="btn-nuevo-campo">
                <Plus className="w-4 h-4 mr-1" /> Nuevo campo
              </Button>
            </div>
            {estructura.campos_mesa.length === 0 ? (
              <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                Sin campos definidos. Las mesas solo guardarán su número.
              </div>
            ) : (
              <div className="space-y-2">
                {estructura.campos_mesa.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-md hover:border-slate-300">
                    <div>
                      <div className="text-sm font-semibold">{c.etiqueta} <span className="font-data text-xs text-slate-500">({c.clave})</span></div>
                      <div className="text-[10px] font-data uppercase tracking-wider text-slate-500 mt-0.5">
                        {c.tipo_dato} {c.requerido && "· requerido"} {c.opciones?.length ? `· ${c.opciones.length} opciones` : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModalCampo({ editar: c })}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => eliminarCampo(c.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {modalNodo && <ModalNodo id_eleccion={id_eleccion} data={modalNodo} onClose={() => setModalNodo(null)} onOk={() => { setModalNodo(null); cargar(); }} />}
      {modalRecinto && <ModalRecinto id_eleccion={id_eleccion} data={modalRecinto} onClose={() => setModalRecinto(null)} onOk={() => { setModalRecinto(null); cargar(); }} />}
      {modalCampo && <ModalCampoMesa id_eleccion={id_eleccion} data={modalCampo} onClose={() => setModalCampo(null)} onOk={() => { setModalCampo(null); cargar(); }} />}
      {modalMesa && <ModalMesa id_eleccion={id_eleccion} data={modalMesa} campos={estructura.campos_mesa} tipoEleccion={estructura.tipo} onClose={() => setModalMesa(null)} onOk={(idR) => { setModalMesa(null); cargarMesas(idR); cargar(); }} />}
      {modalAnfora && (
        <ModalAnfora
          id_eleccion={id_eleccion}
          data={modalAnfora}
          papeletas={estructura.papeletas || []}
          anforasMismaMesa={anforasDeMesa(modalAnfora.id_mesa)}
          onClose={() => setModalAnfora(null)}
          onOk={() => {
            setModalAnfora(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalAnfora({
  id_eleccion,
  data,
  papeletas,
  anforasMismaMesa,
  onClose,
  onOk,
}) {
  const editar = data.editar;
  const [form, setForm] = useState(
    editar || {
      id_mesa: data.id_mesa,
      numero_anfora: "",
      nombre: "",
      cantidad_votantes: "",
      id_papeletas: [],
      color_hex: "#D97706",
    },
  );
  const [enviando, setEnviando] = useState(false);
  const usadasEnOtras = new Set(
    anforasMismaMesa.filter((a) => a.id !== (editar?.id)).flatMap((a) => a.id_papeletas || [])
  );
  const cantidadIngresada = form.cantidad_votantes !== "" && form.cantidad_votantes != null;
  const cantidadValida =
    !cantidadIngresada ||
    (Number.isInteger(Number(form.cantidad_votantes)) && Number(form.cantidad_votantes) >= 0);
  const togglePapeleta = (idp) => {
    setForm((f) => ({
      ...f,
      id_papeletas: f.id_papeletas.includes(idp) ? f.id_papeletas.filter((x) => x !== idp) : [...f.id_papeletas, idp]
    }));
  };
  const guardar = async () => {
    setEnviando(true);
    try {
      if (editar) {
        await api.put(`/admin/procesos/${id_eleccion}/anforas/${editar.id}`, {
          numero_anfora: form.numero_anfora,
          nombre: form.nombre,
          cantidad_votantes: cantidadIngresada ? Number(form.cantidad_votantes) : null,
          id_papeletas: form.id_papeletas,
          color_hex: form.color_hex,
        });
      } else {
        await api.post(`/admin/procesos/${id_eleccion}/anforas`, {
          ...form,
          cantidad_votantes: Number(form.cantidad_votantes),
        });
      }
      toast.success(editar ? "Ánfora actualizada" : "Ánfora creada");
      onOk();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="modal-anfora">
        <DialogHeader><DialogTitle>{editar ? "Editar ánfora" : "Nueva ánfora"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs uppercase tracking-widest">Nº ánfora</Label>
              <Input value={form.numero_anfora} onChange={(e) => setForm({ ...form, numero_anfora: e.target.value })} className="font-data font-bold" data-testid="input-numero-anfora" />
            </div>
            <div className="col-span-2"><Label className="text-xs uppercase tracking-widest">Nombre / Etiqueta</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ánfora Presidencial" data-testid="input-nombre-anfora" />
            </div>
          </div>
          <div>
            <Label htmlFor="cantidad-votantes-anfora" className="text-xs uppercase tracking-widest">Cantidad de votantes</Label>
            <Input
              id="cantidad-votantes-anfora"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.cantidad_votantes ?? ""}
              onChange={(e) => setForm({ ...form, cantidad_votantes: e.target.value })}
              placeholder="Ej. 250"
              data-testid="input-cantidad-votantes-anfora"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest">Color de identificación</Label>
            <div className="flex gap-2">
              <input type="color" value={form.color_hex || "#D97706"} onChange={(e) => setForm({ ...form, color_hex: e.target.value })} className="w-12 h-10 rounded border" />
              <Input value={form.color_hex || ""} onChange={(e) => setForm({ ...form, color_hex: e.target.value })} className="font-data" />
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-md">
            <div className="text-xs font-semibold text-slate-700 mb-2">Papeletas asignadas a esta ánfora</div>
            <div className="text-[10px] text-slate-500 mb-2">Cada papeleta solo puede ir a UNA ánfora dentro de la misma mesa.</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {papeletas.length === 0 && <div className="text-xs text-slate-400">La elección no tiene papeletas configuradas todavía.</div>}
              {papeletas.map((p) => {
                const usadaEnOtra = usadasEnOtras.has(p.id_papeleta);
                const marcada = form.id_papeletas.includes(p.id_papeleta);
                return (
                  <label key={p.id_papeleta} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${usadaEnOtra ? "opacity-40 cursor-not-allowed bg-slate-100" : marcada ? "bg-emerald-50 border border-emerald-200" : "hover:bg-slate-100 border border-transparent"}`}>
                    <input type="checkbox" checked={marcada} disabled={usadaEnOtra} onChange={() => togglePapeleta(p.id_papeleta)} className="rounded" data-testid={`chk-papeleta-${p.id_papeleta}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{p.nombre}</div>
                      <div className="text-[10px] font-data uppercase tracking-wider text-slate-500">
                        {p.franjas?.length || 0} franjas
                        {usadaEnOtra && " · ya asignada a otra ánfora"}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={guardar}
            disabled={
              enviando ||
              !form.numero_anfora ||
              !form.nombre ||
              !cantidadValida ||
              (!editar && !cantidadIngresada)
            }
            data-testid="btn-guardar-anfora"
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalNodo({ id_eleccion, data, onClose, onOk }) {
  const editar = data.editar;
  const [form, setForm] = useState(editar || { id_padre: data.id_padre, nombre_nivel: "", nombre_nodo: "", codigo: "" });
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    setEnviando(true);
    try {
      if (editar) {
        await api.put(`/admin/procesos/${id_eleccion}/nodos/${editar.id}`, {
          nombre_nivel: form.nombre_nivel, nombre_nodo: form.nombre_nodo, codigo: form.codigo
        });
      } else {
        await api.post(`/admin/procesos/${id_eleccion}/nodos`, form);
      }
      toast.success(editar ? "Nodo actualizado" : "Nodo creado");
      onOk();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="modal-nodo">
        <DialogHeader><DialogTitle>{editar ? "Editar nodo" : "Nuevo nodo"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-widest">Nombre del nivel</Label>
            <Input value={form.nombre_nivel} onChange={(e) => setForm({ ...form, nombre_nivel: e.target.value })}
              placeholder="Departamento / Facultad / Ciudad" data-testid="input-nombre-nivel" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest">Nombre del nodo</Label>
            <Input value={form.nombre_nodo} onChange={(e) => setForm({ ...form, nombre_nodo: e.target.value })}
              placeholder="Cochabamba / Derecho / Sucre" data-testid="input-nombre-nodo" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest">Código</Label>
            <Input value={form.codigo || ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="font-data" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando || !form.nombre_nivel || !form.nombre_nodo} data-testid="btn-guardar-nodo">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalRecinto({ id_eleccion, data, onClose, onOk }) {
  const editar = data.editar;
  const [form, setForm] = useState(editar || { id_nodo_padre: data.id_nodo_padre, nombre: "", codigo: "", direccion: "" });
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    setEnviando(true);
    try {
      if (editar) {
        await api.put(`/admin/procesos/${id_eleccion}/recintos/${editar.id}`, {
          nombre: form.nombre, codigo: form.codigo, direccion: form.direccion
        });
      } else {
        await api.post(`/admin/procesos/${id_eleccion}/recintos`, form);
      }
      toast.success(editar ? "Recinto actualizado" : "Recinto creado");
      onOk();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="modal-recinto">
        <DialogHeader><DialogTitle>{editar ? "Editar recinto" : "Nuevo recinto electoral"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-widest">Nombre</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="U.E. Simón Bolívar" data-testid="input-nombre-recinto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs uppercase tracking-widest">Código</Label>
              <Input value={form.codigo || ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="font-data" />
            </div>
            <div><Label className="text-xs uppercase tracking-widest">Dirección</Label>
              <Input value={form.direccion || ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando || !form.nombre} data-testid="btn-guardar-recinto">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalCampoMesa({ id_eleccion, data, onClose, onOk }) {
  const editar = data.editar;
  const [form, setForm] = useState(editar || { clave: "", etiqueta: "", tipo_dato: "texto", opciones: [], requerido: false, orden: 0 });
  const [opcionesTxt, setOpcionesTxt] = useState((editar?.opciones || []).join(", "));
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    setEnviando(true);
    try {
      const payload = { ...form, opciones: form.tipo_dato === "seleccion" ? opcionesTxt.split(",").map((s) => s.trim()).filter(Boolean) : [] };
      if (editar) await api.put(`/admin/procesos/${id_eleccion}/campos-mesa/${editar.id}`, payload);
      else await api.post(`/admin/procesos/${id_eleccion}/campos-mesa`, payload);
      toast.success(editar ? "Campo actualizado" : "Campo creado");
      onOk();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="modal-campo-mesa">
        <DialogHeader><DialogTitle>{editar ? "Editar campo" : "Nuevo campo dinámico"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs uppercase tracking-widest">Clave (sin espacios)</Label>
              <Input value={form.clave} disabled={!!editar} onChange={(e) => setForm({ ...form, clave: e.target.value.replace(/\s+/g, "_").toLowerCase() })} className="font-data" data-testid="input-clave" />
            </div>
            <div><Label className="text-xs uppercase tracking-widest">Etiqueta visible</Label>
              <Input value={form.etiqueta} onChange={(e) => setForm({ ...form, etiqueta: e.target.value })} data-testid="input-etiqueta" />
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest">Tipo de dato</Label>
            <Select value={form.tipo_dato} onValueChange={(v) => setForm({ ...form, tipo_dato: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_DATO.map((t) => <SelectItem key={t.v} value={t.v}>{t.n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.tipo_dato === "seleccion" && (
            <div>
              <Label className="text-xs uppercase tracking-widest">Opciones (separadas por coma)</Label>
              <Input value={opcionesTxt} onChange={(e) => setOpcionesTxt(e.target.value)} placeholder="Derecho, Medicina, Ingeniería" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-md">
              <span className="text-sm">Requerido</span>
              <Switch checked={form.requerido} onCheckedChange={(v) => setForm({ ...form, requerido: v })} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest">Orden</Label>
              <Input type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando || !form.clave || !form.etiqueta} data-testid="btn-guardar-campo">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalMesa({ id_eleccion, data, campos, tipoEleccion, onClose, onOk }) {
  const editar = data.editar;
  const idRec = data.id_recinto || editar?.id_recinto;
  const [form, setForm] = useState(editar ? { ...editar, tipo_mesa: editar.tipo_mesa || "" } : { id_recinto: idRec, numero_mesa: "", codigo: "", tipo_mesa: "", metadatos: {} });
  const [enviando, setEnviando] = useState(false);
  const esUniversitaria = tipoEleccion === "universitaria";
  const setMeta = (k, v) => setForm((f) => ({ ...f, metadatos: { ...f.metadatos, [k]: v } }));
  const guardar = async () => {
    setEnviando(true);
    try {
      if (editar) {
        await api.put(`/admin/procesos/${id_eleccion}/mesas/${editar.id}`, {
          numero_mesa: form.numero_mesa, codigo: form.codigo, metadatos: form.metadatos,
          ...(esUniversitaria ? { tipo_mesa: form.tipo_mesa } : {}),
        });
      } else {
        await api.post(`/admin/procesos/${id_eleccion}/mesas`, {
          ...form,
          ...(esUniversitaria ? { tipo_mesa: form.tipo_mesa } : {}),
        });
      }
      toast.success(editar ? "Mesa actualizada" : "Mesa creada");
      onOk(idRec);
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="modal-mesa">
        <DialogHeader><DialogTitle>{editar ? "Editar mesa" : "Nueva mesa de sufragio"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs uppercase tracking-widest">Número de mesa</Label>
              <Input value={form.numero_mesa} onChange={(e) => setForm({ ...form, numero_mesa: e.target.value })} className="font-data" data-testid="input-numero-mesa" />
            </div>
            <div><Label className="text-xs uppercase tracking-widest">Código</Label>
              <Input value={form.codigo || ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="font-data" />
            </div>
          </div>
          {esUniversitaria && (
            <div>
              <Label className="text-xs uppercase tracking-widest">
                Tipo de mesa <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.tipo_mesa || ""}
                onValueChange={(tipo_mesa) => setForm({ ...form, tipo_mesa })}
              >
                <SelectTrigger data-testid="select-tipo-mesa">
                  <SelectValue placeholder="Seleccione Docente o Estudiante" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docente">Docente</SelectItem>
                  <SelectItem value="estudiante">Estudiante</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {campos.length > 0 && (
            <div className="p-3 bg-slate-50 rounded-md space-y-3">
              <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Metadatos flexibles</div>
              {campos.map((c) => (
                <div key={c.id}>
                  <Label className="text-xs">{c.etiqueta} {c.requerido && <span className="text-red-500">*</span>}</Label>
                  {c.tipo_dato === "seleccion" ? (
                    <Select value={form.metadatos?.[c.clave] || ""} onValueChange={(v) => setMeta(c.clave, v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                      <SelectContent>{c.opciones.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : c.tipo_dato === "booleano" ? (
                    <div className="flex items-center justify-between p-2 bg-white rounded"><span className="text-xs text-slate-500">Activar</span>
                      <Switch checked={!!form.metadatos?.[c.clave]} onCheckedChange={(v) => setMeta(c.clave, v)} />
                    </div>
                  ) : (
                    <Input
                      type={c.tipo_dato === "numero" ? "number" : c.tipo_dato === "fecha" ? "date" : "text"}
                      value={form.metadatos?.[c.clave] || ""}
                      onChange={(e) => setMeta(c.clave, c.tipo_dato === "numero" ? Number(e.target.value) : e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando || !form.numero_mesa || (esUniversitaria && !form.tipo_mesa)} data-testid="btn-guardar-mesa">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
