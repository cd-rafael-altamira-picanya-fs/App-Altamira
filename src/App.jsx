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
  LogOut,
  UserPlus
} from 'lucide-react';

const PIN_INICIAL_OBLIGATORIO = '1234';
const PIN_DIRECTIVA_INICIAL = '1980';
const MAX_PERFILES_RESERVA_DIRECTIVA = 4;

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

function crearIdPerfil(nombre, dorsal, correo = '') {
  const claveBase = correo.trim() ? `${nombre}_${correo}_${dorsal}` : `${nombre}_${dorsal}`;
  const base = claveBase
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

function perfilJugadorCompleto(p) {
  if (!p) return false;
  const nombreOk = Boolean(p.nombre && p.nombre.trim().length >= 2);
  const dorsalOk = Boolean(p.dorsal && String(p.dorsal).trim().length > 0);
  const fotoOk = Boolean(p.foto && p.foto.length > 0);
  const pinOk = Boolean(p.pinUsuario && String(p.pinUsuario).trim().length >= 4);
  return nombreOk && dorsalOk && fotoOk && pinOk;
}

function leerListaLocal(clave, respaldo) {
  try {
    const saved = localStorage.getItem(clave);
    if (saved !== null) return JSON.parse(saved);
  } catch {
    // Ignorar error de lectura local
  }
  return respaldo;
}

export default function App() {
  const [tab, setTabState] = useState(() => localStorage.getItem('cdra_tab_activa') || 'partidos');
  const setTab = (nuevaTab) => {
    setTabState(nuevaTab);
    localStorage.setItem('cdra_tab_activa', nuevaTab);
  };

  const [ligaSubtab, setLigaSubtab] = useState('tabla');
  const [avisosSubtab, setAvisosSubtab] = useState('avisos');
  const [perfilSubtab, setPerfilSubtab] = useState('mi-perfil');
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('cdra_admin_activa') === '1');
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
          correo: '',
          rol: 'Jugador',
          categoria: 'Senior',
          dorsal: '',
          foto: '',
          pinUsuario: '',
          esReservaDirectiva: false
        };
  });

  const [perfilesClub, setPerfilesClub] = useState(() => leerListaLocal('cdra_perfiles_club', []));

  const [sesionIniciada, setSesionIniciada] = useState(() => {
    return localStorage.getItem('cdra_sesion_activa') === '1';
  });

  const [identificadorLoginInput, setIdentificadorLoginInput] = useState('');
  const [pinLoginInput, setPinLoginInput] = useState('');
  const [modoRegistroJugador, setModoRegistroJugador] = useState(false);
  const [forzarOnboarding, setForzarOnboarding] = useState(false);

  const [formNombre, setFormNombre] = useState(perfil.nombre || '');
  const [formCorreo, setFormCorreo] = useState(perfil.correo || '');
  const [formRol, setFormRol] = useState(perfil.rol || 'Jugador');
  const [formCategoria, setFormCategoria] = useState(perfil.categoria || 'Senior');
  const [formDorsal, setFormDorsal] = useState(perfil.dorsal || '');
  const [formFoto, setFormFoto] = useState(perfil.foto || '');
  const [formPinNuevo, setFormPinNuevo] = useState(perfil.pinUsuario || '');
  const [formPinConfirm, setFormPinConfirm] = useState(perfil.pinUsuario || '');

  const [nuevoPerfilEspecial, setNuevoPerfilEspecial] = useState({
    tipoSlot: 'Entrenador 1',
    nombre: '',
    dorsal: '0',
    categoria: 'Senior',
    pinUsuario: '',
    foto: ''
  });

  const guardarPerfilesLocal = (lista) => {
    setPerfilesClub(lista);
    localStorage.setItem('cdra_perfiles_club', JSON.stringify(lista));
  };

  const sincronizarPerfilEnClub = async (perfilDatos) => {
    const idDoc = crearIdPerfil(perfilDatos.nombre, perfilDatos.dorsal, perfilDatos.correo || '');
    const registroPublico = {
      id: idDoc,
      nombre: perfilDatos.nombre.trim(),
      correo: (perfilDatos.correo || '').trim().toLowerCase(),
      rol: perfilDatos.rol || 'Jugador',
      categoria: perfilDatos.categoria || 'Senior',
      dorsal: String(perfilDatos.dorsal).trim(),
      foto: perfilDatos.foto || '',
      pinUsuario: perfilDatos.pinUsuario || '',
      esReservaDirectiva: Boolean(perfilDatos.esReservaDirectiva),
      tipoSlot: perfilDatos.tipoSlot || '',
      actualizadoEn: serverTimestamp()
    };

    const sinDuplicado = perfilesClub.filter((item) => item.id !== idDoc);
    const nuevaLista = [registroPublico, ...sinDuplicado];
    guardarPerfilesLocal(nuevaLista);

    if (firebaseOk) {
      try {
        await setDoc(doc(db, 'perfiles', idDoc), registroPublico, { merge: true });
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const handleIniciarSesion = (e) => {
    e.preventDefault();
    const idIntroducido = identificadorLoginInput.trim().toLowerCase();
    const pinIntroducido = pinLoginInput.trim();

    if (!idIntroducido) {
      alert('Introduce tu nombre o seudónimo.');
      return;
    }

    if (pinIntroducido === pinDirectiva || pinIntroducido === PIN_DIRECTIVA_INICIAL) {
      const perfilDir = {
        nombre: identificadorLoginInput.trim() || 'Directiva',
        correo: idIntroducido.includes('@') ? idIntroducido : '',
        rol: 'Directiva',
        categoria: 'Club',
        dorsal: '0',
        foto: perfil.foto || '',
        pinUsuario: pinIntroducido,
        esReservaDirectiva: false
      };
      setPerfil(perfilDir);
      localStorage.setItem('cdra_perfil', JSON.stringify(perfilDir));
      localStorage.setItem('cdra_sesion_activa', '1');
      localStorage.setItem('cdra_admin_activa', '1');
      setIsAdmin(true);
      setSesionIniciada(true);
      setForzarOnboarding(false);
      setPinLoginInput('');
      return;
    }

    if (pinIntroducido === PIN_INICIAL_OBLIGATORIO) {
      const perfilInicial = {
        nombre: identificadorLoginInput.trim(),
        correo: idIntroducido.includes('@') ? idIntroducido : '',
        rol: 'Jugador',
        categoria: 'Senior',
        dorsal: '',
        foto: '',
        pinUsuario: '',
        esReservaDirectiva: false
      };
      setPerfil(perfilInicial);
      setFormNombre(perfilInicial.nombre);
      setFormCorreo(perfilInicial.correo);
      setFormRol('Jugador');
      setFormDorsal('');
      setFormFoto('');
      setFormPinNuevo('');
      setFormPinConfirm('');
      localStorage.setItem('cdra_perfil', JSON.stringify(perfilInicial));
      localStorage.setItem('cdra_sesion_activa', '1');
      localStorage.removeItem('cdra_admin_activa');
      setIsAdmin(false);
      setSesionIniciada(true);
      setForzarOnboarding(true);
      setPinLoginInput('');
      return;
    }

    const candidatos = [
      ...perfilesClub,
      ...(perfil && perfil.nombre ? [perfil] : [])
    ];

    const coincidenciaIdentidad = candidatos.find((item) => {
      const nombreMatch = item.nombre && item.nombre.trim().toLowerCase() === idIntroducido;
      const correoMatch = item.correo && item.correo.trim().toLowerCase() === idIntroducido;
      return nombreMatch || correoMatch;
    });

    if (coincidenciaIdentidad) {
      if (coincidenciaIdentidad.pinUsuario && coincidenciaIdentidad.pinUsuario.trim() === pinIntroducido) {
        const esDir = coincidenciaIdentidad.rol === 'Directiva';
        const perfilRecuperado = {
          nombre: coincidenciaIdentidad.nombre || identificadorLoginInput.trim(),
          correo: coincidenciaIdentidad.correo || (idIntroducido.includes('@') ? idIntroducido : ''),
          rol: coincidenciaIdentidad.rol || 'Jugador',
          categoria: coincidenciaIdentidad.categoria || 'Senior',
          dorsal: coincidenciaIdentidad.dorsal || '',
          foto: coincidenciaIdentidad.foto || '',
          pinUsuario: coincidenciaIdentidad.pinUsuario,
          esReservaDirectiva: Boolean(coincidenciaIdentidad.esReservaDirectiva),
          tipoSlot: coincidenciaIdentidad.tipoSlot || ''
        };
        setPerfil(perfilRecuperado);
        localStorage.setItem('cdra_perfil', JSON.stringify(perfilRecuperado));
        localStorage.setItem('cdra_sesion_activa', '1');
        if (esDir) {
          localStorage.setItem('cdra_admin_activa', '1');
        } else {
          localStorage.removeItem('cdra_admin_activa');
        }
        setIsAdmin(esDir);
        setSesionIniciada(true);
        const completo = perfilJugadorCompleto(perfilRecuperado);
        setForzarOnboarding(!completo);
        if (completo) {
          sincronizarPerfilEnClub(perfilRecuperado);
        }
        setPinLoginInput('');
        return;
      } else {
        alert('La contraseña o PIN no coincide con ese nombre o seudónimo.');
        return;
      }
    }

    alert('No se encontró ese usuario. Puedes registrarte como jugador o usar el PIN inicial 1234.');
  };

  const handleGuardarConfiguracionObligatoria = async (e) => {
    e.preventDefault();
    const nombreLimpio = formNombre.trim();
    const correoLimpio = formCorreo.trim().toLowerCase();
    const dorsalLimpio = String(formDorsal).trim();
    const pinLimpio = formPinNuevo.trim();

    if (nombreLimpio.length < 2) {
      alert('El campo Nombre / Seudónimo * es obligatorio.');
      return;
    }
    if (!dorsalLimpio) {
      alert('El campo Dorsal * es obligatorio.');
      return;
    }
    if (!formFoto) {
      alert('El campo Foto * es obligatorio.');
      return;
    }
    if (pinLimpio.length < 4 || pinLimpio === PIN_INICIAL_OBLIGATORIO) {
      alert('El campo Contraseña / PIN * es obligatorio (mínimo 4 caracteres y distinto de 1234).');
      return;
    }
    if (pinLimpio !== formPinConfirm.trim()) {
      alert('La confirmación de la contraseña / PIN no coincide.');
      return;
    }

    const perfilActualizado = {
      nombre: nombreLimpio,
      correo: correoLimpio,
      rol: formRol || 'Jugador',
      categoria: formCategoria || 'Senior',
      dorsal: dorsalLimpio,
      foto: formFoto,
      pinUsuario: pinLimpio,
      esReservaDirectiva: false
    };

    setPerfil(perfilActualizado);
    localStorage.setItem('cdra_perfil', JSON.stringify(perfilActualizado));
    localStorage.setItem('cdra_sesion_activa', '1');
    setForzarOnboarding(false);
    setModoRegistroJugador(false);
    setSesionIniciada(true);
    await sincronizarPerfilEnClub(perfilActualizado);
    alert('¡Registro completado! Ya puedes entrar con tu nombre o seudónimo y tu contraseña.');
  };

  const handleCrearPerfilEspecialDirectiva = async (e) => {
    e.preventDefault();
    const perfilesEspecialesActuales = perfilesClub.filter((p) => p.esReservaDirectiva);
    if (perfilesEspecialesActuales.length >= MAX_PERFILES_RESERVA_DIRECTIVA) {
      alert('Ya has creado el máximo de 4 perfiles especiales (2 entrenadores + 2 reserva). Borra uno si quieres crear otro.');
      return;
    }

    const nombreLimpio = nuevoPerfilEspecial.nombre.trim();
    const pinLimpio = nuevoPerfilEspecial.pinUsuario.trim();
    const dorsalLimpio = String(nuevoPerfilEspecial.dorsal || '0').trim();

    if (nombreLimpio.length < 2) {
      alert('Escribe el nombre o seudónimo del perfil especial.');
      return;
    }
    if (pinLimpio.length < 4) {
      alert('Escribe una contraseña o PIN de al menos 4 caracteres.');
      return;
    }

    const rolAsignado = nuevoPerfilEspecial.tipoSlot.startsWith('Entrenador')
      ? 'Entrenador'
      : 'Reserva Directiva';

    const idDoc = crearIdPerfil(nombreLimpio, dorsalLimpio, nuevoPerfilEspecial.tipoSlot);
    const registroEspecial = {
      id: idDoc,
      nombre: nombreLimpio,
      correo: '',
      rol: rolAsignado,
      categoria: nuevoPerfilEspecial.categoria,
      dorsal: dorsalLimpio,
      foto: nuevoPerfilEspecial.foto || perfil.foto || '',
      pinUsuario: pinLimpio,
      esReservaDirectiva: true,
      tipoSlot: nuevoPerfilEspecial.tipoSlot,
      actualizadoEn: serverTimestamp()
    };

    const nuevaLista = [registroEspecial, ...perfilesClub.filter((item) => item.id !== idDoc)];
    guardarPerfilesLocal(nuevaLista);
    if (firebaseOk) {
      try {
        await setDoc(doc(db, 'perfiles', idDoc), registroEspecial, { merge: true });
      } catch {
        // Mantiene respaldo local
      }
    }

    setNuevoPerfilEspecial({
      tipoSlot: 'Entrenador 2',
      nombre: '',
      dorsal: '0',
      categoria: 'Senior',
      pinUsuario: '',
      foto: ''
    });
    alert(`Perfil especial (${nuevoPerfilEspecial.tipoSlot}) creado correctamente.`);
  };

  const handleCerrarSesion = () => {
    localStorage.removeItem('cdra_sesion_activa');
    localStorage.removeItem('cdra_admin_activa');
    setSesionIniciada(false);
    setIsAdmin(false);
    setShowForm(false);
    setForzarOnboarding(false);
    setModoRegistroJugador(false);
    setIdentificadorLoginInput('');
    setPinLoginInput('');
  };

  const handleAbrirEditarPerfil = () => {
    setFormNombre(perfil.nombre || '');
    setFormCorreo(perfil.correo || '');
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

  const [partidos, setPartidos] = useState(() => leerListaLocal('cdra_partidos_local', DEMO_PARTIDOS));
  const [clasificacion, setClasificacion] = useState(() => leerListaLocal('cdra_clasificacion_local', DEMO_CLASIFICACION));
  const [plantilla, setPlantilla] = useState(() => leerListaLocal('cdra_plantilla_local', DEMO_PLANTILLA));
  const [avisos, setAvisos] = useState(() => leerListaLocal('cdra_avisos_local', DEMO_AVISOS));
  const [mensajes, setMensajes] = useState(() => leerListaLocal('cdra_mensajes_local', DEMO_CHAT));

  const guardarPartidosLocal = (lista) => {
    setPartidos(lista);
    localStorage.setItem('cdra_partidos_local', JSON.stringify(lista));
  };

  const guardarClasificacionLocal = (lista) => {
    setClasificacion(lista);
    localStorage.setItem('cdra_clasificacion_local', JSON.stringify(lista));
  };

  const guardarPlantillaLocal = (lista) => {
    setPlantilla(lista);
    localStorage.setItem('cdra_plantilla_local', JSON.stringify(lista));
  };

  const guardarAvisosLocal = (lista) => {
    setAvisos(lista);
    localStorage.setItem('cdra_avisos_local', JSON.stringify(lista));
  };

  const guardarMensajesLocal = (lista) => {
    setMensajes(lista);
    localStorage.setItem('cdra_mensajes_local', JSON.stringify(lista));
  };

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
          if (!snap.empty) {
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setPartidos(docs);
            localStorage.setItem('cdra_partidos_local', JSON.stringify(docs));
          }
        },
        () => setFirebaseOk(false)
      );

      const u2 = onSnapshot(
        query(collection(db, 'clasificacion'), orderBy('pts', 'desc')),
        (snap) => {
          if (!snap.empty) {
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setClasificacion(docs);
            localStorage.setItem('cdra_clasificacion_local', JSON.stringify(docs));
          }
        }
      );

      const u3 = onSnapshot(
        query(collection(db, 'plantilla'), orderBy('createdAt', 'asc')),
        (snap) => {
          if (!snap.empty) {
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setPlantilla(docs);
            localStorage.setItem('cdra_plantilla_local', JSON.stringify(docs));
          }
        }
      );

      const u4 = onSnapshot(
        query(collection(db, 'avisos'), orderBy('createdAt', 'desc')),
        (snap) => {
          if (!snap.empty) {
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setAvisos(docs);
            localStorage.setItem('cdra_avisos_local', JSON.stringify(docs));
          }
        }
      );

      const u5 = onSnapshot(
        query(collection(db, 'mensajes'), orderBy('createdAt', 'asc')),
        (snap) => {
          if (!snap.empty) {
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setMensajes(docs);
            localStorage.setItem('cdra_mensajes_local', JSON.stringify(docs));
          }
        }
      );

      const u6 = onSnapshot(
        collection(db, 'perfiles'),
        (snap) => {
          const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (lista.length > 0) {
            setPerfilesClub(lista);
            localStorage.setItem('cdra_perfiles_club', JSON.stringify(lista));
          }
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
      localStorage.removeItem('cdra_admin_activa');
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
      localStorage.setItem('cdra_admin_activa', '1');
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

    const actualizada = partidos.map((p) => (p.id === partido.id ? { ...p, asistentes: nuevaLista } : p));
    guardarPartidosLocal(actualizada);
    if (firebaseOk && !partido.id.startsWith('demo')) {
      try {
        await updateDoc(doc(db, 'partidos', partido.id), { asistentes: nuevaLista });
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const sumarGol = async (jugador, delta) => {
    const nuevosGoles = Math.max(0, Number(jugador.goles || 0) + delta);
    const actualizada = plantilla.map((j) => (j.id === jugador.id ? { ...j, goles: nuevosGoles } : j));
    guardarPlantillaLocal(actualizada);
    if (firebaseOk && !jugador.id.startsWith('p')) {
      try {
        await updateDoc(doc(db, 'plantilla', jugador.id), { goles: nuevosGoles });
      } catch {
        // Mantiene respaldo local
      }
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
    const idTemporal = `msg_${Date.now()}`;
    const actualizada = [...mensajes, { id: idTemporal, ...msgObj }];
    guardarMensajesLocal(actualizada);
    setTextoChat('');
    if (firebaseOk) {
      try {
        const ref = await addDoc(collection(db, 'mensajes'), msgObj);
        guardarMensajesLocal(actualizada.map((m) => (m.id === idTemporal ? { ...m, id: ref.id } : m)));
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const handleAddPartido = async (e) => {
    e.preventDefault();
    if (!nuevoPartido.visitante) return;
    const item = { ...nuevoPartido, asistentes: [], createdAt: serverTimestamp() };
    const idTemporal = `part_${Date.now()}`;
    const actualizada = [{ id: idTemporal, ...item }, ...partidos];
    guardarPartidosLocal(actualizada);
    setShowForm(false);
    setNuevoPartido({
      categoria: 'Senior',
      local: 'C.D. Rafael Altamira FS',
      visitante: '',
      fecha: '',
      pabellon: 'Pabellón Municipal Picanya',
      resultado: 'VS'
    });
    if (firebaseOk) {
      try {
        const ref = await addDoc(collection(db, 'partidos'), item);
        guardarPartidosLocal(actualizada.map((p) => (p.id === idTemporal ? { ...p, id: ref.id } : p)));
      } catch {
        // Mantiene respaldo local
      }
    }
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
    const idTemporal = `eq_${Date.now()}`;
    const actualizada = [...clasificacion, { id: idTemporal, ...item }].sort((a, b) => b.pts - a.pts);
    guardarClasificacionLocal(actualizada);
    setShowForm(false);
    setNuevoEquipoTabla({ pos: '', equipo: '', pj: '0', pts: '0', gf: '0', gc: '0' });
    if (firebaseOk) {
      try {
        const ref = await addDoc(collection(db, 'clasificacion'), item);
        guardarClasificacionLocal(actualizada.map((c) => (c.id === idTemporal ? { ...c, id: ref.id } : c)));
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const handleAddJugador = async (e) => {
    e.preventDefault();
    if (!nuevoJugador.nombre) return;
    const item = {
      ...nuevoJugador,
      dorsal: String(nuevoJugador.dorsal || '0').trim(),
      goles: Number(nuevoJugador.goles || 0),
      createdAt: serverTimestamp()
    };
    const idTemporal = `jug_${Date.now()}`;
    const actualizada = [...plantilla, { id: idTemporal, ...item }];
    guardarPlantillaLocal(actualizada);
    setShowForm(false);
    setNuevoJugador({ dorsal: '', nombre: '', posicion: 'Ala', categoria: 'Senior', goles: '0', foto: '' });

    if (firebaseOk) {
      try {
        const ref = await addDoc(collection(db, 'plantilla'), item);
        const conIdReal = actualizada.map((j) => (j.id === idTemporal ? { ...j, id: ref.id } : j));
        guardarPlantillaLocal(conIdReal);
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const handleAddAviso = async (e) => {
    e.preventDefault();
    if (!nuevoAviso.titulo || !nuevoAviso.mensaje) return;
    const item = { ...nuevoAviso, createdAt: serverTimestamp() };
    const idTemporal = `av_${Date.now()}`;
    const actualizada = [{ id: idTemporal, ...item }, ...avisos];
    guardarAvisosLocal(actualizada);
    setShowForm(false);
    setNuevoAviso({ titulo: '', mensaje: '', urgente: false });
    if (firebaseOk) {
      try {
        const ref = await addDoc(collection(db, 'avisos'), item);
        guardarAvisosLocal(actualizada.map((a) => (a.id === idTemporal ? { ...a, id: ref.id } : a)));
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const handleDelete = async (col, id) => {
    if (col === 'partidos') {
      guardarPartidosLocal(partidos.filter((x) => x.id !== id));
    } else if (col === 'clasificacion') {
      guardarClasificacionLocal(clasificacion.filter((x) => x.id !== id));
    } else if (col === 'plantilla') {
      guardarPlantillaLocal(plantilla.filter((x) => x.id !== id));
    } else if (col === 'avisos') {
      guardarAvisosLocal(avisos.filter((x) => x.id !== id));
    } else if (col === 'mensajes') {
      guardarMensajesLocal(mensajes.filter((x) => x.id !== id));
    } else if (col === 'perfiles') {
      guardarPerfilesLocal(perfilesClub.filter((x) => x.id !== id));
    }

    if (firebaseOk && !/^(demo|c|p|a|m)\d+$/.test(id)) {
      try {
        await deleteDoc(doc(db, col, id));
      } catch {
        // Eliminado localmente aunque el documento no existiera en Firebase
      }
    }
  };

  const goleadoresOrdenados = [...plantilla].sort((a, b) => Number(b.goles || 0) - Number(a.goles || 0));
  const mensajesFiltrados = mensajes.filter((m) => (m.canal || 'General') === canalChat);

  const miIdPerfil = crearIdPerfil(perfil.nombre, perfil.dorsal, perfil.correo || '');
  const listaPerfilesVisibles = (() => {
    const mapa = new Map();
    perfilesClub.forEach((p) => {
      if (p.nombre || p.dorsal || p.foto) {
        mapa.set(p.id, p);
      }
    });
    if (perfil.nombre || perfil.dorsal || perfil.foto) {
      mapa.set(miIdPerfil, {
        id: miIdPerfil,
        nombre: perfil.nombre || 'Sin nombre',
        correo: perfil.correo || '',
        rol: perfil.rol || 'Jugador',
        categoria: perfil.categoria || 'Senior',
        dorsal: String(perfil.dorsal || '0'),
        foto: perfil.foto || ''
      });
    }
    return Array.from(mapa.values());
  })();

  const perfilesEspecialesCreados = perfilesClub.filter((p) => p.esReservaDirectiva);

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
              <p>Picanya Fútbol Sala · Acceso del Club</p>
            </div>
          </div>
        </header>

        <main className="container">
          {!modoRegistroJugador ? (
            <form className="card" onSubmit={handleIniciarSesion} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <div className="section-title">
                <Lock size={19} /> Iniciar Sesión
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                Entra con tu <strong>nombre o seudónimo</strong> y tu <strong>contraseña / PIN</strong> (o usa el PIN inicial <strong>1234</strong> para configurar un perfil nuevo).
              </p>
              <input
                type="text"
                placeholder="Nombre o seudónimo *"
                style={{ width: '100%', padding: 11, borderRadius: 8, border: '1px solid var(--border)', fontSize: 15 }}
                value={identificadorLoginInput}
                onChange={(e) => setIdentificadorLoginInput(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Contraseña o PIN * (inicio: 1234)"
                style={{ width: '100%', padding: 11, borderRadius: 8, border: '1px solid var(--border)', fontSize: 15 }}
                value={pinLoginInput}
                onChange={(e) => setPinLoginInput(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary">Entrar</button>
              <button
                type="button"
                className="btn-rsvp"
                style={{ justifyContent: 'center', marginTop: 4 }}
                onClick={() => {
                  setModoRegistroJugador(true);
                  setFormNombre('');
                  setFormDorsal('');
                  setFormFoto('');
                  setFormPinNuevo('');
                  setFormPinConfirm('');
                }}
              >
                <UserPlus size={14} /> Registrarse como Jugador
              </button>
            </form>
          ) : (
            <form className="card" onSubmit={handleGuardarConfiguracionObligatoria} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div className="section-title">
                <UserPlus size={19} /> Registro de Jugador
              </div>
              <p style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}>
                Todos los campos marcados con * son obligatorios.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div className="avatar-column">
                  <div className="avatar-circle" style={{ width: 84, height: 84, fontSize: 24 }}>
                    {formFoto ? <img src={formFoto} alt="Vista previa" /> : (formNombre?.[0] || 'J')}
                  </div>
                  <span className="avatar-number-below">#{formDorsal || '0'}</span>
                </div>
                <label className="btn-primary" style={{ cursor: 'pointer' }}>
                  <Camera size={15} /> Subir foto *
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setFormFoto(dataUrl))}
                  />
                </label>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Nombre o seudónimo *</label>
                <input
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  placeholder="Ej. Dani o Daniel López *"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Número de dorsal *</label>
                <input
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  placeholder="Ej. 10 *"
                  value={formDorsal}
                  onChange={(e) => setFormDorsal(e.target.value)}
                  required
                />
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
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Contraseña / PIN personal (mín. 4 caracteres) *</label>
                <input
                  type="password"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  placeholder="Tu contraseña o PIN *"
                  value={formPinNuevo}
                  onChange={(e) => setFormPinNuevo(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Confirmar contraseña / PIN *</label>
                <input
                  type="password"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  placeholder="Repite tu contraseña o PIN *"
                  value={formPinConfirm}
                  onChange={(e) => setFormPinConfirm(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary">Completar Registro y Entrar</button>
              <button
                type="button"
                className="btn-rsvp"
                style={{ justifyContent: 'center' }}
                onClick={() => setModoRegistroJugador(false)}
              >
                Volver a Iniciar Sesión
              </button>
            </form>
          )}
        </main>
      </div>
    );
  }

  if (forzarOnboarding || (perfil.rol === 'Jugador' && !perfilJugadorCompleto(perfil))) {
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
              <p>Configuración obligatoria del jugador</p>
            </div>
          </div>
          <button type="button" className="admin-btn" onClick={handleCerrarSesion}>
            <LogOut size={14} /> Salir
          </button>
        </header>

        <main className="container">
          <form className="card" onSubmit={handleGuardarConfiguracionObligatoria} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div className="section-title">
              <KeyRound size={19} /> Completa tu Perfil de Jugador
            </div>
            <p style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}>
              Campos obligatorios marcados con *: Nombre/Seudónimo *, Dorsal *, Foto * y Contraseña/PIN *.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div className="avatar-column">
                <div className="avatar-circle" style={{ width: 84, height: 84, fontSize: 24 }}>
                  {formFoto ? <img src={formFoto} alt="Vista previa" /> : (formNombre?.[0] || 'J')}
                </div>
                <span className="avatar-number-below">#{formDorsal || '0'}</span>
              </div>
              <label className="btn-primary" style={{ cursor: 'pointer' }}>
                <Camera size={15} /> Subir foto *
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setFormFoto(dataUrl))}
                />
              </label>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Nombre o seudónimo *</label>
              <input
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                placeholder="Nombre o seudónimo *"
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Número de dorsal *</label>
              <input
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                placeholder="Ej. 10 *"
                value={formDorsal}
                onChange={(e) => setFormDorsal(e.target.value)}
                required
              />
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
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Contraseña / PIN personal (mín. 4, distinto de 1234) *</label>
              <input
                type="password"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                placeholder="Nueva contraseña o PIN *"
                value={formPinNuevo}
                onChange={(e) => setFormPinNuevo(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Confirmar contraseña / PIN *</label>
              <input
                type="password"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                placeholder="Repite tu contraseña o PIN *"
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
            <p>{perfil.nombre} · #{perfil.dorsal || '0'}</p>
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
                    <div
