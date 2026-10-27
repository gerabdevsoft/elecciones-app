import { useEffect, useState } from "react";
import { api, formatearError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Shuffle, Layers, Users, ChevronRight, Vote,
  ImagePlus, Sparkles, FileWarning, X, LayoutTemplate, Network, Printer
} from "lucide-react";

const TIPOS_ELECCION = [
  { v: "nacional", n: "Nacional (Presidente / Diputados)", icon: "🇧🇴" },
  { v: "departamental", n: "Departamental (Gobernador / Asamblea)", icon: "🗺️" },
  { v: "municipal", n: "Municipal (Alcalde / Concejales)", icon: "🏛️" },
  { v: "universitaria", n: "Universitaria (Rector / Vicerrector)", icon: "🎓" },
  { v: "sindical", n: "Sindical / Gremial", icon: "🤝" },
  { v: "otro", n: "Otro", icon: "🗳️" },
];
const TIPOS_VOTO = [
  { v: "nominal", n: "Nominal (voto directo por candidato)" },
  { v: "lista", n: "Lista (voto por partido/sigla)" },
  { v: "plancha_recta", n: "Plancha Recta (arrastra escaños)" },
  { v: "estamentario", n: "Estamentario (universidades: docentes/estudiantes)" },
];
const REGLAS = [
  { v: "solo_validos", n: "Solo votos válidos" },
  { v: "validos_mas_blancos", n: "Válidos + Blancos" },
  { v: "emitidos_totales", n: "Emitidos totales" },
];
const BADGE_TIPO_VOTO = {
  nominal: "bg-blue-50 text-blue-700",
  lista: "bg-amber-50 text-amber-800",
  plancha_recta: "bg-emerald-50 text-emerald-700",
  estamentario: "bg-purple-50 text-purple-700",
};

export default function GestionElectoralPage() {
  const { usuario } = useAuth();
  const [procesos, setProcesos] = useState([]);
  const [seleccion, setSeleccion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modalProceso, setModalProceso] = useState(false);
  const [modalPapeleta, setModalPapeleta] = useState(null);
  const [modalFranja, setModalFranja] = useState(null);
  const [modalCandidato, setModalCandidato] = useState(null);
  const [modalSorteo, setModalSorteo] = useState(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const { data } = await api.get("/procesos");
      setProcesos(data);
      if (seleccion) {
        const p = data.find((x) => x.id_eleccion === seleccion.id_eleccion);
        setSeleccion(p || null);
      }
    } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  if (usuario?.rol !== "admin") {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <FileWarning className="w-12 h-12 mx-auto text-amber-500 mb-4" />
        <h1 className="font-display font-bold text-2xl">Acceso restringido</h1>
        <p className="text-slate-500 mt-2">Solo administradores pueden gestionar elecciones y papeletas.</p>
      </div>
    );
  }

  const eliminarProceso = async (id) => {
    if (!window.confirm(`¿Eliminar elección ${id}? Solo funciona sin actas.`)) return;
    try { await api.delete(`/admin/procesos/${id}`); toast.success("Elección eliminada"); setSeleccion(null); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const eliminarPapeleta = async (idp) => {
    if (!window.confirm("¿Eliminar boleta con todas sus franjas y candidatos?")) return;
    try { await api.delete(`/admin/procesos/${seleccion.id_eleccion}/papeletas/${idp}`); toast.success("Boleta eliminada"); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const eliminarFranja = async (idp, idf) => {
    if (!window.confirm("¿Eliminar franja y todos sus candidatos?")) return;
    try { await api.delete(`/admin/procesos/${seleccion.id_eleccion}/papeletas/${idp}/franjas/${idf}`); toast.success("Franja eliminada"); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };
  const eliminarCandidato = async (idp, idf, idc) => {
    if (!window.confirm("¿Eliminar candidato?")) return;
    try { await api.delete(`/admin/procesos/${seleccion.id_eleccion}/papeletas/${idp}/franjas/${idf}/candidatos/${idc}`); toast.success("Candidato eliminado"); cargar(); }
    catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8" data-testid="gestion-electoral-page">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="stre-badge bg-[#EFF6FF] text-[#1E3A8A] mb-2"><Sparkles className="w-3 h-3" /> Diseñador Electoral</div>
          <h1 className="font-display font-extrabold text-3xl text-slate-900 tracking-tight">Gestión de Elecciones, Boletas y Franjas</h1>
          <p className="text-slate-500 mt-1 max-w-2xl">Cada elección tiene 1..N boletas (papeletas imprimibles). Cada boleta contiene 1..N franjas con recuento independiente (nominal, lista, plancha recta, estamentario).</p>
        </div>
        <Button className="bg-[#1E3A8A] hover:bg-[#1E40AF]" onClick={() => setModalProceso("nuevo")} data-testid="btn-nueva-eleccion">
          <Plus className="w-4 h-4 mr-2" /> Nueva Elección
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Lista de procesos */}
        <div className="stre-card p-4 h-[calc(100vh-220px)] overflow-y-auto" data-testid="lista-procesos">
          <div className="text-[10px] font-data uppercase tracking-widest text-slate-500 mb-3">Elecciones Registradas</div>
          {cargando && <div className="text-slate-400 text-sm font-data">Cargando…</div>}
          {!cargando && procesos.length === 0 && <div className="text-slate-400 text-sm">Sin elecciones aún</div>}
          <div className="space-y-2">
            {procesos.map((p) => {
              const meta = TIPOS_ELECCION.find((t) => t.v === p.tipo);
              const activo = seleccion?.id_eleccion === p.id_eleccion;
              return (
                <button key={p.id_eleccion} onClick={() => setSeleccion(p)}
                  data-testid={`select-proceso-${p.id_eleccion}`}
                  className={`w-full text-left p-3 rounded-lg border transition ${activo ? "bg-[#EFF6FF] border-[#1E3A8A]" : "border-slate-100 hover:border-slate-300"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{meta?.icon || "🗳️"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate">{p.nombre}</div>
                      <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{p.id_eleccion} · {p.papeletas?.length || 0} boletas</div>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${activo ? "text-[#1E3A8A]" : "text-slate-300"}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalle del proceso */}
        <div className="stre-card p-6 h-[calc(100vh-220px)] overflow-y-auto">
          {!seleccion ? (
            <div className="h-full flex items-center justify-center text-center">
              <div>
                <Vote className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <div className="text-slate-400">Selecciona una elección para editar sus boletas</div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-display font-extrabold text-2xl tracking-tight">{seleccion.nombre}</h2>
                  <div className="text-xs font-data uppercase tracking-widest text-slate-500 mt-1">
                    {seleccion.id_eleccion} · {seleccion.pais} · {seleccion.fecha_eleccion}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <a href={`/papeleta/${seleccion.id_eleccion}/imprimir`} target="_blank">
                    <Button variant="outline" size="sm" className="bg-[#ECFDF5] text-[#059669] border-[#A7F3D0] hover:bg-[#D1FAE5]" data-testid="btn-imprimir-papeletas">
                      <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir Boletas
                    </Button>
                  </a>
                  <a href={`/gestion-electoral/estructura/${seleccion.id_eleccion}`}>
                    <Button variant="outline" size="sm" className="bg-[#EFF6FF] text-[#1E3A8A] border-[#DBEAFE] hover:bg-[#DBEAFE]" data-testid="btn-estructura">
                      <Network className="w-3.5 h-3.5 mr-1" /> Estructura Jurisdiccional
                    </Button>
                  </a>
                  <a href={`/gestion-electoral/diseno/${seleccion.id_eleccion}`}>
                    <Button variant="outline" size="sm" data-testid="btn-disenar-papeleta" className="bg-[#F5F3FF] text-[#7C3AED] border-[#DDD6FE] hover:bg-[#EDE9FE]">
                      <LayoutTemplate className="w-3.5 h-3.5 mr-1" /> Diseñar Boleta
                    </Button>
                  </a>
                  <Button variant="outline" size="sm" onClick={() => setModalProceso(seleccion)} data-testid="btn-editar-proceso"><Edit2 className="w-3.5 h-3.5 mr-1" /> Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => eliminarProceso(seleccion.id_eleccion)} data-testid="btn-eliminar-proceso"><Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar</Button>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <h3 className="font-display font-bold text-lg flex items-center gap-2"><Layers className="w-4 h-4" /> Boletas (Papeletas Imprimibles)</h3>
                <Button size="sm" onClick={() => setModalPapeleta({ idProc: seleccion.id_eleccion })} data-testid="btn-agregar-papeleta">
                  <Plus className="w-4 h-4 mr-1" /> Nueva Boleta
                </Button>
              </div>

              <div className="mt-4 space-y-5">
                {(seleccion.papeletas || []).sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((pap) => (
                  <div key={pap.id_papeleta} className="border border-slate-200 rounded-lg overflow-hidden" data-testid={`papeleta-${pap.id_papeleta}`}>
                    <div className="p-4 flex items-center justify-between bg-slate-50" style={{ borderLeft: `4px solid ${pap.color_hex || "#1E3A8A"}` }}>
                      <div>
                        <div className="font-display font-bold text-slate-900">{pap.nombre}</div>
                        <div className="text-[10px] font-data uppercase tracking-widest text-slate-500 mt-0.5">
                          {pap.franjas?.length || 0} franjas · 1 ánfora por mesa
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setModalFranja({ pap, nueva: true })} data-testid={`btn-agregar-franja-${pap.id_papeleta}`}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Franja
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setModalPapeleta({ idProc: seleccion.id_eleccion, papeleta: pap })}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => eliminarPapeleta(pap.id_papeleta)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {/* Franjas dentro de la boleta */}
                    <div className="divide-y divide-slate-100">
                      {(pap.franjas || []).sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((fr) => (
                        <div key={fr.id_franja} className="p-4" data-testid={`franja-${fr.id_franja}`}>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-8 rounded-sm" style={{ background: fr.color_franja || pap.color_hex || "#94A3B8" }} />
                              <div>
                                <div className="font-semibold text-sm">{fr.titulo}</div>
                                <div className="flex items-center gap-2">
                                  <span className={`stre-badge ${BADGE_TIPO_VOTO[fr.tipo_voto] || "bg-slate-100 text-slate-600"}`}>
                                    {(fr.tipo_voto || "nominal").replaceAll("_", " ")}
                                  </span>
                                  <span className="text-[10px] font-data text-slate-500">
                                    base: {REGLAS.find((regla) => regla.v === fr.calcular_porcentaje_sobre)?.n}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setModalSorteo({ pap, franja: fr })} data-testid={`btn-sorteo-${fr.id_franja}`}>
                                <Shuffle className="w-3.5 h-3.5 mr-1" /> Sorteo
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setModalCandidato({ pap, franja: fr })}>
                                <Plus className="w-3.5 h-3.5 mr-1" /> Candidato
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setModalFranja({ pap, franja: fr })}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => eliminarFranja(pap.id_papeleta, fr.id_franja)}>
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </Button>
                            </div>
                          </div>
                          {/* Candidatos de la franja */}
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                            {(fr.candidatos || []).map((c) => (
                              <div key={c.id_candidato} className="flex items-center gap-2 p-2 border border-slate-100 rounded-md group hover:border-slate-300">
                                <div className="w-8 h-8 rounded flex items-center justify-center font-data font-bold text-white text-xs shrink-0"
                                     style={{ background: c.color_hex || "#94A3B8" }}>
                                  {c.numero_lista ?? "—"}
                                </div>
                                {c.foto_url ? (
                                  <img src={`${process.env.REACT_APP_BACKEND_URL}${c.foto_url}`} alt="" className="w-10 h-10 rounded object-cover border" />
                                ) : (
                                  <div className="w-10 h-10 rounded bg-slate-100 border flex items-center justify-center text-slate-300"><Users className="w-4 h-4" /></div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{c.nombre}</div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-data uppercase tracking-wider">
                                    {c.logo_partido_url && <img src={`${process.env.REACT_APP_BACKEND_URL}${c.logo_partido_url}`} alt="" className="w-3 h-3 rounded-full" />}
                                    {c.sigla || c.partido || "sin partido"}
                                  </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition flex">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModalCandidato({ pap, franja: fr, candidato: c })}><Edit2 className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => eliminarCandidato(pap.id_papeleta, fr.id_franja, c.id_candidato)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                                </div>
                              </div>
                            ))}
                            {(!fr.candidatos || fr.candidatos.length === 0) && (
                              <div className="col-span-full text-center text-slate-400 text-xs py-2 font-data">Sin candidatos en esta franja</div>
                            )}
                          </div>
                        </div>
                      ))}
                      {(!pap.franjas || pap.franjas.length === 0) && (
                        <div className="text-center py-6 text-slate-400 text-sm font-data">Sin franjas. Añade la primera franja a esta boleta.</div>
                      )}
                    </div>
                  </div>
                ))}
                {(!seleccion.papeletas || seleccion.papeletas.length === 0) && (
                  <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    Sin boletas. Crea la primera boleta y luego sus franjas.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {modalProceso && <ModalProceso data={modalProceso === "nuevo" ? null : modalProceso} onClose={() => setModalProceso(false)} onOk={() => { setModalProceso(false); cargar(); }} />}
      {modalPapeleta && <ModalPapeleta {...modalPapeleta} onClose={() => setModalPapeleta(null)} onOk={() => { setModalPapeleta(null); cargar(); }} />}
      {modalFranja && <ModalFranja idProc={seleccion.id_eleccion} tipoEleccion={seleccion.tipo} {...modalFranja} onClose={() => setModalFranja(null)} onOk={() => { setModalFranja(null); cargar(); }} />}
      {modalCandidato && <ModalCandidato idProc={seleccion.id_eleccion} {...modalCandidato} onClose={() => setModalCandidato(null)} onOk={() => { setModalCandidato(null); cargar(); }} />}
      {modalSorteo && <ModalSorteo idProc={seleccion.id_eleccion} {...modalSorteo} onClose={() => setModalSorteo(null)} onOk={() => { setModalSorteo(null); cargar(); }} />}
    </div>
  );
}

function ModalProceso({ data, onClose, onOk }) {
  const [form, setForm] = useState(data || { nombre: "", pais: "Bolivia", tipo: "nacional", fecha_eleccion: "2026-12-01", activo: true, es_segunda_vuelta: false });
  const [enviando, setEnviando] = useState(false);
  const PREFIJOS = { nacional: "PRES", departamental: "DEP", municipal: "MUN", universitaria: "UNIV", sindical: "SIND", otro: "OTRO" };
  const preview = data ? data.id_eleccion : `${PREFIJOS[form.tipo] || "OTRO"}-${(form.fecha_eleccion || "").slice(0,4) || "----"}-BO-${form.es_segunda_vuelta ? "02" : "01"}`;
  const guardar = async () => {
    setEnviando(true);
    try {
      if (data) {
        await api.put(`/admin/procesos/${data.id_eleccion}`, {
          nombre: form.nombre, pais: "Bolivia", tipo: form.tipo,
          fecha_eleccion: form.fecha_eleccion, activo: form.activo
        });
        toast.success("Elección actualizada");
      } else {
        await api.post("/admin/procesos", { ...form, pais: "Bolivia" });
        toast.success("Elección creada");
      }
      onOk();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="modal-proceso">
        <DialogHeader><DialogTitle>{data ? "Editar Elección" : "Nueva Elección"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-600">ID Elección (auto-generado)</Label>
            <Input value={preview} disabled className="font-data font-bold bg-slate-100" data-testid="input-id-eleccion" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-600">Nombre público</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Elecciones Departamentales La Paz 2026" data-testid="input-nombre-eleccion" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">País</Label>
              <Input value="Bolivia" disabled className="bg-slate-100" data-testid="input-pais" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Fecha</Label>
              <Input type="date" value={form.fecha_eleccion} onChange={(e) => setForm({ ...form, fecha_eleccion: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-600">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_ELECCION.map((t) => <SelectItem key={t.v} value={t.v}>{t.icon} {t.n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!data && (
            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-md border border-amber-200">
              <div><div className="text-sm font-medium">Segunda Vuelta (Runoff)</div><div className="text-xs text-slate-500">Incrementa el contador a 02</div></div>
              <Switch checked={form.es_segunda_vuelta} onCheckedChange={(v) => setForm({ ...form, es_segunda_vuelta: v })} data-testid="switch-segunda-vuelta" />
            </div>
          )}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
            <div><div className="text-sm font-medium">Activa</div><div className="text-xs text-slate-500">Visible en el selector de proceso</div></div>
            <Switch checked={form.activo} onCheckedChange={(v) => setForm({ ...form, activo: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando || !form.nombre} data-testid="btn-guardar-proceso">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalPapeleta({ idProc, papeleta, onClose, onOk }) {
  const [form, setForm] = useState(papeleta || { nombre: "", color_hex: "#1E3A8A", orden: 0 });
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    setEnviando(true);
    try {
      if (papeleta) {
        await api.put(`/admin/procesos/${idProc}/papeletas/${papeleta.id_papeleta}`, form);
        toast.success("Boleta actualizada");
      } else {
        await api.post(`/admin/procesos/${idProc}/papeletas`, form);
        toast.success("Boleta creada");
      }
      onOk();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="modal-papeleta">
        <DialogHeader><DialogTitle>{papeleta ? "Editar Boleta" : "Nueva Boleta (Papeleta)"}</DialogTitle>
          <DialogDescription>Una boleta es una papeleta imprimible que va a UNA ánfora. Contendrá 1..N franjas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-600">Nombre de la boleta</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Boleta Nacional, Boleta Rectorado" data-testid="input-nombre-papeleta" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Color de identificación</Label>
              <div className="flex gap-2">
                <input type="color" value={form.color_hex || "#1E3A8A"} onChange={(e) => setForm({ ...form, color_hex: e.target.value })} className="w-12 h-10 rounded border" />
                <Input value={form.color_hex || ""} onChange={(e) => setForm({ ...form, color_hex: e.target.value })} className="font-data" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Orden</Label>
              <Input type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando || !form.nombre} data-testid="btn-guardar-papeleta">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalFranja({ idProc, tipoEleccion, pap, franja, onClose, onOk }) {
  const [form, setForm] = useState(franja || {
    titulo: "", tipo_voto: "nominal",
    calcular_porcentaje_sobre: "solo_validos", permite_blancos: true, permite_nulos: true,
    orden: 0, color_franja: "#F1F5F9", descripcion: ""
  });
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    setEnviando(true);
    try {
      if (franja) {
        await api.put(`/admin/procesos/${idProc}/papeletas/${pap.id_papeleta}/franjas/${franja.id_franja}`, form);
        toast.success("Franja actualizada");
      } else {
        await api.post(`/admin/procesos/${idProc}/papeletas/${pap.id_papeleta}/franjas`, form);
        toast.success("Franja creada");
      }
      onOk();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="modal-franja">
        <DialogHeader><DialogTitle>{franja ? "Editar Franja" : "Nueva Franja"}</DialogTitle>
          <DialogDescription>Boleta: <strong>{pap.nombre}</strong> · Cada franja tiene su propio recuento independiente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-600">Título de la franja</Label>
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ej: Presidente, Diputados, Decano de Facultad" data-testid="input-titulo-franja" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Tipo de Voto</Label>
              <Select value={form.tipo_voto} onValueChange={(v) => setForm({ ...form, tipo_voto: v })}>
                <SelectTrigger data-testid="select-tipo-voto"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_VOTO.map((t) => <SelectItem key={t.v} value={t.v}>{t.n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">% se calcula sobre</Label>
              <Select value={form.calcular_porcentaje_sobre} onValueChange={(v) => setForm({ ...form, calcular_porcentaje_sobre: v })}>
                <SelectTrigger data-testid="select-base-porcentaje"><SelectValue /></SelectTrigger>
                <SelectContent>{REGLAS.map((t) => <SelectItem key={t.v} value={t.v}>{t.n}</SelectItem>)}</SelectContent>
              </Select>
              {tipoEleccion === "universitaria" && (
                <div className="mt-2 text-[10px] text-slate-500" data-testid="aviso-calculo-universitario">
                  Esta base se aplicará por separado a las mesas Docente y Estudiante.
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Orden</Label>
              <Input type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Color de franja</Label>
              <div className="flex gap-2">
                <input type="color" value={form.color_franja || "#F1F5F9"} onChange={(e) => setForm({ ...form, color_franja: e.target.value })} className="w-12 h-10 rounded border" />
                <Input value={form.color_franja || ""} onChange={(e) => setForm({ ...form, color_franja: e.target.value })} className="font-data" />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-md flex-1">
              <span className="text-sm">Permite Blancos</span>
              <Switch checked={form.permite_blancos} onCheckedChange={(v) => setForm({ ...form, permite_blancos: v })} />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-md flex-1">
              <span className="text-sm">Permite Nulos</span>
              <Switch checked={form.permite_nulos} onCheckedChange={(v) => setForm({ ...form, permite_nulos: v })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando || !form.titulo} data-testid="btn-guardar-franja">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalCandidato({ idProc, pap, franja, candidato, onClose, onOk }) {
  const [form, setForm] = useState(candidato || { nombre: "", partido: "", sigla: "", color_hex: "#DC2626", foto_url: "", logo_partido_url: "", numero_lista: null });
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(null);

  const subir = async (archivo, campo) => {
    if (!archivo) return;
    setSubiendo(campo);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("tipo", campo === "foto_url" ? "candidato" : "logo");
      const { data } = await api.post("/admin/upload-imagen", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, [campo]: data.url }));
      toast.success("Imagen subida");
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setSubiendo(null); }
  };

  const guardar = async () => {
    setEnviando(true);
    try {
      const payload = { ...form, numero_lista: form.numero_lista ? Number(form.numero_lista) : null };
      const base = `/admin/procesos/${idProc}/papeletas/${pap.id_papeleta}/franjas/${franja.id_franja}/candidatos`;
      if (candidato) {
        await api.put(`${base}/${candidato.id_candidato}`, payload);
        toast.success("Candidato actualizado");
      } else {
        await api.post(base, payload);
        toast.success("Candidato añadido");
      }
      onOk();
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="modal-candidato">
        <DialogHeader><DialogTitle>{candidato ? "Editar Candidato" : "Nuevo Candidato"}</DialogTitle>
          <DialogDescription>Boleta: <strong>{pap.nombre}</strong> · Franja: <strong>{franja.titulo}</strong></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-600">Nombre completo / Nombre de lista</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} data-testid="input-nombre-candidato" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Partido</Label>
              <Input value={form.partido || ""} onChange={(e) => setForm({ ...form, partido: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Sigla</Label>
              <Input value={form.sigla || ""} onChange={(e) => setForm({ ...form, sigla: e.target.value })} className="font-data uppercase" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Color</Label>
              <div className="flex gap-2">
                <input type="color" value={form.color_hex || "#DC2626"} onChange={(e) => setForm({ ...form, color_hex: e.target.value })} className="w-12 h-10 rounded border" />
                <Input value={form.color_hex || ""} onChange={(e) => setForm({ ...form, color_hex: e.target.value })} className="font-data" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-slate-600">Nº lista</Label>
              <Input type="number" value={form.numero_lista ?? ""} onChange={(e) => setForm({ ...form, numero_lista: e.target.value })} placeholder="Se define por sorteo" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ImgUpload label="Foto del candidato" url={form.foto_url} loading={subiendo === "foto_url"} onFile={(f) => subir(f, "foto_url")} onClear={() => setForm({ ...form, foto_url: "" })} />
            <ImgUpload label="Logo del partido" url={form.logo_partido_url} loading={subiendo === "logo_partido_url"} onFile={(f) => subir(f, "logo_partido_url")} onClear={() => setForm({ ...form, logo_partido_url: "" })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando || !form.nombre} data-testid="btn-guardar-candidato">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImgUpload({ label, url, loading, onFile, onClear }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-slate-600">{label}</Label>
      <label className="mt-1 relative flex items-center justify-center h-24 rounded-md border-2 border-dashed border-slate-200 hover:border-slate-400 cursor-pointer bg-slate-50 overflow-hidden">
        {url ? (
          <>
            <img src={`${process.env.REACT_APP_BACKEND_URL}${url}`} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={(e) => { e.preventDefault(); onClear(); }} className="absolute top-1 right-1 bg-white/90 rounded-full p-1"><X className="w-3 h-3" /></button>
          </>
        ) : (
          <div className="text-center text-slate-400 text-xs">
            {loading ? "Subiendo…" : (<><ImagePlus className="w-5 h-5 mx-auto mb-1" /> Click para subir</>)}
          </div>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
    </div>
  );
}

function ModalSorteo({ idProc, pap, franja, onClose, onOk }) {
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const sortear = async () => {
    if (!window.confirm(`¿Ejecutar sorteo de posiciones para la franja "${franja.titulo}"? Se registrará permanentemente.`)) return;
    setEnviando(true);
    try {
      const { data } = await api.post(`/admin/procesos/${idProc}/papeletas/${pap.id_papeleta}/franjas/${franja.id_franja}/sorteo`);
      setResultado(data.orden);
      toast.success("Sorteo ejecutado y registrado en bitácora");
    } catch (e) { toast.error(formatearError(e?.response?.data?.detail)); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="modal-sorteo">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shuffle className="w-5 h-5 text-[#7C3AED]" /> Sorteo de Posiciones</DialogTitle>
          <DialogDescription>Boleta: <strong>{pap.nombre}</strong> · Franja: <strong>{franja.titulo}</strong> · {franja.candidatos?.length || 0} candidatos</DialogDescription>
        </DialogHeader>
        {!resultado ? (
          <div className="p-6 bg-[#F5F3FF] rounded-md text-center">
            <Shuffle className="w-10 h-10 mx-auto text-[#7C3AED] mb-3" />
            <p className="text-sm text-slate-700">El sorteo asignará números de lista aleatoriamente y quedará registrado en bitácora inmutable.</p>
            <Button className="mt-4 bg-[#7C3AED] hover:bg-[#6D28D9]" onClick={sortear} disabled={enviando} data-testid="btn-ejecutar-sorteo">
              {enviando ? "Sorteando…" : "Ejecutar Sorteo"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {resultado.map((r) => (
              <div key={r.id_candidato} className="flex items-center gap-3 p-2 border border-slate-100 rounded-md">
                <div className="w-10 h-10 rounded-md bg-[#1E3A8A] text-white font-data font-bold text-lg flex items-center justify-center">{r.posicion}</div>
                <div className="text-sm font-medium">{r.nombre}</div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => { if (resultado) onOk(); else onClose(); }}>{resultado ? "Cerrar" : "Cancelar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
