import React, { useState, useEffect, useRef } from 'react';
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
  UserPlus,
  Download,
  CopyX
} from 'lucide-react';

const PIN_INICIAL_OBLIGATORIO = '1234';
const PIN_DIRECTIVA_INICIAL = '1980';
const MAX_PERFILES_ESPECIALES_DIRECTIVA = 4;
const MAX_PARTIDOS_POR_IMPORTACION = 80;
const MAX_EQUIPOS_CLASIFICACION = 60;

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
  const claveBase = correo.trim()
    ? `${nombre}_${correo}_${dorsal || 'sin_dorsal'}`
    : `${nombre}_${dorsal || 'sin_dorsal'}`;
  const base = claveBase
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || `perfil_${Date.now()}`;
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
      boxRef.current.style.setProperty('display', 'flex', 'important');
      boxRef.current.style.setProperty('align-items', 'center', 'important');
      boxRef.current.style.setProperty('justify-content', 'center', 'important');
      boxRef.current.style.setProperty('flex-shrink', '0', 'important');
      boxRef.current.style.setProperty('margin', '0 auto', 'important');
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
        fontSize: `${Math.max(13, Math.round(tamano * 0.36))}px`,
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
            </>
          )}
        </div>
        <button type="button" className="btn-primary" onClick={handleAbrirEditarPerfil}>
          Editar foto, nombre, dorsal o contraseña
        </button>
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
  { id: 'p1', dorsal: '10', nombre: 'Marc Navarro', posicion: 'Pívot', categoria: 'Senior ♂', goles: 14, foto: '' },
  { id: 'p2', dorsal: '7', nombre: 'Alejandro Ruiz', posicion: 'Ala', categoria: 'Senior ♂', goles: 11, foto: '' },
  { id: 'p3', dorsal: '4', nombre: 'Javier Gómez', posicion: 'Cierre', categoria: 'Senior ♂', goles: 6, foto: '' },
  { id: 'p4', dorsal: '1', nombre: 'Carlos Martínez', posicion: 'Portero', categoria: 'Senior ♂', goles: 1, foto: '' }
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
  const fotoOk = Boolean(p.foto && p.foto.length > 0);
  const pinOk = Boolean(p.pinUsuario && String(p.pinUsuario).trim().length >= 4);
  return nombreOk && dorsalOk && categoriaOk && fotoOk && pinOk;
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

  const [partidosSubtab, setPartidosSubtab] = useState('proximos');
  const [ligaSubtab, setLigaSubtab] = useState('tabla');
  const [avisosSubtab, setAvisosSubtab] = useState('avisos');
  const [perfilSubtab, setPerfilSubtab] = useState('mi-perfil');
  const [generoPerfilesTab, setGeneroPerfilesTab] = useState('masculina');
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('cdra_admin_activa') === '1');
  const [firebaseOk, setFirebaseOk] = useState(false);
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
  const [formCategoria, setFormCategoria] = useState(perfil.categoria || '');
  const [formDorsal, setFormDorsal] = useState(perfil.dorsal === '0' ? '' : (perfil.dorsal || ''));
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
  const puedeGestionarAlaYGoles =
    Boolean(isAdmin) ||
    rolActual.includes('entrenador') ||
    rolActual.includes('directiva');
  const sinDorsalUsuarioActual = esRolSinDorsal(perfil?.rol);

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

  const guardarPerfilesLocal = (lista) => {
    setPerfilesClub(lista);
    localStorage.setItem('cdra_perfiles_club', JSON.stringify(lista));
  };

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
      const idPerfilActivo = crearIdPerfil(perfil.nombre, perfil.dorsal, perfil.correo || '');
      const mismoUsuario =
        (idAExcluir && idPerfilActivo === idAExcluir) ||
        (nombreExcluido && perfil.nombre.trim().toLowerCase() === nombreExcluido);
      if (!mismoUsuario && mismaCategoriaYDorsal(dNorm, cNorm, perfil.dorsal, perfil.categoria)) {
        return true;
      }
    }

    return false;
  };

  const sincronizarJugadorEnPlantilla = async (perfilDatos) => {
    if (esRolSinDorsal(perfilDatos.rol)) return;
    const idJugador = `reg_${crearIdPerfil(perfilDatos.nombre, perfilDatos.dorsal, perfilDatos.correo || '')}`;
    const jugadorDoc = {
      dorsal: String(perfilDatos.dorsal).trim(),
      nombre: perfilDatos.nombre.trim(),
      posicion: 'Sin asignar',
      categoria: perfilDatos.categoria || '',
      goles: 0,
      foto: perfilDatos.foto || '',
      createdAt: serverTimestamp()
    };

    const sinDuplicado = plantilla.filter((j) => j.id !== idJugador);
    const nuevaPlantilla = [...sinDuplicado, { id: idJugador, ...jugadorDoc }];
    guardarPlantillaLocal(nuevaPlantilla);

    if (firebaseOk) {
      try {
        await setDoc(doc(db, 'plantilla', idJugador), jugadorDoc, { merge: true });
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const sincronizarPerfilEnClub = async (perfilDatos) => {
    const esEspecial = esRolSinDorsal(perfilDatos.rol);
    const dorsalRaw = String(perfilDatos.dorsal || '').trim();
    const dorsalLimpio = (esEspecial || dorsalRaw === '0') ? '' : dorsalRaw;
    const categoriaLimpia = esEspecial ? (perfilDatos.rol || 'Entrenador') : (perfilDatos.categoria || '');
    const idDoc = crearIdPerfil(perfilDatos.nombre, dorsalLimpio, perfilDatos.correo || '');
    const registroPublico = {
      id: idDoc,
      nombre: perfilDatos.nombre.trim(),
      correo: (perfilDatos.correo || '').trim().toLowerCase(),
      rol: perfilDatos.rol || 'Jugador',
      categoria: categoriaLimpia,
      dorsal: dorsalLimpio,
      foto: perfilDatos.foto || '',
      pinUsuario: perfilDatos.pinUsuario || '',
      esReservaDirectiva: Boolean(perfilDatos.esReservaDirectiva || esEspecial),
      tipoSlot: perfilDatos.tipoSlot || (esEspecial ? perfilDatos.rol : ''),
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

    if (!esEspecial) {
      await sincronizarJugadorEnPlantilla({ ...perfilDatos, dorsal: dorsalLimpio, categoria: categoriaLimpia });
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
        const esEspecial = esRolSinDorsal(coincidenciaIdentidad.rol);
        const dorsalItem = String(coincidenciaIdentidad.dorsal || '').trim();
        const perfilRecuperado = {
          nombre: coincidenciaIdentidad.nombre || idRaw,
          correo: coincidenciaIdentidad.correo || (idIntroducido.includes('@') ? idIntroducido : ''),
          rol: coincidenciaIdentidad.rol || 'Jugador',
          categoria: esEspecial ? (coincidenciaIdentidad.rol || 'Entrenador') : (coincidenciaIdentidad.categoria || ''),
          dorsal: (esEspecial || dorsalItem === '0') ? '' : dorsalItem,
          foto: coincidenciaIdentidad.foto || '',
          pinUsuario: coincidenciaIdentidad.pinUsuario,
          esReservaDirectiva: Boolean(coincidenciaIdentidad.esReservaDirectiva || esEspecial),
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
    const esEspecial = esRolSinDorsal(formRol);
    const dorsalRaw = String(formDorsal || '').trim();
    const dorsalLimpio = (esEspecial || dorsalRaw === '0') ? '' : dorsalRaw;
    const categoriaLimpia = esEspecial ? (formRol || 'Entrenador') : String(formCategoria).trim();
    const pinLimpio = formPinNuevo.trim();

    if (nombreLimpio.length < 2) {
      alert('El campo Nombre / Seudónimo * es obligatorio.');
      return;
    }
    if (!esEspecial && !dorsalLimpio) {
      alert('El campo Dorsal * es obligatorio (y distinto de 0).');
      return;
    }
    if (!esEspecial && !categoriaLimpia) {
      alert('El campo Categoría * es obligatorio.');
      return;
    }
    const idActualPerfil = perfil?.nombre
      ? crearIdPerfil(perfil.nombre, perfil.dorsal, perfil.correo || '')
      : '';
    if (
      !esEspecial &&
      existeDorsalEnCategoria(dorsalLimpio, categoriaLimpia, idActualPerfil, perfil?.nombre || '')
    ) {
      alert(`ERROR: Ya existe un jugador con el dorsal #${dorsalLimpio} en ${categoriaLimpia}. No puede haber dos dorsales iguales en la misma categoría.`);
      return;
    }
    if (!esEspecial && !formFoto) {
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
      categoria: categoriaLimpia,
      dorsal: dorsalLimpio,
      foto: formFoto,
      pinUsuario: pinLimpio,
      esReservaDirectiva: esEspecial
    };

    setPerfil(perfilActualizado);
    localStorage.setItem('cdra_perfil', JSON.stringify(perfilActualizado));
    localStorage.setItem('cdra_sesion_activa', '1');
    setForzarOnboarding(false);
    setModoRegistroJugador(false);
    setSesionIniciada(true);
    await sincronizarPerfilEnClub(perfilActualizado);
    alert('¡Perfil guardado correctamente!');
  };

  const handleCrearPerfilEspecialDirectiva = async (e) => {
    e.preventDefault();
    const perfilesEspecialesActuales = perfilesClub.filter((p) => p.esReservaDirectiva || esRolSinDorsal(p.rol));
    if (perfilesEspecialesActuales.length >= MAX_PERFILES_ESPECIALES_DIRECTIVA) {
      alert('Ya has creado el máximo de 4 perfiles especiales. Borra uno si quieres crear otro.');
      return;
    }

    const nombreLimpio = nuevoPerfilEspecial.nombre.trim();
    const pinLimpio = nuevoPerfilEspecial.pinUsuario.trim();
    const rolElegido = nuevoPerfilEspecial.rolEspecial || 'Entrenador';

    if (nombreLimpio.length < 2) {
      alert('Escribe el nombre o seudónimo del perfil.');
      return;
    }
    if (pinLimpio.length < 4) {
      alert('Escribe una contraseña o PIN de al menos 4 caracteres.');
      return;
    }

    const idDoc = crearIdPerfil(nombreLimpio, rolElegido, 'especial');
    const registroEspecial = {
      id: idDoc,
      nombre: nombreLimpio,
      correo: '',
      rol: rolElegido,
      categoria: rolElegido,
      dorsal: '',
      foto: nuevoPerfilEspecial.foto || '',
      pinUsuario: pinLimpio,
      esReservaDirectiva: true,
      tipoSlot: rolElegido,
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
      rolEspecial: '2º Entrenador',
      nombre: '',
      pinUsuario: '',
      foto: ''
    });
    alert(`Perfil de ${rolElegido} creado correctamente sin dorsal.`);
  };

  const handleCerrarSesion = () => {
    localStorage.removeItem('cdra_sesion_activa');
    localStorage.removeItem('cdra_admin_activa');
    setSesionIniciada(false);
    setIsAdmin(false);
    setShowForm(false);
    setShowImportBox(false);
    setShowImportTablaBox(false);
    setForzarOnboarding(false);
    setModoRegistroJugador(false);
    setIdentificadorLoginInput('');
    setPinLoginInput('');
  };

  const handleAbrirEditarPerfil = () => {
    const dorsalActual = String(perfil.dorsal || '').trim();
    setFormNombre(perfil.nombre || '');
    setFormCorreo(perfil.correo || '');
    setFormRol(perfil.rol || 'Jugador');
    setFormCategoria(perfil.categoria || '');
    setFormDorsal(dorsalActual === '0' ? '' : dorsalActual);
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

  const [canalChat, setCanalChat] = useState('General');
  const [textoChat, setTextoChat] = useState('');

  const [nuevoPartido, setNuevoPartido] = useState({
    categoria: 'Senior ♂',
    local: 'C.D. Rafael Altamira FS',
    visitante: '',
    fecha: '',
    pabellon: 'Pabellón Municipal Picanya',
    resultado: 'VS'
  });

  const [nuevoEquipoTabla, setNuevoEquipoTabla] = useState({
    pos: '',
    equipo: '',
    pts: '0',
    pj: '0',
    pg: '0',
    pe: '0',
    pp: '0',
    gf: '0',
    gc: '0'
  });

  const [nuevoJugador, setNuevoJugador] = useState({
    dorsal: '',
    nombre: '',
    posicion: 'Ala',
    categoria: '',
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
      setShowImportBox(false);
      setShowImportTablaBox(false);
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
    if (!puedeGestionarAlaYGoles) return;
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
      rol: `${perfil.rol} · ${perfil.categoria || perfil.rol}`,
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

  const registrarPartidosSinDuplicar = async (candidatos) => {
    const clavesVistas = new Set(partidos.map((p) => normalizarClavePartido(p)));
    const unicos = [];

    for (const cand of candidatos) {
      if (unicos.length >= MAX_PARTIDOS_POR_IMPORTACION) break;

      const localCrudo = String(cand.local || '').trim();
      const visitanteCrudo = String(cand.visitante || '').trim();

      if (/^descansa(-\d+)?$/i.test(localCrudo) || /^descansa(-\d+)?$/i.test(visitanteCrudo)) {
        continue;
      }

      const esLocalAltamira = esEquipoClubAltamira(localCrudo);
      const esVisitanteAltamira = esEquipoClubAltamira(visitanteCrudo);

      if (!esLocalAltamira && !esVisitanteAltamira) {
        continue;
      }

      const fechaCandidata = String(cand.fecha || '').trim();
      const fechaDetectada =
        (fechaCandidata && !/^(próximamente|proximamente|por confirmar)$/i.test(fechaCandidata)
          ? fechaCandidata
          : '') ||
        extraerFechaDeTexto(`${fechaCandidata} ${localCrudo} ${visitanteCrudo}`) ||
        fechaCandidata ||
        'Por confirmar';

      let rivalLimpio = 'Rival por confirmar';
      if (esLocalAltamira && visitanteCrudo && !esVisitanteAltamira) {
        rivalLimpio = limpiarNombreRival(visitanteCrudo);
      } else if (esVisitanteAltamira && localCrudo && !esLocalAltamira) {
        rivalLimpio = limpiarNombreRival(localCrudo);
      } else if (visitanteCrudo && !esTextoFechaOJornada(visitanteCrudo)) {
        rivalLimpio = limpiarNombreRival(visitanteCrudo);
      } else if (localCrudo && !esTextoFechaOJornada(localCrudo)) {
        rivalLimpio = limpiarNombreRival(localCrudo);
      }

      const clubLocal = 'C.D. Rafael Altamira FS';
      const juegaFuera = Boolean(esVisitanteAltamira && !esLocalAltamira);

      const localFinal = juegaFuera
        ? rivalLimpio
        : clubLocal;

      const visitanteFinal = juegaFuera
        ? clubLocal
        : rivalLimpio;

      const pabellonCalculado = juegaFuera
        ? `Pabellón visitante (${rivalLimpio})`
        : 'Pabellón Municipal Picanya';

      const pabellonFinal =
        cand.pabellon &&
        !esTextoFechaOJornada(cand.pabellon) &&
        !(juegaFuera && /pabell[oó]n municipal picanya/i.test(cand.pabellon))
          ? cand.pabellon
          : pabellonCalculado;

      const itemLimpio = {
        categoria: cand.categoria || detectarCategoriaImportada(cand.categoriaTexto || ''),
        local: localFinal,
        visitante: visitanteFinal,
        fecha: fechaDetectada,
        pabellon: pabellonFinal,
        resultado: cand.resultado || 'VS'
      };

      const clave = normalizarClavePartido(itemLimpio);
      if (!clave || clavesVistas.has(clave)) continue;
      clavesVistas.add(clave);
      unicos.push(itemLimpio);
    }

    if (unicos.length === 0) return 0;

    const nuevosConId = unicos.map((item, idx) => ({
      id: `sync_${Date.now()}_${idx}`,
      ...item,
      asistentes: [],
      createdAt: serverTimestamp()
    }));

    const listaActualizada = [...nuevosConId, ...partidos];
    guardarPartidosLocal(listaActualizada);

    if (firebaseOk) {
      for (let i = 0; i < unicos.length; i++) {
        const payload = { ...unicos[i], asistentes: [], createdAt: serverTimestamp() };
        try {
          const ref = await addDoc(collection(db, 'partidos'), payload);
          const idTemp = nuevosConId[i].id;
          guardarPartidosLocal((prev) => prev.map((p) => (p.id === idTemp ? { ...p, id: ref.id } : p)));
        } catch {
          // Mantiene respaldo local si falla la red
        }
      }
    }

    return unicos.length;
  };

  const registrarClasificacionSinDuplicar = async (candidatos) => {
    const clavesExistentes = new Set(
      clasificacion.map((item) => normalizarNombreEquipoClasificacion(item.equipo))
    );
    const nuevos = [];

    for (const cand of candidatos) {
      if (nuevos.length >= MAX_EQUIPOS_CLASIFICACION) break;
      const nombreEq = sanearNombreEquipoTabla([String(cand.equipo || '').trim()]);
      const claveEq = normalizarNombreEquipoClasificacion(nombreEq);
      if (!nombreEq || !claveEq || clavesExistentes.has(claveEq)) continue;

      clavesExistentes.add(claveEq);
      const gf = Number(cand.gf || 0);
      const gc = Number(cand.gc || 0);
      nuevos.push({
        pos: Number(cand.pos || clasificacion.length + nuevos.length + 1),
        equipo: nombreEq,
        pts: Number(cand.pts || 0),
        pj: Number(cand.pj || 0),
        pg: Number(cand.pg || 0),
        pe: Number(cand.pe || 0),
        pp: Number(cand.pp || 0),
        gf,
        gc,
        dif: calcularDifClasificacion(gf, gc, cand.dif),
        escudo: cand.escudo || ''
      });
    }

    if (nuevos.length === 0) return 0;

    const nuevosConId = nuevos.map((item, idx) => ({
      id: `eq_sync_${Date.now()}_${idx}`,
      ...item
    }));

    const ordenada = [...clasificacion, ...nuevosConId].sort((a, b) => {
      const posA = Number(a.pos || 999);
      const posB = Number(b.pos || 999);
      if (posA !== posB) return posA - posB;
      if (Number(b.pts || 0) !== Number(a.pts || 0)) {
        return Number(b.pts || 0) - Number(a.pts || 0);
      }
      return calcularDifClasificacion(b.gf, b.gc, b.dif) - calcularDifClasificacion(a.gf, a.gc, a.dif);
    });

    guardarClasificacionLocal(ordenada);

    if (firebaseOk) {
      for (let i = 0; i < nuevos.length; i++) {
        try {
          const ref = await addDoc(collection(db, 'clasificacion'), nuevos[i]);
          const idTemp = nuevosConId[i].id;
          guardarClasificacionLocal((prev) =>
            prev.map((c) => (c.id === idTemp ? { ...c, id: ref.id } : c))
          );
        } catch {
          // Mantiene respaldo local
        }
      }
    }

    return nuevos.length;
  };

  const handleImportarClasificacionTexto = async (e) => {
    e.preventDefault();
    const parseados = parsearClasificacionDesdeTexto(textoImportarClasificacion);
    if (parseados.length === 0) {
      alert('No se detectaron filas de clasificación válidas en el texto pegado.');
      return;
    }

    const añadidos = await registrarClasificacionSinDuplicar(parseados);
    if (añadidos === 0) {
      alert('Esos equipos ya estaban en la clasificación (0 duplicados).');
      return;
    }

    setTextoImportarClasificacion('');
    setShowImportTablaBox(false);
    alert(`¡Se importaron ${añadidos} equipo(s) a la clasificación sin duplicados!`);
  };

  const handleLimpiarTablaCompleta = async () => {
    if (!isAdmin) return;
    if (!window.confirm('¿Vaciar toda la tabla de clasificación para volver a importarla limpia?')) {
      return;
    }
    const anteriores = [...clasificacion];
    guardarClasificacionLocal([]);
    if (firebaseOk) {
      for (const item of anteriores) {
        if (!/^c\d+$/.test(item.id)) {
          try {
            await deleteDoc(doc(db, 'clasificacion', item.id));
          } catch {
            // Ignora si no existía en Firestore
          }
        }
      }
    }
  };

  const handleSubirEscudoEquipo = async (equipoItem, file) => {
    if (!isAdmin || !file) return;
    procesarFotoCircular(file, async (dataUrl) => {
      const actualizada = clasificacion.map((c) =>
        c.id === equipoItem.id ? { ...c, escudo: dataUrl } : c
      );
      guardarClasificacionLocal(actualizada);
      if (firebaseOk && !/^c\d+$/.test(equipoItem.id)) {
        try {
          await updateDoc(doc(db, 'clasificacion', equipoItem.id), { escudo: dataUrl });
        } catch {
          // Mantiene respaldo local
        }
      }
    });
  };

  const handleLimpiarDuplicadosPartidos = async () => {
    const vistos = new Set();
    const unicos = [];
    const eliminados = [];

    for (const p of partidos) {
      const clave = normalizarClavePartido(p);
      if (!clave || vistos.has(clave)) {
        eliminados.push(p);
      } else {
        vistos.add(clave);
        unicos.push(p);
      }
    }

    if (eliminados.length === 0) {
      alert('No había partidos duplicados.');
      return;
    }

    guardarPartidosLocal(unicos);
    if (firebaseOk) {
      for (const item of eliminados) {
        if (!/^(demo|c|p|a|m)\d+$/.test(item.id)) {
          try {
            await deleteDoc(doc(db, 'partidos', item.id));
          } catch {
            // Ignora error si ya no existe
          }
        }
      }
    }
    alert(`Se eliminaron ${eliminados.length} partido(s) duplicado(s).`);
  };

  const handleLimpiarPartidosSinRival = async () => {
    const partidosValidos = partidos.filter((p) => {
      const rival = p.local === 'C.D. Rafael Altamira FS' ? p.visitante : p.local;
      return (
        !esNombreInvalidoOResidual(rival) &&
        !esTextoFechaOJornada(rival) &&
        !/^(próximamente|proximamente|por confirmar|rival por confirmar)$/i.test(String(rival || '').trim())
      );
    });
    const eliminados = partidos.filter((p) => !partidosValidos.some((v) => v.id === p.id));
    if (eliminados.length === 0) {
      alert('No hay partidos con fechas, jornadas o nombres incompletos como rival.');
      return;
    }
    guardarPartidosLocal(partidosValidos);
    if (firebaseOk) {
      for (const item of eliminados) {
        if (!/^(demo|c|p|a|m)\d+$/.test(item.id)) {
          try {
            await deleteDoc(doc(db, 'partidos', item.id));
          } catch {
            // Ignora error en documento inexistente
          }
        }
      }
    }
    alert(`Se eliminaron ${eliminados.length} partido(s) con datos incompletos o de fecha/jornada como rival.`);
  };

  const handleAgregarUrlSincronizacion = () => {
    const limpia = nuevaUrlInput.trim();
    if (!limpia) return;
    if (!urlsSincronizacion.includes(limpia)) {
      const actualizada = [...urlsSincronizacion, limpia];
      setUrlsSincronizacion(actualizada);
      localStorage.setItem('cdra_urls_partidos', JSON.stringify(actualizada));
    }
    setNuevaUrlInput('');
  };

  const handleQuitarUrlSincronizacion = (urlABorrar) => {
    const actualizada = urlsSincronizacion.filter((u) => u !== urlABorrar);
    setUrlsSincronizacion(actualizada);
    localStorage.setItem('cdra_urls_partidos', JSON.stringify(actualizada));
  };

  const handleSincronizarUrls = async () => {
    if (urlsSincronizacion.length === 0) {
      alert('Añade al menos una URL primero.');
      return;
    }
    setSincronizandoUrls(true);
    try {
      const resp = await fetch('/api/sincronizar-partidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlsSincronizacion })
      });
      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        alert(data.error || 'No se pudo completar la sincronización automática.');
        return;
      }

      const añadidos = await registrarPartidosSinDuplicar(data.partidos || []);
      const añadidosTabla = await registrarClasificacionSinDuplicar(data.clasificacion || []);
      const avisoBloqueos =
        data.errores && data.errores.length > 0
          ? `\nNota: algunas webs cargan contenido dinámico o restringen lectura directa (${data.errores.map((e) => e.motivo).join(', ')}). Usa "Pegar texto" para esas.`
          : '';

      alert(
        añadidos > 0 || añadidosTabla > 0
          ? `¡Listo! Se añadieron ${añadidos} partido(s) y ${añadidosTabla} equipo(s) en clasificación sin duplicados.${avisoBloqueos}`
          : `Todo al día: no había novedades que añadir (0 duplicados).${avisoBloqueos}`
      );
    } catch {
      alert('No se pudo conectar con /api/sincronizar-partidos. Usa el cuadro de "Pegar texto" si estás probando en local.');
    } finally {
      setSincronizandoUrls(false);
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
      categoria: 'Senior ♂',
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

  const handleImportarPartidosTexto = async (e) => {
    e.preventDefault();
    const parseados = parsearPartidosDesdeTexto(textoImportarPartidos);
    if (parseados.length === 0) {
      alert('No se encontraron partidos de C.D. Rafael Altamira en el texto pegado.');
      return;
    }

    const añadidos = await registrarPartidosSinDuplicar(parseados);
    if (añadidos === 0) {
      alert('Esos partidos ya estaban registrados en la app (0 duplicados).');
      return;
    }

    setTextoImportarPartidos('');
    setShowImportBox(false);
    alert(`¡Se importaron ${añadidos} partido(s) nuevo(s) sin duplicados!`);
  };

  const handleAddEquipoTabla = async (e) => {
    e.preventDefault();
    if (!nuevoEquipoTabla.equipo) return;
    const gf = Number(nuevoEquipoTabla.gf || 0);
    const gc = Number(nuevoEquipoTabla.gc || 0);
    const item = {
      pos: Number(nuevoEquipoTabla.pos || clasificacion.length + 1),
      equipo: sanearNombreEquipoTabla([nuevoEquipoTabla.equipo]),
      pts: Number(nuevoEquipoTabla.pts || 0),
      pj: Number(nuevoEquipoTabla.pj || 0),
      pg: Number(nuevoEquipoTabla.pg || 0),
      pe: Number(nuevoEquipoTabla.pe || 0),
      pp: Number(nuevoEquipoTabla.pp || 0),
      gf,
      gc,
      dif: calcularDifClasificacion(gf, gc),
      escudo: ''
    };
    const idTemporal = `eq_${Date.now()}`;
    const actualizada = [...clasificacion, { id: idTemporal, ...item }].sort((a, b) => Number(a.pos || 999) - Number(b.pos || 999));
    guardarClasificacionLocal(actualizada);
    setShowForm(false);
    setNuevoEquipoTabla({ pos: '', equipo: '', pts: '0', pj: '0', pg: '0', pe: '0', pp: '0', gf: '0', gc: '0' });
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
    const dorsalLimpio = String(nuevoJugador.dorsal || '').trim();
    const nombreLimpio = String(nuevoJugador.nombre || '').trim();
    const categoriaLimpia = String(nuevoJugador.categoria || '').trim();

    if (!dorsalLimpio) {
      alert('El campo Dorsal / Número * es obligatorio.');
      return;
    }
    if (!nombreLimpio) {
      alert('El campo Nombre del jugador * es obligatorio.');
      return;
    }
    if (!categoriaLimpia) {
      alert('El campo Categoría * es obligatorio.');
      return;
    }
    if (existeDorsalEnCategoria(dorsalLimpio, categoriaLimpia)) {
      alert(`ERROR: Ya existe un jugador con el dorsal #${dorsalLimpio} en ${categoriaLimpia}. No puede haber dos dorsales iguales en la misma categoría.`);
      return;
    }
    if (!nuevoJugador.foto) {
      alert('El campo Subir foto del jugador: * es obligatorio.');
      return;
    }

    const item = {
      ...nuevoJugador,
      dorsal: dorsalLimpio,
      nombre: nombreLimpio,
      posicion: puedeGestionarAlaYGoles ? (nuevoJugador.posicion || 'Ala') : 'Sin asignar',
      categoria: categoriaLimpia,
      goles: puedeGestionarAlaYGoles ? Math.max(0, Number(nuevoJugador.goles || 0)) : 0,
      createdAt: serverTimestamp()
    };
    const idTemporal = `jug_${Date.now()}`;
    const actualizada = [...plantilla, { id: idTemporal, ...item }];
    guardarPlantillaLocal(actualizada);
    setShowForm(false);
    setNuevoJugador({ dorsal: '', nombre: '', posicion: 'Ala', categoria: '', goles: '0', foto: '' });

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

  const { proximos: partidosProximos, jugados: partidosJugados } = separarPartidosProximosYJugados(partidos);
  const goleadoresOrdenados = [...plantilla].sort((a, b) => Number(b.goles || 0) - Number(a.goles || 0));
  const mensajesFiltrados = mensajes.filter((m) => (m.canal || 'General') === canalChat);

  const miIdPerfil = crearIdPerfil(perfil.nombre, perfil.dorsal, perfil.correo || '');
  const {
    directivasVisibles,
    entrenadoresVisibles,
    usuariosMasculinosOrdenados,
    usuariosFemeninosOrdenados,
    totalPerfilesVisibles
  } = (() => {
    const mapa = new Map();
    perfilesClub.forEach((p) => {
      if (p.nombre || p.dorsal || p.foto || p.rol) {
        mapa.set(p.id, p);
      }
    });
    if (perfil.nombre || perfil.dorsal || perfil.foto || perfil.rol) {
      const dorsalPerfil = String(perfil.dorsal || '').trim();
      mapa.set(miIdPerfil, {
        id: miIdPerfil,
        nombre: perfil.nombre || 'Sin nombre',
        correo: perfil.correo || '',
        rol: perfil.rol || 'Jugador',
        categoria: esRolSinDorsal(perfil.rol) ? (perfil.rol || 'Entrenador') : (perfil.categoria || 'Sin categoría'),
        dorsal: (esRolSinDorsal(perfil.rol) || dorsalPerfil === '0') ? '' : dorsalPerfil,
        foto: perfil.foto || '',
        esReservaDirectiva: Boolean(perfil.esReservaDirectiva)
      });
    }

    const todos = Array.from(mapa.values());
    const directivas = todos.filter((item) => esDirectiva(item));
    const entrenadores = todos.filter((item) => !esDirectiva(item) && esStaffPrioritario(item));
    const restoUsuarios = todos.filter((item) => !esDirectiva(item) && !esStaffPrioritario(item));

    const femeninos = restoUsuarios
      .filter((item) => esPerfilFemenino(item))
      .sort((a, b) =>
        String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
          sensitivity: 'base'
        })
      );

    const masculinos = restoUsuarios
      .filter((item) => !esPerfilFemenino(item))
      .sort((a, b) =>
        String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
          sensitivity: 'base'
        })
      );

    return {
      directivasVisibles: directivas,
      entrenadoresVisibles: entrenadores,
      usuariosMasculinosOrdenados: masculinos,
      usuariosFemeninosOrdenados: femeninos,
      totalPerfilesVisibles: todos.length
    };
  })();

  const usuariosPorGeneroActual =
    generoPerfilesTab === 'femenina'
      ? usuariosFemeninosOrdenados
      : usuariosMasculinosOrdenados;

  const renderTarjetaPartido = (p, yaJugado = false) => {
    const asistentes = p.asistentes || [];
    const voy = asistentes.includes(perfil.nombre);

    const fechaRescatada =
      (p.fecha && !/^(próximamente|proximamente|por confirmar)$/i.test(String(p.fecha).trim())
        ? String(p.fecha).trim()
        : '') ||
      extraerFechaDeTexto(`${p.fecha || ''} ${p.local || ''} ${p.visitante || ''}`) ||
      'Por confirmar';

    const localTexto = esTextoFechaOJornada(p.local) ? 'Rival por confirmar' : p.local;
    const visitanteTexto = esTextoFechaOJornada(p.visitante) ? 'Rival por confirmar' : p.visitante;
    const juegaFueraTarjeta =
      esEquipoClubAltamira(visitanteTexto) && !esEquipoClubAltamira(localTexto);
    const rivalTarjeta = juegaFueraTarjeta ? localTexto : visitanteTexto;
    const pabellonBase =
      p.pabellon &&
      !esTextoFechaOJornada(p.pabellon) &&
      !(juegaFueraTarjeta && /pabell[oó]n municipal picanya/i.test(p.pabellon))
        ? String(p.pabellon)
        : juegaFueraTarjeta
        ? `Pabellón visitante (${rivalTarjeta})`
        : 'Pabellón Municipal Picanya';

    const pabellonTexto = pabellonBase.replace(/\(([^)]*)\)/g, (_, inner) =>
      esTextoFechaOJornada(inner) ? '(Rival por confirmar)' : `(${inner})`
    );

    const urlMaps = obtenerUrlGoogleMapsPabellon(pabellonTexto, rivalTarjeta);

    return (
      <div
        key={p.id}
        className="card"
        style={yaJugado ? { opacity: 0.9 } : undefined}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={`tag ${p.resultado !== 'VS' ? 'result' : ''}`}>
              <TextoConSignoGenero texto={p.categoria} />
            </span>
            {yaJugado && (
              <span className="tag" style={{ background: '#e2e8f0', color: '#475569' }}>
                Jugado
              </span>
            )}
          </div>
          {isAdmin && (
            <button className="btn-danger" onClick={() => handleDelete('partidos', p.id)}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="match-teams">
          <span style={{ flex: 1 }}>{localTexto}</span>
          <span className="match-score">{p.resultado || 'VS'}</span>
          <span style={{ flex: 1, textAlign: 'right' }}>{visitanteTexto}</span>
        </div>
        <div className="match-meta">
          <span><Clock size={13} /> {fechaRescatada}</span>
          <a
            href={urlMaps}
            target="_blank"
            rel="noreferrer"
            title="Abrir ubicación en Google Maps"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--primary)',
              fontWeight: 700,
              textDecoration: 'underline'
            }}
          >
            <MapPin size={13} /> {pabellonTexto}
          </a>
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
  };

  const renderFilaPerfil = (item) => {
    const esEspecialItem = esRolSinDorsal(item.rol);
    const dorsalItem = String(item.dorsal || '').trim();
    return (
      <div key={item.id} className="card player-row">
        <div className="player-info">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <AvatarCircular src={item.foto} alt={item.nombre} letra={item.nombre?.[0] || 'U'} tamano={46} />
            {!esEspecialItem && dorsalItem && dorsalItem !== '0' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>#{dorsalItem}</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {item.nombre} {item.id === miIdPerfil ? '(Tú)' : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {esEspecialItem ? (
                <TextoConSignoGenero texto={item.categoria || item.rol} />
              ) : (
                <>
                  {item.rol} · <TextoConSignoGenero texto={item.categoria || 'Sin categoría'} />
                </>
              )}
            </div>
          </div>
        </div>
        {isAdmin && (
          <button className="btn-danger" onClick={() => handleDelete('perfiles', item.id)}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  };

  const perfilesEspecialesCreados = perfilesClub.filter(
    (p) => p.esReservaDirectiva || esRolSinDorsal(p.rol)
  );

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
                  setFormCategoria('');
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

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                <AvatarCircular
                  src={formFoto}
                  alt="Vista previa"
                  letra={formNombre?.[0] || 'J'}
                  tamano={72}
                />
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  Dorsal: #{formDorsal || '-'}
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
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Equipo / Categoría *</label>
                <SelectorCategoriaYGenero
                  valorActual={formCategoria}
                  onChangeValor={(val) => setFormCategoria(val)}
                />
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

  if (forzarOnboarding || (!sinDorsalUsuarioActual && !perfilJugadorCompleto(perfil))) {
    const editandoEspecial = esRolSinDorsal(formRol);
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
              <p>{editandoEspecial ? `Perfil de ${formRol}` : 'Configuración obligatoria del jugador'}</p>
            </div>
          </div>
          <button type="button" className="admin-btn" onClick={handleCerrarSesion}>
            <LogOut size={14} /> Salir
          </button>
        </header>

        <main className="container">
          <form className="card" onSubmit={handleGuardarConfiguracionObligatoria} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div className="section-title">
              <KeyRound size={19} /> {editandoEspecial ? `Editar Perfil (${formRol})` : 'Completa tu Perfil de Jugador'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <AvatarCircular
                src={formFoto}
                alt="Vista previa"
                letra={formNombre?.[0] || 'U'}
                tamano={72}
              />
              {!editandoEspecial && (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  Dorsal: #{formDorsal || '-'}
                </div>
              )}
              <label className="btn-primary" style={{ cursor: 'pointer' }}>
                <Camera size={15} /> {editandoEspecial ? 'Subir foto' : 'Subir foto *'}
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

            {!editandoEspecial && (
              <>
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
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Equipo / Categoría *</label>
                  <SelectorCategoriaYGenero
                    valorActual={formCategoria}
                    onChangeValor={(val) => setFormCategoria(val)}
                  />
                </div>
              </>
            )}

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

  const dorsalCabecera = String(perfil?.dorsal || '').trim();
  const mostrarDorsalCabecera = !sinDorsalUsuarioActual && dorsalCabecera !== '' && dorsalCabecera !== '0';

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
            <p>
              {perfil.nombre}
              {mostrarDorsalCabecera ? ` · #${dorsalCabecera}` : ` · ${perfil.rol}`}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <button className="admin-btn" onClick={() => { setTab('perfil'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); }}>
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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-rsvp"
                    onClick={handleLimpiarDuplicadosPartidos}
                  >
                    <CopyX size={14} /> Limpiar duplicados
                  </button>
                  <button
                    type="button"
                    className="btn-rsvp"
                    onClick={handleLimpiarPartidosSinRival}
                  >
                    <Trash2 size={14} /> Limpiar fechas
                  </button>
                  <button
                    type="button"
                    className="btn-rsvp"
                    onClick={() => {
                      setShowImportBox(!showImportBox);
                      setShowForm(false);
                    }}
                  >
                    <Download size={14} /> Importar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setShowForm(!showForm);
                      setShowImportBox(false);
                    }}
                  >
                    <Plus size={15} /> Partido
                  </button>
                </div>
              )}
            </div>

            <div className="subtabs">
              <button
                type="button"
                className={`subtab ${partidosSubtab === 'proximos' ? 'active' : ''}`}
                onClick={() => setPartidosSubtab('proximos')}
              >
                Próximos ({partidosProximos.length})
              </button>
              <button
                type="button"
                className={`subtab ${partidosSubtab === 'jugados' ? 'active' : ''}`}
                onClick={() => setPartidosSubtab('jugados')}
              >
                Jugados ({partidosJugados.length})
              </button>
            </div>

            {isAdmin && showImportBox && (
              <div className="form-box">
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                  Sincronizar webs o importar texto (sin duplicados)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)' }}>
                    Webs configuradas ({urlsSincronizacion.length})
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="url"
                      placeholder="Añadir otra URL (https://...)"
                      value={nuevaUrlInput}
                      onChange={(e) => setNuevaUrlInput(e.target.value)}
                    />
                    <button type="button" className="btn-rsvp" onClick={handleAgregarUrlSincronizacion}>
                      + Web
                    </button>
                  </div>

                  {urlsSincronizacion.map((u) => (
                    <div
                      key={u}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        background: '#ffffff',
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: 12
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</span>
                      <button type="button" className="btn-danger" onClick={() => handleQuitarUrlSincronizacion(u)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn-primary"
                    disabled={sincronizandoUrls}
                    onClick={handleSincronizarUrls}
                  >
                    <Download size={15} />
                    {sincronizandoUrls ? 'Sincronizando webs...' : 'Sincronizar webs ahora'}
                  </button>
                </div>

                <form onSubmit={handleImportarPartidosTexto} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                    Pega aquí las jornadas o enfrentamientos de El balón de la Comunitat, Futbuteo o FFCV y se añadirán sin duplicar:
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-rsvp"
                      onClick={() => setTextoImportarPartidos(TEXTO_MUESTRA_FFCV)}
                    >
                      Cargar muestra FFCV Altamira
                    </button>
                  </div>
                  <textarea
                    rows="5"
                    placeholder={`Ejemplo:\nJornada 10 (29-11-2026)\nC.D. Rafael Altamira Picanya "A" - Maristas Cullera`}
                    value={textoImportarPartidos}
                    onChange={(e) => setTextoImportarPartidos(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn-rsvp" style={{ justifyContent: 'center' }}>
                    <Download size={14} /> Añadir partidos pegados
                  </button>
                </form>
              </div>
            )}

            {isAdmin && showForm && (
              <form className="form-box" onSubmit={handleAddPartido}>
                <SelectorCategoriaYGenero
                  valorActual={nuevoPartido.categoria}
                  onChangeValor={(val) => setNuevoPartido({ ...nuevoPartido, categoria: val })}
                />
                <input placeholder="Local" value={nuevoPartido.local} onChange={(e) => setNuevoPartido({ ...nuevoPartido, local: e.target.value })} />
                <input placeholder="Visitante *" required value={nuevoPartido.visitante} onChange={(e) => setNuevoPartido({ ...nuevoPartido, visitante: e.target.value })} />
                <input placeholder="Día y Hora (Sábado 18:30)" value={nuevoPartido.fecha} onChange={(e) => setNuevoPartido({ ...nuevoPartido, fecha: e.target.value })} />
                <input placeholder="Pabellón" value={nuevoPartido.pabellon} onChange={(e) => setNuevoPartido({ ...nuevoPartido, pabellon: e.target.value })} />
                <input placeholder="Resultado (o VS)" value={nuevoPartido.resultado} onChange={(e) => setNuevoPartido({ ...nuevoPartido, resultado: e.target.value })} />
                <button type="submit" className="btn-primary">Guardar Partido</button>
              </form>
            )}

            {partidosSubtab === 'proximos' && (
              <div>
                {partidosProximos.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    No hay próximos partidos programados por ahora.
                  </div>
                ) : (
                  partidosProximos.map((p) => renderTarjetaPartido(p, false))
                )}
              </div>
            )}

            {partidosSubtab === 'jugados' && (
              <div>
                {partidosJugados.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Aún no hay partidos jugados registrados.
                  </div>
                ) : (
                  partidosJugados.map((p) => renderTarjetaPartido(p, true))
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'liga' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Trophy size={19} /> Clasificación y Goles</h2>
              {isAdmin && ligaSubtab === 'tabla' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-rsvp"
                    onClick={handleLimpiarTablaCompleta}
                  >
                    <Trash2 size={14} /> Limpiar tabla
                  </button>
                  <button
                    type="button"
                    className="btn-rsvp"
                    onClick={() => {
                      setShowImportTablaBox(!showImportTablaBox);
                      setShowForm(false);
                    }}
                  >
                    <Download size={14} /> Importar tabla
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setShowForm(!showForm);
                      setShowImportTablaBox(false);
                    }}
                  >
                    <Plus size={15} /> Equipo
                  </button>
                </div>
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
                {isAdmin && showImportTablaBox && (
                  <form className="form-box" onSubmit={handleImportarClasificacionTexto}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                      Importar clasificación completa (sin duplicados)
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                      Pega aquí las filas con columnas (# Equipo Pts PJ PG PE PP GF GC Dif) o el texto de clasificación:
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-rsvp"
                        onClick={() => setTextoImportarClasificacion(TEXTO_MUESTRA_CLASIFICACION)}
                      >
                        Cargar muestra clasificación
                      </button>
                    </div>
                    <textarea
                      rows="6"
                      placeholder={`Ejemplo:\n1\tC.D. Corbera\t25\t9\t8\t1\t0\t59\t10\t+49`}
                      value={textoImportarClasificacion}
                      onChange={(e) => setTextoImportarClasificacion(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn-primary">
                      <Download size={15} /> Añadir clasificación sin duplicados
                    </button>
                  </form>
                )}

                {isAdmin && showForm && (
                  <form className="form-box" onSubmit={handleAddEquipoTabla}>
                    <input placeholder="Nombre del equipo *" required value={nuevoEquipoTabla.equipo} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, equipo: e.target.value })} />
                    <input type="number" placeholder="Puntos (Pts)" value={nuevoEquipoTabla.pts} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, pts: e.target.value })} />
                    <input type="number" placeholder="Partidos Jugados (PJ)" value={nuevoEquipoTabla.pj} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, pj: e.target.value })} />
                    <input type="number" placeholder="Ganados (PG)" value={nuevoEquipoTabla.pg} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, pg: e.target.value })} />
                    <input type="number" placeholder="Empatados (PE)" value={nuevoEquipoTabla.pe} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, pe: e.target.value })} />
                    <input type="number" placeholder="Perdidos (PP)" value={nuevoEquipoTabla.pp} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, pp: e.target.value })} />
                    <input type="number" placeholder="Goles a Favor (GF)" value={nuevoEquipoTabla.gf} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, gf: e.target.value })} />
                    <input type="number" placeholder="Goles en Contra (GC)" value={nuevoEquipoTabla.gc} onChange={(e) => setNuevoEquipoTabla({ ...nuevoEquipoTabla, gc: e.target.value })} />
                    <button type="submit" className="btn-primary">Añadir a la tabla</button>
                  </form>
                )}

                <div className="card table-wrap" style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Equipo</th>
                        <th>Pts</th>
                        <th>PJ</th>
                        <th>PG</th>
                        <th>PE</th>
                        <th>PP</th>
                        <th>GF</th>
                        <th>GC</th>
                        <th>Dif</th>
                        {isAdmin && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {clasificacion.map((c, idx) => {
                        const nombreLimpio = sanearNombreEquipoTabla([c.equipo]);
                        const gf = Number(c.gf || 0);
                        const gc = Number(c.gc || 0);
                        const dif = calcularDifClasificacion(gf, gc, c.dif);
                        return (
                          <tr key={c.id} className={nombreLimpio.toLowerCase().includes('altamira') ? 'highlight-row' : ''}>
                            <td>{c.pos || idx + 1}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AvatarCircular
                                  src={c.escudo}
                                  alt={nombreLimpio}
                                  letra={nombreLimpio?.[0] || 'E'}
                                  tamano={26}
                                />
                                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{nombreLimpio}</span>
                                {isAdmin && (
                                  <label
                                    title="Subir escudo del equipo"
                                    style={{
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      padding: 4,
                                      borderRadius: 6,
                                      border: '1px solid var(--border)',
                                      background: '#fff'
                                    }}
                                  >
                                    <Camera size={12} />
                                    <input
                                      type="file"
                                      accept="image/*"
                                      style={{ display: 'none' }}
                                      onChange={(e) => handleSubirEscudoEquipo(c, e.target.files[0])}
                                    />
                                  </label>
                                )}
                              </div>
                            </td>
                            <td><strong style={{ color: 'var(--primary)' }}>{c.pts ?? 0}</strong></td>
                            <td>{c.pj ?? 0}</td>
                            <td>{c.pg ?? 0}</td>
                            <td>{c.pe ?? 0}</td>
                            <td>{c.pp ?? 0}</td>
                            <td>{gf}</td>
                            <td>{gc}</td>
                            <td style={{ fontWeight: 700 }}>{formatearDif(dif)}</td>
                            {isAdmin && (
                              <td>
                                <button className="btn-danger" onClick={() => handleDelete('clasificacion', c.id)}>
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <AvatarCircular src={j.foto} alt={j.nombre} letra={j.nombre?.[0] || 'J'} tamano={46} />
                        {j.dorsal && j.dorsal !== '0' && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>#{j.dorsal}</span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          {idx + 1}º · {j.nombre}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          <TextoConSignoGenero texto={j.categoria} />
                          {puedeGestionarAlaYGoles && j.posicion && j.posicion !== 'Sin asignar' ? ` · ${j.posicion}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="tag result"><Award size={12} style={{ verticalAlign: 'middle' }} /> {j.goles || 0}</span>
                      {puedeGestionarAlaYGoles && (
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
                <input
                  placeholder="Dorsal / Número (ej. 10) *"
                  required
                  value={nuevoJugador.dorsal}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, dorsal: e.target.value })}
                />
                <input
                  placeholder="Nombre del jugador *"
                  required
                  value={nuevoJugador.nombre}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, nombre: e.target.value })}
                />
                {puedeGestionarAlaYGoles && (
                  <select value={nuevoJugador.posicion} onChange={(e) => setNuevoJugador({ ...nuevoJugador, posicion: e.target.value })}>
                    <option value="Portero">Portero</option>
                    <option value="Cierre">Cierre</option>
                    <option value="Ala">Ala</option>
                    <option value="Pívot">Pívot</option>
                    <option value="Entrenador">Entrenador</option>
                  </select>
                )}
                <SelectorCategoriaYGenero
                  valorActual={nuevoJugador.categoria}
                  onChangeValor={(val) => setNuevoJugador({ ...nuevoJugador, categoria: val })}
                />
                {puedeGestionarAlaYGoles && (
                  <input
                    type="number"
                    placeholder="Goles iniciales"
                    value={nuevoJugador.goles}
                    onChange={(e) => setNuevoJugador({ ...nuevoJugador, goles: e.target.value })}
                  />
                )}
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                  Subir foto del jugador: *
                  <input
                    type="file"
                    accept="image/*"
                    required
                    onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setNuevoJugador({ ...nuevoJugador, foto: dataUrl }))}
                  />
                </label>
                <button type="submit" className="btn-primary">Guardar Jugador</button>
              </form>
            )}

            {plantilla.map((j) => (
              <div key={j.id} className="card player-row">
                <div className="player-info">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <AvatarCircular src={j.foto} alt={j.nombre} letra={j.nombre?.[0] || 'J'} tamano={46} />
                    {j.dorsal && j.dorsal !== '0' && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>#{j.dorsal}</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{j.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      <TextoConSignoGenero texto={j.categoria} />
                      {puedeGestionarAlaYGoles && j.posicion && j.posicion !== 'Sin asignar' ? ` · ${j.posicion}` : ''}
                      {puedeGestionarAlaYGoles ? ` · ${j.goles || 0} goles` : ''}
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
                {CATEGORIAS_CLUB.map((cat) => (
                  <option key={cat} value={cat}>Canal: {cat}</option>
                ))}
              </select>
            </div>

            <div className="chat-box">
              {mensajesFiltrados.length === 0 && (
                <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No hay mensajes aún en <strong><TextoConSignoGenero texto={canalChat} /></strong>. ¡Escribe el primero!
                </div>
              )}
              {mensajesFiltrados.map((m) => {
                const esMio = m.autor === perfil.nombre;
                return (
                  <div key={m.id} className={`msg ${esMio ? 'mine' : ''}`}>
                    <div className="msg-head">
                      <span>{m.autor} (<TextoConSignoGenero texto={m.rol} />)</span>
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
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      <TextoConSignoGenero texto={en.categoria} />
                    </div>
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
              <h2 className="section-title"><User size={19} /> Perfiles del Club</h2>
              <button type="button" className="btn-rsvp" onClick={handleCerrarSesion}>
                <LogOut size={13} /> Cerrar sesión
              </button>
            </div>

            <div className="subtabs">
              <button className={`subtab ${perfilSubtab === 'mi-perfil' ? 'active' : ''}`} onClick={() => setPerfilSubtab('mi-perfil')}>
                Mi Perfil
              </button>
              <button className={`subtab ${perfilSubtab === 'companeros' ? 'active' : ''}`} onClick={() => setPerfilSubtab('companeros')}>
                Perfiles ({totalPerfilesVisibles})
              </button>
            </div>

            {perfilSubtab === 'mi-perfil' && (
              <>
                <TarjetaMiPerfil
                  perfil={perfil}
                  sinDorsalUsuarioActual={sinDorsalUsuarioActual}
                  handleAbrirEditarPerfil={handleAbrirEditarPerfil}
                />

                {isAdmin && (
                  <form className="card" onSubmit={handleCrearPerfilEspecialDirectiva} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="section-title" style={{ fontSize: 15 }}>
                      <UserPlus size={17} /> Entrenador y 2º Entrenador ({perfilesEspecialesCreados.length}/{MAX_PERFILES_ESPECIALES_DIRECTIVA})
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                      No llevan dorsal; su rol y categoría es Entrenador o 2º Entrenador.
                    </p>
                    <select
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                      value={nuevoPerfilEspecial.rolEspecial}
                      onChange={(e) => setNuevoPerfilEspecial({ ...nuevoPerfilEspecial, rolEspecial: e.target.value })}
                    >
                      {ROLES_ESPECIALES_DIRECTIVA.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Nombre o seudónimo *"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                      value={nuevoPerfilEspecial.nombre}
                      onChange={(e) => setNuevoPerfilEspecial({ ...nuevoPerfilEspecial, nombre: e.target.value })}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Contraseña o PIN (mín. 4 caracteres) *"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                      value={nuevoPerfilEspecial.pinUsuario}
                      onChange={(e) => setNuevoPerfilEspecial({ ...nuevoPerfilEspecial, pinUsuario: e.target.value })}
                      required
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AvatarCircular
                        src={nuevoPerfilEspecial.foto}
                        alt="Foto perfil especial"
                        letra={nuevoPerfilEspecial.nombre?.[0] || 'E'}
                        tamano={48}
                      />
                      <label className="btn-rsvp" style={{ cursor: 'pointer' }}>
                        <Camera size={14} /> Foto (opcional)
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) =>
                            procesarFotoCircular(e.target.files[0], (dataUrl) =>
                              setNuevoPerfilEspecial({ ...nuevoPerfilEspecial, foto: dataUrl })
                            )
                          }
                        />
                      </label>
                    </div>
                    <button type="submit" className="btn-primary">Crear Perfil sin Dorsal</button>
                  </form>
                )}

                {isAdmin && (
                  <form className="card" onSubmit={handleCambiarPinDirectiva} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="section-title" style={{ fontSize: 15 }}>
                      <KeyRound size={17} /> Cambiar PIN de Directiva
                    </div>
                    <input
                      type="password"
                      placeholder="PIN actual de directiva"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                      value={pinDirActualInput}
                      onChange={(e) => setPinDirActualInput(e.target.value)}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Nuevo PIN de directiva (mín. 4 caracteres)"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                      value={pinDirNuevoInput}
                      onChange={(e) => setPinDirNuevoInput(e.target.value)}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Confirmar nuevo PIN de directiva"
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                      value={pinDirConfirmInput}
                      onChange={(e) => setPinDirConfirmInput(e.target.value)}
                      required
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn-primary" style={{ flex: 1 }}>Actualizar PIN Directiva</button>
                      <button type="button" className="btn-rsvp" onClick={handleRestablecerPinDirectiva}>Restablecer 1980</button>
                    </div>
                  </form>
                )}
              </>
            )}

            {perfilSubtab === 'companeros' && (
              <div>
                {totalPerfilesVisibles === 0 ? (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Aún no hay perfiles completados en el club.
                  </div>
                ) : (
                  <>
                    {directivasVisibles.map((item) => renderFilaPerfil(item))}
                    {entrenadoresVisibles.map((item) => renderFilaPerfil(item))}

                    <div className="subtabs" style={{ marginTop: 14 }}>
                      <button
                        type="button"
                        className={`subtab ${generoPerfilesTab === 'masculina' ? 'active' : ''}`}
                        onClick={() => setGeneroPerfilesTab('masculina')}
                      >
                        Plantilla masculina ({usuariosMasculinosOrdenados.length})
                      </button>
                      <button
                        type="button"
                        className={`subtab ${generoPerfilesTab === 'femenina' ? 'active' : ''}`}
                        onClick={() => setGeneroPerfilesTab('femenina')}
                      >
                        Plantilla femenina ({usuariosFemeninosOrdenados.length})
                      </button>
                    </div>

                    {usuariosPorGeneroActual.length === 0 ? (
                      <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                        No hay usuarios en {generoPerfilesTab === 'femenina' ? 'plantilla femenina' : 'plantilla masculina'}.
                      </div>
                    ) : (
                      usuariosPorGeneroActual.map((item) => renderFilaPerfil(item))
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="status-pill">
          {firebaseOk ? '● Sincronizado con Firebase' : '○ Modo local activo'}
        </div>
      </main>

      <nav className="bottom-nav">
        <button className={`nav-item ${tab === 'partidos' ? 'active' : ''}`} onClick={() => { setTab('partidos'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); }}>
          <Calendar size={20} />
          <span>Partidos</span>
        </button>
        <button className={`nav-item ${tab === 'liga' ? 'active' : ''}`} onClick={() => { setTab('liga'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); }}>
          <Trophy size={20} />
          <span>Liga/Goles</span>
        </button>
        <button className={`nav-item ${tab === 'plantilla' ? 'active' : ''}`} onClick={() => { setTab('plantilla'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); }}>
          <Users size={20} />
          <span>Plantilla</span>
        </button>
        <button className={`nav-item ${tab === 'chat' ? 'active' : ''}`} onClick={() => { setTab('chat'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); }}>
          <MessageCircle size={20} />
          <span>Chat</span>
        </button>
        <button className={`nav-item ${tab === 'avisos' ? 'active' : ''}`} onClick={() => { setTab('avisos'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); }}>
          <Bell size={20} />
          <span>Avisos</span>
        </button>
      </nav>
    </div>
  );
}
