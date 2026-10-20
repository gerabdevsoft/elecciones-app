import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";
import LoginPage from "@/pages/LoginPage";
import SeleccionProcesoPage from "@/pages/SeleccionProcesoPage";
import CentroComputoPage from "@/pages/CentroComputoPage";
import BitacoraPage from "@/pages/BitacoraPage";
import ResultadosPage from "@/pages/ResultadosPage";
import TrepPublicoPage from "@/pages/TrepPublicoPage";
import ResultadosPublicosPage from "@/pages/ResultadosPublicosPage";
import GestionElectoralPage from "@/pages/GestionElectoralPage";
import DisenoPapeletaPage from "@/pages/DisenoPapeletaPage";
import ImprimirPapeletaPage from "@/pages/ImprimirPapeletaPage";
import EstructuraElectoralPage from "@/pages/EstructuraElectoralPage";
import AsignacionesOperativasPage from "@/pages/AsignacionesOperativasPage";
import { Vote, LogOut, Layers, ClipboardList, BarChart3, Radio, ShieldCheck, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/App.css";

function RequiereAuth({ children }) {
  const { usuario } = useAuth();
  if (usuario === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 font-data text-sm animate-pulse" data-testid="auth-loading">Verificando sesión…</div>
      </div>
    );
  }
  if (!usuario) return <Navigate to="/acceso" replace />;
  return children;
}

function RequiereProceso({ children }) {
  const { procesoActivo } = useAuth();
  if (!procesoActivo) return <Navigate to="/seleccionar-proceso" replace />;
  return children;
}

function RequiereRol({ roles, children }) {
  const { usuario } = useAuth();
  if (!usuario || !roles.includes(usuario.rol)) return <Navigate to="/seleccionar-proceso" replace />;
  return children;
}

function Cabecera() {
  const { usuario, procesoActivo, cerrarSesion, liberarProceso } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  if (!usuario) return null;

  const enlaces = [];
  if (usuario.rol !== "resultados") {
    enlaces.push({ to: "/centro-computo", label: "Centro de Cómputo", icon: ClipboardList, testid: "nav-centro-computo" });
  }
  if (["admin", "resultados"].includes(usuario.rol)) {
    enlaces.push({ to: "/resultados", label: "Resultados", icon: Radio, testid: "nav-resultados" });
  }
  if (["admin", "operador"].includes(usuario.rol)) {
    enlaces.push({ to: "/trep", label: "TREP Público", icon: Vote, testid: "nav-trep-publico" });
    enlaces.push({ to: "/resultados-publicos", label: "Resultados Públicos", icon: BarChart3, testid: "nav-resultados-publicos" });
  }
  if (usuario.rol === "admin") {
    enlaces.push({ to: "/gestion-electoral", label: "Gestión Electoral", icon: Settings2, testid: "nav-gestion" });
    enlaces.push({ to: "/asignaciones-operativas", label: "Asignaciones", icon: Users, testid: "nav-asignaciones" });
    enlaces.push({ to: "/bitacora", label: "Bitácora de Auditoría", icon: ShieldCheck, testid: "nav-bitacora" });
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200" data-testid="cabecera-app">
      <div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:flex-nowrap lg:px-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-[#1E3A8A] flex items-center justify-center shadow-sm">
            <Vote className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-display font-bold text-slate-900 text-[15px] leading-tight">STRE</div>
            <div className="text-[10px] font-data tracking-widest text-slate-500 uppercase">Centro de Cómputo</div>
          </div>
        </div>

        <nav className="flex items-center gap-1 flex-wrap justify-center flex-1 md:flex-none mx-2">
          {enlaces.map((e) => {
            const Icon = e.icon;
            const activo = loc.pathname.startsWith(e.to);
            return (
              <Link key={e.to} to={e.to} data-testid={e.testid} aria-label={e.label} title={e.label}
                className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium flex items-center gap-1.5 transition ${activo ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <Icon className="w-4 h-4" /> <span className="hidden lg:inline">{e.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {procesoActivo && (
            <button
              onClick={() => { liberarProceso(); navigate("/seleccionar-proceso"); }}
              data-testid="cambiar-proceso-btn"
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#F5F3FF] text-[#7C3AED] text-xs font-semibold border border-[#DDD6FE] hover:bg-[#EDE9FE]">
              <Layers className="w-3.5 h-3.5" /> {procesoActivo.id_eleccion}
            </button>
          )}
          <div className="hidden lg:block text-right">
            <div className="text-xs font-semibold text-slate-800">{usuario.nombre_completo}</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-data">{usuario.rol}</div>
          </div>
          <Button variant="outline" size="sm" onClick={cerrarSesion} data-testid="cerrar-sesion-btn" aria-label="Salir" title="Salir">
            <LogOut className="w-4 h-4 lg:mr-1" /> <span className="hidden lg:inline">Salir</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 stre-watermark">
      <Cabecera />
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route path="/trep" element={<TrepPublicoPage />} />
          <Route path="/resultados-publicos" element={<ResultadosPublicosPage />} />
          <Route path="/acceso" element={<LoginPage />} />
          <Route path="/seleccionar-proceso" element={
            <RequiereAuth><AppShell><SeleccionProcesoPage /></AppShell></RequiereAuth>
          } />
          <Route path="/centro-computo" element={
            <RequiereAuth><RequiereProceso><RequiereRol roles={["admin", "operador", "auditor"]}><AppShell><CentroComputoPage /></AppShell></RequiereRol></RequiereProceso></RequiereAuth>
          } />
          <Route path="/resumen" element={<Navigate to="/resultados-publicos" replace />} />
          <Route path="/resultados" element={
            <RequiereAuth><RequiereProceso><RequiereRol roles={["admin", "resultados"]}><AppShell><ResultadosPage /></AppShell></RequiereRol></RequiereProceso></RequiereAuth>
          } />
          <Route path="/bitacora" element={
            <RequiereAuth><AppShell><BitacoraPage /></AppShell></RequiereAuth>
          } />
          <Route path="/gestion-electoral" element={
            <RequiereAuth><AppShell><GestionElectoralPage /></AppShell></RequiereAuth>
          } />
          <Route path="/asignaciones-operativas" element={
            <RequiereAuth><RequiereProceso><RequiereRol roles={["admin"]}><AppShell><AsignacionesOperativasPage /></AppShell></RequiereRol></RequiereProceso></RequiereAuth>
          } />
          <Route path="/gestion-electoral/diseno/:id_eleccion" element={
            <RequiereAuth><AppShell><DisenoPapeletaPage /></AppShell></RequiereAuth>
          } />
          <Route path="/gestion-electoral/estructura/:id_eleccion" element={
            <RequiereAuth><AppShell><EstructuraElectoralPage /></AppShell></RequiereAuth>
          } />
          <Route path="/papeleta/:id_eleccion/imprimir" element={
            <RequiereAuth><ImprimirPapeletaPage /></RequiereAuth>
          } />
          <Route path="*" element={<Navigate to="/trep" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
