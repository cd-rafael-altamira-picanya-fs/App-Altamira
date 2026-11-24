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
  Plus,
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
  Download,
  CopyX,
  Phone,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

const NOMBRE_CREADOR_APP = '@dagakol';
const PIN_INICIAL_OBLIGATORIO = '1234';
const PIN_DIRECTIVA_INICIAL = '1980';
const MAX_PERFILES_ESPECIALES_DIRECTIVA = 4;
const MAX_PARTIDOS_POR_IMPORTACION = 60;
const MAX_EQUIPOS_CLASIFICACION = 20;
const TTL_SINCRONIZACION_MS = 3 * 60 * 60 * 1000;

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
  'Senior',
  'Juvenil',
  'Cadete',
  'Infantil',
  'Alevín',
  'Benjamín',
  'Prebenjamín'
];

const CATEGORIAS_CLUB = CATEGORIAS_BASE.flatMap((cat) => [
  `${cat} ♂`,
  `${cat} ♀`
]);

const URLS_POR_DEFECTO = [
  'https://www.elbalondelacomunitat.es/equipo/905540140/partidos',
  'https://futbuteo.com/valencia/campo/pabellon-mpal-fuente-la-higuera'
];

const TEXTO_MUESTRA_FFCV = `Jornada 8 (15-11-2026)
C.D. Rafael Altamira Picanya "A" - Descansa-1

Jornada 9 (22-11-2026)
C.D. Maguen Alfafar F.S. - C.D. Rafael Altamira Picanya "A"

Jornada 10 (29-11-2026)
C.D. Rafael Altamira Picanya "A" - Maristas Cullera

Jornada 11 (06-12-2026)
C.F.S. Aliança Quart de Poblet "A" - C.D. Rafael Altamira Picanya "A"

Jornada 12 (13-12-2026)
C.D. Rafael Altamira Picanya "A" - C.D. Inter Marjal

Jornada 13 (20-12-2026)
C.F.S. L'Olleria La Vall d'Albaida "A" - C.D. Rafael Altamira Picanya "A"

Jornada 14 (10-01-2027)
C.D. Rafael Altamira Picanya "A" - Santa Ana Algemesí C.D.`;

const TEXTO_MUESTRA_CLASIFICACION = `#	Equipo	Pts	PJ	PG	PE	PP	GF	GC	Dif
1	C.D. Corbera	25	9	8	1	0	59	10	+49
2	F.S. Picassent 'B'	22	9	7	1	1	50	23	+27`;

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
    if (saved !== null) return JSON.parse(saved);
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

    consulta = /pabell[oó]n|polideportivo|campo|pista/i.test(nombreObjetivo)
      ? `${nombreObjetivo}, Valencia`
      : `Pabellón ${nombreObjetivo}, Valencia`;
  } else if (!/valencia/i.test(consulta)) {
    consulta = `${consulta}, Valencia`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

function esNombreInvalidoOResidual(texto) {
  const limpio = String(texto || '')
    .replace(/["""'']/g, '')
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
  if ((tieneMes || tieneDiaSemana) && !/\b(c\.?d\.?|c\.?f\.?s?\.?|f\.?s\.?|futsal|club|sport|atletico|atlético|union|unión|valencia|picanya|torrent|maristas|salesianos)\b/i.test(low)) {
    return true;
  }
  return false;
}

function detectarCategoriaImportada(texto) {
  const t = String(texto || '').toLowerCase();
  const esFemenino = t.includes('valenta') || t.includes('femenin') || t.includes('♀');
  const signo = esFemenino ? '♀' : '♂';

  const baseEncontrada = CATEGORIAS_BASE.find((cat) => {
    const limpio = cat
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const tLimpio = t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return tLimpio.includes(limpio);
  });

  if (baseEncontrada) {
    return `${baseEncontrada} ${signo}`;
  }
  return esFemenino ? 'Senior ♀' : 'Senior ♂';
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

function parsearPartidosDesdeTexto(textoCrudo) {
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

      resultados.push({
        categoria: detectarCategoriaImportada(`${linea} ${jornadaActual}`),
        local,
        visitante,
        fecha: fechaCompleta,
        pabellon: esFuera
          ? `Pabellón visitante (${rivalParaPabellon})`
          : 'Pabellón Municipal Picanya',
        resultado: 'VS'
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
    const categoria = detectarCategoriaImportada(`${linea} ${jornadaActual}`);
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
      resultado: 'VS'
    });
  }

  return resultados;
}

function normalizarNombreEquipoClasificacion(nombre) {
  const limpio = sanearNombreEquipoTabla(nombre);
  const s = String(limpio || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["""'']/g, '')
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
  if (/^#?\s*equipo\s+pts\b/i.test(t)) return true;
  if (/^(pts|pj|pg|pe|pp|gf|gc|dif|forma)\b/i.test(t) && !/[a-z]{4,}/i.test(t.replace(/\b(pts|pj|pg|pe|pp|gf|gc|dif|forma)\b/gi, ''))) {
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

function parsearClasificacionDesdeTexto(textoCrudo) {
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

      if (nums.length >= 7) {
        pts = nums[0];
        pj = nums[1];
        pg = nums[2];
        pe = nums[3];
        pp = nums[4];
        gf = nums[5];
        gc = nums[6];
        dif = nums[7] !== undefined ? nums[7] : gf - gc;
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

    const matchConPos = limpiaForma.match(/^(\d{1,2})\s*[.)-]?\s+(.+?)\s+([+-]?\d+(?:\s+[+-]?\d+){1,8})$/);
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
  const fecha = normalizarFechaClave(partido.fecha);
  const equiposOrdenados = [
    normalizarEquipoClave(partido.local),
    normalizarEquipoClave(partido.visitante)
  ]
    .filter(Boolean)
    .sort()
    .join('__');
  return `${fecha}|${equiposOrdenados}`;
}

function obtenerMarcaTiempoPartido(partido) {
  const textoCompleto = `${partido?.fecha || ''} ${partido?.local || ''} ${partido?.visitante || ''}`.trim();
  if (!textoCompleto) return Number.MAX_SAFE_INTEGER;

  const meses = {
    ene: 0, enero: 0,
    feb: 1, febrero: 1,
    mar: 2, marzo: 2,
    abr: 3, abril: 3,
    may: 4, mayo: 4,
    jun: 5, junio: 5,
    jul: 6, julio: 6,
    ago: 7, agosto: 7,
    sep: 8, sept: 8, septiembre: 8,
    oct: 9, octubre: 9,
    nov: 10, noviembre: 10,
    dic: 11, diciembre: 11
  };

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

  const fechaCortaMatch = textoCompleto.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
  if (fechaCortaMatch) {
    const dia = Number(fechaCortaMatch[1]);
    const mes = Number(fechaCortaMatch[2]) - 1;
    const ahora = new Date();
    let anio = ahora.getFullYear();
    const candidata = new Date(anio, mes, dia, horas, minutos, 0);
    if (candidata.getTime() < ahora.getTime() - 90 * 24 * 60 * 60 * 1000) {
      anio += 1;
    }
    const d = new Date(anio, mes, dia, horas, minutos, 0);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }

  const limpio = textoCompleto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const partes = limpio.split(/[\s,·()]+/);
  let diaMes = null;
  let mesIdx = null;

  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (/^\d{1,2}$/.test(p) && Number(p) >= 1 && Number(p) <= 31 && diaMes === null) {
      diaMes = Number(p);
    }
    if (meses[p] !== undefined && mesIdx === null) {
      mesIdx = meses[p];
    }
  }

  if (diaMes !== null && mesIdx !== null) {
    const ahora = new Date();
    let anio = ahora.getFullYear();
    const candidata = new Date(anio, mesIdx, diaMes, horas, minutos, 0);
    if (candidata.getTime() < ahora.getTime() - 90 * 24 * 60 * 60 * 1000) {
      anio += 1;
    }
    const finalDate = new Date(anio, mesIdx, diaMes, horas, minutos, 0);
    if (!Number.isNaN(finalDate.getTime())) return finalDate.getTime();
  }

  const diasSemana = {
    domingo: 0, dom: 0,
    lunes: 1, lun: 1,
    martes: 2, mar: 2,
    miercoles: 3, mie: 3,
    jueves: 4, jue: 4,
    viernes: 5, vie: 5,
    sabado: 6, sab: 6
  };

  for (const p of partes) {
    if (diasSemana[p] !== undefined) {
      const ahora = new Date();
      const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0);
      const diffDias = (diasSemana[p] - inicioHoy.getDay() + 7) % 7;
      const candidata = new Date(
        inicioHoy.getFullYear(),
        inicioHoy.getMonth(),
        inicioHoy.getDate() + diffDias,
        horas,
        minutos,
        0
      );
      if (candidata.getTime() < ahora.getTime()) {
        candidata.setDate(candidata.getDate() + 7);
      }
      return candidata.getTime();
    }
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

function TextoConSignoGenero({ texto }) {
  if (!texto) return null;
  const partes = String(texto).split(/(♀|♂)/g);
  return (
    <>
      {partes.map((parte, idx) => {
        if (parte === '♀') {
          return (
            <span key={idx} className="signo-mujer">
              ♀
            </span>
          );
        }
        if (parte === '♂') {
          return (
            <span key={idx} className="signo-hombre">
              ♂
            </span>
          );
        }
        return <React.Fragment key={idx}>{parte}</React.Fragment>;
      })}
    </>
  );
}

function SelectorCategoriaYGenero({ valorActual, onChangeValor }) {
  const textoActual = String(valorActual || '');
  const generoActual = textoActual.endsWith('♀')
    ? '♀'
    : textoActual.endsWith('♂')
    ? '♂'
    : '';
  const baseActual = CATEGORIAS_BASE.find((c) => textoActual.startsWith(c)) || '';

  const seleccionar = (nuevaBase, nuevoGenero) => {
    const baseElegida = nuevaBase || baseActual || 'Senior';
    const generoElegido = nuevoGenero || generoActual || '♂';
    onChangeValor(`${baseElegida} ${generoElegido}`);
  };

  return (
    <div style={{ marginTop: 4 }}>
      <select
        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
        value={valorActual}
        onChange={(e) => onChangeValor(e.target.value)}
        required
      >
        <option value="">Selecciona tu categoría *</option>
        {CATEGORIAS_CLUB.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>

      <div className="selector-genero-grid">
        <button
          type="button"
          className={`btn-genero ${generoActual === '♂' ? 'activo-hombre' : ''}`}
          onClick={() => seleccionar(baseActual, '♂')}
        >
          <span>{baseActual || 'Categoría'}</span>
          <span className="signo-hombre">♂</span>
        </button>
        <button
          type="button"
          className={`btn-genero ${generoActual === '♀' ? 'activo-mujer' : ''}`}
          onClick={() => seleccionar(baseActual, '♀')}
        >
          <span>{baseActual || 'Categoría'}</span>
          <span className="signo-mujer">♀</span>
        </button>
      </div>
    </div>
  );
}

const ROLES_ESPECIALES_DIRECTIVA = [
  { value: 'Entrenador', label: 'Entrenador' },
  { value: '2º Entrenador', label: '2º Entrenador' },
  { value: 'Reserva Directiva 1', label: 'Reserva Directiva 1' },
  { value: 'Reserva Directiva 2', label: 'Reserva Directiva 2' }
];

function esDirectiva(perfilItem) {
  const r = String(perfilItem?.rol || perfilItem?.categoria || '').toLowerCase();
  return r.includes('directiva');
}

function esEntrenador(perfilItem) {
  const r = String(perfilItem?.rol || perfilItem?.categoria || '').toLowerCase();
  return r.includes('entrenador');
}

function esStaffPrioritario(perfilItem) {
  return esDirectiva(perfilItem) || esEntrenador(perfilItem) || Boolean(perfilItem?.esReservaDirectiva);
}

function esPerfilFemenino(perfilItem) {
  const cat = String(perfilItem?.categoria || '').trim().toLowerCase();
  const nombre = String(perfilItem?.nombre || '').trim().toLowerCase();
  if (cat.endsWith('♀') || cat.includes('femenin')) return true;
  if (cat.endsWith('♂') || cat.includes('masculin')) return false;
  if (nombre.includes('femenin')) return true;
  return false;
}

function esRolSinDorsal(rol) {
  const r = String(rol || '').toLowerCase();
  return r.includes('entrenador') || r.includes('directiva') || r.includes('reserva');
}

function normalizarCategoria(cat) {
  return String(cat || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizarDorsal(dorsal) {
  const limpio = String(dorsal || '')
    .trim()
    .replace(/^#/, '')
    .replace(/^0+(?=\d)/, '');
  return limpio;
}

function mismaCategoriaYDorsal(dorsalA, catA, dorsalB, catB) {
  const d1 = normalizarDorsal(dorsalA);
  const d2 = normalizarDorsal(dorsalB);
  if (!d1 || !d2 || d1 === '0' || d2 === '0' || d1 !== d2) return false;

  const c1 = normalizarCategoria(catA);
  const c2 = normalizarCategoria(catB);
  if (!c1 || !c2) return false;

  return c1 === c2;
}

function procesarFotoCircular(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 120;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      callback(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function slugBase(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function crearIdPerfil(nombre, dorsal, correo = '', rol = '') {
  const esEspecial = esRolSinDorsal(rol) || esRolSinDorsal(dorsal);
  const nombreSlug = slugBase(nombre);
  if (esEspecial) {
    const rolSlug = slugBase(esRolSinDorsal(rol) ? rol : dorsal) || 'staff';
    return `${nombreSlug || 'usuario'}_${rolSlug}`;
  }
  const dorsalSlug = normalizarDorsal(dorsal) || 'sin_dorsal';
  return `${nombreSlug || 'usuario'}_${dorsalSlug}`;
}

function obtenerClaveUnicaPerfil(item) {
  const nombreSlug = slugBase(item?.nombre);
  if (esRolSinDorsal(item?.rol) || item?.esReservaDirectiva) {
    const rolSlug = slugBase(item?.rol || item?.categoria || 'staff');
    return `staff:${nombreSlug}:${rolSlug}`;
  }
  const dorsalSlug = normalizarDorsal(item?.dorsal) || 'sin_dorsal';
  const catSlug = slugBase(item?.categoria || '');
  if (nombreSlug && catSlug) {
    return `jugador:${nombreSlug}:${catSlug}:${dorsalSlug}`;
  }
  return `id:${item?.id || `${nombreSlug}_${dorsalSlug}`}`;
}

function AvatarCircular({ src, alt, letra, tamano = 48 }) {
  const boxRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const px = `${tamano}px`;
    if (boxRef.current) {
      boxRef.current.style.setProperty('width', px, 'important');
      boxRef.current.style.setProperty('height', px, 'important');
      boxRef.current.style.setProperty('min-width', px, 'important');
      boxRef.current.style.setProperty('min-height', px, 'important');
      boxRef.current.style.setProperty('max-width', px, 'important');
      boxRef.current.style.setProperty('max-height', px, 'important');
      boxRef.current.style.setProperty('border-radius', '9999px', 'important');
      boxRef.current.style.setProperty('border', '3px solid #ec4899', 'important');
      boxRef.current.style.setProperty('overflow', 'hidden', 'important');
      boxRef.current.style.setProperty('position', 'relative', 'important');
      boxRef.current.style.setProperty('display', 'inline-flex', 'important');
      boxRef.current.style.setProperty('align-items', 'center', 'important');
      boxRef.current.style.setProperty('justify-content', 'center', 'important');
      boxRef.current.style.setProperty('flex-shrink', '0', 'important');
      boxRef.current.style.setProperty('margin', '0', 'important');
    }
    if (imgRef.current) {
      imgRef.current.style.setProperty('width', '100%', 'important');
      imgRef.current.style.setProperty('height', '100%', 'important');
      imgRef.current.style.setProperty('border-radius', '9999px', 'important');
      imgRef.current.style.setProperty('border', 'none', 'important');
      imgRef.current.style.setProperty('object-fit', 'cover', 'important');
      imgRef.current.style.setProperty('object-position', 'center', 'important');
      imgRef.current.style.setProperty('position', 'static', 'important');
      imgRef.current.style.setProperty('float', 'none', 'important');
      imgRef.current.style.setProperty('margin', '0', 'important');
    }
  }, [tamano, src]);

  return (
    <div
      ref={boxRef}
      className="avatar-circular-box"
      style={{
        backgroundColor: '#1e3a8a',
        color: '#ffffff',
        fontWeight: 800,
        fontSize: `${Math.max(11, Math.round(tamano * 0.36))}px`,
        border: '3px solid #ec4899'
      }}
    >
      {src ? (
        <img ref={imgRef} src={src} alt={alt || 'Foto de perfil'} />
      ) : (
        <span>{letra || 'U'}</span>
      )}
    </div>
  );
}

function TarjetaMiPerfil({
  perfil,
  sinDorsalUsuarioActual,
  handleAbrirEditarPerfil
}) {
  const dorsalLimpio = String(perfil?.dorsal || '').trim();
  const mostrarDorsal = !sinDorsalUsuarioActual && dorsalLimpio !== '' && dorsalLimpio !== '0';
  const edadLimpia = normalizarEdad(perfil?.edad || '');

  return (
    <div className="card mi-perfil-card">
      <div className="mi-perfil-foto-wrap">
        <AvatarCircular
          src={perfil.foto}
          alt={perfil.nombre || 'Foto de perfil'}
          letra={perfil.nombre?.[0] || 'U'}
          tamano={72}
        />
      </div>

      <div className="mi-perfil-texto-wrap">
        {mostrarDorsal && (
          <div className="mi-perfil-dorsal">#{dorsalLimpio}</div>
        )}
        <div className="mi-perfil-nombre">{perfil.nombre}</div>
        <div className="mi-perfil-rol">
          {sinDorsalUsuarioActual ? (
            <TextoConSignoGenero texto={perfil.categoria || perfil.rol} />
          ) : (
            <>
              {perfil.rol} · <TextoConSignoGenero texto={perfil.categoria || 'Sin categoría'} />
              {edadLimpia ? ` · ${edadLimpia} años` : ''}
            </>
          )}
        </div>
        {perfil.telefono && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Tel: {perfil.telefono}
          </div>
        )}
        <button type="button" className="btn-primary" onClick={handleAbrirEditarPerfil}>
          Editar foto, nombre, dorsal, edad, teléfono o contraseña
        </button>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          App creada por <strong>{NOMBRE_CREADOR_APP}</strong>
        </div>
      </div>
    </div>
  );
}

const DEMO_PARTIDOS = [
  {
    id: 'demo1',
    categoria: 'Senior ♂',
    local: 'C.D. Rafael Altamira FS',
    visitante: 'Picanya Futsal B',
    fecha: 'Sábado 18:30',
    pabellon: 'Pabellón Municipal Picanya',
    resultado: 'VS',
    asistentes: ['Carlos M.', 'Javier G.', 'Marc N.']
  },
  {
    id: 'demo2',
    categoria: 'Juvenil ♂',
    local: 'Torrent FS',
    visitante: 'C.D. Rafael Altamira FS',
    fecha: 'Domingo 11:00',
    pabellon: 'Pabellón visitante (Torrent FS)',
    resultado: '3 - 5',
    asistentes: ['Alejandro R.']
  }
];

const DEMO_CLASIFICACION = [
  { id: 'c1', pos: 1, equipo: 'C.D. Rafael Altamira FS', pts: 25, pj: 10, pg: 8, pe: 1, pp: 1, gf: 42, gc: 18, dif: 24, escudo: '' },
  { id: 'c2', pos: 2, equipo: 'Torrent FS', pts: 22, pj: 10, pg: 7, pe: 1, pp: 2, gf: 38, gc: 21, dif: 17, escudo: '' },
  { id: 'c3', pos: 3, equipo: 'Picanya Futsal B', pts: 19, pj: 10, pg: 6, pe: 1, pp: 3, gf: 31, gc: 24, dif: 7, escudo: '' },
  { id: 'c4', pos: 4, equipo: 'Paiporta FS', pts: 15, pj: 10, pg: 5, pe: 0, pp: 5, gf: 27, gc: 30, dif: -3, escudo: '' }
];

const DEMO_PLANTILLA = [
  { id: 'p1', dorsal: '10', nombre: 'Marc Navarro', posicion: 'Pívot', categoria: 'Senior ♂', edad: '24', goles: 14, foto: '', telefono: '' },
  { id: 'p2', dorsal: '7', nombre: 'Alejandro Ruiz', posicion: 'Ala', categoria: 'Senior ♂', edad: '22', goles: 11, foto: '', telefono: '' },
  { id: 'p3', dorsal: '4', nombre: 'Javier Gómez', posicion: 'Cierre', categoria: 'Senior ♂', edad: '25', goles: 6, foto: '', telefono: '' },
  { id: 'p4', dorsal: '1', nombre: 'Carlos Martínez', posicion: 'Portero', categoria: 'Senior ♂', edad: '27', goles: 1, foto: '', telefono: '' }
];

const DEMO_AVISOS = [
  {
    id: 'a1',
    titulo: 'Convocatoria Jornada Fin de Semana',
    mensaje: 'Todos los convocados deben estar 45 minutos antes en el pabellón con equipación azul.',
    urgente: true,
    autor: 'Directiva'
  },
  {
    id: 'a2',
    titulo: 'Cuotas y Reconocimientos Médicos',
    mensaje: 'Recordamos entregar la ficha médica firmada en la oficina del club.',
    urgente: false,
    autor: 'Directiva'
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
  { categoria: 'Senior ♂ / ♀', dias: 'Martes y Jueves · 20:30 - 22:00' },
  { categoria: 'Juvenil / Cadete ♂ / ♀', dias: 'Lunes y Miércoles · 18:30 - 20:00' },
  { categoria: 'Escuela / Base ♂ / ♀', dias: 'Martes y Jueves · 17:30 - 18:45' }
];

function perfilJugadorCompleto(p) {
  if (!p) return false;
  if (esRolSinDorsal(p.rol)) {
    return Boolean(p.nombre && p.nombre.trim().length >= 2 && p.pinUsuario && String(p.pinUsuario).trim().length >= 4);
  }
  const nombreOk = Boolean(p.nombre && p.nombre.trim().length >= 2);
  const dorsalOk = Boolean(p.dorsal && String(p.dorsal).trim().length > 0 && String(p.dorsal).trim() !== '0');
  const categoriaOk = Boolean(p.categoria && String(p.categoria).trim().length > 0);
  const telefonoOk = Boolean(limpiarTelefono(p.telefono).length >= 6);
  const edadOk = Boolean(normalizarEdad(p.edad));
  const pinOk = Boolean(p.pinUsuario && String(p.pinUsuario).trim().length >= 4);
  return nombreOk && dorsalOk && categoriaOk && telefonoOk && edadOk && pinOk;
}

function deduplicarPerfilesLista(lista) {
  const mapa = new Map();
  for (const item of lista || []) {
    if (!item || (!item.nombre && !item.dorsal && !item.foto && !item.rol)) continue;
    const clave = obtenerClaveUnicaPerfil(item);
    const existente = mapa.get(clave);
    if (!existente) {
      mapa.set(clave, item);
    } else {
      mapa.set(clave, {
        ...existente,
        ...item,
        foto: item.foto || existente.foto || '',
        telefono: limpiarTelefono(item.telefono || existente.telefono || ''),
        edad: normalizarEdad(item.edad || existente.edad || ''),
        pinUsuario: item.pinUsuario || existente.pinUsuario || ''
      });
    }
  }
  return Array.from(mapa.values());
}

export default function App() {
  const [tab, setTabState] = useState(() => {
    const savedTab = localStorage.getItem('cdra_tab_activa') || 'partidos';
    return savedTab === 'chat' ? 'partidos' : savedTab;
  });
  const setTab = (nuevaTab) => {
    const segura = nuevaTab === 'chat' ? 'partidos' : nuevaTab;
    setTabState(segura);
    guardarLocalSeguro('cdra_tab_activa', segura);
  };

  const irAAvisosAlEntrar = () => {
    setAvisosSubtab('avisos');
    setTab('avisos');
  };

  const [partidosSubtab, setPartidosSubtab] = useState('proximos');
  const [ligaSubtab, setLigaSubtab] = useState('tabla');
  const [avisosSubtab, setAvisosSubtab] = useState('avisos');
  const [perfilSubtab, setPerfilSubtab] = useState('mi-perfil');
  const [generoPerfilesTab, setGeneroPerfilesTab] = useState('masculina');
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('cdra_admin_activa') === '1');
  const [firebaseOk, setFirebaseOk] = useState(false);
  const [refrescandoDatos, setRefrescandoDatos] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showImportBox, setShowImportBox] = useState(false);
  const [showImportTablaBox, setShowImportTablaBox] = useState(false);
  const [textoImportarPartidos, setTextoImportarPartidos] = useState('');
  const [textoImportarClasificacion, setTextoImportarClasificacion] = useState('');
  const [urlsSincronizacion, setUrlsSincronizacion] = useState(() =>
    leerListaLocal('cdra_urls_partidos', URLS_POR_DEFECTO)
  );
  const [nuevaUrlInput, setNuevaUrlInput] = useState('');
  const [sincronizandoUrls, setSincronizandoUrls] = useState(false);
  const [escudoCargado, setEscudoCargado] = useState(true);

  const [permisoNotifMovil, setPermisoNotifMovil] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [alertaAvisoEntrante, setAlertaAvisoEntrante] = useState(null);
  const avisosVistosRef = useRef(new Set());
  const inicializadoAvisosRef = useRef(false);
  const nombreUsuarioActualRef = useRef('');

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
          categoria: '',
          dorsal: '',
          telefono: '',
          edad: '',
          foto: '',
          pinUsuario: '',
          esReservaDirectiva: false
        };
  });

  useEffect(() => {
    nombreUsuarioActualRef.current = (perfil?.nombre || '').trim().toLowerCase();
  }, [perfil?.nombre]);

  const [perfilesClub, setPerfilesClub] = useState(() =>
    deduplicarPerfilesLista(leerListaLocal('cdra_perfiles_club', []))
  );

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
  const [formCategoria, setFormCategoria] = useState(perfil.categoria || '');
  const [formDorsal, setFormDorsal] = useState(perfil.dorsal === '0' ? '' : (perfil.dorsal || ''));
  const [formTelefono, setFormTelefono] = useState(perfil.telefono || '');
  const [formEdad, setFormEdad] = useState(perfil.edad || '');
  const [formFoto, setFormFoto] = useState(perfil.foto || '');
  const [formPinNuevo, setFormPinNuevo] = useState(perfil.pinUsuario || '');
  const [formPinConfirm, setFormPinConfirm] = useState(perfil.pinUsuario || '');

  const [nuevoPerfilEspecial, setNuevoPerfilEspecial] = useState({
    rolEspecial: 'Entrenador',
    nombre: '',
    pinUsuario: '',
    foto: ''
  });

  const rolActual = String(perfil?.rol || '').toLowerCase();
  const puedeVerTelefonosPrivados =
    Boolean(isAdmin) ||
    rolActual.includes('entrenador') ||
    rolActual.includes('directiva');
  const puedeGestionarAlaYGoles =
    Boolean(isAdmin) ||
    rolActual.includes('entrenador') ||
    rolActual.includes('directiva');
  const puedePublicarAvisos =
    Boolean(isAdmin) ||
    rolActual.includes('entrenador') ||
    rolActual.includes('directiva');
  const sinDorsalUsuarioActual = esRolSinDorsal(perfil?.rol);

  const [partidos, setPartidos] = useState(() => leerListaLocal('cdra_partidos_local', DEMO_PARTIDOS));
  const [clasificacion, setClasificacion] = useState(() => leerListaLocal('cdra_clasificacion_local', DEMO_CLASIFICACION));
  const [plantilla, setPlantilla] = useState(() => leerListaLocal('cdra_plantilla_local', DEMO_PLANTILLA));
  const [avisos, setAvisos] = useState(() => leerListaLocal('cdra_avisos_local', DEMO_AVISOS));

  const partidosLenRef = useRef(partidos.length);
  const clasifLenRef = useRef(clasificacion.length);
  const plantillaLenRef = useRef(plantilla.length);

  useEffect(() => {
    partidosLenRef.current = partidos.length;
    clasifLenRef.current = clasificacion.length;
    plantillaLenRef.current = plantilla.length;
  }, [partidos.length, clasificacion.length, plantilla.length]);

  const dispararNotificacionMovilAviso = useCallback((avisoObj) => {
    if (!avisoObj) return;
    setAlertaAvisoEntrante({
      id: avisoObj.id || `noti_${Date.now()}`,
      titulo: avisoObj.titulo || 'Nuevo aviso del club',
      mensaje: avisoObj.mensaje || '',
      urgente: Boolean(avisoObj.urgente),
      autor: avisoObj.autor || 'Directiva / Entrenador'
    });

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const prefijo = avisoObj.urgente ? '🚨 URGENTE · ' : '🔔 ';
        const noti = new Notification(`${prefijo}${avisoObj.titulo || 'Aviso C.D. Rafael Altamira'}`, {
          body: `${avisoObj.mensaje || ''}${avisoObj.autor ? ` (${avisoObj.autor})` : ''}`,
          icon: '/escudo.png',
          tag: avisoObj.id || `aviso_${Date.now()}`
        });
        noti.onclick = () => {
          window.focus();
          setTab('avisos');
          setAvisosSubtab('avisos');
        };
      } catch {
        // Fallback visual en pantalla si el navegador bloquea la llamada directa
      }
    }
  }, []);

  const solicitarPermisoNotificacionesMovil = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Este navegador no soporta notificaciones nativas del sistema, pero verás las alertas destacadas dentro de la app.');
      return;
    }
    try {
      const resultado = await Notification.requestPermission();
      setPermisoNotifMovil(resultado);
      if (resultado === 'granted') {
        new Notification('C.D. Rafael Altamira', {
          body: 'Notificaciones activadas. Te avisaremos cuando haya un aviso nuevo.',
          icon: '/escudo.png'
        });
      } else if (resultado === 'denied') {
        alert('Has bloqueado las notificaciones del navegador. Puedes activarlas en los ajustes del sitio en tu móvil.');
      }
    } catch {
      alert('No se pudo solicitar el permiso de notificaciones en este dispositivo.');
    }
  };

  const guardarPartidosLocal = (lista) => {
    setPartidos(lista);
    guardarLocalSeguro('cdra_partidos_local', lista);
  };

  const guardarClasificacionLocal = (lista) => {
    setClasificacion(lista);
    guardarLocalSeguro('cdra_clasificacion_local', lista);
  };

  const guardarPlantillaLocal = (lista) => {
    setPlantilla(lista);
    guardarLocalSeguro('cdra_plantilla_local', lista);
  };

  const guardarAvisosLocal = (lista) => {
    setAvisos(lista);
    guardarLocalSeguro('cdra_avisos_local', lista);
  };

  const guardarPerfilesLocal = (lista) => {
    const limpia = deduplicarPerfilesLista(lista);
    setPerfilesClub(limpia);
    guardarLocalSeguro('cdra_perfiles_club', limpia);
  };

  const cargarPerfilesSiToca = useCallback(async (forzar = false) => {
    const ahora = Date.now();
    const ultimaSyncPerfiles = Number(localStorage.getItem('cdra_last_sync_perfiles_at') || '0');
    if (!forzar && ahora - ultimaSyncPerfiles < TTL_SINCRONIZACION_MS) {
      return;
    }
    try {
      const snapPerfiles = await getDocs(query(collection(db, 'perfiles'), limit(30)));
      setFirebaseOk(true);
      guardarLocalSeguro('cdra_last_sync_perfiles_at', String(Date.now()));
      if (!snapPerfiles.empty) {
        const docsPerfiles = snapPerfiles.docs.map((d) => ({ id: d.id, ...d.data() }));
        const limpia = deduplicarPerfilesLista(docsPerfiles);
        setPerfilesClub(limpia);
        guardarLocalSeguro('cdra_perfiles_club', limpia);
      }
    } catch {
      // Mantiene datos locales
    }
  }, []);

  const cargarDatosUnaVez = useCallback(async (forzar = false, incluirPerfiles = false) => {
    const ahora = Date.now();
    const ultimaSync = Number(localStorage.getItem('cdra_last_sync_at') || '0');
    const tieneDatosLocales =
      partidosLenRef.current > 0 || clasifLenRef.current > 0 || plantillaLenRef.current > 0;

    if (!forzar && tieneDatosLocales && ahora - ultimaSync < TTL_SINCRONIZACION_MS) {
      setFirebaseOk(true);
      if (incluirPerfiles) {
        await cargarPerfilesSiToca(false);
      }
      return;
    }

    setRefrescandoDatos(true);
    try {
      const peticiones = [
        getDocs(query(collection(db, 'partidos'), orderBy('createdAt', 'desc'), limit(20))),
        getDocs(query(collection(db, 'clasificacion'), orderBy('pts', 'desc'), limit(MAX_EQUIPOS_CLASIFICACION))),
        getDocs(query(collection(db, 'plantilla'), orderBy('createdAt', 'asc'), limit(30))),
        getDocs(query(collection(db, 'avisos'), orderBy('createdAt', 'desc'), limit(10)))
      ];
      if (incluirPerfiles || forzar) {
        peticiones.push(getDocs(query(collection(db, 'perfiles'), limit(30))));
      }

      const resultados = await Promise.all(peticiones);
      const [snapPartidos, snapClasif, snapPlantilla, snapAvisos, snapPerfiles] = resultados;

      setFirebaseOk(true);
      const ahoraSync = String(Date.now());
      guardarLocalSeguro('cdra_last_sync_at', ahoraSync);

      if (!snapPartidos.empty) {
        const docsPartidos = snapPartidos.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPartidos(docsPartidos);
        guardarLocalSeguro('cdra_partidos_local', docsPartidos);
      }

      if (!snapClasif.empty) {
        const docsClasif = snapClasif.docs.map((d) => ({ id: d.id, ...d.data() }));
        setClasificacion(docsClasif);
        guardarLocalSeguro('cdra_clasificacion_local', docsClasif);
      }

      if (!snapPlantilla.empty) {
        const docsPlantilla = snapPlantilla.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPlantilla(docsPlantilla);
        guardarLocalSeguro('cdra_plantilla_local', docsPlantilla);
      }

      if (!snapAvisos.empty) {
        const docsAvisos = snapAvisos.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAvisos(docsAvisos);
        guardarLocalSeguro('cdra_avisos_local', docsAvisos);

        if (!inicializadoAvisosRef.current) {
          docsAvisos.forEach((item) => avisosVistosRef.current.add(item.id));
          inicializadoAvisosRef.current = true;
        } else {
          const nuevosAvisos = docsAvisos.filter((item) => !avisosVistosRef.current.has(item.id));
          docsAvisos.forEach((item) => avisosVistosRef.current.add(item.id));
          if (nuevosAvisos.length > 0) {
            const ultimo = nuevosAvisos[0];
            const autorActual = nombreUsuarioActualRef.current;
            const autorAviso = (ultimo.autor || '').trim().toLowerCase();
            if (!autorActual || !autorAviso || autorActual !== autorAviso) {
              dispararNotificacionMovilAviso(ultimo);
            }
          }
        }
      }

      if (snapPerfiles) {
        guardarLocalSeguro('cdra_last_sync_perfiles_at', ahoraSync);
        if (!snapPerfiles.empty) {
          const docsPerfiles = snapPerfiles.docs.map((d) => ({ id: d.id, ...d.data() }));
          const limpia = deduplicarPerfilesLista(docsPerfiles);
          setPerfilesClub(limpia);
          guardarLocalSeguro('cdra_perfiles_club', limpia);
        }
      }
    } catch {
      setFirebaseOk(false);
    } finally {
      setRefrescandoDatos(false);
    }
  }, [cargarPerfilesSiToca, dispararNotificacionMovilAviso]);

  useEffect(() => {
    if (sesionIniciada && tab === 'perfil') {
      cargarPerfilesSiToca(false);
    }
  }, [sesionIniciada, tab, cargarPerfilesSiToca]);

  const existeDorsalEnCategoria = (dorsalCandidato, categoriaCandidata, idAExcluir = '', nombreAExcluir = '') => {
    const dNorm = normalizarDorsal(dorsalCandidato);
    const cNorm = normalizarCategoria(categoriaCandidata);
    if (!dNorm || dNorm === '0' || !cNorm) return false;

    const nombreExcluido = String(nombreAExcluir || '').trim().toLowerCase();

    const chocaEnPerfiles = perfilesClub.some((item) => {
      if (esRolSinDorsal(item.rol)) return false;
      if (idAExcluir && item.id === idAExcluir) return false;
      if (nombreExcluido && item.nombre && item.nombre.trim().toLowerCase() === nombreExcluido) {
        return false;
      }
      return mismaCategoriaYDorsal(dNorm, cNorm, item.dorsal, item.categoria);
    });

    if (chocaEnPerfiles) return true;

    const idJugadorExcluido = idAExcluir ? `reg_${idAExcluir}` : '';
    const chocaEnPlantilla = plantilla.some((jug) => {
      if (idJugadorExcluido && jug.id === idJugadorExcluido) return false;
      if (nombreExcluido && jug.nombre && jug.nombre.trim().toLowerCase() === nombreExcluido) {
        return false;
      }
      return mismaCategoriaYDorsal(dNorm, cNorm, jug.dorsal, jug.categoria);
    });

    if (chocaEnPlantilla) return true;

    if (perfil && !esRolSinDorsal(perfil.rol) && perfil.nombre) {
      const idPerfilActivo = crearIdPerfil(perfil.nombre, perfil.dorsal, perfil.correo || '', perfil.rol || '');
      const mismoUsuario =
        (idAExcluir && idPerfilActivo === idAExcluir) ||
        (nombreExcluido && perfil.nombre.trim().toLowerCase() === nombreExcluido);
      if (!mismoUsuario && mismaCategoriaYDorsal(dNorm, cNorm, perfil.dorsal, perfil.categoria)) {
        return true;
      }
    }

    return false;
  };

  const sincronizarJugadorEnPlantilla = async (perfilDatos, incluirFoto = true) => {
    if (esRolSinDorsal(perfilDatos.rol)) return;
    const idJugador = `reg_${crearIdPerfil(perfilDatos.nombre, perfilDatos.dorsal, perfilDatos.correo || '', perfilDatos.rol || '')}`;
    const telefonoLimpio = limpiarTelefono(perfilDatos.telefono);
    const edadLimpia = normalizarEdad(perfilDatos.edad);
    const existente = plantilla.find((j) => j.id === idJugador);
    const jugadorDoc = {
      dorsal: String(perfilDatos.dorsal).trim(),
      nombre: perfilDatos.nombre.trim(),
      posicion: existente?.posicion || 'Sin asignar',
      categoria: perfilDatos.categoria || '',
      telefono: telefonoLimpio,
      edad: edadLimpia,
      goles: existente?.goles ?? 0,
      ...(incluirFoto ? { foto: perfilDatos.foto || '' } : {}),
      createdAt: serverTimestamp()
    };

    const sinDuplicado = plantilla.filter((j) => j.id !== idJugador);
    const nuevaPlantilla = [
      ...sinDuplicado,
      { id: idJugador, ...jugadorDoc, foto: perfilDatos.foto || existente?.foto || '' }
    ];
    guardarPlantillaLocal(nuevaPlantilla);

    if (firebaseOk) {
      try {
        await setDoc(doc(db, 'plantilla', idJugador), jugadorDoc, { merge: true });
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const sincronizarPerfilEnClub = async (perfilDatos, fotoAnterior = '') => {
    const esEspecial = esRolSinDorsal(perfilDatos.rol);
    const dorsalRaw = String(perfilDatos.dorsal || '').trim();
    const dorsalLimpio = (esEspecial || dorsalRaw === '0') ? '' : dorsalRaw;
    const categoriaLimpia = esEspecial ? (perfilDatos.rol || 'Entrenador') : (perfilDatos.categoria || '');
    const telefonoLimpio = limpiarTelefono(perfilDatos.telefono);
    const edadLimpia = esEspecial ? '' : normalizarEdad(perfilDatos.edad);
    const idDoc = crearIdPerfil(perfilDatos.nombre, dorsalLimpio, perfilDatos.correo || '', perfilDatos.rol || '');
    const fotoNueva = perfilDatos.foto || '';
    const fotoHaCambiado = fotoNueva !== (fotoAnterior || '');

    const registroPublico = {
      id: idDoc,
      nombre: perfilDatos.nombre.trim(),
      correo: (perfilDatos.correo || '').trim().toLowerCase(),
      rol: perfilDatos.rol || 'Jugador',
      categoria: categoriaLimpia,
      dorsal: dorsalLimpio,
      telefono: telefonoLimpio,
      edad: edadLimpia,
      ...(fotoHaCambiado ? { foto: fotoNueva } : {}),
      pinUsuario: perfilDatos.pinUsuario || '',
      esReservaDirectiva: Boolean(perfilDatos.esReservaDirectiva || esEspecial),
      tipoSlot: perfilDatos.tipoSlot || (esEspecial ? perfilDatos.rol : ''),
      actualizadoEn: serverTimestamp()
    };

    const claveNueva = obtenerClaveUnicaPerfil(registroPublico);
    const sinDuplicado = perfilesClub.filter(
      (item) => item.id !== idDoc && obtenerClaveUnicaPerfil(item) !== claveNueva
    );
    const nuevaLista = [{ ...registroPublico, foto: fotoNueva }, ...sinDuplicado];
    guardarPerfilesLocal(nuevaLista);

    if (firebaseOk) {
      try {
        await setDoc(doc(db, 'perfiles', idDoc), registroPublico, { merge: true });
      } catch {
        // Mantiene respaldo local
      }
    }

    if (!esEspecial) {
      await sincronizarJugadorEnPlantilla(
        {
          ...perfilDatos,
          dorsal: dorsalLimpio,
          categoria: categoriaLimpia,
          telefono: telefonoLimpio,
          edad: edadLimpia
        },
        fotoHaCambiado
      );
    }
  };

  const handleIniciarSesion = (e) => {
    e.preventDefault();
    const idRaw = identificadorLoginInput.trim();
    const idIntroducido = idRaw.toLowerCase();
    const pinIntroducido = pinLoginInput.trim();

    if (!pinIntroducido) {
      alert('Introduce tu contraseña o PIN.');
      return;
    }

    if (pinIntroducido === pinDirectiva || pinIntroducido === PIN_DIRECTIVA_INICIAL) {
      const perfilDir = {
        nombre: idRaw || 'Directiva',
        correo: idIntroducido.includes('@') ? idIntroducido : '',
        rol: 'Directiva',
        categoria: 'Directiva',
        dorsal: '',
        telefono: limpiarTelefono(perfil.telefono || ''),
        edad: normalizarEdad(perfil.edad || ''),
        foto: perfil.foto || '',
        pinUsuario: pinIntroducido,
        esReservaDirectiva: false
      };
      setPerfil(perfilDir);
      guardarLocalSeguro('cdra_perfil', perfilDir);
      guardarLocalSeguro('cdra_sesion_activa', '1');
      guardarLocalSeguro('cdra_admin_activa', '1');
      setIsAdmin(true);
      setSesionIniciada(true);
      setForzarOnboarding(false);
      setPinLoginInput('');
      irAAvisosAlEntrar();
      return;
    }

    if (!idIntroducido) {
      alert('Introduce tu nombre o seudónimo.');
      return;
    }

    if (pinIntroducido === PIN_INICIAL_OBLIGATORIO) {
      const perfilInicial = {
        nombre: idRaw,
        correo: idIntroducido.includes('@') ? idIntroducido : '',
        rol: 'Jugador',
        categoria: '',
        dorsal: '',
        telefono: '',
        edad: '',
        foto: '',
        pinUsuario: '',
        esReservaDirectiva: false
      };
      setPerfil(perfilInicial);
      setFormNombre(perfilInicial.nombre);
      setFormCorreo(perfilInicial.correo);
      setFormRol('Jugador');
      setFormCategoria('');
      setFormDorsal('');
      setFormTelefono('');
      setFormEdad('');
      setFormFoto('');
      setFormPinNuevo('');
      setFormPinConfirm('');
      guardarLocalSeguro('cdra_perfil', perfilInicial);
      guardarLocalSeguro('cdra_sesion_activa', '1');
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
        const esEspecial = esRolSinDorsal(coincidenciaIdentidad.rol);
