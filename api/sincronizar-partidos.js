function limpiarEtiquetasHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extraerClasificacionDesdeHtml(html, categoriaActiva) {
  const filas = [];
  const vistas = new Set();
  const trMatches = String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const tr of trMatches) {
    const celdas = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
      .map((td) => limpiarEtiquetasHtml(td))
      .filter(Boolean);

    if (celdas.length < 4) continue;

    const posMatch = String(celdas[0] || '').match(/^(\d{1,2})\.?$/);
    if (!posMatch) continue;

    const pos = Number(posMatch[1]);
    if (pos < 1 || pos > 30) continue;

    const equipo = String(celdas[1] || '').trim();
    if (!equipo || equipo.length < 2 || /^\d+$/.test(equipo)) continue;

    const numeros = celdas
      .slice(2)
      .map((val) => Number(String(val).replace(/[^\d+-]/g, '')))
      .filter((n) => !Number.isNaN(n));

    if (numeros.length < 2) continue;

    const pj = numeros[0] ?? 0;
    const pg = numeros.length >= 7 ? (numeros[1] ?? 0) : 0;
    const pe = numeros.length >= 7 ? (numeros[2] ?? 0) : 0;
    const pp = numeros.length >= 7 ? (numeros[3] ?? 0) : 0;
    const gf = numeros.length >= 7 ? (numeros[4] ?? 0) : (numeros[2] ?? 0);
    const gc = numeros.length >= 7 ? (numeros[5] ?? 0) : (numeros[3] ?? 0);
    const pts = numeros.length >= 7 ? (numeros[6] ?? 0) : (numeros[1] ?? 0);

    const clave = `${pos}_${equipo.toLowerCase()}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    filas.push({
      categoria: categoriaActiva || 'Juvenil ♂',
      pos,
      equipo,
      pj,
      pg,
      pe,
      pp,
      gf,
      gc,
      pts,
      dif: gf - gc
    });
  }

  return filas;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const categoriaActiva = String(body.categoriaActiva || '').trim();
    const fuentes = Array.isArray(body.fuentes) ? body.fuentes : [];
    const urls = Array.isArray(body.urls) ? body.urls : fuentes.map((f) => f.url).filter(Boolean);

    const clasificacion = [];
    const partidos = [];
    const errores = [];
    const diagnostico = [];

    for (const urlRaw of urls) {
      const urlLimpia = String(urlRaw || '').trim();
      if (!urlLimpia) continue;

      const variantes = Array.from(new Set([urlLimpia, urlLimpia.split('#')[0]].filter(Boolean)));
      let mejorHtml = '';
      let mejorUrl = '';

      for (const objetivo of variantes) {
        try {
          const resp = await fetch(objetivo, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
              'Referer': 'https://futbuteo.com/'
            }
          });
          if (resp.ok) {
            const texto = await resp.text();
            if (texto && texto.length > mejorHtml.length) {
              mejorHtml = texto;
              mejorUrl = objetivo;
            }
          } else {
            errores.push({ url: objetivo, motivo: `HTTP ${resp.status}` });
          }
        } catch (err) {
          errores.push({ url: objetivo, motivo: err?.message || 'Error de conexión' });
        }
      }

      if (!mejorHtml) continue;

      const trCount = (mejorHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []).length;
      const extraidas = extraerClasificacionDesdeHtml(mejorHtml, categoriaActiva);
      diagnostico.push({
        url: mejorUrl,
        htmlLength: mejorHtml.length,
        trCount,
        filasExtraidas: extraidas.length
      });

      for (const fila of extraidas) {
        clasificacion.push(fila);
      }
    }

    return res.status(200).json({
      ok: clasificacion.length > 0 || errores.length === 0,
      partidos,
      clasificacion,
      errores,
      diagnostico
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Error interno del servidor'
    });
  }
}
```[cite: 13]

---

### 2. `src/App.jsx`

```javascript
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from './firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import {
  Calendar,
  Users,
  Bell,
  Shield,
  MapPin,
  Clock,
  Trash2,
  Trophy,
  Lock,
  Unlock,
  User,
  Award,
  Camera,
  KeyRound,
  Navigation,
  LogOut,
  UserPlus,
  Phone,
  RefreshCw,
  ExternalLink,
  Pencil
} from 'lucide-react';

const NOMBRE_CLUB_APP = 'C.D. Rafael Altamira Picanya';
const NOMBRE_CREADOR_APP = '@dagakol';
const PIN_INICIAL_OBLIGATORIO = '1234';
const PIN_DIRECTIVA_INICIAL = '1980';
const MAX_PERFILES_ESPECIALES_DIRECTIVA = 4;
const MAX_PARTIDOS_POR_IMPORTACION = 80;
const MAX_EQUIPOS_CLASIFICACION = 30;
const TTL_SINCRONIZACION_MS = 6 * 60 * 60 * 1000;

const REDES_SOCIALES_CLUB = [
  {
    nombre: 'Facebook Oficial',
    detalle: 'Noticias, fotos y actualidad del club',
    url: 'https://www.facebook.com/share/1EGbswnnTm/',
    color: '#1877F2'
  },
  {
    nombre: 'Instagram Oficial',
    detalle: 'Resultados, crónicas y día a día',
    url: 'https://www.instagram.com/altamirapicanyafsf?dmpr=MWV4c3F2YnpnYmxxag==',
    color: '#E1306C'
  },
  {
    nombre: 'Instagram Femenino',
    detalle: 'Sección femenina · C.D. Rafael Altamira',
    url: 'https://www.instagram.com/altamirapicanya2020?avpt=a2t3eDA5Y3F1d3li',
    color: '#db2777'
  }
];

const CATEGORIAS_BASE = [
  'Juvenil',
  'Cadete',
  'Infantil',
  'Alevín',
  'Benjamín',
  'Prebenjamín'
];

const CATEGORIAS_CLUB = [
  ...CATEGORIAS_BASE.flatMap((cat) => [`${cat} ♂`, `${cat} ♀`]),
  'Copa Valenta ♀',
  'Promoción Valenta ♀'
];

const CATEGORIAS_VISIBLES_CLUB = [
  'Benjamín ♂',
  'Juvenil ♂',
  'Alevín ♂',
  'Copa Valenta ♀',
  'Promoción Valenta ♀'
];

const FUENTES_CATEGORIAS_CLUB = [
  {
    categoria: 'Benjamín ♂',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-benjamin-futbol-sala-escolar-grup-4-valencia#tabla'
  },
  {
    categoria: 'Juvenil ♂',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-a-2a-regional-juvenil-futbol-sala-grup-3-valencia#tabla'
  },
  {
    categoria: 'Alevín ♂',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-a-alevin-futbol-sala-escolar-grup-4-valencia#tabla'
  },
  {
    categoria: 'Copa Valenta ♀',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-a-iv-la-nostra-copa-valenta-futbol-sala-grup-2-valencia#tabla'
  },
  {
    categoria: 'Promoción Valenta ♀',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-a-liga-provincial-promocion-valenta-futbol-sala-grup-2-valencia#tabla'
  }
];

const REGEX_FECHA_TEXTO = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/;
const REGEX_DIA_FECHA_LARGA = /^(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\s*,?\s*\d{1,2}\s+(de\s+)?[a-záéíóú]{3,}(\s+de\s+\d{4})?$/i;
const REGEX_SOLO_JORNADA = /^jornada\s*\d+(\s*\([^)]*\))?$/i;

function guardarLocalSeguro(clave, valor) {
  try {
    const serializado = typeof valor === 'string' ? valor : JSON.stringify(valor);
    localStorage.setItem(clave, serializado);
  } catch {
    // Evita fallos si localStorage alcanza su límite o está restringido
  }
}

function leerListaLocal(clave, respaldo) {
  try {
    const saved = localStorage.getItem(clave);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Ignorar error de lectura local
  }
  return respaldo;
}

function limpiarTelefono(tel) {
  return String(tel || '').replace(/[^\d+]/g, '').trim();
}

function normalizarEdad(edad) {
  const num = Number(String(edad ?? '').trim());
  if (!Number.isInteger(num) || num < 1 || num > 99) return '';
  return String(num);
}

function obtenerUrlGoogleMapsPabellon(pabellonTexto, rivalTexto = '') {
  const limpio = String(pabellonTexto || '').trim();
  const rivalLimpio = String(rivalTexto || '').trim();

  if (!limpio || /pabell[oó]n municipal picanya/i.test(limpio)) {
    const destinoCasa = 'Pabellón Municipal de Picanya, Picanya, Valencia';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinoCasa)}`;
  }

  const matchVisitante = limpio.match(/^Pabell[oó]n visitante\s*\((.+)\)$/i);
  let consulta = limpio;

  if (matchVisitante) {
    const dentroParentesis = matchVisitante[1].trim();
    const nombreObjetivo =
      /rival por confirmar/i.test(dentroParentesis) &&
      rivalLimpio &&
      !/rival por confirmar/i.test(rivalLimpio)
        ? rivalLimpio
        : dentroParentesis;

    consulta = /pabell[oó]n|polideportivo|campo|pista|colegio|pavell[oó]/i.test(nombreObjetivo)
      ? `${nombreObjetivo}, Valencia`
      : `Pabellón ${nombreObjetivo}, Valencia`;
  } else if (!/valencia/i.test(consulta)) {
    consulta = `${consulta}, Valencia`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

function esNombreInvalidoOResidual(texto) {
  const limpio = String(texto || '')
    .replace(/["'’]/g, '')
    .trim();
  if (!limpio || limpio.length < 3) return true;
  if (/^[ab]$/i.test(limpio)) return true;
  return false;
}

function esTextoFechaOJornada(texto) {
  const t = String(texto || '').trim();
  if (!t) return true;
  if (esNombreInvalidoOResidual(t)) return true;
  if (REGEX_DIA_FECHA_LARGA.test(t)) return true;
  if (REGEX_SOLO_JORNADA.test(t)) return true;
  if (/^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?(\s+([01]?\d|2[0-3]):[0-5]\d)?$/.test(t)) return true;
  const low = t.toLowerCase();
  const tieneMes = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic)\b/.test(low);
  const tieneDiaSemana = /\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/.test(low);
  if (
    (tieneMes || tieneDiaSemana) &&
    !/\b(c\.?d\.?|c\.?f\.?s?\.?|f\.?s\.?|futsal|club|sport|atletico|atlético|union|unión|valencia|picanya|torrent|maristas|salesianos)\b/i.test(low)
  ) {
    return true;
  }
  return false;
}

function esRivalValido(rival) {
  const lim = String(rival || '').trim();
  return (
    !esNombreInvalidoOResidual(lim) &&
    !esTextoFechaOJornada(lim) &&
    !/^(próximamente|proximamente|por confirmar|rival por confirmar)$/i.test(lim)
  );
}

function detectarCategoriaImportada(texto, categoriaForzada = '') {
  if (categoriaForzada && String(categoriaForzada).trim()) {
    const forz = String(categoriaForzada).trim();
    if (!/^senior\b/i.test(forz)) return forz;
  }

  const raw = String(texto || '');
  const tLimpio = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const baseEncontrada = CATEGORIAS_BASE.find((cat) => {
    const limpio = cat
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return new RegExp(`\\b${limpio}\\b`).test(tLimpio);
  });

  if (baseEncontrada) {
    const signo =
      tLimpio.includes('valenta') || tLimpio.includes('femenin') || raw.includes('♀')
        ? '♀'
        : '♂';
    return `${baseEncontrada} ${signo}`;
  }

  if (tLimpio.includes('nostra copa') || tLimpio.includes('navarti')) {
    return 'Copa Valenta ♀';
  }

  if (
    tLimpio.includes('promocion') ||
    tLimpio.includes('valenta') ||
    tLimpio.includes('maristas cullera') ||
    tLimpio.includes('inter marjal') ||
    tLimpio.includes("l'olleria") ||
    tLimpio.includes('maguen alfafar')
  ) {
    return 'Promoción Valenta ♀';
  }

  return 'Juvenil ♂';
}

function extraerFechaDeTexto(texto) {
  const str = String(texto || '');
  const horaMatch = str.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);

  const matchFecha = str.match(REGEX_FECHA_TEXTO);
  if (matchFecha) {
    const dia = matchFecha[1].padStart(2, '0');
    const mes = matchFecha[2].padStart(2, '0');
    let anio = matchFecha[3];
    if (anio.length === 2) anio = `20${anio}`;
    return horaMatch ? `${dia}-${mes}-${anio} · ${horaMatch[0]}` : `${dia}-${mes}-${anio}`;
  }

  const matchDiaMes = str.match(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?\b/i);
  if (matchDiaMes) {
    const base = `${matchDiaMes[1]} de ${matchDiaMes[2].toLowerCase()}${matchDiaMes[3] ? ` de ${matchDiaMes[3]}` : ''}`;
    return horaMatch ? `${base} · ${horaMatch[0]}` : base;
  }

  if (esTextoFechaOJornada(str)) {
    return horaMatch ? `${str.trim()} · ${horaMatch[0]}` : str.trim();
  }

  return '';
}

function limpiarNombreRival(texto) {
  let limpio = String(texto || '')
    .replace(/\bJornada\s*\d+\s*\([^)]*\)/gi, '')
    .replace(/\bJornada\s*\d+\b/gi, '')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '')
    .replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (esNombreInvalidoOResidual(limpio) || esTextoFechaOJornada(limpio)) {
    return 'Rival por confirmar';
  }

  const low = limpio.toLowerCase();
  if (
    !limpio ||
    low.includes('futsal') ||
    low.includes('fútbol sala') ||
    low.includes('futbol sala') ||
    low.includes('grup ') ||
    low.includes('grupo ') ||
    low === 'próximamente' ||
    low === 'proximamente' ||
    low === 'por confirmar'
  ) {
    return 'Rival por confirmar';
  }
  return limpio;
}

function esEquipoClubAltamira(nombre) {
  return /rafael altamira|picanya/i.test(String(nombre || ''));
}

function normalizarMarcadorPartido(valor) {
  const limpio = String(valor || '').trim();
  if (!limpio || /^vs$/i.test(limpio)) return 'VS';
  const matchMarcador = limpio.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (matchMarcador) {
    return `${matchMarcador[1]} - ${matchMarcador[2]}`;
  }
  return limpio;
}

function parsearPartidosDesdeTexto(textoCrudo, categoriaForzada = '') {
  const lineas = String(textoCrudo || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let fechaActual = 'Por confirmar';
  let jornadaActual = '';
  const resultados = [];

  const regexDiaEncabezado = /^(LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SABADO|SÁBADO|DOMINGO)\s*,?\s*\d{1,2}\s+(DE\s+)?[A-ZÁÉÍÓÚ]{3,}/i;
  const regexJornadaEncabezado = /^Jornada\s*\d+/i;

  for (const linea of lineas) {
    if (regexJornadaEncabezado.test(linea)) {
      const numJornada = linea.match(/^Jornada\s*\d+/i)?.[0] || linea;
      jornadaActual = numJornada;
      const fechaEnJornada = extraerFechaDeTexto(linea);
      fechaActual = fechaEnJornada ? `${fechaEnJornada} (${numJornada})` : numJornada;
      continue;
    }

    if (regexDiaEncabezado.test(linea)) {
      fechaActual = linea
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
      continue;
    }

    const horaMatch = linea.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    const hora = horaMatch ? horaMatch[0] : '';
    const fechaEnLinea = extraerFechaDeTexto(linea);
    const marcadorEnLineaMatch = linea.match(/(?:^|\s)(\d{1,2})\s*[-–]\s*(\d{1,2})(?:\s|$)/);

    if (
      !linea.includes('-') &&
      !linea.includes('–') &&
      !linea.includes('—') &&
      !/\bvs\.?\b/i.test(linea) &&
      (fechaEnLinea || hora) &&
      !esEquipoClubAltamira(linea)
    ) {
      const base = fechaEnLinea || fechaActual;
      fechaActual = hora && !base.includes(hora) ? `${base} · ${hora}` : base;
      continue;
    }

    const partesGuion = linea.split(/\s+(?:-|–|—|vs\.?)\s+/i).map((s) => s.trim()).filter(Boolean);
    if (partesGuion.length >= 2) {
      const eqIzq = partesGuion[0];
      const eqDer = partesGuion[1];

      if (/^descansa(-\d+)?$/i.test(eqIzq) || /^descansa(-\d+)?$/i.test(eqDer)) {
        continue;
      }

      const izqEsAltamira = esEquipoClubAltamira(eqIzq);
      const derEsAltamira = esEquipoClubAltamira(eqDer);

      if (!izqEsAltamira && !derEsAltamira) {
        continue;
      }

      const clubLocal = 'C.D. Rafael Altamira FS';
      let local = clubLocal;
      let visitante = 'Rival por confirmar';
      let esFuera = false;

      if (izqEsAltamira && !derEsAltamira) {
        local = clubLocal;
        visitante = limpiarNombreRival(eqDer);
        esFuera = false;
      } else if (derEsAltamira && !izqEsAltamira) {
        local = limpiarNombreRival(eqIzq);
        visitante = clubLocal;
        esFuera = true;
      } else {
        local = clubLocal;
        visitante = 'Rival por confirmar';
        esFuera = false;
      }

      const rivalParaPabellon = esFuera ? local : visitante;
      const fechaBase = fechaEnLinea || fechaActual;
      const fechaCompleta =
        hora && !fechaBase.includes(hora) ? `${fechaBase} · ${hora}` : fechaBase;

      let resultadoDetectado = 'VS';
      if (marcadorEnLineaMatch) {
        const g1 = marcadorEnLineaMatch[1];
        const g2 = marcadorEnLineaMatch[2];
        resultadoDetectado = esFuera ? `${g2} - ${g1}` : `${g1} - ${g2}`;
      } else if (partesGuion[2]) {
        resultadoDetectado = normalizarMarcadorPartido(partesGuion[2]);
      }

      resultados.push({
        categoria: detectarCategoriaImportada(`${linea} ${jornadaActual}`, categoriaForzada),
        local,
        visitante,
        fecha: fechaCompleta,
        pabellon: esFuera
          ? `Pabellón visitante (${rivalParaPabellon})`
          : 'Pabellón Municipal Picanya',
        resultado: resultadoDetectado
      });
      continue;
    }

    const esFuera = /\bFUERA\b/i.test(linea);
    const segmentos = linea
      .split(/\s*(?:\||·| en )\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);

    const candidatoRival = segmentos.find((seg) => {
      const sLow = seg.toLowerCase();
      if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(seg)) return false;
      if (/^(casa|fuera)$/i.test(seg)) return false;
      if (/^descansa(-\d+)?$/i.test(seg)) return true;
      if (regexDiaEncabezado.test(seg) || regexJornadaEncabezado.test(seg) || esTextoFechaOJornada(seg)) return false;
      if (esEquipoClubAltamira(seg)) return false;
      if (
        sLow.includes('fútbol sala') ||
        sLow.includes('futbol sala') ||
        sLow.includes('regional') ||
        sLow.includes('provincial') ||
        sLow.includes('promoción') ||
        sLow.includes('promocion') ||
        sLow.includes('valenta') ||
        sLow.includes('copa') ||
        sLow.includes('grup ')
      ) {
        return false;
      }
      return seg.length >= 2;
    });

    if (candidatoRival && /^descansa(-\d+)?$/i.test(candidatoRival)) {
      continue;
    }

    const rival = limpiarNombreRival(candidatoRival || 'Rival por confirmar');
    const clubLocal = 'C.D. Rafael Altamira FS';
    const local = esFuera ? rival : clubLocal;
    const visitante = esFuera ? clubLocal : rival;
    const categoria = detectarCategoriaImportada(`${linea} ${jornadaActual}`, categoriaForzada);
    const fechaBase = fechaEnLinea || fechaActual;
    const fechaCompleta =
      hora && !fechaBase.includes(hora) ? `${fechaBase} · ${hora}` : fechaBase;
    const pabellon = esFuera
      ? `Pabellón visitante (${rival})`
      : 'Pabellón Municipal Picanya';

    resultados.push({
      categoria,
      local,
      visitante,
      fecha: fechaCompleta,
      pabellon,
      resultado: marcadorEnLineaMatch
        ? `${marcadorEnLineaMatch[1]} - ${marcadorEnLineaMatch[2]}`
        : 'VS'
    });
  }

  return resultados;
}

function parsearPartidosDesdeHtml(htmlTexto, categoriaForzada = '') {
  if (!htmlTexto || typeof DOMParser === 'undefined') return [];
  try {
    const parser = new DOMParser();
    const docHtml = parser.parseFromString(htmlTexto, 'text/html');
    const textoPlano = docHtml.body ? docHtml.body.innerText || docHtml.body.textContent || '' : '';
    return parsearPartidosDesdeTexto(textoPlano, categoriaForzada);
  } catch {
    return [];
  }
}

function normalizarNombreEquipoClasificacion(nombre) {
  const limpio = sanearNombreEquipoTabla(nombre);
  const s = String(limpio || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["'’]/g, '')
    .replace(/\b(c\.?d\.?|c\.?f\.?s?\.?|f\.?s\.?|futsal|club|deportivo)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (/rafael altamira|picanya/.test(s)) return 'cd_rafael_altamira';
  return s;
}

function esLineaCabeceraOEscudo(linea) {
  const t = String(linea || '').trim();
  if (!t) return true;
  if (/^escudo\s+de\b/i.test(t)) return true;
  if (/^#?\s*equipo\s+(pts|pj)\b/i.test(t)) return true;
  if (
    /^(pts|pj|pg|pe|pp|gf|gc|dif|forma|g|e|p)\b/i.test(t) &&
    !/[a-z]{4,}/i.test(t.replace(/\b(pts|pj|pg|pe|pp|gf|gc|dif|forma)\b/gi, ''))
  ) {
    return true;
  }
  return false;
}

function esLineaSoloNumerosEstadistica(linea) {
  const limpio = String(linea || '').trim();
  if (!limpio) return false;
  return /^[+-]?\d+(?:\s+[+-]?\d+)+$/.test(limpio);
}

function sanearNombreEquipoTabla(entrada) {
  const partes = Array.isArray(entrada) ? entrada : [String(entrada || '')];
  const filtradas = partes
    .flatMap((p) => String(p || '').split(/\r?\n/))
    .map((p) =>
      p
        .replace(/^forma\s+\d+\s+/i, '')
        .replace(/^escudo\s+de\s+/i, '')
        .trim()
    )
    .filter((p) => p && !esLineaCabeceraOEscudo(p) && !/^\d{1,2}\.?$/.test(p));

  let unido = '';
  for (const parte of filtradas) {
    const sinPosYEscudo = parte
      .replace(/^\d{1,2}\s+escudo\s+de\s+/i, '')
      .replace(/^escudo\s+de\s+/i, '')
      .trim();

    if (!sinPosYEscudo) continue;

    if (!unido) {
      unido = sinPosYEscudo;
      continue;
    }

    if (/^['"]?[a-z0-9]{1,3}['"]?$/i.test(sinPosYEscudo)) {
      unido = `${unido} ${sinPosYEscudo}`;
      continue;
    }

    const unidoNorm = unido.toLowerCase().replace(/\s+/g, ' ');
    const parteNorm = sinPosYEscudo.toLowerCase().replace(/\s+/g, ' ');
    if (parteNorm === unidoNorm || unidoNorm.endsWith(parteNorm)) {
      continue;
    }
    unido = `${unido} ${sinPosYEscudo}`;
  }

  let limpio = unido.replace(/\s{2,}/g, ' ').trim();

  const mitad = Math.floor(limpio.length / 2);
  if (limpio.length >= 10) {
    for (let len = mitad; len >= 6; len--) {
      const candidata = limpio.slice(0, len).trim();
      if (!candidata) continue;
      const escaped = candidata.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexRepetido = new RegExp(`^${escaped}\\s+${escaped}(?:\\s+${escaped})*$`, 'i');
      if (regexRepetido.test(limpio)) {
        limpio = candidata;
        break;
      }
    }
  }

  return limpio.trim();
}

function calcularDifClasificacion(gf, gc, difManual) {
  if (difManual !== undefined && difManual !== null && String(difManual).trim() !== '') {
    const num = Number(String(difManual).trim());
    if (!Number.isNaN(num)) return num;
  }
  return Number(gf || 0) - Number(gc || 0);
}

function formatearDif(dif) {
  const n = Number(dif || 0);
  return n > 0 ? `+${n}` : `${n}`;
}

function parsearClasificacionDesdeTexto(textoCrudo, categoriaForzada = '') {
  const lineas = String(textoCrudo || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const equipos = [];
  let posPendiente = null;
  let lineasNombrePendientes = [];

  const finalizarFilaConNumeros = (nums, posExplicita = null) => {
    if (!nums || nums.length < 2) return;
    const nombreFinal = sanearNombreEquipoTabla(lineasNombrePendientes);

    if (nombreFinal.length >= 2 && !/^\d+$/.test(nombreFinal)) {
      let pts = 0;
      let pj = 0;
      let pg = 0;
      let pe = 0;
      let pp = 0;
      let gf = 0;
      let gc = 0;
      let dif = null;

      if (nums.length >= 8) {
        pts = nums[0];
        pj = nums[1];
        pg = nums[2];
        pe = nums[3];
        pp = nums[4];
        gf = nums[5];
        gc = nums[6];
        dif = nums[7];
      } else if (nums.length === 7) {
        pj = nums[0];
        pg = nums[1];
        pe = nums[2];
        pp = nums[3];
        gf = nums[4];
        gc = nums[5];
        pts = nums[6];
        dif = gf - gc;
      } else if (nums.length >= 4) {
        pj = nums[0] ?? 0;
        pts = nums[1] ?? 0;
        gf = nums[2] ?? 0;
        gc = nums[3] ?? 0;
        dif = gf - gc;
      } else {
        pj = nums[0] ?? 0;
        pts = nums[1] ?? 0;
        gf = nums[2] ?? 0;
        gc = 0;
        dif = gf - gc;
      }

      equipos.push({
        categoria: categoriaForzada || '',
        pos: posExplicita || posPendiente || equipos.length + 1,
        equipo: nombreFinal,
        pts,
        pj,
        pg,
        pe,
        pp,
        gf,
        gc,
        dif: calcularDifClasificacion(gf, gc, dif)
      });
    }

    posPendiente = null;
    lineasNombrePendientes = [];
  };

  for (const linea of lineas) {
    if (esLineaCabeceraOEscudo(linea)) {
      continue;
    }

    if (linea.includes('\t')) {
      const celdas = linea.split('\t').map((c) => c.trim()).filter(Boolean);
      const posCelda = /^\d{1,2}\.?$/.test(celdas[0] || '') ? Number(celdas[0].replace('.', '')) : null;
      const inicioEq = posCelda !== null ? 1 : 0;
      const numsCeldas = [];
      const eqPartes = [];

      for (let i = inicioEq; i < celdas.length; i++) {
        if (/^[+-]?\d+$/.test(celdas[i])) {
          numsCeldas.push(Number(celdas[i]));
        } else {
          eqPartes.push(celdas[i]);
        }
      }

      if (eqPartes.length > 0 && numsCeldas.length >= 2) {
        lineasNombrePendientes = eqPartes;
        finalizarFilaConNumeros(numsCeldas, posCelda);
        continue;
      }
    }

    const limpiaForma = linea.replace(/^forma\s+\d+\s+/i, '').trim();
    if (esLineaCabeceraOEscudo(limpiaForma)) {
      continue;
    }

    if (/^\d{1,2}\.?$/.test(limpiaForma)) {
      if (lineasNombrePendientes.length > 0) {
        lineasNombrePendientes = [];
      }
      posPendiente = Number(limpiaForma.replace('.', ''));
      continue;
    }

    if (esLineaSoloNumerosEstadistica(limpiaForma)) {
      const nums = limpiaForma.split(/\s+/).map(Number);
      finalizarFilaConNumeros(nums);
      continue;
    }

    const matchConPos = limpiaForma.match(/^(\d{1,2})\s*[.)-]??\s+(.+?)\s+([+-]?\d+(?:\s+[+-]?\d+){1,8})$/);
    if (matchConPos) {
      const posNum = Number(matchConPos[1]);
      const equipoNombre = sanearNombreEquipoTabla([matchConPos[2]]);
      const nums = matchConPos[3].trim().split(/\s+/).map(Number);
      if (equipoNombre.length >= 2 && nums.length >= 2) {
        posPendiente = posNum;
        lineasNombrePendientes = [equipoNombre];
        finalizarFilaConNumeros(nums, posNum);
        continue;
      }
    }

    if (/^['"]?[a-z0-9]{1,3}['"]?$/i.test(limpiaForma) && lineasNombrePendientes.length > 0) {
      lineasNombrePendientes.push(limpiaForma);
      continue;
    }

    lineasNombrePendientes.push(limpiaForma);
  }

  return equipos;
}

function normalizarEquipoClave(nombre) {
  return normalizarNombreEquipoClasificacion(nombre);
}

function normalizarFechaClave(fechaStr) {
  const raw = String(fechaStr || '').trim();
  const m = raw.match(REGEX_FECHA_TEXTO);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mes = m[2].padStart(2, '0');
    let a = m[3];
    if (a.length === 2) a = `20${a}`;
    return `${d}-${mes}-${a}`;
  }
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizarClavePartido(partido) {
  const cat = normalizarCategoria(partido?.categoria || '');
  const fecha = normalizarFechaClave(partido?.fecha);
  const equiposOrdenados = [
    normalizarEquipoClave(partido?.local),
    normalizarEquipoClave(partido?.visitante)
  ]
    .filter(Boolean)
    .sort()
    .join('__');
  return `${cat}|${fecha}|${equiposOrdenados}`;
}

function normalizarClaveClasificacion(item) {
  const cat = normalizarCategoria(item?.categoria || '');
  const eq = normalizarNombreEquipoClasificacion(item?.equipo || '');
  if (!eq) return '';
  return `${cat}|${eq}`;
}

function obtenerMarcaTiempoPartido(partido) {
  const textoCompleto = `${partido?.fecha || ''} ${partido?.local || ''} ${partido?.visitante || ''}`.trim();
  if (!textoCompleto) return Number.MAX_SAFE_INTEGER;

  const horaMatch = textoCompleto.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const horas = horaMatch ? Number(horaMatch[1]) : 23;
  const minutos = horaMatch ? Number(horaMatch[2]) : 59;

  const fechaCompletaMatch = textoCompleto.match(REGEX_FECHA_TEXTO);
  if (fechaCompletaMatch) {
    const dia = Number(fechaCompletaMatch[1]);
    const mes = Number(fechaCompletaMatch[2]) - 1;
    let anio = Number(fechaCompletaMatch[3]);
    if (anio < 100) anio += 2000;
    const d = new Date(anio, mes, dia, horas, minutos, 0);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }

  return Number.MAX_SAFE_INTEGER;
}

function esPartidoYaJugado(partido, ahoraMs = Date.now()) {
  const res = String(partido?.resultado || 'VS').trim().toUpperCase();
  if (res && res !== 'VS') return true;
  const ts = obtenerMarcaTiempoPartido(partido);
  if (ts === Number.MAX_SAFE_INTEGER) return false;
  return ts < ahoraMs - 2 * 60 * 60 * 1000;
}

function separarPartidosProximosYJugados(lista) {
  const ahoraMs = Date.now();
  const proximos = [];
  const jugados = [];

  for (const p of lista || []) {
    if (esPartidoYaJugado(p, ahoraMs)) {
      jugados.push(p);
    } else {
      proximos.push(p);
    }
  }

  proximos.sort((a, b) => {
    const tA = obtenerMarcaTiempoPartido(a);
    const tB = obtenerMarcaTiempoPartido(b);
    if (tA !== tB) return tA - tB;
    return String(a?.categoria || '').localeCompare(String(b?.categoria || ''), 'es');
  });

  jugados.sort((a, b) => {
    const tA = obtenerMarcaTiempoPartido(a);
    const tB = obtenerMarcaTiempoPartido(b);
    if (tA !== tB) return tB - tA;
    return String(a?.categoria || '').localeCompare(String(b?.categoria || ''), 'es');
  });

  return { proximos, jugados };
}

function formatearEtiquetaUsuarioCabecera(perfilObj, mostrarDorsal, dorsalValor) {
  const nombre = String(perfilObj?.nombre || '').trim();
  const rol = String(perfilObj?.rol || '').trim();
  const esDir =
