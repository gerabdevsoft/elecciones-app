import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Vote, Lock, ShieldCheck, KeyRound } from "lucide-react";

export default function LoginPage() {
  const { usuario, iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/seleccionar-proceso" replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    const ok = await iniciarSesion(email.trim().toLowerCase(), contrasena);
    setEnviando(false);
    if (ok) navigate("/seleccionar-proceso");
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 stre-watermark" data-testid="login-page">
      {/* Panel institucional */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0F172A] text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px"
        }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-white flex items-center justify-center">
              <Vote className="w-6 h-6 text-[#1E3A8A]" />
            </div>
            <div>
              <div className="font-display font-extrabold tracking-tight text-xl">STRE</div>
              <div className="text-[10px] font-data tracking-[0.3em] text-slate-400 uppercase">Bolivia · 2026</div>
            </div>
          </div>
        </div>

        <div className="relative">
          <h1 className="font-display font-extrabold text-4xl lg:text-5xl leading-[1.05] tracking-tight">
            Transmisión y Auditoría <br/>de Resultados Electorales
          </h1>
          <p className="mt-6 text-slate-300 text-base max-w-md leading-relaxed">
            Plataforma soberana para digitalizar actas, reconocer votos manuscritos por visión artificial y consolidar resultados con bitácora inmutable.
          </p>
          <div className="mt-10 flex items-center gap-6 text-xs font-data uppercase tracking-widest text-slate-400">
            <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Cifrado SHA-256</span>
            <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-amber-400" /> Auditoría inmutable</span>
          </div>
        </div>

        <div className="relative text-[11px] font-data text-slate-500 tracking-wider">
          © 2026 STRE · Contexto electoral bloqueado tras autenticación
        </div>
      </div>

      {/* Formulario */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#1E3A8A] flex items-center justify-center">
              <Vote className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-display font-extrabold text-xl text-slate-900">STRE</div>
              <div className="text-[10px] font-data tracking-widest text-slate-500 uppercase">Bolivia · 2026</div>
            </div>
          </div>

          <div className="stre-badge bg-[#EFF6FF] text-[#1E3A8A] mb-6" data-testid="badge-institucional">
            <ShieldCheck className="w-3 h-3" /> Acceso Institucional
          </div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">Acceder al Centro de Cómputo</h2>
          <p className="text-slate-500 mt-2 text-sm">Sistema de Transmisión de Resultados Electorales · Bolivia 2026</p>

          <form onSubmit={enviar} className="mt-10 space-y-5 animate-fade-up">
            <div>
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Usuario de Red / Correo</Label>
              <Input
                id="email" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@stre.bo" data-testid="login-username-input"
                className="mt-2 h-12 font-data" />
            </div>
            <div>
              <Label htmlFor="pw" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Contraseña de Acceso</Label>
              <div className="relative mt-2">
                <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  id="pw" type="password" required autoComplete="current-password"
                  value={contrasena} onChange={(e) => setContrasena(e.target.value)}
                  placeholder="••••••••" data-testid="login-password-input"
                  className="h-12 pl-10 font-data" />
              </div>
            </div>

            <Button type="submit" disabled={enviando} data-testid="login-submit-button"
              className="w-full h-12 text-sm font-semibold tracking-wide bg-[#1E3A8A] hover:bg-[#1E40AF]">
              {enviando ? "Verificando…" : "Acceder al Centro de Cómputo"}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
