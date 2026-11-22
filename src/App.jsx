import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
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
  Navigation
} from 'lucide-react';

const PIN_INICIAL = '1980';

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

export default function App() {
  const [tab, setTab] = useState('partidos');
  const [ligaSubtab, setLigaSubtab] = useState('tabla');
  const [avisosSubtab, setAvisosSubtab] = useState('avisos');
  const [isAdmin, setIsAdmin] = useState(false);
  const [firebaseOk, setFirebaseOk] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [escudoCargado, setEscudoCargado] = useState(true);

  const [pinDirectiva, setPinDirectiva] = useState(() => {
    return localStorage.getItem('cdra_pin_directiva') || PIN_INICIAL;
  });
  const [pinActualInput, setPinActualInput] = useState('');
  const [pinNuevoInput, setPinNuevoInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');

  const [perfil, setPerfil] = useState(() => {
    const saved = localStorage.getItem('cdra_perfil');
    return saved
      ? JSON.parse(saved)
      : { nombre: 'Jugador / Familia', rol: 'Jugador', categoria: 'Senior', dorsal: '10', foto: '' };
  });

  const savePerfil = (e) => {
    e.preventDefault();
    localStorage.setItem('cdra_perfil', JSON.stringify(perfil));
    alert('Perfil, dorsal y foto guardados en tu dispositivo');
  };

  const handleCambiarPin = (e) => {
    e.preventDefault();
    if (pinActualInput !== pinDirectiva) {
      alert('El PIN actual no es correcto');
      return;
    }
    if (pinNuevoInput.trim().length < 4) {
      alert('El nuevo PIN debe tener al menos 4 caracteres');
      return;
    }
    if (pinNuevoInput !== pinConfirmInput) {
      alert('La confirmación del nuevo PIN no coincide');
      return;
    }
    const nuevoPin = pinNuevoInput.trim();
    localStorage.setItem('cdra_pin_directiva', nuevoPin);
    setPinDirectiva(nuevoPin);
    setPinActualInput('');
    setPinNuevoInput('');
    setPinConfirmInput('');
    alert('PIN de directiva actualizado correctamente');
  };

  const handleRestablecerPin = () => {
    localStorage.setItem('cdra_pin_directiva', PIN_INICIAL);
    setPinDirectiva(PIN_INICIAL);
    setPinActualInput('');
    setPinNuevoInput('');
    setPinConfirmInput('');
    alert(`PIN restablecido a ${PIN_INICIAL}`);
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

      return () => {
        u1();
        u2();
        u3();
        u4();
        u5();
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
    if (pin === pinDirectiva) setIsAdmin(true);
    else if (pin !== null) alert('PIN incorrecto');
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
    if (firebaseOk && !/^(demo|c|p|a|m)\d+$/.test(id)) {
      await deleteDoc(doc(db, col, id));
    }
  };

  const goleadoresOrdenados = [...plantilla].sort((a, b) => Number(b.goles || 0) - Number(a.goles || 0));
  const mensajesFiltrados = mensajes.filter((m) => (m.canal || 'General') === canalChat);

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
            <p>{perfil.nombre} · {perfil.categoria}</p>
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
                  <option value="Pívot">Pívot</option>
                  <option value="Entrenador">Entrenador</option>
                </select>
                <input placeholder="Categoría (Senior, Juvenil...)" value={nuevoJugador.categoria} onChange={(e) => setNuevoJugador({ ...nuevoJugador, categoria: e.target.value })} />
                <input type="number" placeholder="Goles iniciales" value={nuevoJugador.goles} onChange={(e) => setNuevoJugador({ ...nuevoJugador, goles: e.target.value })} />
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                  Subir foto del jugador:
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setNuevoJugador({ ...nuevoJugador, foto: dataUrl }))}
                  />
                </label>
                <button type="submit" className="btn-primary">Guardar Jugador</button>
              </form>
            )}

            {plantilla.map((j) => (
              <div key={j.id} className="card player-row">
                <div className="player-info">
                  <div className="avatar-column">
                    <div className="avatar-circle">
                      {j.foto ? <img src={j.foto} alt={j.nombre} /> : (j.nombre?.[0] || 'J')}
                    </div>
                    <span className="avatar-number-below">#{j.dorsal || '0'}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{j.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {j.posicion} · {j.categoria} · <strong>{j.goles || 0} goles</strong>
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <button className="btn-danger" onClick={() => handleDelete('plantilla', j.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'chat' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><MessageCircle size={19} /> Chat del Club</h2>
              <select
                value={canalChat}
                onChange={(e) => setCanalChat(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontWeight: 700 }}
              >
                <option value="General">Canal: General</option>
                <option value="Senior">Canal: Senior</option>
                <option value="Juvenil">Canal: Juvenil</option>
                <option value="Cadete">Canal: Cadete</option>
              </select>
            </div>

            <div className="chat-box">
              {mensajesFiltrados.length === 0 && (
                <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No hay mensajes aún en <strong>{canalChat}</strong>. ¡Escribe el primero!
                </div>
              )}
              {mensajesFiltrados.map((m) => {
                const esMio = m.autor === perfil.nombre;
                return (
                  <div key={m.id} className={`msg ${esMio ? 'mine' : ''}`}>
                    <div className="msg-head">
                      <span>{m.autor} ({m.rol})</span>
                      <span>
                        {m.hora}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete('mensajes', m.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', marginLeft: 6, cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="msg-text">{m.texto}</div>
                  </div>
                );
              })}
            </div>

            <form className="chat-input-row" onSubmit={handleSendChat}>
              <input
                placeholder={`Escribir como ${perfil.nombre}...`}
                value={textoChat}
                onChange={(e) => setTextoChat(e.target.value)}
              />
              <button type="submit" className="btn-primary"><Send size={16} /></button>
            </form>
          </div>
        )}

        {tab === 'avisos' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Bell size={19} /> Club y Avisos</h2>
              {isAdmin && avisosSubtab === 'avisos' && (
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                  <Plus size={15} /> Aviso
                </button>
              )}
            </div>

            <div className="subtabs">
              <button className={`subtab ${avisosSubtab === 'avisos' ? 'active' : ''}`} onClick={() => setAvisosSubtab('avisos')}>
                Avisos
              </button>
              <button className={`subtab ${avisosSubtab === 'pistas' ? 'active' : ''}`} onClick={() => setAvisosSubtab('pistas')}>
                Pabellones y Horarios
              </button>
            </div>

            {avisosSubtab === 'avisos' && (
              <>
                {isAdmin && showForm && (
                  <form className="form-box" onSubmit={handleAddAviso}>
                    <input placeholder="Título del aviso *" required value={nuevoAviso.titulo} onChange={(e) => setNuevoAviso({ ...nuevoAviso, titulo: e.target.value })} />
                    <textarea rows="3" placeholder="Mensaje para jugadores y familias *" required value={nuevoAviso.mensaje} onChange={(e) => setNuevoAviso({ ...nuevoAviso, mensaje: e.target.value })} />
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={nuevoAviso.urgente} onChange={(e) => setNuevoAviso({ ...nuevoAviso, urgente: e.target.checked })} />
                      Marcar como Urgente
                    </label>
                    <button type="submit" className="btn-primary">Publicar Aviso</button>
                  </form>
                )}

                {avisos.map((a) => (
                  <div key={a.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className={`tag ${a.urgente ? 'urgent' : ''}`}>
                        {a.urgente ? 'Urgente' : 'Comunicado'}
                      </span>
                      {isAdmin && (
                        <button className="btn-danger" onClick={() => handleDelete('avisos', a.id)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{a.titulo}</h3>
                    <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.45 }}>{a.mensaje}</p>
                  </div>
                ))}
              </>
            )}

            {avisosSubtab === 'pistas' && (
              <div>
                {PABELLONES.map((pb) => (
                  <div key={pb.nombre} className="card">
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{pb.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{pb.zona}</div>
                    <a
                      href={pb.mapa}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary"
                      style={{ textDecoration: 'none' }}
                    >
                      <Navigation size={14} /> Abrir en Maps
                    </a>
                  </div>
                ))}

                {ENTRENOS.map((en) => (
                  <div key={en.categoria} className="card">
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{en.categoria}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{en.dias}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'perfil' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><User size={19} /> Mi Perfil del Club</h2>
            </div>

            <form className="card" onSubmit={savePerfil} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div className="avatar-column">
                  <div className="avatar-circle" style={{ width: 84, height: 84, fontSize: 24 }}>
                    {perfil.foto ? <img src={perfil.foto} alt={perfil.nombre} /> : (perfil.nombre?.[0] || 'U')}
                  </div>
                  <span className="avatar-number-below">#{perfil.dorsal || '0'}</span>
                </div>
                <label className="btn-primary" style={{ cursor: 'pointer' }}>
                  <Camera size={15} /> Subir mi foto
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setPerfil({ ...perfil, foto: dataUrl }))}
                  />
                </label>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Tu Nombre y Apellido</label>
                <input
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  value={perfil.nombre}
                  onChange={(e) => setPerfil({ ...perfil, nombre: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Rol en el Club</label>
                <select
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  value={perfil.rol}
                  onChange={(e) => setPerfil({ ...perfil, rol: e.target.value })}
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
                  value={perfil.categoria}
                  onChange={(e) => setPerfil({ ...perfil, categoria: e.target.value })}
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
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Número / Dorsal (aparecerá debajo de la foto)</label>
                <input
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  placeholder="Ej. 10"
                  value={perfil.dorsal}
                  onChange={(e) => setPerfil({ ...perfil, dorsal: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-primary">Guardar mi Perfil</button>
            </form>

            {isAdmin && (
              <form className="card" onSubmit={handleCambiarPin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="section-title" style={{ fontSize: 15 }}>
                  <KeyRound size={17} /> Cambiar PIN de Directiva
                </div>
                <input
                  type="password"
                  placeholder="PIN actual"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                  value={pinActualInput}
                  onChange={(e) => setPinActualInput(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Nuevo PIN (mín. 4 caracteres)"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                  value={pinNuevoInput}
                  onChange={(e) => setPinNuevoInput(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Confirmar nuevo PIN"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                  value={pinConfirmInput}
                  onChange={(e) => setPinConfirmInput(e.target.value)}
                  required
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>Actualizar PIN</button>
                  <button type="button" className="btn-rsvp" onClick={handleRestablecerPin}>Restablecer 1980</button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="status-pill">
          {firebaseOk ? '● Sincronizado con Firebase' : '○ Modo local activo'}
        </div>
      </main>

      <nav className="bottom-nav">
        <button className={`nav-item ${tab === 'partidos' ? 'active' : ''}`} onClick={() => { setTab('partidos'); setShowForm(false); }}>
          <Calendar size={20} />
          <span>Partidos</span>
        </button>
        <button className={`nav-item ${tab === 'liga' ? 'active' : ''}`} onClick={() => { setTab('liga'); setShowForm(false); }}>
          <Trophy size={20} />
          <span>Liga/Goles</span>
        </button>
        <button className={`nav-item ${tab === 'plantilla' ? 'active' : ''}`} onClick={() => { setTab('plantilla'); setShowForm(false); }}>
          <Users size={20} />
          <span>Plantilla</span>
        </button>
        <button className={`nav-item ${tab === 'chat' ? 'active' : ''}`} onClick={() => { setTab('chat'); setShowForm(false); }}>
          <MessageCircle size={20} />
          <span>Chat</span>
        </button>
        <button className={`nav-item ${tab === 'avisos' ? 'active' : ''}`} onClick={() => { setTab('avisos'); setShowForm(false); }}>
          <Bell size={20} />
          <span>Avisos</span>
        </button>
      </nav>
    </div>
  );
}
