import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
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
  Unlock
} from 'lucide-react';

const PIN_DIRECTIVA = '1980';

const DEMO_PARTIDOS = [
  {
    id: 'demo1',
    categoria: 'Senior Masculino',
    local: 'C.D. Rafael Altamira FS',
    visitante: 'Picanya Futsal B',
    fecha: 'Sábado 18:30',
    pabellon: 'Pabellón Municipal Picanya',
    resultado: 'VS'
  },
  {
    id: 'demo2',
    categoria: 'Juvenil',
    local: 'Torrent FS',
    visitante: 'C.D. Rafael Altamira FS',
    fecha: 'Domingo 11:00',
    pabellon: 'Pabellón El Vedat',
    resultado: '3 - 5'
  }
];

const DEMO_PLANTILLA = [
  { id: 'p1', dorsal: '1', nombre: 'Carlos Martínez', posicion: 'Portero', categoria: 'Senior' },
  { id: 'p2', dorsal: '4', nombre: 'Javier Gómez', posicion: 'Cierre', categoria: 'Senior' },
  { id: 'p3', dorsal: '7', nombre: 'Alejandro Ruiz', posicion: 'Ala', categoria: 'Senior' },
  { id: 'p4', dorsal: '10', nombre: 'Marc Navarro', posicion: 'Pívot', categoria: 'Senior' }
];

const DEMO_AVISOS = [
  {
    id: 'a1',
    titulo: 'Convocatoria Jornada Fin de Semana',
    mensaje: 'Todos los jugadores convocados deben estar 45 minutos antes en el pabellón.',
    urgente: true,
    fecha: 'Hoy'
  },
  {
    id: 'a2',
    titulo: 'Cuotas y Reconocimientos Médicos',
    mensaje: 'Recordamos entregar la documentación en la oficina del club.',
    urgente: false,
    fecha: 'Esta semana'
  }
];

export default function App() {
  const [tab, setTab] = useState('partidos');
  const [isAdmin, setIsAdmin] = useState(false);
  const [firebaseOk, setFirebaseOk] = useState(false);

  const [partidos, setPartidos] = useState(DEMO_PARTIDOS);
  const [plantilla, setPlantilla] = useState(DEMO_PLANTILLA);
  const [avisos, setAvisos] = useState(DEMO_AVISOS);
  const [showForm, setShowForm] = useState(false);

  const [nuevoPartido, setNuevoPartido] = useState({
    categoria: 'Senior',
    local: 'C.D. Rafael Altamira FS',
    visitante: '',
    fecha: '',
    pabellon: 'Pabellón Municipal Picanya',
    resultado: 'VS'
  });

  const [nuevoJugador, setNuevoJugador] = useState({
    dorsal: '',
    nombre: '',
    posicion: 'Ala',
    categoria: 'Senior'
  });

  const [nuevoAviso, setNuevoAviso] = useState({
    titulo: '',
    mensaje: '',
    urgente: false
  });

  useEffect(() => {
    try {
      const qPartidos = query(collection(db, 'partidos'), orderBy('createdAt', 'desc'));
      const unsubPartidos = onSnapshot(
        qPartidos,
        (snap) => {
          setFirebaseOk(true);
          if (!snap.empty) {
            setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          }
        },
        () => setFirebaseOk(false)
      );

      const qPlantilla = query(collection(db, 'plantilla'), orderBy('createdAt', 'asc'));
      const unsubPlantilla = onSnapshot(qPlantilla, (snap) => {
        if (!snap.empty) {
          setPlantilla(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      });

      const qAvisos = query(collection(db, 'avisos'), orderBy('createdAt', 'desc'));
      const unsubAvisos = onSnapshot(qAvisos, (snap) => {
        if (!snap.empty) {
          setAvisos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      });

      return () => {
        unsubPartidos();
        unsubPlantilla();
        unsubAvisos();
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
    const pin = window.prompt('PIN de Directiva (por defecto: 1980):');
    if (pin === PIN_DIRECTIVA) {
      setIsAdmin(true);
    } else if (pin !== null) {
      alert('PIN incorrecto');
    }
  };

  const handleAddPartido = async (e) => {
    e.preventDefault();
    if (!nuevoPartido.visitante) return;
    const item = { ...nuevoPartido, createdAt: serverTimestamp() };
    setPartidos([{ id: Date.now().toString(), ...nuevoPartido }, ...partidos]);
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

  const handleAddJugador = async (e) => {
    e.preventDefault();
    if (!nuevoJugador.nombre) return;
    const item = { ...nuevoJugador, createdAt: serverTimestamp() };
    setPlantilla([...plantilla, { id: Date.now().toString(), ...nuevoJugador }]);
    setShowForm(false);
    setNuevoJugador({ dorsal: '', nombre: '', posicion: 'Ala', categoria: 'Senior' });
    if (firebaseOk) await addDoc(collection(db, 'plantilla'), item);
  };

  const handleAddAviso = async (e) => {
    e.preventDefault();
    if (!nuevoAviso.titulo || !nuevoAviso.mensaje) return;
    const item = { ...nuevoAviso, fecha: 'Reciente', createdAt: serverTimestamp() };
    setAvisos([{ id: Date.now().toString(), ...nuevoAviso, fecha: 'Ahora' }, ...avisos]);
    setShowForm(false);
    setNuevoAviso({ titulo: '', mensaje: '', urgente: false });
    if (firebaseOk) await addDoc(collection(db, 'avisos'), item);
  };

  const handleDelete = async (col, id) => {
    if (col === 'partidos') setPartidos(partidos.filter((x) => x.id !== id));
    if (col === 'plantilla') setPlantilla(plantilla.filter((x) => x.id !== id));
    if (col === 'avisos') setAvisos(avisos.filter((x) => x.id !== id));
    if (firebaseOk && !id.startsWith('demo') && !id.startsWith('p') && !id.startsWith('a')) {
      await deleteDoc(doc(db, col, id));
    }
  };

  return (
    <div>
      <header className="header">
        <div className="header-title">
          <div className="badge-escudo">CDRA</div>
          <div>
            <h1>C.D. Rafael Altamira</h1>
            <p>Picanya Fútbol Sala</p>
          </div>
        </div>
        <button className={`admin-btn ${isAdmin ? 'active' : ''}`} onClick={toggleAdmin}>
          {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
          {isAdmin ? 'Directiva' : 'Acceso'}
        </button>
      </header>

      <main className="container">
        {tab === 'partidos' && (
          <div>
            <div className="section-header">
              <h2 className="section-title">
                <Trophy size={20} /> Partidos y Resultados
              </h2>
              {isAdmin && (
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                  <Plus size={16} /> Añadir
                </button>
              )}
            </div>

            {isAdmin && showForm && (
              <form className="form-box" onSubmit={handleAddPartido}>
                <input
                  placeholder="Categoría (ej. Senior, Cadete)"
                  value={nuevoPartido.categoria}
                  onChange={(e) => setNuevoPartido({ ...nuevoPartido, categoria: e.target.value })}
                />
                <input
                  placeholder="Equipo Local"
                  value={nuevoPartido.local}
                  onChange={(e) => setNuevoPartido({ ...nuevoPartido, local: e.target.value })}
                />
                <input
                  placeholder="Equipo Visitante *"
                  required
                  value={nuevoPartido.visitante}
                  onChange={(e) => setNuevoPartido({ ...nuevoPartido, visitante: e.target.value })}
                />
                <input
                  placeholder="Día y Hora (ej. Sábado 18:00)"
                  value={nuevoPartido.fecha}
                  onChange={(e) => setNuevoPartido({ ...nuevoPartido, fecha: e.target.value })}
                />
                <input
                  placeholder="Pabellón"
                  value={nuevoPartido.pabellon}
                  onChange={(e) => setNuevoPartido({ ...nuevoPartido, pabellon: e.target.value })}
                />
                <input
                  placeholder="Resultado (o VS)"
                  value={nuevoPartido.resultado}
                  onChange={(e) => setNuevoPartido({ ...nuevoPartido, resultado: e.target.value })}
                />
                <button type="submit" className="btn-primary">Guardar Partido</button>
              </form>
            )}

            {partidos.map((p) => (
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
              </div>
            ))}
          </div>
        )}

        {tab === 'plantilla' && (
          <div>
            <div className="section-header">
              <h2 className="section-title">
                <Shield size={20} /> Equipos y Plantilla
              </h2>
              {isAdmin && (
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                  <Plus size={16} /> Jugador
                </button>
              )}
            </div>

            {isAdmin && showForm && (
              <form className="form-box" onSubmit={handleAddJugador}>
                <input
                  placeholder="Dorsal (ej. 10)"
                  value={nuevoJugador.dorsal}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, dorsal: e.target.value })}
                />
                <input
                  placeholder="Nombre del jugador *"
                  required
                  value={nuevoJugador.nombre}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, nombre: e.target.value })}
                />
                <select
                  value={nuevoJugador.posicion}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, posicion: e.target.value })}
                >
                  <option value="Portero">Portero</option>
                  <option value="Cierre">Cierre</option>
                  <option value="Ala">Ala</option>
                  <option value="Pívot">Pívot</option>
                  <option value="Entrenador">Entrenador</option>
                </select>
                <input
                  placeholder="Equipo (ej. Senior, Juvenil)"
                  value={nuevoJugador.categoria}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, categoria: e.target.value })}
                />
                <button type="submit" className="btn-primary">Guardar Jugador</button>
              </form>
            )}

            {plantilla.map((j) => (
              <div key={j.id} className="card player-row">
                <div className="player-info">
                  <div className="dorsal">{j.dorsal || '#'}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{j.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {j.posicion} · {j.categoria}
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

        {tab === 'avisos' && (
          <div>
            <div className="section-header">
              <h2 className="section-title">
                <Bell size={20} /> Tablón de Avisos
              </h2>
              {isAdmin && (
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                  <Plus size={16} /> Aviso
                </button>
              )}
            </div>

            {isAdmin && showForm && (
              <form className="form-box" onSubmit={handleAddAviso}>
                <input
                  placeholder="Título del aviso *"
                  required
                  value={nuevoAviso.titulo}
                  onChange={(e) => setNuevoAviso({ ...nuevoAviso, titulo: e.target.value })}
                />
                <textarea
                  rows="3"
                  placeholder="Mensaje para jugadores y familias *"
                  required
                  value={nuevoAviso.mensaje}
                  onChange={(e) => setNuevoAviso({ ...nuevoAviso, mensaje: e.target.value })}
                />
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={nuevoAviso.urgente}
                    onChange={(e) => setNuevoAviso({ ...nuevoAviso, urgente: e.target.checked })}
                  />
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
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{a.titulo}</h3>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.45 }}>{a.mensaje}</p>
              </div>
            ))}
          </div>
        )}

        <div className="status-pill">
          {firebaseOk
            ? '● Sincronizado con Firebase'
            : '○ Modo local activo'}
        </div>
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${tab === 'partidos' ? 'active' : ''}`}
          onClick={() => { setTab('partidos'); setShowForm(false); }}
        >
          <Calendar size={22} />
          <span>Partidos</span>
        </button>
        <button
          className={`nav-item ${tab === 'plantilla' ? 'active' : ''}`}
          onClick={() => { setTab('plantilla'); setShowForm(false); }}
        >
          <Users size={22} />
          <span>Plantilla</span>
        </button>
        <button
          className={`nav-item ${tab === 'avisos' ? 'active' : ''}`}
          onClick={() => { setTab('avisos'); setShowForm(false); }}
        >
          <Bell size={22} />
          <span>Avisos</span>
        </button>
      </nav>
    </div>
  );
}
