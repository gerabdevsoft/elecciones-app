import { useEffect, useMemo, useState } from "react";
import { api, formatearError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

const inicialUsuario = { nombre_completo: "", email: "", contrasena: "" };

export default function AsignacionesOperativasPage() {
  const { procesoActivo } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [estructura, setEstructura] = useState(null);
  const [usuarioNuevo, setUsuarioNuevo] = useState(inicialUsuario);
  const [form, setForm] = useState({
    id_usuario: "",
    funcion: "carga",
    id_nodos: [],
    id_recintos: [],
    id_anforas: [],
  });

  const cargar = async () => {
    if (!procesoActivo) return;
    try {
      const [usuariosRes, asignacionesRes, estructuraRes] = await Promise.all([
        api.get("/admin/usuarios-operativos"),
        api.get(`/admin/procesos/${procesoActivo.id_eleccion}/asignaciones-operativas`),
        api.get(`/procesos/${procesoActivo.id_eleccion}/localizador-anforas`),
      ]);
      setUsuarios(usuariosRes.data);
      setAsignaciones(asignacionesRes.data);
      setEstructura(estructuraRes.data);
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    }
  };

  useEffect(() => { cargar(); }, [procesoActivo?.id_eleccion]);

  const nodosTerminales = useMemo(() => (
    (estructura?.nodos || []).filter((nodo) => nodo.es_hoja_configurada)
  ), [estructura]);

  const alternar = (campo, id) => {
    setForm((anterior) => ({
      ...anterior,
      [campo]: anterior[campo].includes(id)
        ? anterior[campo].filter((valor) => valor !== id)
        : [...anterior[campo], id],
    }));
  };

  const crearUsuario = async (evento) => {
    evento.preventDefault();
    try {
      const { data } = await api.post("/admin/usuarios-operativos", usuarioNuevo);
      toast.success("Usuario operativo creado.");
      setUsuarioNuevo(inicialUsuario);
      setForm((anterior) => ({ ...anterior, id_usuario: data.id }));
      await cargar();
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    }
  };

  const guardarAsignacion = async () => {
    try {
      await api.post(
        `/admin/procesos/${procesoActivo.id_eleccion}/asignaciones-operativas`,
        form,
      );
      toast.success("Ámbito operativo asignado.");
      setForm((anterior) => ({
        ...anterior,
        id_nodos: [],
        id_recintos: [],
        id_anforas: [],
      }));
      await cargar();
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    }
  };

  const eliminar = async (id) => {
    try {
      await api.delete(`/admin/asignaciones-operativas/${id}`);
      toast.success("Asignación eliminada.");
      await cargar();
    } catch (e) {
      toast.error(formatearError(e?.response?.data?.detail));
    }
  };

  if (!procesoActivo) return null;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8" data-testid="asignaciones-operativas-page">
      <div className="border-l-4 border-[#1E3A8A] pl-4">
        <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Administración operativa</div>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-slate-900">Usuarios y ámbitos</h1>
        <p className="mt-1 text-slate-600">{procesoActivo.nombre} · los ámbitos se heredan dinámicamente a recintos y ánforas.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <form onSubmit={crearUsuario} className="border border-slate-200 bg-white p-5" data-testid="crear-usuario-operativo-form">
          <div className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-[#1E3A8A]" /><h2 className="font-display text-lg font-bold">Crear usuario operativo</h2></div>
          <div className="mt-5 space-y-3">
            <div><Label>Nombre completo</Label><Input value={usuarioNuevo.nombre_completo} onChange={(evento) => setUsuarioNuevo({ ...usuarioNuevo, nombre_completo: evento.target.value })} data-testid="nombre-usuario-operativo" /></div>
            <div><Label>Correo electrónico</Label><Input type="email" value={usuarioNuevo.email} onChange={(evento) => setUsuarioNuevo({ ...usuarioNuevo, email: evento.target.value })} data-testid="email-usuario-operativo" /></div>
            <div><Label>Contraseña inicial</Label><Input type="password" minLength="10" value={usuarioNuevo.contrasena} onChange={(evento) => setUsuarioNuevo({ ...usuarioNuevo, contrasena: evento.target.value })} data-testid="contrasena-usuario-operativo" /></div>
          </div>
          <Button type="submit" className="mt-5 w-full" data-testid="crear-usuario-operativo-button"><UserPlus className="w-4 h-4 mr-2" /> Crear cuenta</Button>
        </form>

        <section className="border border-slate-200 bg-white p-5" data-testid="asignar-ambito-operativo">
          <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#1E3A8A]" /><h2 className="font-display text-lg font-bold">Asignar función y ámbito</h2></div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><Label>Usuario</Label><Select value={form.id_usuario} onValueChange={(id_usuario) => setForm({ ...form, id_usuario })}><SelectTrigger data-testid="asignar-usuario-select"><SelectValue placeholder="Seleccione una cuenta" /></SelectTrigger><SelectContent>{usuarios.map((usuario) => <SelectItem key={usuario.id} value={usuario.id}>{usuario.nombre_completo} · {usuario.email}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Función en esta elección</Label><Select value={form.funcion} onValueChange={(funcion) => setForm({ ...form, funcion })}><SelectTrigger data-testid="asignar-funcion-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="carga">Operador de carga</SelectItem><SelectItem value="validacion">Validador de actas</SelectItem></SelectContent></Select></div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SelectorAmbito titulo="Nodos finales" items={nodosTerminales} seleccionados={form.id_nodos} onAlternar={(id) => alternar("id_nodos", id)} testid="scope-nodos" etiqueta={(item) => item.path_texto || item.nombre_nodo} />
            <SelectorAmbito titulo="Recintos" items={estructura?.recintos || []} seleccionados={form.id_recintos} onAlternar={(id) => alternar("id_recintos", id)} testid="scope-recintos" etiqueta={(item) => item.nombre} />
            <SelectorAmbito titulo="Ánforas específicas" items={estructura?.anforas || []} seleccionados={form.id_anforas} onAlternar={(id) => alternar("id_anforas", id)} testid="scope-anforas" etiqueta={(item) => `${item.numero_anfora} · ${item.nombre}`} />
          </div>
          <Button onClick={guardarAsignacion} disabled={!form.id_usuario} className="mt-5" data-testid="guardar-asignacion-operativa-button"><ShieldCheck className="w-4 h-4 mr-2" /> Guardar asignación</Button>
        </section>
      </div>

      <section className="mt-8 border border-slate-200 bg-white p-5" data-testid="lista-asignaciones-operativas">
        <div className="flex items-center gap-2"><Users className="w-5 h-5 text-[#1E3A8A]" /><h2 className="font-display text-lg font-bold">Asignaciones vigentes</h2></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-slate-200 text-left text-[10px] font-data uppercase tracking-widest text-slate-500"><tr><th className="p-2">Usuario</th><th className="p-2">Función</th><th className="p-2">Ámbito</th><th className="p-2" /></tr></thead><tbody>{asignaciones.map((asignacion) => { const usuario = usuarios.find((item) => item.id === asignacion.id_usuario); return <tr key={asignacion.id} className="border-b border-slate-100"><td className="p-2"><div className="font-semibold">{usuario?.nombre_completo || "Usuario eliminado"}</div><div className="text-xs text-slate-500">{usuario?.email}</div></td><td className="p-2 capitalize">{asignacion.funcion}</td><td className="p-2 text-xs text-slate-600">{asignacion.id_nodos.length} nodos · {asignacion.id_recintos.length} recintos · {asignacion.id_anforas.length} ánforas</td><td className="p-2 text-right"><Button variant="outline" size="sm" onClick={() => eliminar(asignacion.id)} data-testid={`eliminar-asignacion-${asignacion.id}`}>Quitar</Button></td></tr>; })}</tbody></table></div>
      </section>
    </div>
  );
}

function SelectorAmbito({ titulo, items, seleccionados, onAlternar, testid, etiqueta }) {
  return <div className="border border-slate-200 p-3"><div className="text-sm font-semibold">{titulo}</div><div className="mt-1 text-[10px] text-slate-500">Las selecciones se acumulan.</div><div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 text-xs"><input type="checkbox" checked={seleccionados.includes(item.id)} onChange={() => onAlternar(item.id)} data-testid={`${testid}-${item.id}`} /><span>{etiqueta(item)}</span></label>)}{items.length === 0 && <div className="text-xs text-slate-400">Sin elementos disponibles.</div>}</div></div>;
}