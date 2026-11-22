import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import {
  Calendar,
  Users,
  Bell,
  Shield,
  MapPin,
  Clock,
  Plus,
  Trash2,
  Trophy,
  Lock,
  Unlock,
  MessageCircle,
  User,
  Send,
  Award,
  Camera,
  KeyRound,
  Navigation,
  LogOut
} from 'lucide-react';

const PIN_INICIAL_OBLIGATORIO = '1234';
const PIN_DIRECTIVA_INICIAL = '1980';

function procesarFotoCircular(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function crearIdPerfil(nombre, dorsal) {
  const base = `${nombre || 'usuario'}_${dorsal || '0'}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || `perfil_${Date.now()}`;
}

const DEMO_PARTIDOS = [
  {
    id: 'demo1',
    categoria: 'Senior Masculino',
    local: 'C.D. Rafael Altamira FS',
    visitante: 'Picanya Futsal B',
    fecha: 'Sábado 18:30',
    pabellon: 'Pabellón Municipal Picanya',
    resultado: 'VS',
    asistentes: ['Carlos M.', 'Javier G.', 'Marc N.']
  },
  {
    id: 'demo2',
    categoria: 'Juvenil',
    local: 'Torrent FS',
    visitante: 'C.D. Rafael Altamira FS',
    fecha: 'Domingo 11:00',
    pabellon: 'Pabellón El Vedat',
    resultado: '3 - 5',
    asistentes: ['Alejandro R.']
  }
];

const DEMO_CLASIFICACION = [
  { id: 'c1', pos: 1, equipo: 'C.D. Rafael Altamira FS', pj: 10, pts: 25, gf: 42, gc: 18 },
  { id: 'c2', pos: 2, equipo: 'Torrent FS', pj: 10, pts: 22, gf: 38, gc: 21 },
  { id: 'c3', pos: 3, equipo: 'Picanya Futsal B', pj: 10, pts: 19, gf: 31, gc: 24 },
  { id: 'c4', pos: 4, equipo: 'Paiporta FS', pj: 10, pts: 15, gf: 27, gc: 30 }
];

const DEMO_PLANTILLA = [
  { id: 'p1', dorsal: '10', nombre: 'Marc Navarro', posicion: 'Pívot', categoria: 'Senior', goles: 14, foto: '' },
  { id: 'p2', dorsal: '7', nombre: 'Alejandro Ruiz', posicion: 'Ala', categoria: 'Senior', goles: 11, foto: '' },
  { id: 'p3', dorsal: '4', nombre: 'Javier Gómez', posicion: 'Cierre', categoria: 'Senior', goles: 6, foto: '' },
  { id: 'p4', dorsal: '1', nombre: 'Carlos Martínez', posicion: 'Portero', categoria: 'Senior', goles: 1, foto: '' }
];

const DEMO_AVISOS = [
  {
    id: 'a1',
    titulo: 'Convocatoria Jornada Fin de Semana',
    mensaje: 'Todos los convocados deben estar 45 minutos antes en el pabellón con equipación azul.',
    urgente: true
  },
  {
    id: 'a2',
    titulo: 'Cuotas y Reconocimientos Médicos',
    mensaje: 'Recordamos entregar la ficha médica firmada en la oficina del club.',
    urgente: false
  }
];

const DEMO_CHAT = [
  {
    id: 'm1',
    autor: 'Entrenador Senior',
    rol: 'Cuerpo Técnico',
    canal: 'General',
    texto: '¡Buenas equipo! Recordad confirmar asistencia en la pestaña Partidos.',
    hora: '18:10'
  }
];

const PABELLONES = [
  {
    nombre: 'Pabellón Municipal de Picanya',
    zona: 'Picanya · Sede principal',
    mapa: 'https://www.google.com/maps/search/?api=1&query=Pabellon+Municipal+Picanya'
  },
  {
    nombre: 'Pabellón El Vedat',
    zona: 'Torrent · Desplazamientos',
    mapa: 'https://www.google.com/maps/search/?api=1&query=Pabellon+El+Vedat+Torrent'
  }
];

const ENTRENOS = [
  { categoria: 'Senior', dias: 'Martes y Jueves · 20:30 - 22:00' },
  { categoria: 'Juvenil / Cadete', dias: 'Lunes y Miércoles · 18:30 - 20:00' },
  { categoria: 'Escuela / Base', dias: 'Martes y Jueves · 17:30 - 18:45' }
];

function perfilEstaCompleto(p) {
  if (!p) return false;
  const nombreOk = Boolean(p.nombre && p.nombre.trim().length >= 2);
  const dorsalOk = Boolean(p.dorsal && String(p.dorsal).trim().length > 0);
  const fotoOk = Boolean(p.foto && p.foto.length > 0);
  const pinOk = Boolean(
    p.pinUsuario &&
      String(p.pinUsuario).trim().length >= 4 &&
      String(p.pinUsuario).trim() !== PIN_INICIAL_OBLIGATORIO
  );
  return nombreOk && dorsalOk && fotoOk && pinOk;
}

export default function App() {
  const [tab, setTab] = useState('partidos');
  const [ligaSubtab, setLigaSubtab] = useState('tabla');
  const [avisosSubtab, setAvisosSubtab] = useState('avisos');
  const [perfilSubtab, setPerfilSubtab] = useState('mi-perfil');
  const [isAdmin, setIsAdmin] = useState(false);
  const [firebaseOk, setFirebaseOk] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [escudoCargado, setEscudoCargado] = useState(true);

  const [pinDirectiva, setPinDirectiva] = useState(() => {
    return localStorage.getItem('cdra_pin_directiva') || PIN_DIRECTIVA_INICIAL;
  });
  const [pinDirActualInput, setPinDirActualInput] = useState('');
  const [pinDirNuevoInput, setPinDirNuevoInput] = useState('');
  const [pinDirConfirmInput, setPinDirConfirmInput] = useState('');

  const [perfil, setPerfil] = useState(() => {
    const saved = localStorage.getItem('cdra_perfil');
    return saved
      ? JSON.parse(saved)
      : {
          nombre: '',
          rol: 'Jugador',
          categoria: 'Senior',
          dorsal: '',
          foto: '',
          pinUsuario: ''
        };
  });

  const [perfilesClub, setPerfilesClub] = useState([]);

  const [sesionIniciada, setSesionIniciada] = useState(() => {
    const saved = localStorage.getItem('cdra_perfil');
    const parsed = saved ? JSON.parse(saved) : null;
    return perfilEstaCompleto(parsed);
  });

  const [pinLoginInput, setPinLoginInput] = useState('');
  const [forzarOnboarding, setForzarOnboarding] = useState(() => {
    const saved = localStorage.getItem('cdra_perfil');
    const parsed = saved ? JSON.parse(saved) : null;
    return !perfilEstaCompleto(parsed);
  });

  const [formNombre, setFormNombre] = useState(perfil.nombre || '');
  const [formRol, setFormRol] = useState(perfil.rol || 'Jugador');
  const [formCategoria, setFormCategoria] = useState(perfil.categoria || 'Senior');
  const [formDorsal, setFormDorsal] = useState(perfil.dorsal || '');
  const [formFoto, setFormFoto] = useState(perfil.foto || '');
  const [formPinNuevo, setFormPinNuevo] = useState(
    perfil.pinUsuario && perfil.pinUsuario !== PIN_INICIAL_OBLIGATORIO ? perfil.pinUsuario : ''
  );
  const [formPinConfirm, setFormPinConfirm] = useState(
    perfil.pinUsuario && perfil.pinUsuario !== PIN_INICIAL_OBLIGATORIO ? perfil.pinUsuario : ''
  );

  const sincronizarPerfilEnClub = async (perfilDatos) => {
    const idDoc = crearIdPerfil(perfilDatos.nombre, perfilDatos.dorsal);
    const registroPublico = {
      id: idDoc,
      nombre: perfilDatos.nombre.trim(),
      rol: perfilDatos.rol,
      categoria: perfilDatos.categoria,
      dorsal: String(perfilDatos.dorsal).trim(),
      foto: perfilDatos.foto,
      actualizadoEn: serverTimestamp()
    };

    setPerfilesClub((prev) => {
      const sinDuplicado = prev.filter((item) => item.id !== idDoc);
      return [registroPublico, ...sinDuplicado];
    });

    if (firebaseOk) {
      await setDoc(doc(db, 'perfiles', idDoc), registroPublico, { merge: true });
    }
  };

  const handleIniciarSesion = (e) => {
    e.preventDefault();
    const pinIntroducido = pinLoginInput.trim();
    const pinGuardado = perfil.pinUsuario && perfil.pinUsuario.trim();

    if (pinIntroducido === PIN_INICIAL_OBLIGATORIO) {
      setSesionIniciada(true);
      setForzarOnboarding(true);
      setFormPinNuevo('');
      setFormPinConfirm('');
      setPinLoginInput('');
      return;
    }

    if (pinGuardado && pinIntroducido === pinGuardado) {
      setSesionIniciada(true);
      const completo = perfilEstaCompleto(perfil);
      setForzarOnboarding(!completo);
      if (completo) {
        sincronizarPerfilEnClub(perfil);
      }
      setPinLoginInput('');
      return;
    }

    alert('PIN incorrecto. Usa 1234 para el primer acceso o tu PIN personal.');
  };

  const handleGuardarConfiguracionObligatoria = async (e) => {
    e.preventDefault();
    const nombreLimpio = formNombre.trim();
    const dorsalLimpio = String(formDorsal).trim();
    const pinLimpio = formPinNuevo.trim();

    if (nombreLimpio.length < 2) {
      alert('Debes escribir tu nombre y apellidos.');
      return;
    }
    if (!dorsalLimpio) {
      alert('Debes indicar tu número de dorsal.');
      return;
    }
    if (!formFoto) {
      alert('Debes subir tu foto de perfil.');
      return;
    }
    if (pinLimpio.length < 4 || pinLimpio === PIN_INICIAL_OBLIGATORIO) {
      alert('Debes establecer un nuevo PIN personal (mínimo 4 caracteres y distinto de 1234).');
      return;
    }
    if (pinLimpio !== formPinConfirm.trim()) {
      alert('La confirmación del nuevo PIN no coincide.');
      return;
    }

    const perfilActualizado = {
      nombre: nombreLimpio,
      rol: formRol,
      categoria: formCategoria,
      dorsal: dorsalLimpio,
      foto: formFoto,
      pinUsuario: pinLimpio
    };

    setPerfil(perfilActualizado);
    localStorage.setItem('cdra_perfil', JSON.stringify(perfilActualizado));
    setForzarOnboarding(false);
    setSesionIniciada(true);
    await sincronizarPerfilEnClub(perfilActualizado);
    alert('¡Listo! Tu perfil y PIN se han guardado y compartido con el club.');
  };

  const handleCerrarSesion = () => {
    setSesionIniciada(false);
    setIsAdmin(false);
    setShowForm(false);
    setPinLoginInput('');
  };

  const handleAbrirEditarPerfil = () => {
    setFormNombre(perfil.nombre || '');
    setFormRol(perfil.rol || 'Jugador');
    setFormCategoria(perfil.categoria || 'Senior');
    setFormDorsal(perfil.dorsal || '');
    setFormFoto(perfil.foto || '');
    setFormPinNuevo(perfil.pinUsuario || '');
    setFormPinConfirm(perfil.pinUsuario || '');
    setForzarOnboarding(true);
  };

  const handleCambiarPinDirectiva = (e) => {
    e.preventDefault();
    if (pinDirActualInput !== pinDirectiva && pinDirActualInput !== PIN_DIRECTIVA_INICIAL) {
      alert('El PIN actual de directiva no es correcto');
      return;
    }
    if (pinDirNuevoInput.trim().length < 4) {
      alert('El nuevo PIN de directiva debe tener al menos 4 caracteres');
      return;
    }
    if (pinDirNuevoInput !== pinDirConfirmInput) {
      alert('La confirmación del nuevo PIN de directiva no coincide');
      return;
    }
    const nuevoPin = pinDirNuevoInput.trim();
    localStorage.setItem('cdra_pin_directiva', nuevoPin);
    setPinDirectiva(nuevoPin);
    setPinDirActualInput('');
    setPinDirNuevoInput('');
    setPinDirConfirmInput('');
    alert('PIN de directiva actualizado correctamente');
  };

  const handleRestablecerPinDirectiva = () => {
    localStorage.setItem('cdra_pin_directiva', PIN_DIRECTIVA_INICIAL);
    setPinDirectiva(PIN_DIRECTIVA_INICIAL);
    setPinDirActualInput('');
    setPinDirNuevoInput('');
    setPinDirConfirmInput('');
    alert(`PIN de directiva restablecido a ${PIN_DIRECTIVA_INICIAL}`);
  };

  const [partidos, setPartidos] = useState(DEMO_PARTIDOS);
  const [clasificacion, setClasificacion] = useState(DEMO_CLASIFICACION);
  const [plantilla, setPlantilla] = useState(DEMO_PLANTILLA);
  const [avisos, setAvisos] = useState(DEMO_AVISOS);
  const [mensajes, setMensajes] = useState(DEMO_CHAT);

  const [canalChat, setCanalChat] = useState('General');
  const [textoChat, setTextoChat] = useState('');

  const [nuevoPartido, setNuevoPartido] = useState({
    categoria: 'Senior',
    local: 'C.D. Rafael Altamira FS',
    visitante: '',
    fecha: '',
    pabellon: 'Pabellón Municipal Picanya',
    resultado: 'VS'
  });

  const [nuevoEquipoTabla, setNuevoEquipoTabla] = useState({
    pos: '',
    equipo: '',
    pj: '0',
    pts: '0',
    gf: '0',
    gc: '0'
  });

  const [nuevoJugador, setNuevoJugador] = useState({
    dorsal: '',
    nombre: '',
    posicion: 'Ala',
    categoria: 'Senior',
    goles: '0',
    foto: ''
  });

  const [nuevoAviso, setNuevoAviso] = useState({
    titulo: '',
    mensaje: '',
    urgente: false
  });

  useEffect(() => {
    try {
      const u1 = onSnapshot(
        query(collection(db, 'partidos'), orderBy('createdAt', 'desc')),
        (snap) => {
          setFirebaseOk(true);
          if (!snap.empty) setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        () => setFirebaseOk(false)
      );

      const u2 = onSnapshot(
        query(collection(db, 'clasificacion'), orderBy('pts', 'desc')),
        (snap) => {
          if (!snap.empty) setClasificacion(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      );

      const u3 = onSnapshot(
        query(collection(db, 'plantilla'), orderBy('createdAt', 'asc')),
        (snap) => {
          if (!snap.empty) setPlantilla(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      );

      const u4 = onSnapshot(
        query(collection(db, 'avisos'), orderBy('createdAt', 'desc')),
        (snap) => {
          if (!snap.empty) setAvisos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      );

      const u5 = onSnapshot(
        query(collection(db, 'mensajes'), orderBy('createdAt', 'asc')),
        (snap) => {
          if (!snap.empty) setMensajes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      );

      const u6 = onSnapshot(
        collection(db, 'perfiles'),
        (snap) => {
          const lista = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((item) => item.nombre && item.dorsal && item.foto);
          setPerfilesClub(lista);
        }
      );

      return () => {
        u1();
        u2();
        u3();
        u4();
        u5();
        u6();
      };
    } catch {
      setFirebaseOk(false);
    }
  }, []);

  const toggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false);
      setShowForm(false);
      return;
    }
    const pin = window.prompt('Introduce el PIN de Directiva:');
    if (pin === null) return;
    if (pin === pinDirectiva || pin === PIN_DIRECTIVA_INICIAL) {
      if (pin === PIN_DIRECTIVA_INICIAL && pinDirectiva !== PIN_DIRECTIVA_INICIAL) {
        localStorage.setItem('cdra_pin_directiva', PIN_DIRECTIVA_INICIAL);
        setPinDirectiva(PIN_DIRECTIVA_INICIAL);
      }
      setIsAdmin(true);
    } else {
      alert('PIN de directiva incorrecto');
    }
  };

  const toggleAsistencia = async (partido) => {
    const nombreUser = perfil.nombre.trim() || 'Anónimo';
    const listaActual = partido.asistentes || [];
    const yaVa = listaActual.includes(nombreUser);
    const nuevaLista = yaVa
      ? listaActual.filter((n) => n !== nombreUser)
      : [...listaActual, nombreUser];

    setPartidos(partidos.map((p) => (p.id === partido.id ? { ...p, asistentes: nuevaLista } : p)));
    if (firebaseOk && !partido.id.startsWith('demo')) {
      await updateDoc(doc(db, 'partidos', partido.id), { asistentes: nuevaLista });
    }
  };

  const sumarGol = async (jugador, delta) => {
    const nuevosGoles = Math.max(0, Number(jugador.goles || 0) + delta);
    setPlantilla(plantilla.map((j) => (j.id === jugador.id ? { ...j, goles: nuevosGoles } : j)));
    if (firebaseOk && !jugador.id.startsWith('p')) {
      await updateDoc(doc(db, 'plantilla', jugador.id), { goles: nuevosGoles });
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!textoChat.trim()) return;
    const now = new Date();
    const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const msgObj = {
      autor: perfil.nombre || 'Usuario',
      rol: `${perfil.rol} · ${perfil.categoria}`,
      canal: canalChat,
      texto: textoChat.trim(),
      hora,
      createdAt: serverTimestamp()
    };
    setMensajes([...mensajes, { id: Date.now().toString(), ...msgObj }]);
    setTextoChat('');
    if (firebaseOk) await addDoc(collection(db, 'mensajes'), msgObj);
  };

  const handleAddPartido = async (e) => {
    e.preventDefault();
    if (!nuevoPartido.visitante) return;
    const item = { ...nuevoPartido, asistentes: [], createdAt: serverTimestamp() };
    setPartidos([{ id: Date.now().toString(), ...item }, ...partidos]);
    setShowForm(false);
    setNuevoPartido({
      categoria: 'Senior',
      local: 'C.D. Rafael Altamira FS',
      visitante: '',
      fecha: '',
      pabellon: 'Pabellón Municipal Picanya',
      resultado: 'VS'
    });
    if (firebaseOk) await addDoc(collection(db, 'partidos'), item);
  };

  const handleAddEquipoTabla = async (e) => {
    e.preventDefault();
    if (!nuevoEquipoTabla.equipo) return;
    const item = {
      pos: Number(nuevoEquipoTabla.pos || clasificacion.length + 1),
      equipo: nuevoEquipoTabla.equipo,
      pj: Number(nuevoEquipoTabla.pj || 0),
      pts: Number(nuevoEquipoTabla.pts || 0),
      gf: Number(nuevoEquipoTabla.gf || 0),
      gc: Number(nuevoEquipoTabla.gc || 0)
    };
    setClasificacion([...clasificacion, { id: Date.now().toString(), ...item }].sort((a, b) => b.pts - a.pts));
    setShowForm(false);
    setNuevoEquipoTabla({ pos: '', equipo: '', pj: '0', pts: '0', gf: '0', gc: '0' });
    if (firebaseOk) await addDoc(collection(db, 'clasificacion'), item);
  };

  const handleAddJugador = async (e) => {
    e.preventDefault();
    if (!nuevoJugador.nombre) return;
    const item = { ...nuevoJugador, goles: Number(nuevoJugador.goles || 0), createdAt: serverTimestamp() };
    setPlantilla([...plantilla, { id: Date.now().toString(), ...item }]);
    setShowForm(false);
    setNuevoJugador({ dorsal: '', nombre: '', posicion: 'Ala', categoria: 'Senior', goles: '0', foto: '' });
    if (firebaseOk) await addDoc(collection(db, 'plantilla'), item);
  };

  const handleAddAviso = async (e) => {
    e.preventDefault();
    if (!nuevoAviso.titulo || !nuevoAviso.mensaje) return;
    const item = { ...nuevoAviso, createdAt: serverTimestamp() };
    setAvisos([{ id: Date.now().toString(), ...item }, ...avisos]);
    setShowForm(false);
    setNuevoAviso({ titulo: '', mensaje: '', urgente: false });
    if (firebaseOk) await addDoc(collection(db, 'avisos'), item);
  };

  const handleDelete = async (col, id) => {
    if (col === 'partidos') setPartidos(partidos.filter((x) => x.id !== id));
    if (col === 'clasificacion') setClasificacion(clasificacion.filter((x) => x.id !== id));
    if (col === 'plantilla') setPlantilla(plantilla.filter((x) => x.id !== id));
    if (col === 'avisos') setAvisos(avisos.filter((x) => x.id !== id));
    if (col === 'mensajes') setMensajes(mensajes.filter((x) => x.id !== id));
    if (col === 'perfiles') setPerfilesClub(perfilesClub.filter((x) => x.id !== id));
    if (firebaseOk && !/^(demo|c|p|a|m)\d+$/.test(id)) {
      await deleteDoc(doc(db, col, id));
    }
  };

  const goleadoresOrdenados = [...plantilla].sort((a, b) => Number(b.goles || 0) - Number(a.goles || 0));
  const mensajesFiltrados = mensajes.filter((m) => (m.canal || 'General') === canalChat);

  const miIdPerfil = crearIdPerfil(perfil.nombre, perfil.dorsal);
  const listaPerfilesVisibles = (() => {
    const mapa = new Map();
    perfilesClub.forEach((p) => mapa.set(p.id, p));
    if (perfilEstaCompleto(perfil)) {
      mapa.set(miIdPerfil, {
        id: miIdPerfil,
        nombre: perfil.nombre.trim(),
        rol: perfil.rol,
        categoria: perfil.categoria,
        dorsal: String(perfil.dorsal).trim(),
        foto: perfil.foto
      });
    }
    return Array.from(mapa.values());
  })();

  if (!sesionIniciada) {
    return (
      <div>
        <header className="header">
          <div className="header-title">
            {escudoCargado ? (
              <img
                src="/escudo.png"
                alt="Escudo C.D. Rafael Altamira"
                className="escudo-img"
                onError={() => setEscudoCargado(false)}
              />
            ) : (
              <div className="badge-escudo">CDRA</div>
            )}
            <div>
              <h1>C.D. Rafael Altamira</h1>
              <p>Picanya Fútbol Sala · Acceso restringido</p>
            </div>
          </div>
        </header>

        <main className="container">
          <form className="card" onSubmit={handleIniciarSesion} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            <div className="section-title">
              <Lock size={19} /> Iniciar Sesión
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
              Introduce el PIN inicial <strong>1234</strong> (o tu PIN personal ya configurado) para entrar.
            </p>
            <input
              type="password"
              placeholder="PIN de acceso (inicio: 1234)"
              style={{ width: '100%', padding: 11, borderRadius: 8, border: '1px solid var(--border)', fontSize: 15 }}
              value={pinLoginInput}
              onChange={(e) => setPinLoginInput(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary">Entrar</button>
          </form>
        </main>
      </div>
    );
  }

  if (forzarOnboarding || !perfilEstaCompleto(perfil)) {
    return (
      <div>
        <header className="header">
          <div className="header-title">
            {escudoCargado ? (
              <img
                src="/escudo.png"
                alt="Escudo C.D. Rafael Altamira"
                className="escudo-img"
                onError={() => setEscudoCargado(false)}
              />
            ) : (
              <div className="badge-escudo">CDRA</div>
            )}
            <div>
              <h1>C.D. Rafael Altamira</h1>
              <p>Configuración obligatoria inicial</p>
            </div>
          </div>
          <button type="button" className="admin-btn" onClick={handleCerrarSesion}>
            <LogOut size={14} /> Salir
          </button>
        </header>

        <main className="container">
          <form className="card" onSubmit={handleGuardarConfiguracionObligatoria} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div className="section-title">
              <KeyRound size={19} /> Completa tu Perfil y Cambia tu PIN
            </div>
            <p style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}>
              Obligatorio: debes cambiar el PIN 1234 y rellenar foto, nombre y dorsal para ver el club y compartir tu perfil.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div className="avatar-column">
                <div className="avatar-circle" style={{ width: 84, height: 84, fontSize: 24 }}>
                  {formFoto ? <img src={formFoto} alt="Vista previa" /> : (formNombre?.[0] || 'U')}
                </div>
                <span className="avatar-number-below">#{formDorsal || '0'}</span>
              </div>
              <label className="btn-primary" style={{ cursor: 'pointer' }}>
                <Camera size={15} /> Subir foto obligatoria
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setFormFoto(dataUrl))}
                />
              </label>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Nombre y apellidos *</label>
              <input
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                placeholder="Tu nombre y apellido"
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Número de dorsal *</label>
              <input
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                placeholder="Ej. 10"
                value={formDorsal}
                onChange={(e) => setFormDorsal(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Rol en el club</label>
              <select
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                value={formRol}
                onChange={(e) => setFormRol(e.target.value)}
              >
                <option value="Jugador">Jugador</option>
                <option value="Familiar">Padre / Madre / Familiar</option>
                <option value="Entrenador">Entrenador / Cuerpo Técnico</option>
                <option value="Directiva">Directiva</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Equipo / Categoría</label>
              <select
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                value={formCategoria}
                onChange={(e) => setFormCategoria(e.target.value)}
              >
                <option value="Senior">Senior</option>
                <option value="Juvenil">Juvenil</option>
                <option value="Cadete">Cadete</option>
                <option value="Infantil">Infantil</option>
                <option value="Alevín">Alevín</option>
                <option value="Benjamín">Benjamín</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Nuevo PIN personal (distinto de 1234, mín. 4) *</label>
              <input
                type="password"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                placeholder="Nuevo PIN personal"
                value={formPinNuevo}
                onChange={(e) => setFormPinNuevo(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Confirmar nuevo PIN personal *</label>
              <input
                type="password"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                placeholder="Repite tu nuevo PIN"
                value={formPinConfirm}
                onChange={(e) => setFormPinConfirm(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-primary">Guardar y Entrar a la App</button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div>
      <header className="header">
        <div className="header-title">
          {escudoCargado ? (
            <img
              src="/escudo.png"
              alt="Escudo C.D. Rafael Altamira"
              className="escudo-img"
              onError={() => setEscudoCargado(false)}
            />
          ) : (
            <div className="badge-escudo">CDRA</div>
          )}
          <div>
            <h1>C.D. Rafael Altamira</h1>
            <p>{perfil.nombre} · #{perfil.dorsal}</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="admin-btn" onClick={() => { setTab('perfil'); setShowForm(false); }}>
            <User size={14} /> Perfil
          </button>
          <button className={`admin-btn ${isAdmin ? 'active' : ''}`} onClick={toggleAdmin}>
            {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
            {isAdmin ? 'Directiva' : 'PIN'}
          </button>
        </div>
      </header>

      <main className="container">
        {tab === 'partidos' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Calendar size={19} /> Partidos y Asistencia</h2>
              {isAdmin && (
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                  <Plus size={15} /> Partido
                </button>
              )}
            </div>

            {isAdmin && showForm && (
              <form className="form-box" onSubmit={handleAddPartido}>
                <input placeholder="Categoría (Senior, Juvenil...)" value={nuevoPartido.categoria} onChange={(e) => setNuevoPartido({ ...nuevoPartido, categoria: e.target.value })} />
                <input placeholder="Local" value={nuevoPartido.local} onChange={(e) => setNuevoPartido({ ...nuevoPartido, local: e.target.value })} />
                <input placeholder="Visitante *" required value={nuevoPartido.visitante} onChange={(e) => setNuevoPartido({ ...nuevoPartido, visitante: e.target.value })} />
                <input placeholder="Día y Hora (Sábado 18:30)" value={nuevoPartido.fecha} onChange={(e) => setNuevoPartido({ ...nuevoPartido, fecha: e.target.value })} />
                <input placeholder="Pabellón" value={nuevoPartido.pabellon} onChange={(e) => setNuevoPartido({ ...nuevoPartido, pabellon: e.target.value })} />
                <input placeholder="Resultado (o VS)" value={nuevoPartido.resultado} onChange={(e) => setNuevoPartido({ ...nuevoPartido, resultado: e.target.value })} />
                <button type="submit" className="btn-primary">Guardar Partido</button>
              </form>
            )}

            {partidos.map((p) => {
              const asistentes = p.asistentes || [];
              const voy = asistentes.includes(perfil.nombre);
              return (
                <div key={p.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`tag ${p.resultado !== 'VS' ? 'result' : ''}`}>{p.categoria}</span>
                    {isAdmin && (
                      <button className="btn-danger" onClick={() => handleDelete('partidos', p.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="match-teams">
                    <span style={{ flex: 1 }}>{p.local}</span>
                    <span className="match-score">{p.resultado || 'VS'}</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>{p.visitante}</span>
                  </div>
                  <div className="match-meta">
                    <span><Clock size={13} /> {p.fecha || 'Por confirmar'}</span>
                    <span><MapPin size={13} /> {p.pabellon || 'Picanya'}</span>
                  </div>
                  <div className="rsvp-bar">
                    <span>Convocados: <strong>{asistentes.length}</strong></span>
                    <div className="rsvp-btns">
                      <button
                        className={`btn-rsvp ${voy ? 'yes' : ''}`}
                        onClick={() => toggleAsistencia(p)}
                      >
                        {voy ? '✓ Voy al partido' : 'Confirmar asistencia'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'liga' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Trophy size={19} /> Clasificación y Goles</h2>
              {isAdmin && ligaSubtab === 'tabla' && (
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                  <Plus size={15} /> Equipo
                </button>
              )}
            </div>

            <div className="subtabs">
              <button className={`subtab ${ligaSubtab === 'tabla' ? 'active' : ''}`} onClick={() => setLigaSubtab('tabla')}>
                Tabla de Liga
              </button>
              <button className={`subtab ${ligaSubtab === 'goles' ? 'active' : ''}`} onClick={() => setLigaSubtab('goles')}>
                Pichichi / Goles
              </button>
            </div>

            {ligaSubtab === 'tabla' && (
              <>
                {isAdmin && showForm && (
                  <form className="form-box" onSubmit={handleAddEquipoTabla}>
                    <input placeholder="Nombre del equipo *" required value={nuevoEquipoTabla.equipo} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, equipo: e.target.value })} />
                    <input type="number" placeholder="Partidos Jugados (PJ)" value={nuevoEquipoTabla.pj} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, pj: e.target.value })} />
                    <input type="number" placeholder="Puntos (PTS)" value={nuevoEquipoTabla.pts} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, pts: e.target.value })} />
                    <input type="number" placeholder="Goles a Favor (GF)" value={nuevoEquipoTabla.gf} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, gf: e.target.value })} />
                    <input type="number" placeholder="Goles en Contra (GC)" value={nuevoEquipoTabla.gc} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, gc: e.target.value })} />
                    <button type="submit" className="btn-primary">Añadir a la tabla</button>
                  </form>
                )}

                <div className="card table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Equipo</th>
                        <th>PJ</th>
                        <th>GF/GC</th>
                        <th>PTS</th>
                        {isAdmin && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {clasificacion.map((c, idx) => (
                        <tr key={c.id} className={c.equipo.toLowerCase().includes('altamira') ? 'highlight-row' : ''}>
                          <td>{idx + 1}</td>
                          <td>{c.equipo}</td>
                          <td>{c.pj}</td>
                          <td>{c.gf}:{c.gc}</td>
                          <td><strong>{c.pts}</strong></td>
                          {isAdmin && (
                            <td>
                              <button className="btn-danger" onClick={() => handleDelete('clasificacion', c.id)}>
                                <Trash2 size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {ligaSubtab === 'goles' && (
              <div>
                {goleadoresOrdenados.map((j, idx) => (
                  <div key={j.id} className="card player-row">
                    <div className="player-info">
                      <div className="avatar-column">
                        <div className="avatar-circle">
                          {j.foto ? <img src={j.foto} alt={j.nombre} /> : (j.nombre?.[0] || 'J')}
                        </div>
                        <span className="avatar-number-below">#{j.dorsal || (idx + 1)}</span>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          {idx + 1}º · {j.nombre}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{j.categoria} · {j.posicion}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="tag result"><Award size={12} style={{ verticalAlign: 'middle' }} /> {j.goles || 0}</span>
                      {isAdmin && (
                        <>
                          <button className="btn-rsvp" onClick={() => sumarGol(j, -1)}>-</button>
                          <button className="btn-rsvp yes" onClick={() => sumarGol(j, 1)}>+</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'plantilla' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Shield size={19} /> Equipos y Plantilla</h2>
              {isAdmin && (
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                  <Plus size={15} /> Jugador
                </button>
              )}
            </div>

            {isAdmin && showForm && (
              <form className="form-box" onSubmit={handleAddJugador}>
                <input placeholder="Dorsal / Número (ej. 10)" value={nuevoJugador.dorsal} onChange={(e) => setNuevoJugador({ ...nuevoJugador, dorsal: e.target.value })} />
                <input placeholder="Nombre del jugador *" required value={nuevoJugador.nombre} onChange={(e) => setNuevoJugador({ ...nuevoJugador, nombre: e.target.value })} />
                <select value={nuevoJugador.posicion} onChange={(e) => setNuevoJugador({ ...nuevoJugador, posicion: e.target.value })}>
                  <option value="Portero">Portero</option>
                  <option value="Cierre">Cierre</option>
                  <option value="Ala">Ala</option>
                  <option value="P
