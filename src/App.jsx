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
  ExternalLink,
  Pencil
} from 'lucide-react';

const NOMBRE_CLUB_APP = 'C.D. Rafael Altamira Picanya';
const NOMBRE_CREADOR_APP = '@dagakol';
const PIN_INICIAL_OBLIGATORIO = '1234';
const PIN_DIRECTIVA_INICIAL = '1980';
const MAX_PERFILES_ESPECIALES_DIRECTIVA = 4;
const MAX_PARTIDOS_POR_IMPORTACION = 50;
const MAX_EQUIPOS_CLASIFICACION = 20;
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
  'https://futbuteo.com/valencia/equipo/c-d-rafael-altamira-picanya',
  'https://www.elbalondelacomunitat.es/equipo/905540140/partidos'
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

function normalizarMarcadorPartido(valor) {
  const limpio = String(valor || '').trim();
  if (!limpio || /^vs$/i.test(limpio)) return 'VS';
  const matchMarcador = limpio.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (matchMarcador) {
    return `${matchMarcador[1]} - ${matchMarcador[2]}`;
  }
  return limpio;
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
        categoria: detectarCategoriaImportada(`${linea} ${jornadaActual}`),
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
      resultado: marcadorEnLineaMatch
        ? `${marcadorEnLineaMatch[1]} - ${marcadorEnLineaMatch[2]}`
        : 'VS'
    });
  }

  return resultados;
}

function parsearPartidosDesdeHtml(htmlTexto) {
  if (!htmlTexto || typeof DOMParser === 'undefined') return [];
  try {
    const parser = new DOMParser();
    const docHtml = parser.parseFromString(htmlTexto, 'text/html');
    const textoPlano = docHtml.body ? docHtml.body.innerText || docHtml.body.textContent || '' : '';
    return parsearPartidosDesdeTexto(textoPlano);
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
  const [urlsSincronizacion, setUrlsSincronizacion] = useState(() => {
    const guardadas = leerListaLocal('cdra_urls_partidos', URLS_POR_DEFECTO);
    const lista = Array.isArray(guardadas) && guardadas.length > 0 ? guardadas : URLS_POR_DEFECTO;
    if (!lista.includes(URLS_POR_DEFECTO[0])) {
      return [URLS_POR_DEFECTO[0], ...lista];
    }
    return lista;
  });
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
      return;
    }

    setRefrescandoDatos(true);
    try {
      const peticiones = [
        getDocs(query(collection(db, 'partidos'), orderBy('createdAt', 'desc'), limit(25))),
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
    setShowImportBox(false);
    setShowImportTablaBox(false);
    setEditandoAvisoId(null);
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
    telefono: '',
    edad: '',
    goles: '0',
    foto: ''
  });

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
      setShowImportBox(false);
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

  const registrarPartidosSinDuplicar = async (candidatos) => {
    let listaTrabajo = [...partidos];
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

      const itemLimpio = {
        categoria: cand.categoria || detectarCategoriaImportada(cand.categoriaTexto || ''),
        local: localFinal,
        visitante: visitanteFinal,
        fecha: fechaDetectada,
        pabellon: pabellonFinal,
        resultado: resultadoNormalizado
      };

      const clave = normalizarClavePartido(itemLimpio);
      if (!clave) continue;

      procesados += 1;

      if (indicePorClave.has(clave)) {
        const idxExistente = indicePorClave.get(clave);
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
          (pabellonFinal && pabellonFinal !== actual?.pabellon);

        if (cambioDetectado) {
          const partidoActualizado = {
            ...actual,
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

    if (nuevosParaAlta.length === 0 && actualizadosFirestore.length === 0) {
      return { añadidos: 0, actualizados: 0 };
    }

    guardarPartidosLocal(listaTrabajo);

    if (firebaseOk) {
      const tareas = [];

      for (const act of actualizadosFirestore) {
        if (act?.id && !String(act.id).startsWith('demo') && !String(act.id).startsWith('sync_')) {
          tareas.push(
            updateDoc(doc(db, 'partidos', act.id), {
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
      actualizados: actualizadosFirestore.length
    };
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

    let ordenada = [...clasificacion, ...nuevosConId].sort((a, b) => {
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
      const resultadosAltas = await Promise.allSettled(
        nuevos.map((item) => addDoc(collection(db, 'clasificacion'), item))
      );

      let huboIdReal = false;
      ordenada = ordenada.map((c) => {
        const idx = nuevosConId.findIndex((n) => n.id === c.id);
        if (idx !== -1 && resultadosAltas[idx]?.status === 'fulfilled') {
          huboIdReal = true;
          return { ...c, id: resultadosAltas[idx].value.id };
        }
        return c;
      });

      if (huboIdReal) {
        guardarClasificacionLocal(ordenada);
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
      await Promise.allSettled(
        anteriores
          .filter((item) => !/^c\d+$/.test(item.id))
          .map((item) => deleteDoc(doc(db, 'clasificacion', item.id)))
      );
    }
  };

  const handleSubirEscudoEquipo = async (equipoItem, file) => {
    if (!isAdmin || !file) return;
    procesarFotoCircular(file, async (dataUrl) => {
      if (dataUrl === (equipoItem.escudo || '')) return;
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
      await Promise.allSettled(
        eliminados
          .filter((item) => !/^(demo|c|p|a|m)\d+$/.test(item.id))
          .map((item) => deleteDoc(doc(db, 'partidos', item.id)))
      );
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
      await Promise.allSettled(
        eliminados
          .filter((item) => !/^(demo|c|p|a|m)\d+$/.test(item.id))
          .map((item) => deleteDoc(doc(db, 'partidos', item.id)))
      );
    }
    alert(`Se eliminaron ${eliminados.length} partido(s) con datos incompletos o de fecha/jornada como rival.`);
  };

  const handleAgregarUrlSincronizacion = () => {
    const limpia = nuevaUrlInput.trim();
    if (!limpia) return;
    if (!urlsSincronizacion.includes(limpia)) {
      const actualizada = [...urlsSincronizacion, limpia];
      setUrlsSincronizacion(actualizada);
      guardarLocalSeguro('cdra_urls_partidos', actualizada);
    }
    setNuevaUrlInput('');
  };

  const handleQuitarUrlSincronizacion = (urlABorrar) => {
    const actualizada = urlsSincronizacion.filter((u) => u !== urlABorrar);
    setUrlsSincronizacion(actualizada);
    guardarLocalSeguro('cdra_urls_partidos', actualizada);
  };

  const sincronizarPartidosDesdeWebs = async (mostrarAvisoResultado = true) => {
    if (urlsSincronizacion.length === 0) {
      if (mostrarAvisoResultado) {
        alert('Añade al menos una URL primero.');
      }
      return;
    }
    setSincronizandoUrls(true);
    try {
      let partidosDetectados = [];
      let clasifDetectada = [];
      let huboRespuestaEndpoint = false;
      let motivosError = [];

      try {
        const resp = await fetch('/api/sincronizar-partidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: urlsSincronizacion })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.ok) {
            huboRespuestaEndpoint = true;
            partidosDetectados = Array.isArray(data.partidos) ? data.partidos : [];
            clasifDetectada = Array.isArray(data.clasificacion) ? data.clasificacion : [];
            if (Array.isArray(data.errores) && data.errores.length > 0) {
              motivosError = data.errores.map((e) => e.motivo).filter(Boolean);
            }
          }
        }
      } catch {
        // Si no existe endpoint /api/sincronizar-partidos, probamos lectura directa
      }

      if (!huboRespuestaEndpoint || partidosDetectados.length === 0) {
        for (const urlObjetivo of urlsSincronizacion) {
          try {
            const r = await fetch(urlObjetivo);
            if (!r.ok) continue;
            const cuerpo = await r.text();
            const extraidos = cuerpo.trim().startsWith('<')
              ? parsearPartidosDesdeHtml(cuerpo)
              : parsearPartidosDesdeTexto(cuerpo);
            if (extraidos.length > 0) {
              partidosDetectados = [...partidosDetectados, ...extraidos];
            }
          } catch {
            // Bloqueo CORS o carga dinámica en cliente
          }
        }
      }

      await cargarDatosUnaVez(true, false);

      const { añadidos, actualizados } = await registrarPartidosSinDuplicar(partidosDetectados);
      if (clasifDetectada.length > 0) {
        await registrarClasificacionSinDuplicar(clasifDetectada);
      }

      if (mostrarAvisoResultado) {
        const avisoBloqueos =
          motivosError.length > 0 && añadidos === 0 && actualizados === 0
            ? `\nNota: la web puede cargar datos dinámicos o restringir lectura directa (${motivosError.join(', ')}). Puedes usar "Pegar texto" si falta algún partido.`
            : '';

        if (añadidos > 0 || actualizados > 0) {
          alert(
            `¡Partidos actualizados! ${añadidos} partido(s) nuevo(s) y ${actualizados} partido(s) jugado(s)/modificado(s) sincronizados.${avisoBloqueos}`
          );
        } else {
          alert(`Partidos revisados y al día: no había cambios ni partidos nuevos.${avisoBloqueos}`);
        }
      }
    } catch {
      if (mostrarAvisoResultado) {
        alert('No se pudo completar la sincronización automática. Usa "Pegar texto" si la web bloquea la lectura directa.');
      }
    } finally {
      setSincronizandoUrls(false);
    }
  };

  const handleSincronizarUrls = async () => {
    await sincronizarPartidosDesdeWebs(true);
  };

  const handleAddPartido = async (e) => {
    e.preventDefault();
    if (!nuevoPartido.visitante) return;
    const item = {
      ...nuevoPartido,
      resultado: normalizarMarcadorPartido(nuevoPartido.resultado),
      asistentes: [],
      createdAt: serverTimestamp()
    };
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

    const { añadidos, actualizados } = await registrarPartidosSinDuplicar(parseados);
    if (añadidos === 0 && actualizados === 0) {
      alert('Esos partidos ya estaban registrados sin cambios (0 duplicados).');
      return;
    }

    setTextoImportarPartidos('');
    setShowImportBox(false);
    alert(`¡Listo! ${añadidos} partido(s) nuevo(s) y ${actualizados} partido(s) actualizado(s).`);
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
    const telefonoLimpio = limpiarTelefono(nuevoJugador.telefono);
    const edadLimpia = normalizarEdad(nuevoJugador.edad);

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
    if (telefonoLimpio.length < 6) {
      alert('El campo Teléfono * es obligatorio para la ficha del club.');
      return;
    }
    if (!edadLimpia) {
      alert('El campo Edad * es obligatorio (entre 1 y 99 años).');
      return;
    }
    if (existeDorsalEnCategoria(dorsalLimpio, categoriaLimpia)) {
      alert(`ERROR: Ya existe un jugador con el dorsal #${dorsalLimpio} en ${categoriaLimpia}. No puede haber dos dorsales iguales en la misma categoría.`);
      return;
    }

    const item = {
      ...nuevoJugador,
      dorsal: dorsalLimpio,
      nombre: nombreLimpio,
      posicion: puedeGestionarAlaYGoles ? (nuevoJugador.posicion || 'Ala') : 'Sin asignar',
      categoria: categoriaLimpia,
      telefono: telefonoLimpio,
      edad: edadLimpia,
      goles: puedeGestionarAlaYGoles ? Math.max(0, Number(nuevoJugador.goles || 0)) : 0,
      foto: nuevoJugador.foto || '',
      createdAt: serverTimestamp()
    };
    const idTemporal = `jug_${Date.now()}`;
    const actualizada = [...plantilla, { id: idTemporal, ...item }];
    guardarPlantillaLocal(actualizada);
    setShowForm(false);
    setNuevoJugador({ dorsal: '', nombre: '', posicion: 'Ala', categoria: '', telefono: '', edad: '', goles: '0', foto: '' });

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

    if (firebaseOk && !/^(demo|c|p|a|m)\d+$/.test(id)) {
      try {
        await deleteDoc(doc(db, col, id));
      } catch {
        // Eliminado localmente aunque el documento no existiera en Firebase
      }
    }
  };

  const { proximos: partidosProximos, jugados: partidosJugados } = useMemo(
    () => separarPartidosProximosYJugados(partidos),
    [partidos]
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

  const renderTarjetaPartido = (p, yaJugado = false) => {
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

    return (
      <div
        key={p.id}
        className="card"
        style={esMarcadorJugado ? { borderLeft: '4px solid var(--primary)' } : undefined}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={`tag ${esMarcadorJugado ? 'result' : ''}`}>
              <TextoConSignoGenero texto={p.categoria} />
            </span>
            <span
              className="tag"
              style={
                esMarcadorJugado
                  ? { background: '#dcfce7', color: '#166534' }
                  : { background: '#eff6ff', color: '#1e3a8a' }
              }
            >
              {esMarcadorJugado ? 'Jugado' : 'Por jugar'}
            </span>
          </div>
          {isAdmin && (
            <button className="btn-danger" onClick={() => handleDelete('partidos', p.id)}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="match-teams">
          <span style={{ flex: 1 }}>{localTexto}</span>
          <span
            className="match-score"
            style={
              esMarcadorJugado
                ? { background: '#1e3a8a', color: '#ffffff' }
                : undefined
            }
          >
            {marcadorVisible}
          </span>
          <span style={{ flex: 1, textAlign: 'right' }}>{visitanteTexto}</span>
        </div>
        <div className="match-meta">
          <span><Clock size={13} /> {fechaRescatada}</span>
          <a
            href={urlMaps}
            target="_blank"
            rel="noopener noreferrer"
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
    const telefonoItem = limpiarTelefono(item.telefono || '');
    const edadItem = normalizarEdad(item.edad || '');
    const esUsuarioActual = obtenerClaveUnicaPerfil(item) === miClavePerfil;
    return (
      <div key={obtenerClaveUnicaPerfil(item)} className="card player-row">
        <div className="player-info">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <AvatarCircular src={item.foto} alt={item.nombre} letra={item.nombre?.[0] || 'U'} tamano={46} />
            {!esEspecialItem && dorsalItem && dorsalItem !== '0' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>#{dorsalItem}</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {item.nombre} {esUsuarioActual ? '(Tú)' : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginTop: 2 }}>
                <a href={`tel:${telefonoItem}`} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
            <form className="card" onSubmit={handleGuardarConfiguracionObligatoria} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div className="section-title">
                <UserPlus size={19} /> Registro de Jugador
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                Los campos con * son obligatorios. La foto es <strong>opcional</strong>. Tu teléfono solo será visible para Directiva y entrenadores.
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
                  <Camera size={15} /> Subir foto (opcional)
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
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Edad *</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  placeholder="Ej. 16 *"
                  value={formEdad}
                  onChange={(e) => setFormEdad(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Teléfono de contacto (ficha del club) *</label>
                <input
                  type="tel"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                  placeholder="Ej. 600123456 *"
                  value={formTelefono}
                  onChange={(e) => setFormTelefono(e.target.value)}
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
                <Camera size={15} /> Subir foto (opcional)
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
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Edad *</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                    placeholder="Ej. 16 *"
                    value={formEdad}
                    onChange={(e) => setFormEdad(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Teléfono de contacto (ficha del club) *</label>
                  <input
                    type="tel"
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}
                    placeholder="Ej. 600123456 *"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
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
                setShowImportBox(false);
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
          <div
            className="card"
            style={{
              border: alertaAvisoEntrante.urgente ? '2px solid var(--danger)' : '2px solid var(--primary)',
              background: alertaAvisoEntrante.urgente ? '#fef2f2' : '#eff6ff',
              marginBottom: 12
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className={`tag ${alertaAvisoEntrante.urgente ? 'urgent' : ''}`}>
                {alertaAvisoEntrante.urgente ? '🚨 Aviso Urgente' : '🔔 Nuevo Aviso del Club'}
              </span>
              <button
                type="button"
                onClick={() => setAlertaAvisoEntrante(null)}
                style={{ background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer', color: '#475569' }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{alertaAvisoEntrante.titulo}</div>
            <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.4 }}>{alertaAvisoEntrante.mensaje}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              Publicado por {alertaAvisoEntrante.autor}
            </div>
          </div>
        )}

        {tab === 'partidos' && (
          <div>
            <div className="section-header">
              <h2 className="section-title"><Calendar size={19} /> Partidos y Asistencia</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-rsvp"
                  disabled={sincronizandoUrls || refrescandoDatos}
                  onClick={() => sincronizarPartidosDesdeWebs(true)}
                  title="Actualizar partidos por jugar y jugados desde las webs vinculadas"
                >
                  <RefreshCw size={14} />
                  {sincronizandoUrls || refrescandoDatos ? 'Actualizando...' : 'Actualizar'}
                </button>
                {isAdmin && (
                  <>
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
                  </>
                )}
              </div>
            </div>

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
                    Pega aquí las jornadas o enfrentamientos de Futbuteo, El balón de la Comunitat o FFCV y se añadirán o actualizarán sin duplicar:
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
                    <Download size={14} /> Añadir o actualizar partidos pegados
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
                    No hay partidos por jugar programados por ahora.
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

                <div
                  className="card table-wrap"
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    overflowX: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    padding: '4px 2px'
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      minWidth: '520px',
                      borderCollapse: 'collapse',
                      fontSize: '12px'
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>#</th>
                        <th style={{ padding: '8px 6px', whiteSpace: 'nowrap', textAlign: 'left', minWidth: '145px' }}>Equipo</th>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>Pts</th>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>PJ</th>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>PG</th>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>PE</th>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>PP</th>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>GF</th>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>GC</th>
                        <th style={{ padding: '8px 5px', whiteSpace: 'nowrap', textAlign: 'center' }}>Dif</th>
                        {isAdmin && <th style={{ padding: '8px 4px', whiteSpace: 'nowrap', textAlign: 'center' }}></th>}
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
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center', fontWeight: 700 }}>
                              {c.pos || idx + 1}
                            </td>
                            <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'left', maxWidth: '185px' }}>
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  maxWidth: '100%',
                                  verticalAlign: 'middle'
                                }}
                              >
                                <AvatarCircular
                                  src={c.escudo}
                                  alt={nombreLimpio}
                                  letra={nombreLimpio?.[0] || 'E'}
                                  tamano={24}
                                />
                                <span
                                  title={nombreLimpio}
                                  style={{
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: 'inline-block'
                                  }}
                                >
                                  {nombreLimpio}
                                </span>
                                {isAdmin && (
                                  <label
                                    title="Subir escudo del equipo"
                                    style={{
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      padding: 3,
                                      borderRadius: 6,
                                      border: '1px solid var(--border)',
                                      background: '#fff',
                                      flexShrink: 0
                                    }}
                                  >
                                    <Camera size={11} />
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
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>
                              <strong style={{ color: 'var(--primary)' }}>{c.pts ?? 0}</strong>
                            </td>
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>{c.pj ?? 0}</td>
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>{c.pg ?? 0}</td>
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>{c.pe ?? 0}</td>
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>{c.pp ?? 0}</td>
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>{gf}</td>
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>{gc}</td>
                            <td style={{ padding: '8px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center', fontWeight: 700 }}>
                              {formatearDif(dif)}
                            </td>
                            {isAdmin && (
                              <td style={{ padding: '8px 4px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>
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
                <input
                  type="number"
                  min="1"
                  max="99"
                  placeholder="Edad del jugador (ej. 16) *"
                  required
                  value={nuevoJugador.edad}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, edad: e.target.value })}
                />
                <input
                  type="tel"
                  placeholder="Teléfono del jugador (ficha del club) *"
                  required
                  value={nuevoJugador.telefono}
                  onChange={(e) => setNuevoJugador({ ...nuevoJugador, telefono: e.target.value })}
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
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  Foto del jugador (opcional):
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => procesarFotoCircular(e.target.files[0], (dataUrl) => setNuevoJugador({ ...nuevoJugador, foto: dataUrl }))}
                  />
                </label>
                <button type="submit" className="btn-primary">Guardar Jugador</button>
              </form>
            )}

            {plantilla.map((j) => {
              const telJugador = limpiarTelefono(j.telefono || '');
              const edadJugador = normalizarEdad(j.edad || '');
              return (
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
                        {edadJugador ? ` · ${edadJugador} años` : ''}
                        {puedeGestionarAlaYGoles && j.posicion && j.posicion !== 'Sin asignar' ? ` · ${j.posicion}` : ''}
                        {puedeGestionarAlaYGoles ? ` · ${j.goles || 0} goles` : ''}
                      </div>
                      {puedeVerTelefonosPrivados && telJugador && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginTop: 2 }}>
                          <a href={`tel:${telJugador}`} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {permisoNotifMovil !== 'granted' && (
                  <button type="button" className="btn-rsvp" onClick={solicitarPermisoNotificacionesMovil}>
                    <Bell size={14} /> Activar alertas móvil
                  </button>
                )}
                {puedePublicarAvisos && avisosSubtab === 'avisos' && (
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setShowForm(!showForm);
                      setEditandoAvisoId(null);
                    }}
                  >
                    <Plus size={15} /> Aviso
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
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={nuevoAviso.urgente} onChange={(e) => setNuevoAviso({ ...nuevoAviso, urgente: e.target.checked })} />
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
                          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                            Editar aviso
                          </div>
                          <input
                            placeholder="Título del aviso *"
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                            value={formEdicionAviso.titulo}
                            onChange={(e) => setFormEdicionAviso({ ...formEdicionAviso, titulo: e.target.value })}
                            required
                          />
                          <textarea
                            rows="3"
                            placeholder="Mensaje para jugadores y familias *"
                            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
                            value={formEdicionAviso.mensaje}
                            onChange={(e) => setFormEdicionAviso({ ...formEdicionAviso, mensaje: e.target.value })}
                            required
                          />
                          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              style={{ width: 'auto' }}
                              checked={formEdicionAviso.urgente}
                              onChange={(e) => setFormEdicionAviso({ ...formEdicionAviso, urgente: e.target.checked })}
                            />
                            Marcar como Urgente
                          </label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span className={`tag ${a.urgente ? 'urgent' : ''}`}>
                              {a.urgente ? 'Urgente' : 'Comunicado'}
                            </span>
                            {(puedePublicarAvisos || isAdmin) && (
                              <div style={{ display: 'flex', gap: 6 }}>
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
                          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{a.titulo}</h3>
                          <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.45 }}>{a.mensaje}</p>
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
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    Redes Sociales del Club
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                    Sigue toda la actividad, fotos y resultados oficiales
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {REDES_SOCIALES_CLUB.map((red) => (
                      <a
                        key={red.nombre}
                        href={red.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary"
                        style={{
                          textDecoration: 'none',
                          justifyContent: 'space-between',
                          background: red.color
                        }}
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
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{pb.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{pb.zona}</div>
                    <a
                      href={pb.mapa}
                      target="_blank"
                      rel="noopener noreferrer"
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
          {firebaseOk ? '● Sincronizado con Firebase' : '○ Modo local activo'} · Creado por {NOMBRE_CREADOR_APP}
        </div>
      </main>

      <nav className="bottom-nav">
        <button className={`nav-item ${tab === 'partidos' ? 'active' : ''}`} onClick={() => { setTab('partidos'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); setEditandoAvisoId(null); }}>
          <Calendar size={20} />
          <span>Partidos</span>
        </button>
        <button className={`nav-item ${tab === 'liga' ? 'active' : ''}`} onClick={() => { setTab('liga'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); setEditandoAvisoId(null); }}>
          <Trophy size={20} />
          <span>Liga/Goles</span>
        </button>
        <button className={`nav-item ${tab === 'plantilla' ? 'active' : ''}`} onClick={() => { setTab('plantilla'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); setEditandoAvisoId(null); }}>
          <Users size={20} />
          <span>Plantilla</span>
        </button>
        <button className={`nav-item ${tab === 'avisos' ? 'active' : ''}`} onClick={() => { setTab('avisos'); setShowForm(false); setShowImportBox(false); setShowImportTablaBox(false); setEditandoAvisoId(null); }}>
          <Bell size={20} />
          <span>Avisos</span>
        </button>
      </nav>
    </div>
  );
}
