import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { renderCandidato } from "@/pages/DisenoPapeletaPage";

const PX_POR_MM = 3.78;

export default function ImprimirPapeletaPage() {
  const { id_eleccion } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/procesos/${id_eleccion}/diseno`).then((r) => {
      setData(r.data);
      setTimeout(() => window.print(), 800);
    });
  }, [id_eleccion]);

  if (!data || !data.diseno) {
    return <div className="p-8">Sin diseño guardado. Vuelve al diseñador y presiona "Guardar".</div>;
  }
  const d = data.diseno;
  const disenosPorBoleta = d.boletas || (data.papeletas || []).map((papeleta) => ({
    ...d,
    id_papeleta: papeleta.id_papeleta,
    franjas: (d.franjas || []).filter(
      (franja) => franja.id_papeleta === papeleta.id_papeleta,
    ),
  }));

  return (
    <div style={{ background: "#e5e7eb", minHeight: "100vh", display: "flex", justifyContent: "center", padding: 20 }}>
      <style>{`
        @page { margin: 0; }
        @media print {
          body { margin: 0; background: white; }
          .no-print { display: none !important; }
          .papeleta-print { box-shadow: none !important; }
          .papeleta-print:not(:last-child) { break-after: page; }
        }
      `}</style>
      <div className="flex flex-col gap-6">
        {disenosPorBoleta.map((boleta) => {
          const papeleta = (data.papeletas || []).find(
            (item) => item.id_papeleta === boleta.id_papeleta,
          );
          const ancho = boleta.orientacion === "vertical"
            ? boleta.ancho_mm * PX_POR_MM
            : boleta.alto_mm * PX_POR_MM;
          const alto = boleta.orientacion === "vertical"
            ? boleta.alto_mm * PX_POR_MM
            : boleta.ancho_mm * PX_POR_MM;
          const infoAnfora = (data.anfora_de_papeleta || {})[boleta.id_papeleta];

          return (
            <div
              key={boleta.id_papeleta}
              className="papeleta-print"
              style={{
                width: ancho,
                height: alto,
                position: "relative",
                background: boleta.fondo_url
                  ? `url(${process.env.REACT_APP_BACKEND_URL}${boleta.fondo_url}) center/cover`
                  : boleta.fondo_color,
                boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              }}
              data-testid={`impresion-boleta-${boleta.id_papeleta}`}
            >
              {boleta.encabezado && (
                <div style={{ position: "absolute", left: boleta.encabezado_config?.x ?? 24, top: boleta.encabezado_config?.y ?? 14, width: boleta.encabezado_config?.w ?? 650, height: boleta.encabezado_config?.h ?? 38, alignItems: "center", background: "rgba(255,255,255,0.7)", display: "flex", fontFamily: boleta.encabezado_config?.font_family || "sans-serif", fontSize: boleta.encabezado_config?.font_size || 16, fontWeight: 700, justifyContent: "center", textAlign: "center" }}>
                  {boleta.encabezado}
                </div>
              )}
              {(boleta.franjas || []).map((franjaDiseno) => {
                const franja = papeleta?.franjas.find(
                  (item) => item.id_franja === franjaDiseno.id_franja,
                );
                if (!franja) return null;
                return (
                  <div key={franja.id_franja} style={{ position: "absolute", left: franjaDiseno.x, top: franjaDiseno.y, width: franjaDiseno.w, height: franjaDiseno.h, background: franjaDiseno.fondo_color, padding: 6, overflow: "hidden" }}>
                    {franjaDiseno.titulo_visible && <div style={{ marginBottom: 5, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{franja.titulo}</div>}
                    {infoAnfora && <div style={{ position: "absolute", right: 6, top: 6, color: "white", background: infoAnfora.color_hex || "#D97706", fontSize: 8, fontWeight: 800, padding: "2px 5px" }}>ÁNFORA {infoAnfora.numero_anfora}</div>}
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${franjaDiseno.columnas || 3}, minmax(${franjaDiseno.ancho_candidato || 150}px, 1fr))`, gridAutoRows: `${franjaDiseno.alto_candidato || 210}px`, gap: franjaDiseno.espaciado_candidatos || 0 }}>
                      {(franja.candidatos || []).map((candidato) => renderCandidato(candidato, franjaDiseno))}
                    </div>
                  </div>
                );
              })}
              {boleta.pie && <div style={{ position: "absolute", left: boleta.pie_config?.x ?? 24, top: boleta.pie_config?.y ?? alto - 34, width: boleta.pie_config?.w ?? 650, height: boleta.pie_config?.h ?? 24, alignItems: "center", background: "rgba(255,255,255,0.7)", display: "flex", fontFamily: boleta.pie_config?.font_family || "monospace", fontSize: boleta.pie_config?.font_size || 11, justifyContent: "center", textAlign: "center" }}>{boleta.pie}</div>}
            </div>
          );
        })}
      </div>
      <button className="no-print" onClick={() => window.print()} style={{ position: "fixed", bottom: 20, right: 20, padding: "10px 20px", background: "#1E3A8A", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }} data-testid="imprimir-boletas">
        Imprimir
      </button>
    </div>
  );
}
