const MESES_MAPA = {
  ene: '01', enero: '01', jan: '01',
  feb: '02', febrero: '02',
  mar: '03', marzo: '03',
  abr: '04', abril: '04', apr: '04',
  may: '05', mayo: '05',
  jun: '06', junio: '06',
  jul: '07', julio: '07',
  ago: '08', agosto: '08', aug: '08',
  sep: '09', sept: '09', set: '09', septiembre: '09', setiembre: '09',
  oct: '10', octubre: '10',
  nov: '11', noviembre: '11',
  dic: '12', diciembre: '12', dec: '12'
};

function limpiarTexto(str = '') {
  return String(str)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’`´]/g, "'")
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizarSinTildes(texto = '') {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function esEquipoAltamira(texto = '') {
  const low = normalizarSinTildes(texto);
  return /\b(rafael\s*altamira|altamira|picanya)\b/i.test(low);
}

function extraerHoraFlexible(texto = '') {
  const str = String(texto || '');
  const m24 = str.match(/(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*(?:h|hs|horas?|cet|cest|utc))?(?=$|[^\d])/i);
  if (m24) {
    const hh = String(Number(m24[1])).padStart(2, '0');
    return `${hh}:${m24[2]}`;
  }
  const mHoraSola = str.match(/(?:^|\s)([01]?\d|2[0-3])\s*h(?:\s|$|[·|])/i);
  if (mHoraSola) {
    const hh = String(Number(mHoraSola[1])).padStart(2, '0');
    return `${hh}:00`;
  }
  return '';
}

function extraerFechaFlexible(texto = '') {
  const str = String(texto || '');
  const low = normalizarSinTildes(str);
  const hora = extraerHoraFlexible(str);

  // 1) Formato numérico: 27/11/2026, 27-11-26, 27.11.2026, 27/11
  const numMatch = str.match(/(?:^|[^\d])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=$|[^\d])/);
  if (numMatch) {
    const d = numMatch[1].padStart(2, '0');
    const m = numMatch[2].padStart(2, '0');
    let y = numMatch[3] || String(new Date().getFullYear());
    if (y.length === 2) y = `20${y}`;
    const fechaBase = `${d}-${m}-${y}`;
    return hora ? `${fechaBase} · ${hora}` : fechaBase;
  }

  // 2) Formato con mes escrito o abreviado: "vie 27 nov", "27 de noviembre", "27 nov 2026"
  const mesMatch = low.match(
    /(?:(?:lun|mar|mie|miercoles|jue|jueves|vie|viernes|sab|sabado|dom|domingo)[a-z]*[\s,.-]+)?(\d{1,2})(?:\s+de)?[\s.-]+(ene|enero|jan|feb|febrero|mar|marzo|abr|abril|apr|may|mayo|jun|junio|jul|julio|ago|agosto|aug|sep|sept|set|septiembre|setiembre|oct|octubre|nov|noviembre|dic|diciembre|dec)(?:[\s,.-]+(?:de\s+)?(\d{2,4}))?/i
  );
  if (mesMatch) {
    const d = mesMatch[1].padStart(2, '0');
    const mesClave = mesMatch[2].toLowerCase();
    const m = MESES_MAPA[mesClave] || mesClave;
    let y = mesMatch[3] || String(new Date().getFullYear());
    if (y.length === 2) y = `20${y}`;
    const fechaBase = `${d}-${m}-${y}`;
    return hora ? `${fechaBase} · ${hora}` : fechaBase;
  }

  // 3) Relativos o etiquetas de partido
  if (/\bhoy\b/i.test(low)) {
    const hoy = new Date();
    const d = String(hoy.getDate()).padStart(2, '0');
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const y = hoy.getFullYear();
    const fechaBase = `${d}-${m}-${y}`;
    return hora ? `${fechaBase} · ${hora}` : fechaBase;
  }

  if (/\bmanana\b/i.test(low)) {
    const man = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const d = String(man.getDate()).padStart(2, '0');
    const m = String(man.getMonth() + 1).padStart(2, '0');
    const y = man.getFullYear();
    const fechaBase = `${d}-${m}-${y}`;
    return hora ? `${fechaBase} · ${hora}` : fechaBase;
  }

  if (hora) {
    return /proximo\s+partido/i.test(low) ? `Próximo partido · ${hora}` : `Por confirmar · ${hora}`;
  }

  if (/proximo\s+partido/i.test(low)) {
    return 'Próximo partido';
  }

  return '';
}

function esLineaRuidoOEstadistica(linea = '') {
  const t = String(linea || '').trim();
  const low = normalizarSinTildes(t);
  if (!t || t.length < 2) return true;
  if (/^[a-z]{1,2}$/i.test(t) && !/^(vs|v)$/i.test(t)) return true;
  if (/^\d{1,3}\s*[º°.]?$/.test(t)) return true;
  if (/^\d+(?:\s*[-–/]\s*\d+){1,4}$/.test(t)) return true;
  if (
    /^(jugados?|ganados?|empatados?|perdidos?|goles?\s*a\s*favor|en\s*contra|g-e-p|pts|pj|pg|pe|pp|gf|gc|dif|forma|ver\s+partido.*|ver\s+detalle.*|clasificacion|estadisticas)$/i.test(
      low
    )
  ) {
    return true;
  }
  return false;
}

function limpiarCandidatoRival(texto = '') {
  let limpio = String(texto || '')
    .replace(/^(?:pr[oó]ximo\s+partido|partido|jornada\s*\d+|casa|fuera|local|visitante)\s*[:·|-]*\s*/i, '')
    .replace(/\s*[·|]\s*(?:vie|sab|dom|lun|mar|mie|jue)[a-z]*\b.*$/i, '')
    .replace(/\b(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:h|hs|cet|cest))?\b/gi, '')
    .replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (esEquipoAltamira(limpio) || esLineaRuidoOEstadistica(limpio)) {
    return '';
  }

  const low = normalizarSinTildes(limpio);
  if (
    low === 'vs' ||
    low === 'v' ||
    /^descansa(-\d+)?$/i.test(low) ||
    /^(pabellon|polideportivo|pavello|colegio|pista\s+\d+)/i.test(low)
  ) {
    return '';
  }

  return limpio;
}

function detectarDireccionPartido(ventana = []) {
  const bloque = ventana.join(' ');
  const lowBloque = normalizarSinTildes(bloque);

  if (/\b(fuera|visitante|away|a\s+domicilio)\b/i.test(lowBloque)) {
    return true;
  }
  if (/\b(casa|local|home)\b/i.test(lowBloque)) {
    return false;
  }

  const idxAltamira = ventana.findIndex((l) => esEquipoAltamira(l));
  const idxVs = ventana.findIndex((l) => /^(vs\.?|v\.?|versus|contra)$/i.test(l.trim()));

  if (idxAltamira !== -1 && idxVs !== -1) {
    // Si Altamira aparece después de VS/V, suele ser visitante (fuera)
    if (idxAltamira > idxVs) return true;
    // Si Altamira aparece antes de VS/V, suele ser local (casa)
    if (idxAltamira < idxVs) return false;
  }

  return false;
}

function extraerPartidosDeLineas(lineas, origenUrl, categoriaFuente = '') {
  const partidos = [];
  const vistos = new Set();

  for (let i = 0; i < lineas.length; i++) {
    const ventana = lineas.slice(Math.max(0, i - 3), Math.min(lineas.length, i + 8));
    const bloque = ventana.join(' · ');

    if (!esEquipoAltamira(bloque)) continue;

    // Regla flexible: admite cualquier combinación con Altamira + (fecha/hora/próximo partido/VS/casa/fuera)
    const fechaDetectada = extraerFechaFlexible(bloque);
    const tieneSenalPartido =
      Boolean(fechaDetectada) ||
      /\b(vs\.?|v\.?|versus|proximo\s+partido|partido|jornada|casa|fuera|local|visitante)\b/i.test(
        normalizarSinTildes(bloque)
      );

    if (!tieneSenalPartido) continue;

    // Busca el rival en las líneas de la ventana o en segmentos separados por delimitadores flexibles
    const candidatosCrudos = [
      ...ventana,
      ...bloque.split(/\s*(?:\||·|\/|\s+-\s+|\s+–\s+|\s+—\s+|\s+vs\.?\s+|\s+v\.?\s+)\s*/i)
    ];

    let rival = '';
    for (const cand of candidatosCrudos) {
      const limpio = limpiarCandidatoRival(cand);
      if (limpio && limpio.length >= 2) {
        rival = limpio;
        break;
      }
    }

    if (!rival) continue;

    const esFuera = detectarDireccionPartido(ventana);
    const pabellonEncontrado = ventana.find((seg) =>
      /\b(pabellon|polideportivo|pavello|colegio|instituto|ies|pista\s+\d+|complex|poliesportiu)\b/i.test(
        normalizarSinTildes(seg)
      )
    );

    const club = 'C.D. Rafael Altamira FS';
    const fechaFinal = fechaDetectada || 'Por confirmar';
    const pabellonFinal = pabellonEncontrado
      ? pabellonEncontrado.trim()
      : esFuera
      ? `Pabellón visitante (${rival})`
      : 'Pabellón Municipal Picanya';

    const clave = `${normalizarSinTildes(categoriaFuente)}|${normalizarSinTildes(fechaFinal)}|${normalizarSinTildes(rival)}|${esFuera ? 'F' : 'C'}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    partidos.push({
      categoria: categoriaFuente || '',
      categoriaTexto: bloque,
      local: esFuera ? rival : club,
      visitante: esFuera ? club : rival,
      fecha: fechaFinal,
      pabellon: pabellonFinal,
      resultado: 'VS',
      fuente: origenUrl
    });
  }

  return partidos;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { urls, fuentes, categoriaActiva } = req.body || {};

    const mapaCategoriaPorUrl = new Map();
    if (Array.isArray(fuentes)) {
      for (const f of fuentes) {
        if (f?.url) {
          mapaCategoriaPorUrl.set(String(f.url).trim(), String(f.categoria || '').trim());
        }
      }
    }

    const listaUrls = Array.isArray(urls)
      ? urls.map((u) => String(u || '').trim()).filter(Boolean)
      : Array.isArray(fuentes)
      ? fuentes.map((f) => String(f?.url || '').trim()).filter(Boolean)
      : [];

    if (listaUrls.length === 0) {
      return res.status(400).json({ ok: false, error: 'Indica al menos una URL válida' });
    }

    const todos = [];
    const errores = [];

    for (const url of listaUrls) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        errores.push({ url, motivo: 'URL no válida' });
        continue;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errores.push({ url, motivo: 'Solo se permiten enlaces http/https' });
        continue;
      }

      const categoriaUrl =
        mapaCategoriaPorUrl.get(url) ||
        (listaUrls.length === 1 ? String(categoriaActiva || '').trim() : '');

      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9'
          }
        });

        if (!resp.ok) {
          errores.push({ url, motivo: `Respuesta HTTP ${resp.status}` });
          continue;
        }

        const html = await resp.text();
        const lineas = limpiarTexto(html);
        const extraidos = extraerPartidosDeLineas(lineas, url, categoriaUrl);
        todos.push(...extraidos);
      } catch (err) {
        errores.push({ url, motivo: err?.message || 'Error de conexión' });
      }
    }

    return res.status(200).json({
      ok: true,
      categoriaActiva: categoriaActiva || '',
      partidos: todos,
      errores
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Error interno' });
  }
}
