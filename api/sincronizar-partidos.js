function limpiarTexto(str = '') {
  return String(str)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extraerPartidosDeLineas(lineas, origenUrl) {
  const regexDia = /^(LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SABADO|SÁBADO|DOMINGO)\s+\d+\s+[A-ZÁÉÍÓÚ]{3,}/i;
  let fechaActual = 'Próximamente';
  const partidos = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (regexDia.test(linea)) {
      fechaActual = linea.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      continue;
    }

    const horaMatch = linea.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    if (!horaMatch && !/\b(CASA|FUERA|VS)\b/i.test(linea)) continue;

    const contexto = [lineas[i - 1] || '', linea, lineas[i + 1] || '', lineas[i + 2] || ''].join(' · ');
    const hora = horaMatch ? horaMatch[0] : '';
    const esFuera = /\bFUERA\b/i.test(contexto);

    const segmentos = contexto
      .split(/\s*(?:\||·| - | vs\.? | en )\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);

    const rival =
      segmentos.find((seg) => {
        const low = seg.toLowerCase();
        if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(seg)) return false;
        if (/^(casa|fuera|vs)$/i.test(seg)) return false;
        if (regexDia.test(seg)) return false;
        if (low.includes('rafael altamira') || low.includes('picanya')) return false;
        if (
          low.includes('fútbol sala') ||
          low.includes('futbol sala') ||
          low.includes('regional') ||
          low.includes('provincial') ||
          low.includes('valenta') ||
          low.includes('copa') ||
          low.includes('grup ')
        ) {
          return false;
        }
        return seg.length >= 2;
      }) || 'Rival por confirmar';

    const club = 'C.D. Rafael Altamira FS';
    partidos.push({
      categoriaTexto: contexto,
      local: esFuera ? rival : club,
      visitante: esFuera ? club : rival,
      fecha: hora ? `${fechaActual} ${hora}` : fechaActual,
      pabellon: esFuera ? `Pabellón visitante (${rival})` : 'Pabellón Municipal Picanya',
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
    const { urls } = req.body || {};
    const listaUrls = Array.isArray(urls)
      ? urls.map((u) => String(u || '').trim()).filter(Boolean)
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
        const extraidos = extraerPartidosDeLineas(lineas, url);
        todos.push(...extraidos);
      } catch (err) {
        errores.push({ url, motivo: err?.message || 'Error de conexión' });
      }
    }

    return res.status(200).json({
      ok: true,
      partidos: todos,
      errores
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Error interno' });
  }
}
