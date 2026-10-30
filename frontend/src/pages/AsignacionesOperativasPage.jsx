import { useEffect, useMemo, useState } from "react";
import { api, formatearError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  ordenarAnforasNumericamente,
  ordenarMesasNumericamente,
  ordenarNodosAlfabeticamente,
  ordenarRecintosAlfabeticamente,
} from "@/lib/sorting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

const ALFANUMERICOS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const NUMEROS = "23456789";
const ESPECIALES = "!@#$%&*?";

function indiceAleatorio(limite) {
  const maximoUint32 = 0x100000000;
  const rangoAceptado = Math.floor(maximoUint32 / limite) * limite;
  const valor = new Uint32Array(1);
  do {
    window.crypto.getRandomValues(valor);
  } while (valor[0] >= rangoAceptado);
  return valor[0] % limite;
}

function generarContrasenaInicial() {
  const caracteres = [
    LETRAS[indiceAleatorio(LETRAS.length)],
    NUMEROS[indiceAleatorio(NUMEROS.length)],
    ...Array.from(
      { length: 3 },
      () => ALFANUMERICOS[indiceAleatorio(ALFANUMERICOS.length)],
    ),
    ESPECIALES[indiceAleatorio(ESPECIALES.length)],
  ];

  for (let indice = caracteres.length - 1; indice > 0; indice -= 1) {
    const otroIndice = indiceAleatorio(indice + 1);
    [caracteres[indice], caracteres[otroIndice]] = [
      caracteres[otroIndice],
      caracteres[indice],
    ];
  }
  return caracteres.join("");
}

function usuarioVacio() {
  return { nombre_completo: "", email: "", contrasena: generarContrasenaInicial() };
}

function perteneceANodosFinales(recinto, idsNodos) {
  if (idsNodos.length === 0) return true;
  return idsNodos.includes(recinto?.id_nodo_padre)
    || (recinto?.path_ancestros || []).some((nodo) => idsNodos.includes(nodo.id));
}

function mesaDentroDelAmbito(mesa, idsNodos, idsRecintos, recintosPorId) {
  if (!mesa) return false;
  if (idsRecintos.length > 0 && !idsRecintos.includes(mesa.id_recinto)) return false;
  if (idsNodos.length === 0) return true;
  return perteneceANodosFinales(recintosPorId.get(mesa.id_recinto), idsNodos);
}

function anforaDentroDelAmbito(anfora, idsNodos, idsRecintos, idsMesas, recintosPorId) {
  if (idsMesas.length > 0 && !idsMesas.includes(anfora.id_mesa)) return false;
  if (idsRecintos.length > 0 && !idsRecintos.includes(anfora.id_recinto)) return false;
  if (idsNodos.length === 0) return true;

  const recinto = recintosPorId.get(anfora.id_recinto);
  return perteneceANodosFinales(recinto, idsNodos)
    || (anfora.path_ancestros || []).some((nodo) => idsNodos.includes(nodo.id));
}

function alternarId(seleccionados, id) {
  return seleccionados.includes(id)
    ? seleccionados.filter((valor) => valor !== id)
    : [...seleccionados, id];
}

export default function AsignacionesOperativasPage() {
  const { procesoActivo } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [estructura, setEstructura] = useState(null);
  const [usuarioNuevo, setUsuarioNuevo] = useState(usuarioVacio);
  const [usuarioCreado, setUsuarioCreado] = useState(null);
  const [mostrarContrasenaCreada, setMostrarContrasenaCreada] = useState(false);
  const [form, setForm] = useState({
    id_usuario: "",
    funcion: "carga",
    id_nodos: [],
    id_recintos: [],
    id_mesas: [],
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
    ordenarNodosAlfabeticamente(
      (estructura?.nodos || []).filter((nodo) => nodo.es_hoja_configurada),
    )
  ), [estructura]);
  const anforasOrdenadas = useMemo(
    () => ordenarAnforasNumericamente(estructura?.anforas || []),
    [estructura],
  );
  const recintosPorId = useMemo(
    () => new Map((estructura?.recintos || []).map((recinto) => [recinto.id, recinto])),
    [estructura],
  );
  const recintosDisponibles = useMemo(
    () => ordenarRecintosAlfabeticamente(
      (estructura?.recintos || []).filter((recinto) => (
        perteneceANodosFinales(recinto, form.id_nodos)
      )),
    ),
    [estructura, form.id_nodos],
  );
  const mesasPorId = useMemo(
    () => new Map((estructura?.mesas || []).map((mesa) => [mesa.id, mesa])),
    [estructura],
  );
  const mesasDisponibles = useMemo(
    () => ordenarMesasNumericamente(
      (estructura?.mesas || []).filter((mesa) => (
        mesaDentroDelAmbito(mesa, form.id_nodos, form.id_recintos, recintosPorId)
      )),
    ),
    [estructura, form.id_nodos, form.id_recintos, recintosPorId],
  );
  const anforasDisponibles = useMemo(
    () => ordenarAnforasNumericamente(
      (estructura?.anforas || []).filter((anfora) => (
        anforaDentroDelAmbito(
          anfora,
          form.id_nodos,
          form.id_recintos,
          form.id_mesas,
          recintosPorId,
        )
      )),
    ),
    [estructura, form.id_nodos, form.id_recintos, form.id_mesas, recintosPorId],
  );

  const alternar = (campo, id) => {
    setForm((anterior) => ({
      ...anterior,
      [campo]: alternarId(anterior[campo], id),
    }));
  };

  const alternarNodo = (idNodo) => {
    setForm((anterior) => {
      const idsNodos = alternarId(anterior.id_nodos, idNodo);
      const idsRecintos = anterior.id_recintos.filter((idRecinto) => (
        perteneceANodosFinales(recintosPorId.get(idRecinto), idsNodos)
      ));
      const idsMesas = anterior.id_mesas.filter((idMesa) => (
        mesaDentroDelAmbito(mesasPorId.get(idMesa), idsNodos, idsRecintos, recintosPorId)
      ));
      const anforasPorId = new Map((estructura?.anforas || []).map((anfora) => [anfora.id, anfora]));
      const idsAnforas = anterior.id_anforas.filter((idAnfora) => {
        const anfora = anforasPorId.get(idAnfora);
        return anfora && anforaDentroDelAmbito(
          anfora,
          idsNodos,
          idsRecintos,
          idsMesas,
          recintosPorId,
        );
      });
      return {
        ...anterior,
        id_nodos: idsNodos,
        id_recintos: idsRecintos,
        id_mesas: idsMesas,
        id_anforas: idsAnforas,
      };
    });
  };

  const alternarRecinto = (idRecinto) => {
    setForm((anterior) => {
      const idsRecintos = alternarId(anterior.id_recintos, idRecinto);
      const idsMesas = anterior.id_mesas.filter((idMesa) => (
        mesaDentroDelAmbito(mesasPorId.get(idMesa), anterior.id_nodos, idsRecintos, recintosPorId)
      ));
      const anforasPorId = new Map((estructura?.anforas || []).map((anfora) => [anfora.id, anfora]));
      const idsAnforas = anterior.id_anforas.filter((idAnfora) => {
        const anfora = anforasPorId.get(idAnfora);
        return anfora && anforaDentroDelAmbito(
          anfora,
          anterior.id_nodos,
          idsRecintos,
          idsMesas,
          recintosPorId,
        );
      });
      return { ...anterior, id_recintos: idsRecintos, id_mesas: idsMesas, id_anforas: idsAnforas };
    });
  };

  const alternarMesa = (idMesa) => {
    setForm((anterior) => {
      const idsMesas = alternarId(anterior.id_mesas, idMesa);
      const anforasPorId = new Map((estructura?.anforas || []).map((anfora) => [anfora.id, anfora]));
      const idsAnforas = anterior.id_anforas.filter((idAnfora) => {
        const anfora = anforasPorId.get(idAnfora);
        return anfora && anforaDentroDelAmbito(
          anfora,
          anterior.id_nodos,
          anterior.id_recintos,
          idsMesas,
          recintosPorId,
        );
      });
      return { ...anterior, id_mesas: idsMesas, id_anforas: idsAnforas };
    });
  };

  const crearUsuario = async (evento) => {
    evento.preventDefault();
    try {
      const { data } = await api.post("/admin/usuarios-operativos", usuarioNuevo);
      toast.success("Usuario operativo creado.");
      setUsuarioCreado({
        email: data.email,
        nombre_completo: data.nombre_completo,
        contrasena: usuarioNuevo.contrasena,
      });
      setMostrarContrasenaCreada(false);
      setUsuarioNuevo(usuarioVacio());
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
        id_mesas: [],
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
        <p className="mt-1 text-slate-600">{procesoActivo.nombre} · los ámbitos se heredan dinámicamente entre nodos, recintos, mesas y ánforas.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <form onSubmit={crearUsuario} className="border border-slate-200 bg-white p-5" data-testid="crear-usuario-operativo-form">
          <div className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-[#1E3A8A]" /><h2 className="font-display text-lg font-bold">Crear usuario operativo</h2></div>
          <div className="mt-5 space-y-3">
            <div><Label>Nombre completo</Label><Input value={usuarioNuevo.nombre_completo} onChange={(evento) => setUsuarioNuevo({ ...usuarioNuevo, nombre_completo: evento.target.value })} data-testid="nombre-usuario-operativo" /></div>
            <div><Label>Correo electrónico</Label><Input type="email" value={usuarioNuevo.email} onChange={(evento) => setUsuarioNuevo({ ...usuarioNuevo, email: evento.target.value })} data-testid="email-usuario-operativo" /></div>
            <div>
              <Label>Contraseña inicial</Label>
              <Input
                type="password"
                value={usuarioNuevo.contrasena}
                readOnly
                aria-label="Contraseña inicial generada"
                data-testid="contrasena-usuario-operativo"
              />
              <p className="mt-1 text-xs text-slate-500">Se genera automáticamente: 6 caracteres con letras, números y un carácter especial.</p>
            </div>
          </div>
          <Button type="submit" className="mt-5 w-full" data-testid="crear-usuario-operativo-button"><UserPlus className="w-4 h-4 mr-2" /> Crear cuenta</Button>
          {usuarioCreado && (
            <div className="mt-4 border border-emerald-200 bg-emerald-50 p-4" data-testid="credenciales-usuario-creado">
              <div className="font-semibold text-emerald-900">Usuario operativo creado</div>
              <div className="mt-1 text-sm text-emerald-900">{usuarioCreado.nombre_completo} · {usuarioCreado.email}</div>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded border border-emerald-200 bg-white px-3 py-2 text-sm" data-testid="contrasena-usuario-creado">
                  {mostrarContrasenaCreada ? usuarioCreado.contrasena : "••••••"}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMostrarContrasenaCreada((visible) => !visible)}
                  aria-label={mostrarContrasenaCreada ? "Ocultar contraseña" : "Ver contraseña"}
                  data-testid="alternar-visibilidad-contrasena"
                >
                  {mostrarContrasenaCreada ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                  {mostrarContrasenaCreada ? "Ocultar" : "Ver"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-emerald-800">Guárdala ahora; no se podrá consultar después de salir de esta pantalla.</p>
            </div>
          )}
        </form>

        <section className="border border-slate-200 bg-white p-5" data-testid="asignar-ambito-operativo">
          <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#1E3A8A]" /><h2 className="font-display text-lg font-bold">Asignar función y ámbito</h2></div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><Label>Usuario</Label><Select value={form.id_usuario} onValueChange={(id_usuario) => setForm({ ...form, id_usuario })}><SelectTrigger data-testid="asignar-usuario-select"><SelectValue placeholder="Seleccione una cuenta" /></SelectTrigger><SelectContent>{usuarios.map((usuario) => <SelectItem key={usuario.id} value={usuario.id}>{usuario.nombre_completo} · {usuario.email}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Función en esta elección</Label><Select value={form.funcion} onValueChange={(funcion) => setForm({ ...form, funcion })}><SelectTrigger data-testid="asignar-funcion-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="carga">Operador de carga</SelectItem><SelectItem value="validacion">Validador de actas</SelectItem></SelectContent></Select></div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            <SelectorAmbito titulo="Nodos finales" items={nodosTerminales} seleccionados={form.id_nodos} onAlternar={alternarNodo} testid="scope-nodos" etiqueta={(item) => item.path_texto || item.nombre_nodo} />
            <SelectorAmbito titulo="Recintos" items={recintosDisponibles} seleccionados={form.id_recintos} onAlternar={alternarRecinto} testid="scope-recintos" etiqueta={(item) => item.nombre} />
            <SelectorAmbito titulo="Mesas" items={mesasDisponibles} seleccionados={form.id_mesas} onAlternar={alternarMesa} testid="scope-mesas" etiqueta={(item) => `Mesa ${item.numero_mesa}`} />
            <SelectorAmbito titulo="Ánforas específicas" items={anforasDisponibles} seleccionados={form.id_anforas} onAlternar={(id) => alternar("id_anforas", id)} testid="scope-anforas" etiqueta={(item) => `${item.numero_anfora} · ${item.nombre}`} />
          </div>
          <Button onClick={guardarAsignacion} disabled={!form.id_usuario} className="mt-5" data-testid="guardar-asignacion-operativa-button"><ShieldCheck className="w-4 h-4 mr-2" /> Guardar asignación</Button>
        </section>
      </div>

      <section className="mt-8 border border-slate-200 bg-white p-5" data-testid="lista-asignaciones-operativas">
        <div className="flex items-center gap-2"><Users className="w-5 h-5 text-[#1E3A8A]" /><h2 className="font-display text-lg font-bold">Asignaciones vigentes</h2></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-slate-200 text-left text-[10px] font-data uppercase tracking-widest text-slate-500"><tr><th className="p-2">Usuario</th><th className="p-2">Función</th><th className="p-2">Ámbito</th><th className="p-2" /></tr></thead><tbody>{asignaciones.map((asignacion) => { const usuario = usuarios.find((item) => item.id === asignacion.id_usuario); return <tr key={asignacion.id} className="border-b border-slate-100"><td className="p-2"><div className="font-semibold">{usuario?.nombre_completo || "Usuario eliminado"}</div><div className="text-xs text-slate-500">{usuario?.email}</div></td><td className="p-2 capitalize">{asignacion.funcion}</td><td className="p-2 text-xs text-slate-600">{asignacion.id_nodos.length} nodos · {asignacion.id_recintos.length} recintos · {(asignacion.id_mesas || []).length} mesas · {asignacion.id_anforas.length} ánforas</td><td className="p-2 text-right"><Button variant="outline" size="sm" onClick={() => eliminar(asignacion.id)} data-testid={`eliminar-asignacion-${asignacion.id}`}>Quitar</Button></td></tr>; })}</tbody></table></div>
      </section>
    </div>
  );
}

function SelectorAmbito({ titulo, items, seleccionados, onAlternar, testid, etiqueta }) {
  return <div className="border border-slate-200 p-3"><div className="text-sm font-semibold">{titulo}</div><div className="mt-1 text-[10px] text-slate-500">Las selecciones se acumulan.</div><div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 text-xs"><input type="checkbox" checked={seleccionados.includes(item.id)} onChange={() => onAlternar(item.id)} data-testid={`${testid}-${item.id}`} /><span>{etiqueta(item)}</span></label>)}{items.length === 0 && <div className="text-xs text-slate-400">Sin elementos disponibles.</div>}</div></div>;
}