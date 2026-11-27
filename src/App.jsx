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
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-benjamin-futbol-sala-escolar-grup-4-valencia'
  },
  {
    categoria: 'Juvenil ♂',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-a-2a-regional-juvenil-futbol-sala-grup-3-valencia'
  },
  {
    categoria: 'Alevín ♂',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-a-alevin-futbol-sala-escolar-grup-4-valencia'
  },
  {
    categoria: 'Copa Valenta ♀',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-a-iv-la-nostra-copa-valenta-futbol-sala-grup-2-valencia'
  },
  {
    categoria: 'Promoción Valenta ♀',
    url: 'https://futbuteo.com/valencia/club/team_panel/c-d-rafael-altamira-picanya-a-liga-provincial-promocion-valenta-futbol-sala-grup-2-valencia'
  }
];

const TEXTO_MUESTRA_CLASIFICACION = `#\tEquipo\tPts\tPJ\tPG\tPE\tPP\tGF\tGC\tDif
1\tC.D. Corbera\t25\t9\t8\t1\t0\t59\t10\t+49
2\tF.S. Picassent 'B'\t22\t9\t7\t1\t1\t50\t23\t+27`;

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
  if ((tieneMes || tieneDiaSemana) && !/\b(c\.?d\.?|c\.?f\.?s?\.?|f\.?s\.?|futsal|club|sport|atletico|atlético|union|unión|valencia|picanya|torrent|maristas|salesianos)\b/i.test(low)) {
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
      const regexRepetido = new RegExp(`^${escaped}\s+${escaped}(?:\s+${escaped})*$`, 'i');
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
        pts = nums[0];
        pj = nums[1];
        pg = nums[2];
        pe = nums[3];
        pp = nums[4];
        gf = nums[5];
        gc = nums[6];
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
    rol.toLowerCase() === 'directiva' ||
    nombre.toLowerCase() === 'directiva';

  if (esDir) {
    return 'Directiva';
  }

  if (mostrarDorsal) {
    return `${nombre} · #${dorsalValor}`;
  }

  if (rol && rol.toLowerCase() !== nombre.toLowerCase()) {
    return `${nombre} · ${rol}`;
  }

  return nombre || rol || 'Usuario';
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
    const baseElegida = nuevaBase || baseActual || 'Juvenil';
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
  if (cat.endsWith('♀') || cat.includes('femenin') || cat.includes('valenta')) return true;
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
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[♂♀]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
      const size = 96;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width - minSide) / 2;
      const sy = (img.height - minSide) / 2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      callback(canvas.toDataURL('image/jpeg', 0.5));
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
  return (
    <div
      className="avatar-circular-box"
      style={{
        width: `${tamano}px`,
        height: `${tamano}px`,
        minWidth: `${tamano}px`,
        minHeight: `${tamano}px`,
        borderRadius: '9999px',
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        backgroundColor: '#1e3a8a',
        color: '#ffffff',
        fontWeight: 800,
        fontSize: `${Math.max(11, Math.round(tamano * 0.36))}px`,
        border: '3px solid #ec4899'
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt || 'Foto de perfil'}
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center'
          }}
        />
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
    id: 'demo_ben_hoy_27',
    categoria: 'Benjamín ♂',
    local: 'C.D. Rafael Altamira Picanya',
    visitante: "Salesianos San Antonio Abad 'A'",
    fecha: '27-11-2026 · 18:00 CET',
    pabellon: 'Pabellón Municipal Picanya',
    resultado: 'VS',
    asistentes: []
  },
  {
    id: 'demo_ale_hoy_27',
    categoria: 'Alevín ♂',
    local: "Salesianos San Antonio Abad 'A'",
    visitante: "C.D. Rafael Altamira Picanya 'A'",
    fecha: '27-11-2026 · 19:15 CET',
    pabellon: 'Colegio Salesianos San Antonio Abad Pista 2',
    resultado: 'VS',
    asistentes: []
  },
  {
    id: 'demo_juv_1',
    categoria: 'Juvenil ♂',
    local: "C.F.S. Aliança Quart de Poblet 'A'",
    visitante: "C.D. Rafael Altamira Picanya 'A'",
    fecha: '28-11-2026 · 11:00 CET',
    pabellon: 'Pista Colegio Publico Juan Comenius Pabellon',
    resultado: 'VS',
    asistentes: ['Carlos M.', 'Javier G.', 'Marc N.']
  },
  {
    id: 'demo_prom_1',
    categoria: 'Promoción Valenta ♀',
    local: "C.D. Rafael Altamira Picanya 'A'",
    visitante: 'Maristas Cullera',
    fecha: '28-11-2026 · 20:30 CET',
    pabellon: 'Pabellón Mpal. Vicent Martí "Galán" Picanya',
    resultado: 'VS',
    asistentes: []
  },
  {
    id: 'demo_copa_1',
    categoria: 'Copa Valenta ♀',
    local: 'Santa Ana Algemesí C.D.',
    visitante: "C.D. Rafael Altamira Picanya 'A'",
    fecha: '24-01-2027 · 13:00 CET',
    pabellon: 'Pavelló Covert 9 de Octubre Algemesi',
    resultado: 'VS',
    asistentes: []
  }
];

const DEMO_CLASIFICACION = [
  { id: 'c_ben_1', categoria: 'Benjamín ♂', pos: 1, equipo: 'C.D. Juan Comenius', pts: 3, pj: 1, pg: 1, pe: 0, pp: 0, gf: 11, gc: 1, dif: 10, escudo: '' },
  { id: 'c_ben_5', categoria: 'Benjamín ♂', pos: 5, equipo: 'C.D. Rafael Altamira Picanya', pts: 0, pj: 1, pg: 0, pe: 0, pp: 1, gf: 2, gc: 12, dif: -10, escudo: '' },
  { id: 'c_ale_1', categoria: 'Alevín ♂', pos: 1, equipo: "S.D. San Pedro Pascual 'A'", pts: 6, pj: 2, pg: 2, pe: 0, pp: 0, gf: 16, gc: 5, dif: 11, escudo: '' },
  { id: 'c_ale_3', categoria: 'Alevín ♂', pos: 3, equipo: "C.D. Rafael Altamira Picanya 'A'", pts: 0, pj: 1, pg: 0, pe: 0, pp: 1, gf: 2, gc: 9, dif: -7, escudo: '' },
  { id: 'c_juv_1', categoria: 'Juvenil ♂', pos: 1, equipo: "C.D. Corbera Lambert Logística y Gestión Port. 'A'", pts: 25, pj: 9, pg: 8, pe: 1, pp: 0, gf: 59, gc: 10, dif: 49, escudo: '' },
  { id: 'c_juv_16', categoria: 'Juvenil ♂', pos: 16, equipo: "C.D. Rafael Altamira Picanya 'A'", pts: 0, pj: 9, pg: 0, pe: 0, pp: 9, gf: 16, gc: 42, dif: -26, escudo: '' },
  { id: 'c_prom_1', categoria: 'Promoción Valenta ♀', pos: 1, equipo: 'C.D. Inter Marjal', pts: 21, pj: 7, pg: 7, pe: 0, pp: 0, gf: 43, gc: 3, dif: 40, escudo: '' },
  { id: 'c_prom_5', categoria: 'Promoción Valenta ♀', pos: 5, equipo: "C.D. Rafael Altamira Picanya 'A'", pts: 9, pj: 7, pg: 3, pe: 0, pp: 4, gf: 12, gc: 26, dif: -14, escudo: '' }
];

const DEMO_PLANTILLA = [
  { id: 'p1', dorsal: '10', nombre: 'Marc Navarro', posicion: 'Pívot', categoria: 'Juvenil ♂', edad: '17', goles: 14, foto: '', telefono: '' },
  { id: 'p2', dorsal: '7', nombre: 'Alejandro Ruiz', posicion: 'Ala', categoria: 'Juvenil ♂', edad: '17', goles: 11, foto: '', telefono: '' },
  { id: 'p3', dorsal: '4', nombre: 'Javier Gómez', posicion: 'Cierre', categoria: 'Juvenil ♂', edad: '18', goles: 6, foto: '', telefono: '' },
  { id: 'p4', dorsal: '1', nombre: 'Carlos Martínez', posicion: 'Portero', categoria: 'Juvenil ♂', edad: '17', goles: 1, foto: '', telefono: '' }
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
  { categoria: 'Juvenil / Cadete ♂ / ♀', dias: 'Lunes y Miércoles · 18:30 - 20:00' },
  { categoria: 'Alevín / Benjamín ♂ / ♀', dias: 'Martes y Jueves · 17:30 - 18:45' }
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

  const [categoriaActiva, setCategoriaActiva] = useState(() => {
    const guardada = localStorage.getItem('cdra_categoria_activa') || '';
    if (guardada && CATEGORIAS_VISIBLES_CLUB.some((c) => normalizarCategoria(c) === normalizarCategoria(guardada))) {
      return guardada;
    }
    return CATEGORIAS_VISIBLES_CLUB[0];
  });

  const seleccionarCategoria = (cat) => {
    const valida =
      CATEGORIAS_VISIBLES_CLUB.find((c) => normalizarCategoria(c) === normalizarCategoria(cat)) ||
      CATEGORIAS_VISIBLES_CLUB[0];
    setCategoriaActiva(valida);
    guardarLocalSeguro('cdra_categoria_activa', valida);
  };

  const [partidosSubtab, setPartidosSubtab] = useState('proximos');
  const [partidoSeleccionadoId, setPartidoSeleccionadoId] = useState(null);
  const [ligaSubtab, setLigaSubtab] = useState('tabla');
  const [avisosSubtab, setAvisosSubtab] = useState('avisos');
  const [perfilSubtab, setPerfilSubtab] = useState('mi-perfil');
  const [generoPerfilesTab, setGeneroPerfilesTab] = useState('masculina');
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('cdra_admin_activa') === '1');
  const [firebaseOk, setFirebaseOk] = useState(false);
  const [refrescandoDatos, setRefrescandoDatos] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showImportTablaBox, setShowImportTablaBox] = useState(false);
  const [textoImportarClasificacion, setTextoImportarClasificacion] = useState('');
  const [fuentesSincronizacion] = useState(() => {
    const guardadas = leerListaLocal('cdra_fuentes_categorias', FUENTES_CATEGORIAS_CLUB);
    if (Array.isArray(guardadas) && guardadas.length > 0 && guardadas[0]?.url) {
      return guardadas;
    }
    return FUENTES_CATEGORIAS_CLUB;
  });
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
  const [editandoAvisoId, setEditandoAvisoId] = useState(null);
  const [formEdicionAviso, setFormEdicionAviso] = useState({
    titulo: '',
    mensaje: '',
    urgente: false
  });

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
        new Notification(NOMBRE_CLUB_APP, {
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
      const snapPerfiles = await getDocs(query(collection(db, 'perfiles'), limit(25)));
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
      return { partidosCargados: partidos };
    }

    setRefrescandoDatos(true);
    let partidosCargados = partidos;
    try {
      const peticiones = [
        getDocs(query(collection(db, 'partidos'), orderBy('createdAt', 'desc'), limit(80))),
        getDocs(query(collection(db, 'clasificacion'), orderBy('pts', 'desc'), limit(MAX_EQUIPOS_CLASIFICACION))),
        getDocs(query(collection(db, 'plantilla'), orderBy('createdAt', 'asc'), limit(25))),
        getDocs(query(collection(db, 'avisos'), orderBy('createdAt', 'desc'), limit(8)))
      ];
      if (incluirPerfiles || forzar) {
        peticiones.push(getDocs(query(collection(db, 'perfiles'), limit(25))));
      }

      const resultados = await Promise.all(peticiones);
      const [snapPartidos, snapClasif, snapPlantilla, snapAvisos, snapPerfiles] = resultados;

      setFirebaseOk(true);
      const ahoraSync = String(Date.now());
      guardarLocalSeguro('cdra_last_sync_at', ahoraSync);

      if (!snapPartidos.empty) {
        const docsPartidos = snapPartidos.docs.map((d) => ({ id: d.id, ...d.data() }));
        partidosCargados = docsPartidos;
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
    return { partidosCargados };
  }, [cargarPerfilesSiToca, dispararNotificacionMovilAviso, partidos]);

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

    const candidatos = deduplicarPerfilesLista([
      ...perfilesClub,
      ...(perfil && perfil.nombre ? [perfil] : [])
    ]);

    const coincidenciaIdentidad = idIntroducido
      ? candidatos.find((item) => {
          const nombreMatch = item.nombre && item.nombre.trim().toLowerCase() === idIntroducido;
          const correoMatch = item.correo && item.correo.trim().toLowerCase() === idIntroducido;
          return nombreMatch || correoMatch;
        })
      : null;

    const esPinDirectivaValido =
      pinIntroducido === pinDirectiva || pinIntroducido === PIN_DIRECTIVA_INICIAL;

    if (coincidenciaIdentidad) {
      const esCuentaDirectiva =
        coincidenciaIdentidad.rol === 'Directiva' ||
        coincidenciaIdentidad.nombre.trim().toLowerCase() === 'directiva';

      const pinGuardadoUsuario = String(coincidenciaIdentidad.pinUsuario || '').trim();
      const pinCoincide = esCuentaDirectiva
        ? (pinGuardadoUsuario === pinIntroducido || esPinDirectivaValido)
        : pinGuardadoUsuario === pinIntroducido;

      if (!pinCoincide) {
        alert('La contraseña o PIN no coincide con ese nombre o seudónimo.');
        return;
      }

      const esEspecial = esRolSinDorsal(coincidenciaIdentidad.rol);
      const dorsalItem = String(coincidenciaIdentidad.dorsal || '').trim();
      const perfilRecuperado = {
        nombre: coincidenciaIdentidad.nombre || idRaw,
        correo: coincidenciaIdentidad.correo || (idIntroducido.includes('@') ? idIntroducido : ''),
        rol: esCuentaDirectiva ? 'Directiva' : (coincidenciaIdentidad.rol || 'Jugador'),
        categoria: esCuentaDirectiva
          ? 'Directiva'
          : esEspecial
          ? (coincidenciaIdentidad.rol || 'Entrenador')
          : (coincidenciaIdentidad.categoria || ''),
        dorsal: (esCuentaDirectiva || esEspecial || dorsalItem === '0') ? '' : dorsalItem,
        telefono: limpiarTelefono(coincidenciaIdentidad.telefono || ''),
        edad: (esCuentaDirectiva || esEspecial) ? '' : normalizarEdad(coincidenciaIdentidad.edad || ''),
        foto: coincidenciaIdentidad.foto || '',
        pinUsuario: pinGuardadoUsuario || pinIntroducido,
        esReservaDirectiva: Boolean(coincidenciaIdentidad.esReservaDirectiva || esEspecial),
        tipoSlot: coincidenciaIdentidad.tipoSlot || ''
      };

      setPerfil(perfilRecuperado);
      guardarLocalSeguro('cdra_perfil', perfilRecuperado);
      guardarLocalSeguro('cdra_sesion_activa', '1');
      if (esCuentaDirectiva) {
        guardarLocalSeguro('cdra_admin_activa', '1');
      } else {
        localStorage.removeItem('cdra_admin_activa');
      }
      setIsAdmin(esCuentaDirectiva);
      setSesionIniciada(true);
      const completo = esCuentaDirectiva || perfilJugadorCompleto(perfilRecuperado);
      setForzarOnboarding(!completo);
      setPinLoginInput('');
      if (completo) {
        irAAvisosAlEntrar();
      }
      return;
    }

    if (esPinDirectivaValido && (!idIntroducido || idIntroducido === 'directiva')) {
      const perfilDir = {
        nombre: idRaw || 'Directiva',
        correo: '',
        rol: 'Directiva',
        categoria: 'Directiva',
        dorsal: '',
        telefono: '',
        edad: '',
        foto: '',
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
    const telefonoLimpio = limpiarTelefono(formTelefono);
    const edadLimpia = esEspecial ? '' : normalizarEdad(formEdad);
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
    if (!esEspecial && telefonoLimpio.length < 6) {
      alert('El campo Teléfono * es obligatorio para la ficha del club (mínimo 6 dígitos).');
      return;
    }
    if (!esEspecial && !edadLimpia) {
      alert('El campo Edad * es obligatorio (entre 1 y 99 años).');
      return;
    }
    const idActualPerfil = perfil?.nombre
      ? crearIdPerfil(perfil.nombre, perfil.dorsal, perfil.correo || '', perfil.rol || '')
      : '';
    if (
      !esEspecial &&
      existeDorsalEnCategoria(dorsalLimpio, categoriaLimpia, idActualPerfil, perfil?.nombre || '')
    ) {
      alert(`ERROR: Ya existe un jugador con el dorsal #${dorsalLimpio} en ${categoriaLimpia}. No puede haber dos dorsales iguales en la misma categoría.`);
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

    const fotoAnterior = perfil?.foto || '';
    const perfilActualizado = {
      nombre: nombreLimpio,
      correo: correoLimpio,
      rol: esEspecial ? formRol : 'Jugador',
      categoria: categoriaLimpia,
      dorsal: dorsalLimpio,
      telefono: telefonoLimpio,
      edad: edadLimpia,
      foto: formFoto || '',
      pinUsuario: pinLimpio,
      esReservaDirectiva: esEspecial
    };

    setPerfil(perfilActualizado);
    guardarLocalSeguro('cdra_perfil', perfilActualizado);
    guardarLocalSeguro('cdra_sesion_activa', '1');
    if (!esEspecial) {
      localStorage.removeItem('cdra_admin_activa');
      setIsAdmin(false);
    }
    setForzarOnboarding(false);
    setModoRegistroJugador(false);
    setSesionIniciada(true);
    irAAvisosAlEntrar();
    await sincronizarPerfilEnClub(perfilActualizado, fotoAnterior);
    alert('¡Perfil guardado correctamente!');
  };

  const handleCrearPerfilEspecialDirectiva = async (e) => {
    e.preventDefault();
    const perfilesEspecialesActuales = deduplicarPerfilesLista(
      perfilesClub.filter((p) => p.esReservaDirectiva || esRolSinDorsal(p.rol))
    );
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

    const idDoc = crearIdPerfil(nombreLimpio, '', '', rolElegido);
    const registroEspecial = {
      id: idDoc,
      nombre: nombreLimpio,
      correo: '',
      rol: rolElegido,
      categoria: rolElegido,
      dorsal: '',
      telefono: '',
      edad: '',
      foto: nuevoPerfilEspecial.foto || '',
      pinUsuario: pinLimpio,
      esReservaDirectiva: true,
      tipoSlot: rolElegido,
      actualizadoEn: serverTimestamp()
    };

    const claveNueva = obtenerClaveUnicaPerfil(registroEspecial);
    const nuevaLista = [
      registroEspecial,
      ...perfilesClub.filter((item) => item.id !== idDoc && obtenerClaveUnicaPerfil(item) !== claveNueva)
    ];
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
    setShowImportTablaBox(false);
    setEditandoAvisoId(null);
    setPartidoSeleccionadoId(null);
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
    setFormTelefono(perfil.telefono || '');
    setFormEdad(perfil.edad || '');
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
    guardarLocalSeguro('cdra_pin_directiva', nuevoPin);
    setPinDirectiva(nuevoPin);
    setPinDirActualInput('');
    setPinDirNuevoInput('');
    setPinDirConfirmInput('');
    alert('PIN de directiva actualizado correctamente');
  };

  const handleRestablecerPinDirectiva = () => {
    guardarLocalSeguro('cdra_pin_directiva', PIN_DIRECTIVA_INICIAL);
    setPinDirectiva(PIN_DIRECTIVA_INICIAL);
    setPinDirActualInput('');
    setPinDirNuevoInput('');
    setPinDirConfirmInput('');
    alert(`PIN de directiva restablecido a ${PIN_DIRECTIVA_INICIAL}`);
  };

  const [nuevoAviso, setNuevoAviso] = useState({
    titulo: '',
    mensaje: '',
    urgente: false
  });

  useEffect(() => {
    if (!sesionIniciada) return;
    cargarDatosUnaVez(false, false);
  }, [sesionIniciada, cargarDatosUnaVez]);

  const toggleAdmin = () => {
    if (isAdmin) {
      localStorage.removeItem('cdra_admin_activa');
      setIsAdmin(false);
      setShowForm(false);
      setShowImportTablaBox(false);
      setEditandoAvisoId(null);
      return;
    }
    const pin = window.prompt('Introduce el PIN de Directiva:');
    if (pin === null) return;
    if (pin === pinDirectiva || pin === PIN_DIRECTIVA_INICIAL) {
      if (pin === PIN_DIRECTIVA_INICIAL && pinDirectiva !== PIN_DIRECTIVA_INICIAL) {
        guardarLocalSeguro('cdra_pin_directiva', PIN_DIRECTIVA_INICIAL);
        setPinDirectiva(PIN_DIRECTIVA_INICIAL);
      }
      guardarLocalSeguro('cdra_admin_activa', '1');
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
    if (firebaseOk && !String(partido.id || '').startsWith('demo')) {
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

  const registrarPartidosSinDuplicar = async (candidatos, listaBase = partidos) => {
    let listaTrabajo = [...listaBase];
    const indicePorClave = new Map();

    listaTrabajo.forEach((p, idx) => {
      const k = normalizarClavePartido(p);
      if (k && !indicePorClave.has(k)) {
        indicePorClave.set(k, idx);
      }
    });

    const nuevosParaAlta = [];
    const actualizadosFirestore = [];
    let procesados = 0;

    for (const cand of candidatos) {
      if (procesados >= MAX_PARTIDOS_POR_IMPORTACION) break;

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

      if (!esRivalValido(rivalLimpio)) {
        continue;
      }

      const clubLocal = 'C.D. Rafael Altamira FS';
      const juegaFuera = Boolean(esVisitanteAltamira && !esLocalAltamira);

      const localFinal = juegaFuera ? rivalLimpio : clubLocal;
      const visitanteFinal = juegaFuera ? clubLocal : rivalLimpio;

      const pabellonCalculado = juegaFuera
        ? `Pabellón visitante (${rivalLimpio})`
        : 'Pabellón Municipal Picanya';

      const pabellonFinal =
        cand.pabellon &&
        !esTextoFechaOJornada(cand.pabellon) &&
        !(juegaFuera && /pabell[oó]n municipal picanya/i.test(cand.pabellon))
          ? cand.pabellon
          : pabellonCalculado;

      const resultadoNormalizado = normalizarMarcadorPartido(cand.resultado || 'VS');
      const categoriaFinal = detectarCategoriaImportada(
        cand.categoriaTexto || `${localFinal} ${visitanteFinal} ${resultadoNormalizado}`,
        cand.categoria || ''
      );

      const itemLimpio = {
        categoria: categoriaFinal,
        local: localFinal,
        visitante: visitanteFinal,
        fecha: fechaDetectada,
        pabellon: pabellonFinal,
        resultado: resultadoNormalizado
      };

      const clave = normalizarClavePartido(itemLimpio);
      if (!clave) continue;

      procesados += 1;

      const idxExistente = indicePorClave.has(clave) ? indicePorClave.get(clave) : -1;

      if (idxExistente !== -1) {
        const actual = listaTrabajo[idxExistente];
        const resultadoAnterior = normalizarMarcadorPartido(actual?.resultado || 'VS');
        const resultadoFinal =
          resultadoNormalizado !== 'VS' ? resultadoNormalizado : resultadoAnterior;

        const fechaAnterior = String(actual?.fecha || '').trim();
        const fechaFinal =
          fechaDetectada &&
          !/^(próximamente|proximamente|por confirmar)$/i.test(fechaDetectada) &&
          (fechaDetectada.length >= fechaAnterior.length ||
            /^(próximamente|proximamente|por confirmar)$/i.test(fechaAnterior))
            ? fechaDetectada
            : fechaAnterior || fechaDetectada;

        const cambioDetectado =
          resultadoFinal !== resultadoAnterior ||
          fechaFinal !== fechaAnterior ||
          (pabellonFinal && pabellonFinal !== actual?.pabellon) ||
          (categoriaFinal &&
            normalizarCategoria(categoriaFinal) !== normalizarCategoria(actual?.categoria));

        if (cambioDetectado) {
          const partidoActualizado = {
            ...actual,
            categoria: categoriaFinal || actual?.categoria,
            local: localFinal,
            visitante: visitanteFinal,
            fecha: fechaFinal,
            pabellon: pabellonFinal || actual?.pabellon,
            resultado: resultadoFinal
          };
          listaTrabajo[idxExistente] = partidoActualizado;
          actualizadosFirestore.push(partidoActualizado);
        }
        continue;
      }

      const nuevoConId = {
        id: `sync_${Date.now()}_${nuevosParaAlta.length}`,
        ...itemLimpio,
        asistentes: [],
        createdAt: serverTimestamp()
      };
      listaTrabajo = [nuevoConId, ...listaTrabajo];
      indicePorClave.clear();
      listaTrabajo.forEach((p, idx) => {
        const k = normalizarClavePartido(p);
        if (k && !indicePorClave.has(k)) indicePorClave.set(k, idx);
      });
      nuevosParaAlta.push({ idTemporal: nuevoConId.id, datos: itemLimpio });
    }

    guardarPartidosLocal(listaTrabajo);

    if (firebaseOk) {
      const tareas = [];

      for (const act of actualizadosFirestore) {
        if (act?.id && !String(act.id).startsWith('demo') && !String(act.id).startsWith('sync_')) {
          tareas.push(
            updateDoc(doc(db, 'partidos', act.id), {
              categoria: act.categoria,
              local: act.local,
              visitante: act.visitante,
              fecha: act.fecha,
              pabellon: act.pabellon,
              resultado: act.resultado
            }).catch(() => {})
          );
        }
      }

      const altIdxStart = tareas.length;
      for (const nuevo of nuevosParaAlta) {
        tareas.push(
          addDoc(collection(db, 'partidos'), {
            ...nuevo.datos,
            asistentes: [],
            createdAt: serverTimestamp()
          })
        );
      }

      if (tareas.length > 0) {
        const settled = await Promise.allSettled(tareas);
        let huboIdReal = false;
        const mapaIdsReales = new Map();

        nuevosParaAlta.forEach((nuevo, i) => {
          const res = settled[altIdxStart + i];
          if (res?.status === 'fulfilled' && res.value?.id) {
            mapaIdsReales.set(nuevo.idTemporal, res.value.id);
            huboIdReal = true;
          }
        });

        if (huboIdReal) {
          guardarPartidosLocal(
            listaTrabajo.map((p) =>
              mapaIdsReales.has(p.id) ? { ...p, id: mapaIdsReales.get(p.id) } : p
            )
          );
        }
      }
    }

    return {
      añadidos: nuevosParaAlta.length,
      actualizados: actualizadosFirestore.length,
      listaResultante: listaTrabajo
    };
  };

  const registrarClasificacionSinDuplicar = async (candidatos, categoriaPorDefecto = '') => {
    const mapaExistentes = new Map();
    clasificacion.forEach((item, idx) => {
      const k = normalizarClaveClasificacion(item);
      if (k && !mapaExistentes.has(k)) {
        mapaExistentes.set(k, idx);
      }
    });

    let listaTrabajo = [...clasificacion];
    const nuevosConId = [];
    const actualizadosFirestore = [];

    for (const cand of candidatos) {
      if (nuevosConId.length >= MAX_EQUIPOS_CLASIFICACION) break;
      const nombreEq = sanearNombreEquipoTabla([String(cand.equipo || '').trim()]);
      const catEq = cand.categoria || categoriaPorDefecto || CATEGORIAS_VISIBLES_CLUB[0];
      const itemClave = { categoria: catEq, equipo: nombreEq };
      const claveEq = normalizarClaveClasificacion(itemClave);
      if (!nombreEq || !claveEq) continue;

      const gf = Number(cand.gf || 0);
      const gc = Number(cand.gc || 0);
      const filaNormalizada = {
        categoria: catEq,
        pos: Number(cand.pos || listaTrabajo.length + nuevosConId.length + 1),
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
      };

      if (mapaExistentes.has(claveEq)) {
        const idxExist = mapaExistentes.get(claveEq);
        const actual = listaTrabajo[idxExist];
        const filaAct = {
          ...actual,
          ...filaNormalizada,
          escudo: filaNormalizada.escudo || actual.escudo || ''
        };
        listaTrabajo[idxExist] = filaAct;
        actualizadosFirestore.push(filaAct);
        continue;
      }

      const nuevoDoc = {
        id: `eq_sync_${Date.now()}_${nuevosConId.length}`,
        ...filaNormalizada
      };
      nuevosConId.push(nuevoDoc);
      listaTrabajo.push(nuevoDoc);
      mapaExistentes.set(claveEq, listaTrabajo.length - 1);
    }

    if (nuevosConId.length === 0 && actualizadosFirestore.length === 0) return 0;

    let ordenada = [...listaTrabajo].sort((a, b) => {
      if (Number(b.pts || 0) !== Number(a.pts || 0)) {
        return Number(b.pts || 0) - Number(a.pts || 0);
      }
      const difA = calcularDifClasificacion(a.gf, a.gc, a.dif);
      const difB = calcularDifClasificacion(b.gf, b.gc, b.dif);
      if (difB !== difA) return difB - difA;
      return Number(b.gf || 0) - Number(a.gf || 0);
    });

    const contadoresPorCat = new Map();
    ordenada = ordenada.map((fila) => {
      const catKey = normalizarCategoria(fila.categoria || '');
      const siguientePos = (contadoresPorCat.get(catKey) || 0) + 1;
      contadoresPorCat.set(catKey, siguientePos);
      return {
        ...fila,
        pos: fila.pos ? Number(fila.pos) : siguientePos
      };
    });

    guardarClasificacionLocal(ordenada);

    if (firebaseOk) {
      const tareas = [];

      for (const act of actualizadosFirestore) {
        if (act?.id && !/^c_?[a-z]*_?\d+$/i.test(act.id) && !String(act.id).startsWith('eq_sync_')) {
          tareas.push(
            updateDoc(doc(db, 'clasificacion', act.id), {
              categoria: act.categoria,
              pos: act.pos,
              equipo: act.equipo,
              pts: act.pts,
              pj: act.pj,
              pg: act.pg,
              pe: act.pe,
              pp: act.pp,
              gf: act.gf,
              gc: act.gc,
              dif: act.dif
            }).catch(() => {})
          );
        }
      }

      const startIdxNuevos = tareas.length;
      for (const nuevo of nuevosConId) {
        const { id: _idTmp, ...datosSinId } = nuevo;
        tareas.push(addDoc(collection(db, 'clasificacion'), datosSinId));
      }

      if (tareas.length > 0) {
        const settled = await Promise.allSettled(tareas);
        let huboIdReal = false;
        const mapaIds = new Map();
        nuevosConId.forEach((n, i) => {
          const r = settled[startIdxNuevos + i];
          if (r?.status === 'fulfilled' && r.value?.id) {
            mapaIds.set(n.id, r.value.id);
            huboIdReal = true;
          }
        });
        if (huboIdReal) {
          ordenada = ordenada.map((c) => (mapaIds.has(c.id) ? { ...c, id: mapaIds.get(c.id) } : c));
          guardarClasificacionLocal(ordenada);
        }
      }
    }

    return nuevosConId.length + actualizadosFirestore.length;
  };

  const handleImportarClasificacionTexto = async (e) => {
    e.preventDefault();
    const catDestino = categoriaActiva || CATEGORIAS_VISIBLES_CLUB[0];
    const parseados = parsearClasificacionDesdeTexto(textoImportarClasificacion, catDestino);
    if (parseados.length === 0) {
      alert('No se detectaron filas de clasificación válidas en el texto pegado.');
      return;
    }

    const procesados = await registrarClasificacionSinDuplicar(parseados, catDestino);
    if (procesados === 0) {
      alert('Esos equipos ya estaban en la clasificación de esa categoría.');
      return;
    }

    setTextoImportarClasificacion('');
    setShowImportTablaBox(false);
    alert(`¡Clasificación actualizada (${procesados} fila(s)) en ${catDestino}!`);
  };

  const handleSubirEscudoEquipo = async (equipoItem, file) => {
    if (!isAdmin || !file) return;
    procesarFotoCircular(file, async (dataUrl) => {
      if (dataUrl === (equipoItem.escudo || '')) return;
      const actualizada = clasificacion.map((c) =>
        c.id === equipoItem.id ? { ...c, escudo: dataUrl } : c
      );
      guardarClasificacionLocal(actualizada);
      if (firebaseOk && !/^c_?[a-z]*_?\d+$/i.test(equipoItem.id)) {
        try {
          await updateDoc(doc(db, 'clasificacion', equipoItem.id), { escudo: dataUrl });
        } catch {
          // Mantiene respaldo local
        }
      }
    });
  };

  const sanearPartidosInterno = async (listaEntrada) => {
    const partidosSinFechasComoRival = [];
    const descartadosPorFechaORival = [];

    for (const p of listaEntrada) {
      const rival = esEquipoClubAltamira(p.local) && !esEquipoClubAltamira(p.visitante)
        ? p.visitante
        : esEquipoClubAltamira(p.visitante) && !esEquipoClubAltamira(p.local)
        ? p.local
        : p.visitante;

      if (esRivalValido(rival)) {
        partidosSinFechasComoRival.push(p);
      } else {
        descartadosPorFechaORival.push(p);
      }
    }

    const vistos = new Set();
    const partidosLimpios = [];
    const duplicadosEliminados = [];

    for (const p of partidosSinFechasComoRival) {
      const clave = normalizarClavePartido(p);
      if (!clave || vistos.has(clave)) {
        duplicadosEliminados.push(p);
      } else {
        vistos.add(clave);
        partidosLimpios.push(p);
      }
    }

    const listaFinal = partidosLimpios.length > 0 ? partidosLimpios : DEMO_PARTIDOS;
    guardarPartidosLocal(listaFinal);

    const aBorrar = [...descartadosPorFechaORival, ...duplicadosEliminados];
    if (firebaseOk && aBorrar.length > 0) {
      await Promise.allSettled(
        aBorrar
          .filter((item) => !/^(demo|c|p|a|m)\d+$/.test(item.id) && !String(item.id).startsWith('demo_'))
          .map((item) => deleteDoc(doc(db, 'partidos', item.id)))
      );
    }

    return {
      partidosLimpios: listaFinal,
      eliminadosFechas: descartadosPorFechaORival.length,
      eliminadosDuplicados: duplicadosEliminados.length
    };
  };

  const sincronizarPartidosDesdeWebs = async (mostrarAvisoResultado = true) => {
    setSincronizandoUrls(true);
    const catActual = categoriaActiva || CATEGORIAS_VISIBLES_CLUB[0];
    const fuenteActiva = fuentesSincronizacion.find(
      (f) => normalizarCategoria(f.categoria) === normalizarCategoria(catActual)
    );
    const fuentesObjetivo = fuenteActiva ? [fuenteActiva] : [];

    try {
      let partidosDetectados = [];
      let clasifDetectada = [];
      let huboRespuestaEndpoint = false;
      let motivosError = [];

      if (fuentesObjetivo.length > 0) {
        try {
          const resp = await fetch('/api/sincronizar-partidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoriaActiva: catActual,
              urls: fuentesObjetivo.map((f) => f.url),
              fuentes: fuentesObjetivo
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.ok) {
              huboRespuestaEndpoint = true;
              partidosDetectados = Array.isArray(data.partidos)
                ? data.partidos.map((item) => ({
                    ...item,
                    categoria: item?.categoria || catActual
                  }))
                : [];
              clasifDetectada = Array.isArray(data.clasificacion)
                ? data.clasificacion.map((item) => ({
                    ...item,
                    categoria: item?.categoria || catActual
                  }))
                : [];
              if (Array.isArray(data.errores) && data.errores.length > 0) {
                motivosError = data.errores.map((e) => e.motivo).filter(Boolean);
              }
            }
          }
        } catch {
          // Si no existe endpoint /api/sincronizar-partidos, probamos lectura directa
        }

        if (!huboRespuestaEndpoint || partidosDetectados.length === 0) {
          for (const fuente of fuentesObjetivo) {
            try {
              const r = await fetch(fuente.url);
              if (!r.ok) continue;
              const cuerpo = await r.text();
              const catFuente = fuente.categoria || catActual;
              const extraidos = cuerpo.trim().startsWith('<')
                ? parsearPartidosDesdeHtml(cuerpo, catFuente)
                : parsearPartidosDesdeTexto(cuerpo, catFuente);
              if (extraidos.length > 0) {
                partidosDetectados = [...partidosDetectados, ...extraidos];
              }
              const extraidaClasif = parsearClasificacionDesdeTexto(
                cuerpo.trim().startsWith('<') && typeof DOMParser !== 'undefined'
                  ? new DOMParser().parseFromString(cuerpo, 'text/html').body?.innerText || ''
                  : cuerpo,
                catFuente
              );
              if (extraidaClasif.length > 0) {
                clasifDetectada = [...clasifDetectada, ...extraidaClasif];
              }
            } catch {
              // Bloqueo CORS o carga dinámica en cliente
            }
          }
        }
      }

      const { partidosCargados } = await cargarDatosUnaVez(true, false);
      const basePartidos =
        Array.isArray(partidosCargados) && partidosCargados.length > 0
          ? partidosCargados
          : partidos.length > 0
          ? partidos
          : DEMO_PARTIDOS;

      const baseCorregida = basePartidos.map((p) => {
        const catPartido = String(p?.categoria || '');
        if (/^senior\b/i.test(catPartido) || !catPartido.trim()) {
          const inferida = detectarCategoriaImportada(
            `${p.local || ''} ${p.visitante || ''} ${p.resultado || ''}`,
            catActual
          );
          if (firebaseOk && p?.id && !String(p.id).startsWith('demo') && !String(p.id).startsWith('sync_')) {
            updateDoc(doc(db, 'partidos', p.id), { categoria: inferida }).catch(() => {});
          }
          return { ...p, categoria: inferida };
        }
        return p;
      });

      const { añadidos, actualizados, listaResultante } = await registrarPartidosSinDuplicar(
        partidosDetectados,
        baseCorregida
      );

      const { eliminadosFechas, eliminadosDuplicados } = await sanearPartidosInterno(listaResultante);

      let clasifActualizadaCount = 0;
      if (clasifDetectada.length > 0) {
        clasifActualizadaCount = await registrarClasificacionSinDuplicar(clasifDetectada, catActual);
      }

      if (mostrarAvisoResultado) {
        const partesResumen = [];
        if (añadidos > 0) partesResumen.push(`${añadidos} partido(s) nuevo(s)`);
        if (actualizados > 0) partesResumen.push(`${actualizados} partido(s) actualizado(s)`);
        if (clasifActualizadaCount > 0) partesResumen.push(`${clasifActualizadaCount} fila(s) de clasificación`);
        if (eliminadosDuplicados > 0) partesResumen.push(`${eliminadosDuplicados} duplicado(s) limpio(s)`);
        if (eliminadosFechas > 0) partesResumen.push(`${eliminadosFechas} sin rival/fecha limpio(s)`);

        const avisoBloqueos =
          motivosError.length > 0 && añadidos === 0 && actualizados === 0 && clasifActualizadaCount === 0
            ? `\nNota: la web ha devuelto aviso (${motivosError.join(', ')}).`
            : '';

        if (partesResumen.length > 0) {
          alert(`${catActual}: ${partesResumen.join(' · ')}.${avisoBloqueos}`);
        } else {
          alert(`${catActual} al día y limpio: sin duplicados ni novedades.${avisoBloqueos}`);
        }
      }
    } catch {
      if (mostrarAvisoResultado) {
        alert('No se pudo completar la sincronización automática en este momento.');
      }
    } finally {
      setSincronizandoUrls(false);
    }
  };

  const handleActualizarClasificacion = async () => {
    const catDestino = categoriaActiva || CATEGORIAS_VISIBLES_CLUB[0];
    if (textoImportarClasificacion.trim()) {
      const parseados = parsearClasificacionDesdeTexto(textoImportarClasificacion, catDestino);
      if (parseados.length === 0) {
        alert('No se detectaron filas de clasificación válidas en el texto pegado.');
        return;
      }
      const procesados = await registrarClasificacionSinDuplicar(parseados, catDestino);
      setTextoImportarClasificacion('');
      setShowImportTablaBox(false);
      alert(
        procesados > 0
          ? `¡Clasificación actualizada (${procesados} equipo(s)) en ${catDestino}!`
          : `Clasificación al día en ${catDestino}.`
      );
      return;
    }

    if (showImportTablaBox) {
      setShowImportTablaBox(false);
      return;
    }

    setSincronizandoUrls(true);
    try {
      const { partidosCargados } = await cargarDatosUnaVez(true, false);
      const basePartidos =
        Array.isArray(partidosCargados) && partidosCargados.length > 0
          ? partidosCargados
          : partidos.length > 0
          ? partidos
          : DEMO_PARTIDOS;

      const fuenteActiva = fuentesSincronizacion.find(
        (f) => normalizarCategoria(f.categoria) === normalizarCategoria(catDestino)
      );

      let clasifDetectada = [];
      if (fuenteActiva) {
        try {
          const resp = await fetch('/api/sincronizar-partidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoriaActiva: catDestino,
              urls: [fuenteActiva.url],
              fuentes: [fuenteActiva]
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.ok && Array.isArray(data.clasificacion)) {
              clasifDetectada = data.clasificacion.map((item) => ({
                ...item,
                categoria: item?.categoria || catDestino
              }));
            }
          }
        } catch {
          // Si no responde el endpoint, abrimos el cuadro de pegar clasificación
        }
      }

      if (clasifDetectada.length > 0) {
        const procesados = await registrarClasificacionSinDuplicar(clasifDetectada, catDestino);
        const partidosCat = basePartidos.filter(
          (p) => normalizarCategoria(p.categoria) === normalizarCategoria(catDestino)
        );
        alert(
          `Clasificación actualizada en ${catDestino}: ${procesados} fila(s) procesada(s) (${partidosCat.length} partido(s) en categoría).`
        );
      } else {
        setShowImportTablaBox(true);
        setShowForm(false);
      }
    } finally {
      setSincronizandoUrls(false);
    }
  };

  const handleAddAviso = async (e) => {
    e.preventDefault();
    if (!puedePublicarAvisos) {
      alert('Solo Directiva o un entrenador pueden publicar avisos.');
      return;
    }
    if (!nuevoAviso.titulo || !nuevoAviso.mensaje) return;

    const autorAviso = perfil.nombre || (isAdmin ? 'Directiva' : perfil.rol || 'Entrenador');
    const item = {
      ...nuevoAviso,
      autor: autorAviso,
      rolAutor: isAdmin ? 'Directiva' : (perfil.rol || 'Entrenador'),
      createdAt: serverTimestamp()
    };
    const idTemporal = `av_${Date.now()}`;
    avisosVistosRef.current.add(idTemporal);
    const actualizada = [{ id: idTemporal, ...item }, ...avisos];
    guardarAvisosLocal(actualizada);
    setShowForm(false);
    setNuevoAviso({ titulo: '', mensaje: '', urgente: false });

    if (firebaseOk) {
      try {
        const ref = await addDoc(collection(db, 'avisos'), item);
        avisosVistosRef.current.add(ref.id);
        guardarAvisosLocal(actualizada.map((a) => (a.id === idTemporal ? { ...a, id: ref.id } : a)));
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const handleIniciarEdicionAviso = (aviso) => {
    if (!puedePublicarAvisos) return;
    setShowForm(false);
    setEditandoAvisoId(aviso.id);
    setFormEdicionAviso({
      titulo: aviso.titulo || '',
      mensaje: aviso.mensaje || '',
      urgente: Boolean(aviso.urgente)
    });
  };

  const handleCancelarEdicionAviso = () => {
    setEditandoAvisoId(null);
    setFormEdicionAviso({ titulo: '', mensaje: '', urgente: false });
  };

  const handleGuardarEdicionAviso = async (e, avisoId) => {
    e.preventDefault();
    if (!puedePublicarAvisos) {
      alert('Solo Directiva o un entrenador pueden editar avisos.');
      return;
    }
    const tituloLimpio = String(formEdicionAviso.titulo || '').trim();
    const mensajeLimpio = String(formEdicionAviso.mensaje || '').trim();
    if (!tituloLimpio || !mensajeLimpio) {
      alert('El título y el mensaje del aviso son obligatorios.');
      return;
    }

    const cambios = {
      titulo: tituloLimpio,
      mensaje: mensajeLimpio,
      urgente: Boolean(formEdicionAviso.urgente)
    };

    const actualizada = avisos.map((a) => (a.id === avisoId ? { ...a, ...cambios } : a));
    guardarAvisosLocal(actualizada);
    setEditandoAvisoId(null);
    setFormEdicionAviso({ titulo: '', mensaje: '', urgente: false });

    if (firebaseOk && !/^a\d+$/.test(String(avisoId || ''))) {
      try {
        await updateDoc(doc(db, 'avisos', avisoId), cambios);
      } catch {
        // Mantiene respaldo local
      }
    }
  };

  const handleDelete = async (col, id) => {
    if (col === 'avisos' && editandoAvisoId === id) {
      handleCancelarEdicionAviso();
    }
    if (col === 'partidos') {
      if (partidoSeleccionadoId === id) setPartidoSeleccionadoId(null);
      guardarPartidosLocal(partidos.filter((x) => x.id !== id));
    } else if (col === 'clasificacion') {
      guardarClasificacionLocal(clasificacion.filter((x) => x.id !== id));
    } else if (col === 'plantilla') {
      guardarPlantillaLocal(plantilla.filter((x) => x.id !== id));
    } else if (col === 'avisos') {
      guardarAvisosLocal(avisos.filter((x) => x.id !== id));
    } else if (col === 'perfiles') {
      const objetivo = perfilesClub.find((x) => x.id === id);
      const claveObjetivo = objetivo ? obtenerClaveUnicaPerfil(objetivo) : '';
      guardarPerfilesLocal(
        perfilesClub.filter(
          (x) => x.id !== id && (!claveObjetivo || obtenerClaveUnicaPerfil(x) !== claveObjetivo)
        )
      );
    }

    if (firebaseOk && !/^(demo|c|p|a|m)\d+$/.test(id) && !String(id).startsWith('demo_')) {
      try {
        await deleteDoc(doc(db, col, id));
      } catch {
        // Eliminado localmente aunque el documento no existiera en Firebase
      }
    }
  };

  const categoriasDisponibles = useMemo(() => {
    const vistas = new Set();
    const lista = [];
    for (const cat of CATEGORIAS_VISIBLES_CLUB) {
      const norm = normalizarCategoria(cat);
      if (norm && !vistas.has(norm) && !norm.startsWith('senior')) {
        vistas.add(norm);
        lista.push(cat);
      }
    }
    return lista;
  }, []);

  const partidosFiltradosPorCategoria = useMemo(() => {
    const catNorm = normalizarCategoria(categoriaActiva || CATEGORIAS_VISIBLES_CLUB[0]);
    const fuentePartidos = partidos.length > 0 ? partidos : DEMO_PARTIDOS;
    return fuentePartidos.filter((p) => {
      const catPartido = normalizarCategoria(p.categoria);
      if (catPartido === catNorm) return true;
      if (!catPartido || catPartido.startsWith('senior')) {
        const inferida = normalizarCategoria(
          detectarCategoriaImportada(`${p.local || ''} ${p.visitante || ''} ${p.resultado || ''}`, '')
        );
        return inferida === catNorm;
      }
      return false;
    });
  }, [partidos, categoriaActiva]);

  const clasificacionFiltrada = useMemo(() => {
    const catNorm = normalizarCategoria(categoriaActiva || CATEGORIAS_VISIBLES_CLUB[0]);
    return clasificacion
      .filter((c) => normalizarCategoria(c.categoria) === catNorm)
      .sort((a, b) => {
        if (Number(b.pts || 0) !== Number(a.pts || 0)) {
          return Number(b.pts || 0) - Number(a.pts || 0);
        }
        const difA = calcularDifClasificacion(a.gf, a.gc, a.dif);
        const difB = calcularDifClasificacion(b.gf, b.gc, b.dif);
        if (difB !== difA) return difB - difA;
        return Number(b.gf || 0) - Number(a.gf || 0);
      });
  }, [clasificacion, categoriaActiva]);

  const { proximos: partidosProximos, jugados: partidosJugados } = useMemo(
    () => separarPartidosProximosYJugados(partidosFiltradosPorCategoria),
    [partidosFiltradosPorCategoria]
  );

  const partidoModal = useMemo(
    () => partidos.find((p) => p.id === partidoSeleccionadoId) || null,
    [partidos, partidoSeleccionadoId]
  );

  const goleadoresOrdenados = useMemo(
    () => [...plantilla].sort((a, b) => Number(b.goles || 0) - Number(a.goles || 0)),
    [plantilla]
  );

  const miIdPerfil = crearIdPerfil(perfil.nombre, perfil.dorsal, perfil.correo || '', perfil.rol || '');
  const miClavePerfil = obtenerClaveUnicaPerfil({ ...perfil, id: miIdPerfil });

  const {
    directivasVisibles,
    entrenadoresVisibles,
    usuariosMasculinosOrdenados,
    usuariosFemeninosOrdenados,
    totalPerfilesVisibles
  } = useMemo(() => {
    const mapa = new Map();
    for (const p of deduplicarPerfilesLista(perfilesClub)) {
      if (p.nombre || p.dorsal || p.foto || p.rol) {
        mapa.set(obtenerClaveUnicaPerfil(p), p);
      }
    }
    if (perfil.nombre || perfil.dorsal || perfil.foto || perfil.rol) {
      const dorsalPerfil = String(perfil.dorsal || '').trim();
      const perfilActualObj = {
        id: miIdPerfil,
        nombre: perfil.nombre || 'Sin nombre',
        correo: perfil.correo || '',
        rol: perfil.rol || 'Jugador',
        categoria: esRolSinDorsal(perfil.rol) ? (perfil.rol || 'Entrenador') : (perfil.categoria || 'Sin categoría'),
        dorsal: (esRolSinDorsal(perfil.rol) || dorsalPerfil === '0') ? '' : dorsalPerfil,
        telefono: limpiarTelefono(perfil.telefono || ''),
        edad: esRolSinDorsal(perfil.rol) ? '' : normalizarEdad(perfil.edad || ''),
        foto: perfil.foto || '',
        esReservaDirectiva: Boolean(perfil.esReservaDirectiva)
      };
      const prev = mapa.get(miClavePerfil);
      mapa.set(miClavePerfil, {
        ...(prev || {}),
        ...perfilActualObj,
        foto: perfilActualObj.foto || prev?.foto || ''
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
  }, [perfilesClub, perfil, miIdPerfil, miClavePerfil]);

  const usuariosPorGeneroActual =
    generoPerfilesTab === 'femenina'
      ? usuariosFemeninosOrdenados
      : usuariosMasculinosOrdenados;

  const obtenerDatosFormateadosPartido = (p, yaJugado = false) => {
    const asistentes = p.asistentes || [];
    const voy = asistentes.includes(perfil.nombre);
    const marcadorVisible = normalizarMarcadorPartido(p.resultado || 'VS');
    const esMarcadorJugado = marcadorVisible !== 'VS' || yaJugado;

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
    return {
      asistentes,
      voy,
      marcadorVisible,
      esMarcadorJugado,
      fechaRescatada,
      localTexto,
      visitanteTexto,
      pabellonTexto,
      urlMaps
    };
  };

  const renderSelectorCategorias = () => (
    <div className="category-bar">
      {categoriasDisponibles.map((cat) => {
        const activa = normalizarCategoria(categoriaActiva) === normalizarCategoria(cat);
        return (
          <button
            key={cat}
            type="button"
            className={`subtab category-pill ${activa ? 'active' : ''}`}
            onClick={() => seleccionarCategoria(cat)}
          >
            <TextoConSignoGenero texto={cat} />
          </button>
        );
      })}
    </div>
  );

  const renderTarjetaPartidoCompacta = (p, yaJugado = false) => {
    const {
      asistentes,
      voy,
      marcadorVisible,
      esMarcadorJugado,
      fechaRescatada,
      localTexto,
      visitanteTexto
    } = obtenerDatosFormateadosPartido(p, yaJugado);

    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        onClick={() => setPartidoSeleccionadoId(p.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPartidoSeleccionadoId(p.id);
          }
        }}
        className={`card match-compact-card ${esMarcadorJugado ? 'is-played' : 'is-upcoming'}`}
      >
        <div className="match-compact-top">
          <span className={`tag match-status-tag ${esMarcadorJugado ? 'result' : 'upcoming'}`}>
            {esMarcadorJugado ? 'Jugado' : 'Por jugar'}
          </span>
          <span className="match-detail-link">Ver detalle ›</span>
        </div>

        <div className="match-compact-teams">
          <span className="match-team-home">{localTexto}</span>
          <span className={`match-score match-score-compact ${esMarcadorJugado ? 'played' : ''}`}>
            {marcadorVisible}
          </span>
          <span className="match-team-away">{visitanteTexto}</span>
        </div>

        <div className="match-compact-footer">
          <span className="match-compact-time">
            <Clock size={12} /> {fechaRescatada}
          </span>
          <span className={`match-compact-rsvp ${voy ? 'going' : ''}`}>
            {voy ? '✓ Voy' : `${asistentes.length} conv.`}
          </span>
        </div>
      </div>
    );
  };

  const renderModalPartido = () => {
    if (!partidoModal) return null;
    const {
      asistentes,
      voy,
      marcadorVisible,
      esMarcadorJugado,
      fechaRescatada,
      localTexto,
      visitanteTexto,
      pabellonTexto,
      urlMaps
    } = obtenerDatosFormateadosPartido(partidoModal, esPartidoYaJugado(partidoModal));

    return (
      <div className="modal-backdrop" onClick={() => setPartidoSeleccionadoId(null)}>
        <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <span className={`tag ${esMarcadorJugado ? 'result' : 'upcoming'}`}>
              {esMarcadorJugado ? 'Partido jugado' : 'Próximo partido'}
            </span>
            <div className="modal-header-actions">
              {isAdmin && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => handleDelete('partidos', partidoModal.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setPartidoSeleccionadoId(null)}
              >
                ✕ Cerrar
              </button>
            </div>
          </div>

          <div className="modal-scoreboard">
            <div className="modal-scoreboard-label">Equipos enfrentados</div>
            <div className="match-teams modal-teams">
              <span className="modal-team-home">{localTexto}</span>
              <span className={`match-score modal-score ${esMarcadorJugado ? 'played' : ''}`}>
                {marcadorVisible}
              </span>
              <span className="modal-team-away">{visitanteTexto}</span>
            </div>
          </div>

          <div className="modal-meta-list">
            <div className="modal-meta-item">
              <Clock size={16} color="#1e3a8a" />
              <span><strong>Fecha y hora:</strong> {fechaRescatada}</span>
            </div>

            <div className="modal-meta-item">
              <MapPin size={16} color="#1e3a8a" className="modal-meta-icon" />
              <span><strong>Dónde se juega:</strong> {pabellonTexto}</span>
            </div>

            <a
              href={urlMaps}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary modal-maps-btn"
            >
              <Navigation size={14} /> Abrir ubicación en Google Maps
            </a>
          </div>

          <div className="modal-rsvp-bar">
            <span className="modal-rsvp-count">
              Convocados: <strong>{asistentes.length}</strong>
            </span>
            <button
              type="button"
              className={`btn-rsvp ${voy ? 'yes' : ''}`}
              onClick={() => toggleAsistencia(partidoModal)}
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
    const telefonoItem = limpiarTelefono(item.telefono || '');
    const edadItem = normalizarEdad(item.edad || '');
    const esUsuarioActual = obtenerClaveUnicaPerfil(item) === miClavePerfil;
    return (
      <div key={obtenerClaveUnicaPerfil(item)} className="card player-row">
        <div className="player-info">
          <div className="player-avatar-col">
            <AvatarCircular src={item.foto} alt={item.nombre} letra={item.nombre?.[0] || 'U'} tamano={46} />
            {!esEspecialItem && dorsalItem && dorsalItem !== '0' && (
              <span className="player-dorsal-label">#{dorsalItem}</span>
            )}
          </div>
          <div>
            <div className="player-name">
              {item.nombre} {esUsuarioActual ? '(Tú)' : ''}
            </div>
            <div className="player-sub">
              {esEspecialItem ? (
                <TextoConSignoGenero texto={item.categoria || item.rol} />
              ) : (
                <>
                  {item.rol} · <TextoConSignoGenero texto={item.categoria || 'Sin categoría'} />
                  {edadItem ? ` · ${edadItem} años` : ''}
                </>
              )}
            </div>
            {puedeVerTelefonosPrivados && !esEspecialItem && telefonoItem && (
              <div className="player-phone">
                <a href={`tel:${telefonoItem}`} className="player-phone-link">
                  <Phone size={12} /> {telefonoItem}
                </a>
              </div>
            )}
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

  const perfilesEspecialesCreados = deduplicarPerfilesLista(
    perfilesClub.filter((p) => p.esReservaDirectiva || esRolSinDorsal(p.rol))
  );

  if (!sesionIniciada) {
    return (
      <div>
        <header className="header">
          {escudoCargado ? (
            <img
              src="/escudo.png"
              alt={`Escudo ${NOMBRE_CLUB_APP}`}
              className="escudo-img"
              onError={() => setEscudoCargado(false)}
            />
          ) : (
            <div className="badge-escudo">CDRA</div>
          )}
          <div className="header-content">
            <h1>{NOMBRE_CLUB_APP}</h1>
            <p>Picanya Fútbol Sala · Acceso del Club</p>
          </div>
        </header>

        <main className="container">
          {!modoRegistroJugador ? (
            <form className="card auth-card" onSubmit={handleIniciarSesion}>
              <div className="section-title">
                <Lock size={19} /> Iniciar Sesión
              </div>
              <p className="auth-help">
                Entra con tu <strong>nombre o seudónimo</strong> y tu <strong>contraseña / PIN</strong> (o usa el PIN inicial <strong>1234</strong> para configurar un perfil nuevo).
              </p>
              <input
                type="text"
                placeholder="Nombre o seudónimo *"
                className="auth-input auth-input-lg"
                value={identificadorLoginInput}
                onChange={(e) => setIdentificadorLoginInput(e.target.value)}
              />
              <input
                type="password"
                placeholder="Contraseña o PIN * (inicio: 1234)"
                className="auth-input auth-input-lg"
                value={pinLoginInput}
                onChange={(e) => setPinLoginInput(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary">Entrar</button>
              <button
                type="button"
                className="btn-rsvp auth-secondary-btn"
                onClick={() => {
                  setModoRegistroJugador(true);
                  setFormNombre('');
                  setFormDorsal('');
                  setFormCategoria('');
                  setFormTelefono('');
                  setFormEdad('');
                  setFormFoto('');
                  setFormPinNuevo('');
                  setFormPinConfirm('');
                }}
              >
                <UserPlus size={14} /> Registrarse como Jugador
              </button>
            </form>
          ) : (
            <form className="card auth-card auth-card-register" onSubmit={handleGuardarConfiguracionObligatoria}>
              <div className="section-title">
                <UserPlus size={19} /> Registro de Jugador
              </div>
              <p className="auth-note">
                Los campos con * son obligatorios. La foto es <strong>opcional</strong>. Tu teléfono solo será visible para Directiva y entrenadores.
              </p>

              <div className="avatar-upload-box">
                <AvatarCircular
                  src={formFoto}
                  alt="Vista previa"
                  letra={formNombre?.[0] || 'J'}
                  tamano={72}
                />
                <div className="avatar-dorsal-preview">
                  Dorsal: #{formDorsal || '-'}
                </div>
                <label className="btn-primary file-upload-label">
                  <Camera size={15} /> Subir foto (opcional)
                  <input
                    type="file"
                    accept="image/*"
                    className="file-input-hidden"
                    onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setFormFoto(dataUrl))}
                  />
                </label>
              </div>

              <div className="field-group">
                <label className="field-label">Nombre o seudónimo *</label>
                <input
                  className="field-input"
                  placeholder="Ej. Dani o Daniel López *"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Número de dorsal *</label>
                <input
                  className="field-input"
                  placeholder="Ej. 10 *"
                  value={formDorsal}
                  onChange={(e) => setFormDorsal(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Edad *</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  className="field-input"
                  placeholder="Ej. 16 *"
                  value={formEdad}
                  onChange={(e) => setFormEdad(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Teléfono de contacto (ficha del club) *</label>
                <input
                  type="tel"
                  className="field-input"
                  placeholder="Ej. 600123456 *"
                  value={formTelefono}
                  onChange={(e) => setFormTelefono(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Equipo / Categoría *</label>
                <SelectorCategoriaYGenero
                  valorActual={formCategoria}
                  onChangeValor={(val) => setFormCategoria(val)}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Contraseña / PIN personal (mín. 4 caracteres) *</label>
                <input
                  type="password"
                  className="field-input"
                  placeholder="Tu contraseña o PIN *"
                  value={formPinNuevo}
                  onChange={(e) => setFormPinNuevo(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Confirmar contraseña / PIN *</label>
                <input
                  type="password"
                  className="field-input"
                  placeholder="Repite tu contraseña o PIN *"
                  value={formPinConfirm}
                  onChange={(e) => setFormPinConfirm(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary">Completar Registro y Entrar</button>
              <button
                type="button"
                className="btn-rsvp auth-secondary-btn"
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
          {escudoCargado ? (
            <img
              src="/escudo.png"
              alt={`Escudo ${NOMBRE_CLUB_APP}`}
              className="escudo-img"
              onError={() => setEscudoCargado(false)}
            />
          ) : (
            <div className="badge-escudo">CDRA</div>
          )}
          <div className="header-content">
            <h1>{NOMBRE_CLUB_APP}</h1>
            <div className="header-actions">
              <button type="button" className="admin-btn" onClick={handleCerrarSesion}>
                <LogOut size={14} /> Salir
              </button>
            </div>
            <p className="header-usuario">
              {editandoEspecial ? `Perfil de ${formRol}` : 'Configuración del jugador'}
            </p>
          </div>
        </header>

        <main className="container">
          <form className="card onboarding-form" onSubmit={handleGuardarConfiguracionObligatoria}>
            <div className="section-title">
              <KeyRound size={19} /> {editandoEspecial ? `Editar Perfil (${formRol})` : 'Completa tu Perfil de Jugador'}
            </div>

            <div className="avatar-upload-box">
              <AvatarCircular
                src={formFoto}
                alt="Vista previa"
                letra={formNombre?.[0] || 'U'}
                tamano={72}
              />
              {!editandoEspecial && (
                <div className="avatar-dorsal-preview">
                  Dorsal: #{formDorsal || '-'}
                </div>
              )}
              <label className="btn-primary file-upload-label">
                <Camera size={15} /> Subir foto (opcional)
                <input
                  type="file"
                  accept="image/*"
                  className="file-input-hidden"
                  onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setFormFoto(dataUrl))}
                />
              </label>
            </div>

            <div className="field-group">
              <label className="field-label">Nombre o seudónimo *</label>
              <input
                className="field-input"
                placeholder="Nombre o seudónimo *"
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                required
              />
            </div>

            {!editandoEspecial && (
              <>
                <div className="field-group">
                  <label className="field-label">Número de dorsal *</label>
                  <input
                    className="field-input"
                    placeholder="Ej. 10 *"
                    value={formDorsal}
                    onChange={(e) => setFormDorsal(e.target.value)}
                    required
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Edad *</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    className="field-input"
                    placeholder="Ej. 16 *"
                    value={formEdad}
                    onChange={(e) => setFormEdad(e.target.value)}
                    required
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Teléfono de contacto (ficha del club) *</label>
                  <input
                    type="tel"
                    className="field-input"
                    placeholder="Ej. 600123456 *"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    required
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Equipo / Categoría *</label>
                  <SelectorCategoriaYGenero
                    valorActual={formCategoria}
                    onChangeValor={(val) => setFormCategoria(val)}
                  />
                </div>
              </>
            )}

            <div className="field-group">
              <label className="field-label">Contraseña / PIN personal (mín. 4, distinto de 1234) *</label>
              <input
                type="password"
                className="field-input"
                placeholder="Nueva contraseña o PIN *"
                value={formPinNuevo}
                onChange={(e) => setFormPinNuevo(e.target.value)}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">Confirmar contraseña / PIN *</label>
              <input
                type="password"
                className="field-input"
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
  const etiquetaUsuarioCabecera = formatearEtiquetaUsuarioCabecera(
    perfil,
    mostrarDorsalCabecera,
    dorsalCabecera
  );

  return (
    <div>
      <header className="header">
        {escudoCargado ? (
          <img
            src="/escudo.png"
            alt={`Escudo ${NOMBRE_CLUB_APP}`}
            className="escudo-img"
            onError={() => setEscudoCargado(false)}
          />
        ) : (
          <div className="badge-escudo">CDRA</div>
        )}

        <div className="header-content">
          <h1>{NOMBRE_CLUB_APP}</h1>

          <div className="header-actions">
            <button
              type="button"
              className="admin-btn"
              title="Actualizar datos desde Firebase"
              onClick={() => cargarDatosUnaVez(true, true)}
              disabled={refrescandoDatos}
            >
              <RefreshCw size={14} /> {refrescandoDatos ? '...' : 'Sync'}
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => {
                setTab('perfil');
                setShowForm(false);
                setShowImportTablaBox(false);
                setEditandoAvisoId(null);
              }}
            >
              <User size={14} /> Perfil
            </button>
            <button
              type="button"
              className={`admin-btn ${isAdmin ? 'active' : ''}`}
              onClick={toggleAdmin}
            >
              {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
              {isAdmin ? 'Directiva' : 'PIN'}
            </button>
          </div>

          <p className="header-usuario">{etiquetaUsuarioCabecera}</p>
        </div>
      </header>

      <main className="container">
        {alertaAvisoEntrante && (
          <div className={`card alert-banner ${alertaAvisoEntrante.urgente ? 'is-urgent' : 'is-normal'}`}>
            <div className="alert-banner-top">
              <span className={`tag ${alertaAvisoEntrante.urgente ? 'urgent' : ''}`}>
                {alertaAvisoEntrante.urgente ? '🚨 Aviso Urgente' : '🔔 Nuevo Aviso del Club'}
              </span>
              <button
                type="button"
                className="alert-banner-close"
                onClick={() => setAlertaAvisoEntrante(null)}
              >
                ✕
              </button>
            </div>
            <div className="alert-banner-title">{alertaAvisoEntrante.titulo}</div>
            <div className="alert-banner-body">{alertaAvisoEntrante.mensaje}</div>
            <div className="alert-banner-author">
              Publicado por {alertaAvisoEntrante.autor}
            </div>
          </div>
        )}

        {tab === 'partidos' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Calendar size={19} /> Partidos y Asistencia</h2>
              <button
                type="button"
                className="btn-rsvp"
                disabled={sincronizandoUrls || refrescandoDatos}
                onClick={() => sincronizarPartidosDesdeWebs(true)}
                title="Actualizar partidos y clasificación de la categoría activa"
              >
                <RefreshCw size={14} />
                {sincronizandoUrls || refrescandoDatos ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>

            {renderSelectorCategorias()}

            <div className="subtabs">
              <button
                type="button"
                className={`subtab ${partidosSubtab === 'proximos' ? 'active' : ''}`}
                onClick={() => setPartidosSubtab('proximos')}
              >
                Por jugar ({partidosProximos.length})
              </button>
              <button
                type="button"
                className={`subtab ${partidosSubtab === 'jugados' ? 'active' : ''}`}
                onClick={() => setPartidosSubtab('jugados')}
              >
                Jugados ({partidosJugados.length})
              </button>
            </div>

            {partidosSubtab === 'proximos' && (
              <div>
                {partidosProximos.length === 0 ? (
                  <div className="card empty-state-card">
                    No hay partidos por jugar en {categoriaActiva} por ahora.
                  </div>
                ) : (
                  partidosProximos.map((p) => renderTarjetaPartidoCompacta(p, false))
                )}
              </div>
            )}

            {partidosSubtab === 'jugados' && (
              <div>
                {partidosJugados.length === 0 ? (
                  <div className="card empty-state-card">
                    Aún no hay partidos jugados en {categoriaActiva}.
                  </div>
                ) : (
                  partidosJugados.map((p) => renderTarjetaPartidoCompacta(p, true))
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'liga' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Trophy size={19} /> Clasificación y Goles</h2>
              {ligaSubtab === 'tabla' && (
                <button
                  type="button"
                  className="btn-rsvp"
                  disabled={sincronizandoUrls || refrescandoDatos}
                  onClick={handleActualizarClasificacion}
                  title="Actualizar clasificación de la categoría activa"
                >
                  <RefreshCw size={14} />
                  {sincronizandoUrls || refrescandoDatos ? 'Actualizando...' : 'Actualizar'}
                </button>
              )}
            </div>

            {ligaSubtab === 'tabla' && renderSelectorCategorias()}

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
                {showImportTablaBox && (
                  <form className="form-box" onSubmit={handleImportarClasificacionTexto}>
                    <div className="import-box-title">
                      Actualizar clasificación ({categoriaActiva})
                    </div>
                    <p className="import-box-help">
                      Pega aquí las filas de la clasificación (# Equipo Pts PJ PG PE PP GF GC Dif) y pulsa Actualizar:
                    </p>
                    <div className="import-box-actions">
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
                      Actualizar clasificación
                    </button>
                  </form>
                )}

                <div className="card table-wrap league-table-wrap">
                  <table className="league-table">
                    <thead>
                      <tr>
                        <th className="col-pos">#</th>
                        <th className="col-team">Equipo</th>
                        <th className="col-stat">Pts</th>
                        <th className="col-stat">PJ</th>
                        <th className="col-stat">PG</th>
                        <th className="col-stat">PE</th>
                        <th className="col-stat">PP</th>
                        <th className="col-stat">GF</th>
                        <th className="col-stat">GC</th>
                        <th className="col-stat">Dif</th>
                        {isAdmin && <th className="col-action"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {clasificacionFiltrada.map((c, idx) => {
                        const nombreLimpio = sanearNombreEquipoTabla([c.equipo]);
                        const gf = Number(c.gf || 0);
                        const gc = Number(c.gc || 0);
                        const dif = calcularDifClasificacion(gf, gc, c.dif);
                        return (
                          <tr key={c.id} className={nombreLimpio.toLowerCase().includes('altamira') ? 'highlight-row' : ''}>
                            <td className="col-pos col-pos-bold">
                              {c.pos || idx + 1}
                            </td>
                            <td className="col-team">
                              <div className="team-cell-inner">
                                <AvatarCircular
                                  src={c.escudo}
                                  alt={nombreLimpio}
                                  letra={nombreLimpio?.[0] || 'E'}
                                  tamano={24}
                                />
                                <span title={nombreLimpio} className="team-name-truncate">
                                  {nombreLimpio}
                                </span>
                                {isAdmin && (
                                  <label className="shield-upload-btn" title="Subir escudo del equipo">
                                    <Camera size={11} />
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="file-input-hidden"
                                      onChange={(e) => handleSubirEscudoEquipo(c, e.target.files[0])}
                                    />
                                  </label>
                                )}
                              </div>
                            </td>
                            <td className="col-stat">
                              <strong className="pts-highlight">{c.pts ?? 0}</strong>
                            </td>
                            <td className="col-stat">{c.pj ?? 0}</td>
                            <td className="col-stat">{c.pg ?? 0}</td>
                            <td className="col-stat">{c.pe ?? 0}</td>
                            <td className="col-stat">{c.pp ?? 0}</td>
                            <td className="col-stat">{gf}</td>
                            <td className="col-stat">{gc}</td>
                            <td className="col-stat col-dif-bold">
                              {formatearDif(dif)}
                            </td>
                            {isAdmin && (
                              <td className="col-action">
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
                      <div className="player-avatar-col">
                        <AvatarCircular src={j.foto} alt={j.nombre} letra={j.nombre?.[0] || 'J'} tamano={46} />
                        {j.dorsal && j.dorsal !== '0' && (
                          <span className="player-dorsal-label">#{j.dorsal}</span>
                        )}
                      </div>
                      <div>
                        <div className="player-name">
                          {idx + 1}º · {j.nombre}
                        </div>
                        <div className="player-sub">
                          <TextoConSignoGenero texto={j.categoria} />
                          {puedeGestionarAlaYGoles && j.posicion && j.posicion !== 'Sin asignar' ? ` · ${j.posicion}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="goal-controls">
                      <span className="tag result"><Award size={12} className="goal-award-icon" /> {j.goles || 0}</span>
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
            </div>

            {plantilla.map((j) => {
              const telJugador = limpiarTelefono(j.telefono || '');
              const edadJugador = normalizarEdad(j.edad || '');
              return (
                <div key={j.id} className="card player-row">
                  <div className="player-info">
                    <div className="player-avatar-col">
                      <AvatarCircular src={j.foto} alt={j.nombre} letra={j.nombre?.[0] || 'J'} tamano={46} />
                      {j.dorsal && j.dorsal !== '0' && (
                        <span className="player-dorsal-label">#{j.dorsal}</span>
                      )}
                    </div>
                    <div>
                      <div className="player-name">{j.nombre}</div>
                      <div className="player-sub">
                        <TextoConSignoGenero texto={j.categoria} />
                        {edadJugador ? ` · ${edadJugador} años` : ''}
                        {puedeGestionarAlaYGoles && j.posicion && j.posicion !== 'Sin asignar' ? ` · ${j.posicion}` : ''}
                        {puedeGestionarAlaYGoles ? ` · ${j.goles || 0} goles` : ''}
                      </div>
                      {puedeVerTelefonosPrivados && telJugador && (
                        <div className="player-phone">
                          <a href={`tel:${telJugador}`} className="player-phone-link">
                            <Phone size={12} /> {telJugador}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <button className="btn-danger" onClick={() => handleDelete('plantilla', j.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'avisos' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Bell size={19} /> Club y Avisos</h2>
              <div className="section-header-actions">
                {permisoNotifMovil !== 'granted' && (
                  <button type="button" className="btn-rsvp" onClick={solicitarPermisoNotificacionesMovil}>
                    <Bell size={14} /> Activar alertas móvil
                  </button>
                )}
                {puedePublicarAvisos && avisosSubtab === 'avisos' && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setShowForm(!showForm);
                      setEditandoAvisoId(null);
                    }}
                  >
                    + Aviso
                  </button>
                )}
              </div>
            </div>

            <div className="subtabs">
              <button className={`subtab ${avisosSubtab === 'avisos' ? 'active' : ''}`} onClick={() => setAvisosSubtab('avisos')}>
                Avisos
              </button>
              <button className={`subtab ${avisosSubtab === 'pistas' ? 'active' : ''}`} onClick={() => setAvisosSubtab('pistas')}>
                Pabellones, Horarios y Redes
              </button>
            </div>

            {avisosSubtab === 'avisos' && (
              <>
                {puedePublicarAvisos && showForm && (
                  <form className="form-box" onSubmit={handleAddAviso}>
                    <input placeholder="Título del aviso *" required value={nuevoAviso.titulo} onChange={(e) => setNuevoAviso({ ...nuevoAviso, titulo: e.target.value })} />
                    <textarea rows="3" placeholder="Mensaje para jugadores y familias *" required value={nuevoAviso.mensaje} onChange={(e) => setNuevoAviso({ ...nuevoAviso, mensaje: e.target.value })} />
                    <label className="checkbox-inline">
                      <input type="checkbox" className="checkbox-auto" checked={nuevoAviso.urgente} onChange={(e) => setNuevoAviso({ ...nuevoAviso, urgente: e.target.checked })} />
                      Marcar como Urgente
                    </label>
                    <button type="submit" className="btn-primary">Publicar Aviso</button>
                  </form>
                )}

                {avisos.map((a) => {
                  const estaEditando = editandoAvisoId === a.id && puedePublicarAvisos;
                  return (
                    <div key={a.id} className="card">
                      {estaEditando ? (
                        <form
                          onSubmit={(e) => handleGuardarEdicionAviso(e, a.id)}
                          className="edit-aviso-form"
                        >
                          <div className="edit-aviso-title">
                            Editar aviso
                          </div>
                          <input
                            placeholder="Título del aviso *"
                            className="field-input"
                            value={formEdicionAviso.titulo}
                            onChange={(e) => setFormEdicionAviso({ ...formEdicionAviso, titulo: e.target.value })}
                            required
                          />
                          <textarea
                            rows="3"
                            placeholder="Mensaje para jugadores y familias *"
                            className="field-input"
                            value={formEdicionAviso.mensaje}
                            onChange={(e) => setFormEdicionAviso({ ...formEdicionAviso, mensaje: e.target.value })}
                            required
                          />
                          <label className="checkbox-inline">
                            <input
                              type="checkbox"
                              className="checkbox-auto"
                              checked={formEdicionAviso.urgente}
                              onChange={(e) => setFormEdicionAviso({ ...formEdicionAviso, urgente: e.target.checked })}
                            />
                            Marcar como Urgente
                          </label>
                          <div className="edit-aviso-actions">
                            <button type="submit" className="btn-primary">
                              Guardar cambios
                            </button>
                            <button
                              type="button"
                              className="btn-rsvp"
                              onClick={handleCancelarEdicionAviso}
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="aviso-card-top">
                            <span className={`tag ${a.urgente ? 'urgent' : ''}`}>
                              {a.urgente ? 'Urgente' : 'Comunicado'}
                            </span>
                            {(puedePublicarAvisos || isAdmin) && (
                              <div className="aviso-card-actions">
                                {puedePublicarAvisos && (
                                  <button
                                    type="button"
                                    className="btn-rsvp"
                                    title="Editar aviso"
                                    onClick={() => handleIniciarEdicionAviso(a)}
                                  >
                                    <Pencil size={13} /> Editar
                                  </button>
                                )}
                                {isAdmin && (
                                  <button className="btn-danger" onClick={() => handleDelete('avisos', a.id)}>
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <h3 className="aviso-heading">{a.titulo}</h3>
                          <p className="aviso-body">{a.mensaje}</p>
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {avisosSubtab === 'pistas' && (
              <div>
                <div className="card">
                  <div className="info-card-title">
                    Redes Sociales del Club
                  </div>
                  <div className="info-card-sub">
                    Sigue toda la actividad, fotos y resultados oficiales
                  </div>
                  <div className="social-links-stack">
                    {REDES_SOCIALES_CLUB.map((red) => (
                      <a
                        key={red.nombre}
                        href={red.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary social-link-btn"
                        style={{ backgroundColor: red.color }}
                      >
                        <span>
                          <TextoConSignoGenero texto={red.nombre} />
                        </span>
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </div>
                </div>

                {PABELLONES.map((pb) => (
                  <div key={pb.nombre} className="card">
                    <div className="info-card-title">{pb.nombre}</div>
                    <div className="info-card-sub">{pb.zona}</div>
                    <a
                      href={pb.mapa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary maps-link-btn"
                    >
                      <Navigation size={14} /> Abrir en Maps
                    </a>
                  </div>
                ))}

                {ENTRENOS.map((en) => (
                  <div key={en.categoria} className="card">
                    <div className="training-cat">
                      <TextoConSignoGenero texto={en.categoria} />
                    </div>
                    <div className="training-days">{en.dias}</div>
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
                  <form className="card admin-panel-form" onSubmit={handleCrearPerfilEspecialDirectiva}>
                    <div className="section-title admin-panel-title">
                      <UserPlus size={17} /> Entrenador y 2º Entrenador ({perfilesEspecialesCreados.length}/{MAX_PERFILES_ESPECIALES_DIRECTIVA})
                    </div>
                    <p className="admin-panel-help">
                      No llevan dorsal; su rol y categoría es Entrenador o 2º Entrenador.
                    </p>
                    <select
                      className="field-input"
                      value={nuevoPerfilEspecial.rolEspecial}
                      onChange={(e) => setNuevoPerfilEspecial({ ...nuevoPerfilEspecial, rolEspecial: e.target.value })}
                    >
                      {ROLES_ESPECIALES_DIRECTIVA.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Nombre o seudónimo *"
                      className="field-input"
                      value={nuevoPerfilEspecial.nombre}
                      onChange={(e) => setNuevoPerfilEspecial({ ...nuevoPerfilEspecial, nombre: e.target.value })}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Contraseña o PIN (mín. 4 caracteres) *"
                      className="field-input"
                      value={nuevoPerfilEspecial.pinUsuario}
                      onChange={(e) => setNuevoPerfilEspecial({ ...nuevoPerfilEspecial, pinUsuario: e.target.value })}
                      required
                    />
                    <div className="special-avatar-row">
                      <AvatarCircular
                        src={nuevoPerfilEspecial.foto}
                        alt="Foto perfil especial"
                        letra={nuevoPerfilEspecial.nombre?.[0] || 'E'}
                        tamano={48}
                      />
                      <label className="btn-rsvp file-upload-label">
                        <Camera size={14} /> Foto (opcional)
                        <input
                          type="file"
                          accept="image/*"
                          className="file-input-hidden"
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
                  <form className="card admin-panel-form" onSubmit={handleCambiarPinDirectiva}>
                    <div className="section-title admin-panel-title">
                      <KeyRound size={17} /> Cambiar PIN de Directiva
                    </div>
                    <input
                      type="password"
                      placeholder="PIN actual de directiva"
                      className="field-input"
                      value={pinDirActualInput}
                      onChange={(e) => setPinDirActualInput(e.target.value)}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Nuevo PIN de directiva (mín. 4 caracteres)"
                      className="field-input"
                      value={pinDirNuevoInput}
                      onChange={(e) => setPinDirNuevoInput(e.target.value)}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Confirmar nuevo PIN de directiva"
                      className="field-input"
                      value={pinDirConfirmInput}
                      onChange={(e) => setPinDirConfirmInput(e.target.value)}
                      required
                    />
                    <div className="pin-form-actions">
                      <button type="submit" className="btn-primary pin-submit-flex">Actualizar PIN Directiva</button>
                      <button type="button" className="btn-rsvp" onClick={handleRestablecerPinDirectiva}>Restablecer 1980</button>
                    </div>
                  </form>
                )}
              </>
            )}

            {perfilSubtab === 'companeros' && (
              <div>
                {totalPerfilesVisibles === 0 ? (
                  <div className="card empty-state-card">
                    Aún no hay perfiles completados en el club.
                  </div>
                ) : (
                  <>
                    {directivasVisibles.map((item) => renderFilaPerfil(item))}
                    {entrenadoresVisibles.map((item) => renderFilaPerfil(item))}

                    <div className="subtabs gender-subtabs">
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
                      <div className="card empty-state-card">
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
          {firebaseOk ? '● Sincronizado con Firebase' : '○ Modo local activo'} · Creado por {NOMBRE_CREADOR_APP}
        </div>
      </main>

      {renderModalPartido()}

      <nav className="bottom-nav">
        <button className={`nav-item ${tab === 'partidos' ? 'active' : ''}`} onClick={() => { setTab('partidos'); setShowForm(false); setShowImportTablaBox(false); setEditandoAvisoId(null); }}>
          <Calendar size={20} />
          <span>Partidos</span>
        </button>
        <button className={`nav-item ${tab === 'liga' ? 'active' : ''}`} onClick={() => { setTab('liga'); setShowForm(false); setShowImportTablaBox(false); setEditandoAvisoId(null); }}>
          <Trophy size={20} />
          <span>Liga/Goles</span>
        </button>
        <button className={`nav-item ${tab === 'plantilla' ? 'active' : ''}`} onClick={() => { setTab('plantilla'); setShowForm(false); setShowImportTablaBox(false); setEditandoAvisoId(null); }}>
          <Users size={20} />
          <span>Plantilla</span>
        </button>
        <button className={`nav-item ${tab === 'avisos' ? 'active' : ''}`} onClick={() => { setTab('avisos'); setShowForm(false); setShowImportTablaBox(false); setEditandoAvisoId(null); }}>
          <Bell size={20} />
          <span>Avisos</span>
        </button>
      </nav>
    </div>
  );
}
