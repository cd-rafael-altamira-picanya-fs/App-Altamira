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

  const numMatch = str.match(/(?:^|[^\d])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=$|[^\d])/);
  if (numMatch) {
    const d = numMatch[1].padStart(2, '0');
    const m = numMatch[2].padStart(2, '0');
    let y = numMatch[3] || '2026';
    if (y.length === 2) y = `20${y}`;
    const fechaBase = `${d}-${m}-${y}`;
    return hora ? `${fechaBase} · ${hora}` : fechaBase;
  }

  const mesMatch = low.match(
    /(?:(?:lun|mar|mie|miercoles|jue|jueves|vie|viernes|sab|sabado|dom|domingo)[a-z]*[\s,.-]+)?(\d{1,2})(?:\s+de)?[\s.-]+(ene|enero|jan|feb|febrero|mar|marzo|abr|abril|apr|may|mayo|jun|junio|jul|julio|ago|agosto|aug|sep|sept|set|septiembre|setiembre|oct|octubre|nov|noviembre|dic|diciembre|dec)(?:[\s,.-]+(?:de\s+)?(\d{2,4}))?/i
  );
  if (mesMatch) {
    const d = mesMatch[1].padStart(2, '0');
    const mesClave = mesMatch[2].toLowerCase();
    const m = MESES_MAPA[mesClave] || mesClave;
    let y = mesMatch[3] || '2026';
    if (y.length === 2) y = `20${y}`;
    const fechaBase = `${d}-${m}-${y}`;
    return hora ? `${fechaBase} · ${hora}` : fechaBase;
  }

  if (hora) {
    return /proximo\s+partido/i.test(low) ? `Próximo partido · ${hora}` : `27-11-2026 · ${hora}`;
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
    return idxAltamira > idxVs;
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

    const fechaDetectada = extraerFechaFlexible(bloque);
    const tieneSenalPartido =
      Boolean(fechaDetectada) ||
      /\b(vs\.?|v\.?|versus|proximo\s+partido|partido|jornada|casa|fuera|local|visitante)\b/i.test(
        normalizarSinTildes(bloque)
      );

    if (!tieneSenalPartido) continue;

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

function esCabeceraClasificacion(linea = '') {
  const low = normalizarSinTildes(linea);
  return /^#?\s*equipo\s+pts\b/i.test(low) ||
    (/\bpts\b/i.test(low) && /\bpj\b/i.test(low) && /\bgf\b/i.test(low) && /\bgc\b/i.test(low));
}

function sanearNombreEquipoServidor(entrada = '') {
  return String(entrada || '')
    .replace(/^escudo\s+de\s+/i, '')
    .replace(/^forma\s+\d+\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extraerClasificacionDeLineas(lineas, origenUrl, categoriaFuente = '') {
  const filas = [];
  const vistos = new Set();

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];

    const matchConPos = linea.match(/^(\d{1,2})\s*[.)-]??\s+(.+?)\s+([+-]?\d+(?:\s+[+-]?\d+){1,8})$/);
    if (matchConPos) {
      const pos = Number(matchConPos[1]);
      const equipo = sanearNombreEquipoServidor(matchConPos[2]);
      const nums = matchConPos[3].trim().split(/\s+/).map(Number);

      if (equipo.length >= 2 && !esCabeceraClasificacion(equipo) && nums.length >= 2) {
        let pts = 0, pj = 0, pg = 0, pe = 0, pp = 0, gf = 0, gc = 0, dif = 0;
        if (nums.length >= 8) {
          [pts, pj, pg, pe, pp, gf, gc, dif] = nums;
        } else if (nums.length === 7) {
          [pts, pj, pg, pe, pp, gf, gc] = nums;
          dif = gf - gc;
        } else if (nums.length >= 4) {
          [pj, pts, gf, gc] = nums;
          dif = gf - gc;
        } else {
          [pj, pts, gf] = nums;
          gc = 0;
          dif = gf - gc;
        }

        const clave = `${normalizarSinTildes(categoriaFuente)}|${normalizarSinTildes(equipo)}`;
        if (!vistos.has(clave)) {
          vistos.add(clave);
          filas.push({
            categoria: categoriaFuente || '',
            pos,
            equipo,
            pts,
            pj,
            pg,
            pe,
            pp,
            gf,
            gc,
            dif,
            fuente: origenUrl
          });
        }
      }
      continue;
    }

    if (/^[+-]?\d+(?:\s+[+-]?\d+){3,8}$/.test(linea) && i >= 1) {
      const nums = linea.trim().split(/\s+/).map(Number);
      const candidatoNombre = sanearNombreEquipoServidor(lineas[i - 1]);
      const posAnterior = i >= 2 && /^\d{1,2}\.?$/.test(lineas[i - 2])
        ? Number(lineas[i - 2].replace('.', ''))
        : filas.length + 1;

      if (
        candidatoNombre.length >= 2 &&
        !/^\d+$/.test(candidatoNombre) &&
        !esCabeceraClasificacion(candidatoNombre) &&
        !/^escudo\s+de$/i.test(candidatoNombre)
      ) {
        let pts = 0, pj = 0, pg = 0, pe = 0, pp = 0, gf = 0, gc = 0, dif = 0;
        if (nums.length >= 8) {
          [pts, pj, pg, pe, pp, gf, gc, dif] = nums;
        } else if (nums.length === 7) {
          [pts, pj, pg, pe, pp, gf, gc] = nums;
          dif = gf - gc;
        } else if (nums.length >= 4) {
          [pj, pts, gf, gc] = nums;
          dif = gf - gc;
        }

        const clave = `${normalizarSinTildes(categoriaFuente)}|${normalizarSinTildes(candidatoNombre)}`;
        if (!vistos.has(clave)) {
          vistos.add(clave);
          filas.push({
            categoria: categoriaFuente || '',
            pos: posAnterior,
            equipo: candidatoNombre,
            pts,
            pj,
            pg,
            pe,
            pp,
            gf,
            gc,
            dif,
            fuente: origenUrl
          });
        }
      }
    }
  }

  return filas;
}

function extraerPartidosDeScriptsHtml(html = '', origenUrl = '', categoriaFuente = '') {
  const partidos = [];
  const vistos = new Set();
  const scriptMatches = [...String(html).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];

  for (const m of scriptMatches) {
    const contenido = String(m[1] || '').trim();
    if (!contenido || !/altamira|picanya/i.test(normalizarSinTildes(contenido))) continue;

    const lineasJson = contenido
      .replace(/[{}\[\],:]/g, '\n')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .split('\n')
      .map((s) => s.replace(/^["'']|["'']$/g, '').trim())
      .filter((s) => s.length >= 2 && s.length <= 140);

    const extraidos = extraerPartidosDeLineas(lineasJson, origenUrl, categoriaFuente);
    for (const p of extraidos) {
      const k = `${normalizarSinTildes(p.categoria)}|${normalizarSinTildes(p.fecha)}|${normalizarSinTildes(p.local)}|${normalizarSinTildes(p.visitante)}`;
      if (!vistos.has(k)) {
        vistos.add(k);
        partidos.push(p);
      }
    }
  }

  return partidos;
}

async function obtenerHtmlConRespaldoRender(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9'
    }
  });

  if (!resp.ok) {
    throw new Error(`Respuesta HTTP ${resp.status}`);
  }

  const htmlDirecto = await resp.text();
  const renderEndpoint = String(process.env.RENDER_FETCH_URL || '').trim();

  if (renderEndpoint) {
    try {
      const targetRender = renderEndpoint.includes('{url}')
        ? renderEndpoint.replace('{url}', encodeURIComponent(url))
        : `${renderEndpoint}${renderEndpoint.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`;
      const rRender = await fetch(targetRender);
      if (rRender.ok) {
        const htmlRenderizado = await rRender.text();
        if (htmlRenderizado && htmlRenderizado.length > htmlDirecto.length) {
          return htmlRenderizado;
        }
      }
    } catch {
      // Si falla el servicio de renderizado, usamos el HTML directo
    }
  }

  return htmlDirecto;
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
    const todaClasificacion = [];
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
        const html = await obtenerHtmlConRespaldoRender(url);
        const lineas = limpiarTexto(html);
        const extraidosTexto = extraerPartidosDeLineas(lineas, url, categoriaUrl);
        const extraidosScripts = extraerPartidosDeScriptsHtml(html, url, categoriaUrl);
        const extraidaClasif = extraerClasificacionDeLineas(lineas, url, categoriaUrl);

        const combinados = [...extraidosTexto];
        for (const item of extraidosScripts) {
          const yaEsta = combinados.some(
            (x) =>
              normalizarSinTildes(x.local) === normalizarSinTildes(item.local) &&
              normalizarSinTildes(x.visitante) === normalizarSinTildes(item.visitante) &&
              normalizarSinTildes(x.fecha) === normalizarSinTildes(item.fecha)
          );
          if (!yaEsta) combinados.push(item);
        }

        todos.push(...combinados);
        for (const fila of extraidaClasif) {
          const yaEstaFila = todaClasificacion.some(
            (f) =>
              normalizarSinTildes(f.categoria) === normalizarSinTildes(fila.categoria) &&
              normalizarSinTildes(f.equipo) === normalizarSinTildes(fila.equipo)
          );
          if (!yaEstaFila) todaClasificacion.push(fila);
        }
      } catch (err) {
        errores.push({ url, motivo: err?.message || 'Error de conexión' });
      }
    }

    return res.status(200).json({
      ok: true,
      categoriaActiva: categoriaActiva || '',
      partidos: todos,
      clasificacion: todaClasificacion,
      errores
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Error interno' });
  }
}
