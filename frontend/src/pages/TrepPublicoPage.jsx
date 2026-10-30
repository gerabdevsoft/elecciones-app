import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ordenarAnforasNumericamente } from "@/lib/sorting";
import {
  construirFiltrosEstructura,
  filtrarAnforasPorEstructura,
} from "@/lib/electoralFilters";
import { FileImage, Search, Vote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TrepPublicoPage() {
  const [procesos, setProcesos] = useState([]);
  const [idEleccion, setIdEleccion] = useState("");
  const [localizador, setLocalizador] = useState(null);
  const [numeroDirecto, setNumeroDirecto] = useState("");
  const [numeroEstructura, setNumeroEstructura] = useState("");
  const [rutaNodos, setRutaNodos] = useState([]);
  const [idRecinto, setIdRecinto] = useState("");
  const [idMesa, setIdMesa] = useState("");
  const [acta, setActa] = useState(null);
  const [errorActa, setErrorActa] = useState("");
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
    setNumeroEstructura("");
    setRutaNodos([]);
    setIdRecinto("");
    setIdMesa("");
    api.get(`/publico/procesos/${idEleccion}/localizador`).then(({ data }) => setLocalizador(data));
  }, [idEleccion]);

  useEffect(() => {
    solicitudActaRef.current += 1;
    setActa(null);
    setErrorActa("");
  }, [numeroDirecto, numeroEstructura, rutaNodos, idRecinto, idMesa]);

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
        const coincideNumeroEstructura = !numeroEstructura.trim() || (
          String(anfora.numero_anfora) === numeroEstructura.trim()
        );
        return coincideDirecta && coincideNumeroEstructura;
      }),
  ), [idMesa, idRecinto, localizador, numeroDirecto, numeroEstructura, rutaNodos]);

  const seleccionarNodo = (indice, idNodo) => {
    setRutaNodos((anterior) => [...anterior.slice(0, indice), idNodo]);
    setIdRecinto("");
    setIdMesa("");
    setNumeroEstructura("");
    setNumeroDirecto("");
  };

  const abrirActa = async (anfora) => {
    const idSolicitud = solicitudActaRef.current + 1;
    solicitudActaRef.current = idSolicitud;
    setErrorActa("");
    try {
      const { data } = await api.get(`/publico/procesos/${idEleccion}/actas/${anfora.id}`);
      if (solicitudActaRef.current === idSolicitud) setActa(data);
    } catch (error) {
      if (solicitudActaRef.current === idSolicitud) {
        setErrorActa("No fue posible cargar el acta consolidada.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100" data-testid="trep-publico-page">
      <CabeceraPublica />
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="border-l-4 border-[#1E3A8A] pl-4">
          <div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Consulta ciudadana</div>
          <h1 className="mt-1 font-display text-3xl font-extrabold text-slate-900">Actas consolidadas</h1>
          <p className="mt-1 max-w-3xl text-slate-600">Consulte actas bloqueadas, su imagen y los resultados transcritos. Los borradores no se publican.</p>
        </div>

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
                  setNumeroEstructura("");
                }}
                className="mt-1 font-data"
                placeholder="Número de ánfora"
                data-testid="buscar-acta-publica"
              />
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="mb-2 text-[10px] font-data uppercase tracking-widest text-slate-500">O filtre por estructura electoral</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {nivelesNodos.map((nivel) => (
                <Select key={nivel.indice} value={rutaNodos[nivel.indice] || ""} onValueChange={(valor) => seleccionarNodo(nivel.indice, valor)}>
                  <SelectTrigger data-testid={`filtro-publico-nodo-${nivel.indice}`}><SelectValue placeholder={nivel.etiqueta} /></SelectTrigger>
                  <SelectContent>{nivel.nodos.map((nodo) => <SelectItem key={nodo.id} value={nodo.id}>{nodo.nombre_nodo}</SelectItem>)}</SelectContent>
                </Select>
              ))}
              <Select value={idRecinto} onValueChange={(valor) => { setIdRecinto(valor); setIdMesa(""); setNumeroEstructura(""); setNumeroDirecto(""); }} disabled={!idNodoTerminal}>
                <SelectTrigger data-testid="filtro-publico-recinto"><SelectValue placeholder="Recinto" /></SelectTrigger>
                <SelectContent>{recintos.map((recinto) => <SelectItem key={recinto.id} value={recinto.id}>{recinto.nombre}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={idMesa} onValueChange={(valor) => { setIdMesa(valor); setNumeroEstructura(""); setNumeroDirecto(""); }} disabled={!idRecinto}>
                <SelectTrigger data-testid="filtro-publico-mesa"><SelectValue placeholder="Mesa" /></SelectTrigger>
                <SelectContent>{mesas.map((mesa) => <SelectItem key={mesa.id} value={mesa.id}>Mesa {mesa.numero_mesa}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={numeroEstructura} onChange={(evento) => { setNumeroEstructura(evento.target.value); setNumeroDirecto(""); }} placeholder="N° de ánfora" className={`font-data ${nivelesNodos.length > 1 ? "md:col-span-2 xl:col-span-1" : ""}`} disabled={!idNodoTerminal} data-testid="buscar-anfora-en-estructura" />
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
          <div className="border border-slate-200 bg-white p-4" data-testid="lista-actas-publicas">
            <div className="flex items-center gap-2 text-sm font-bold"><Search className="w-4 h-4 text-[#1E3A8A]" /> Actas disponibles</div>
            <div className="mt-4 space-y-2">
              {anforas.map((anfora) => {
                const mesa = (localizador?.mesas || []).find((item) => item.id === anfora.id_mesa);
                const recinto = (localizador?.recintos || []).find((item) => item.id === anfora.id_recinto);
                return <button key={anfora.id} type="button" onClick={() => abrirActa(anfora)} className="w-full border border-slate-200 p-3 text-left hover:border-[#1E3A8A] hover:bg-blue-50" data-testid={`abrir-acta-publica-${anfora.id}`}><div className="font-data text-xs font-bold">Ánfora {anfora.numero_anfora}</div><div className="mt-1 text-sm font-semibold">{anfora.nombre}</div><div className="mt-1 text-xs text-slate-500">Mesa {mesa?.numero_mesa || "—"} · {recinto?.nombre || "—"}</div>{mesa?.tipo_mesa && <div className="mt-1 text-[10px] font-data uppercase text-blue-700">Mesa {mesa.tipo_mesa}</div>}</button>;
              })}
              {localizador && anforas.length === 0 && <div className="text-sm text-slate-400">No existen actas consolidadas con estos filtros.</div>}
            </div>
          </div>

          <DetalleActaPublica acta={acta} error={errorActa} />
        </section>
      </main>
    </div>
  );
}

function DetalleActaPublica({ acta, error }) {
  if (error) return <div className="border border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-800" data-testid="error-acta-publica">{error}</div>;
  if (!acta) return <div className="border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400" data-testid="acta-publica-vacia">Seleccione un acta consolidada para ver la imagen y sus datos de solo lectura.</div>;
  return <section className="border border-slate-200 bg-white p-4 sm:p-6" data-testid="detalle-acta-publica"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-data uppercase tracking-widest text-slate-500">Acta consolidada</div><h2 className="mt-1 font-display text-2xl font-bold">Ánfora {acta.numero_anfora}</h2><div className="mt-1 text-sm text-slate-600">{acta.recinto} · {acta.ambiente}</div>{acta.tipo_mesa && <div className="mt-1 text-xs font-data uppercase text-blue-700">Mesa {acta.tipo_mesa}</div>}</div><div className="text-xs font-data text-slate-400">{acta.actualizado_en}</div></div>{acta.imagen_url ? <img src={`${process.env.REACT_APP_BACKEND_URL}${acta.imagen_url}`} alt={`Acta consolidada ${acta.numero_anfora}`} className="mt-6 max-h-[680px] w-full border border-slate-200 object-contain" data-testid="imagen-acta-publica" /> : <div className="mt-6 flex items-center gap-2 border border-dashed border-slate-300 p-5 text-sm text-slate-400"><FileImage className="w-5 h-5" /> Imagen no disponible.</div>}<div className="mt-6 space-y-4">{acta.conteos.map((conteo) => <article key={`${conteo.papeleta}-${conteo.franja}`} className="border border-slate-200 p-4"><div className="text-[10px] font-data uppercase tracking-widest text-slate-500">{conteo.papeleta}</div><h3 className="mt-1 font-bold">{conteo.franja}</h3><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{conteo.candidatos.map((candidato) => <div key={candidato.nombre} className="flex justify-between border-t border-slate-100 pt-2 text-sm"><span>{candidato.nombre}</span><strong className="font-data">{candidato.votos}</strong></div>)}</div><div className="mt-3 flex gap-4 text-xs font-data text-slate-500"><span>Blancos: {conteo.votos_blancos}</span><span>Nulos: {conteo.votos_nulos}</span></div></article>)}</div></section>;
}

export function CabeceraPublica() {
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
          <Link to="/trep" className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" data-testid="enlace-trep-publico">Actas TREP</Link>
          <Link to="/resultados-publicos" className="bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white" data-testid="enlace-resultados-publicos">Resultados</Link>
          <Link to="/acceso" className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" data-testid="enlace-acceso-operativo">Acceso</Link>
        </nav>
      </div>
    </header>
  );
}