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

    if (celdas.length < 8) continue;

    const posMatch = String(celdas[0] || '').match(/^(\d{1,2})\.?$/);
    if (!posMatch) continue;

    const pos = Number(posMatch[1]);
    const equipo = String(celdas[1] || '').trim();
    if (!equipo || equipo.length < 2 || /^\d+$/.test(equipo)) continue;

    const numeros = celdas
      .slice(2)
      .map((val) => Number(String(val).replace(/[^\d+-]/g, '')))
      .filter((n) => !Number.isNaN(n));

    if (numeros.length < 7) continue;

    const [pj, pg, pe, pp, gf, gc, pts] = numeros;
    const clave = `${pos}_${equipo.toLowerCase()}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    filas.push({
      categoria: categoriaActiva || 'Benjamín ♂',
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

    for (const urlRaw of urls) {
      const urlLimpia = String(urlRaw || '').trim();
      if (!urlLimpia) continue;

      const variantes = Array.from(new Set([urlLimpia, urlLimpia.split('#')[0]].filter(Boolean)));
      let mejorHtml = '';

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
            }
          } else {
            errores.push({ url: objetivo, motivo: `HTTP ${resp.status}` });
          }
        } catch (err) {
          errores.push({ url: objetivo, motivo: err?.message || 'Error de conexión' });
        }
      }

      if (!mejorHtml) continue;

      const extraidas = extraerClasificacionDesdeHtml(mejorHtml, categoriaActiva);
      for (const fila of extraidas) {
        clasificacion.push(fila);
      }
    }

    return res.status(200).json({
      ok: clasificacion.length > 0 || errores.length === 0,
      partidos,
      clasificacion,
      errores
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Error interno del servidor'
    });
  }
}
