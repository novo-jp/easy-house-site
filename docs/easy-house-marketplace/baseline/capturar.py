# -*- coding: utf-8 -*-
"""
Captura o baseline da busca de imóveis (/comprar/imoveis) e da ficha.

    python3 capturar.py [http://localhost:3400] [pasta-de-saida]

Gera screenshots por viewport e um medidas.json com o que dá para medir
por instrumento: altura da página, alvos de toque, links de WhatsApp,
aria-current, conteúdo do HTML inicial sem JavaScript, requests da API.
Reprodutível — é o que sustenta o BASELINE.md e o QA_REPORT.md.
"""
import asyncio, json, os, sys, re, urllib.request
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3400"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "antes")
os.makedirs(OUT, exist_ok=True)

VIEWPORTS = [(320, 568), (390, 844), (412, 915), (768, 1024), (1440, 900)]
LISTA = "/comprar/imoveis"

MEDIR_LISTA = """
() => {
  const q = (s) => document.querySelector(s);
  const cards = [...document.querySelectorAll('#resultados .casa, #resultados article')];
  const alturas = cards.map(c => c.getBoundingClientRect().height);
  const links = cards.map(c => c.querySelector('h2 a, h3 a, a'));
  const alvoLink = links.filter(Boolean).map(a => a.getBoundingClientRect().height);
  const fotoClicavel = cards.filter(c => { const f = c.querySelector('.casa__foto'); return f && f.closest('a'); }).length;
  const campo = q('#campoBusca');
  let placeholderCortado = null;
  if (campo) {
    const cs = getComputedStyle(campo);
    const span = document.createElement('span');
    span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + cs.font;
    span.textContent = campo.placeholder;
    document.body.appendChild(span);
    const largTexto = span.getBoundingClientRect().width;
    span.remove();
    const util = campo.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    placeholderCortado = { textoPx: Math.round(largTexto), disponivelPx: Math.round(util), cortado: largTexto > util };
  }
  const current = [...document.querySelectorAll('[aria-current="page"]')].map(e => e.textContent.trim());
  const btnVer = q('#verResultados');
  const chipsCidade = document.querySelectorAll('#grupoCidade [data-filtro]').length;
  return {
    alturaPagina: document.documentElement.scrollHeight,
    cards: cards.length,
    alturaMediaCard: alturas.length ? Math.round(alturas.reduce((a,b)=>a+b,0)/alturas.length) : null,
    alvoLinkTituloPx: alvoLink.length ? Math.round(Math.min(...alvoLink)) : null,
    cardsComFotoClicavel: fotoClicavel,
    placeholder: placeholderCortado,
    ariaCurrentNav: current,
    botaoVerImoveis: btnVer ? btnVer.textContent.trim() : null,
    chipsCidade,
    waLinks: document.querySelectorAll('a[href*="wa.me"]').length,
    h1: document.querySelectorAll('h1').length,
    burgerLabel: q('#navBurger') ? q('#navBurger').getAttribute('aria-label') : null,
    langJa: document.querySelectorAll('[lang="ja"]').length,
    title: document.title
  };
}
"""

MEDIR_FICHA = """
() => {
  const q = (s) => document.querySelector(s);
  const current = [...document.querySelectorAll('[aria-current="page"]')].map(e => e.textContent.trim());
  return {
    alturaPagina: document.documentElement.scrollHeight,
    waLinks: document.querySelectorAll('a[href*="wa.me"]').length,
    ariaCurrentNav: [...document.querySelectorAll('.nav [aria-current="page"]')].map(e => e.textContent.trim()),
    ariaCurrentTotal: current.length,
    langJa: document.querySelectorAll('[lang="ja"]').length,
    temMapa: !!q('[class*=mapa], iframe[src*=map], .leaflet-container'),
    temVoltarBusca: !!q('a[href^="/comprar/imoveis?"], a[data-voltar-busca]'),
    temDataChecagem: /verificad|checad|atualizad|visto em/i.test(document.body.innerText),
    textoJaponesSemLang: (() => {
      const jp = /[\\u3040-\\u30ff\\u3400-\\u9fff]/;
      let n = 0;
      document.querySelectorAll('main p, main td, main span, main li').forEach(el => {
        if (el.children.length === 0 && jp.test(el.textContent) && !el.closest('[lang="ja"]')) n++;
      });
      return n;
    })(),
    h1: document.querySelectorAll('h1').length,
    title: document.title
  };
}
"""

async def main():
    medidas = {"base": BASE, "viewports": {}, "ficha": {}, "semJs": {}, "api": {}}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # ── HTML inicial sem JavaScript ─────────────────────────────
        ctx = await browser.new_context(java_script_enabled=False, viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        await page.goto(BASE + LISTA, wait_until="load")
        html = await page.content()
        medidas["semJs"] = {
            "cardsNoHtml": len(re.findall(r'class="casa[" ]', html)),
            "gradeAriaBusy": 'id="resultados" aria-busy="true"' in html or 'aria-busy="true"' in html,
            "contagemNoHtml": re.search(r'id="contagem"[^>]*>(.*?)</p>', html, re.S).group(1).strip() if re.search(r'id="contagem"', html) else None,
        }
        await page.screenshot(path=os.path.join(OUT, "lista-390-sem-js.png"), full_page=False)
        await ctx.close()

        # ── Com JS, por viewport ────────────────────────────────────
        for (w, h) in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = await ctx.new_page()
            reqs = []
            page.on("request", lambda r: reqs.append(r.url) if "/api/casas" in r.url else None)
            # aceita o banner de consentimento para não poluir as capturas
            await page.add_init_script("try{localStorage.setItem('eh_consent_ads', JSON.stringify({v:'1',ok:false}))}catch(e){}")
            await page.goto(BASE + LISTA, wait_until="networkidle")
            await page.wait_for_timeout(800)
            m = await page.evaluate(MEDIR_LISTA)
            m["requestsApiNoLoad"] = len(reqs)
            await page.screenshot(path=os.path.join(OUT, f"lista-{w}.png"), full_page=False)
            if w in (390, 1440):
                await page.screenshot(path=os.path.join(OUT, f"lista-{w}-inteira.png"), full_page=True)
            # painel de filtros
            await page.click("#abrirFiltros")
            await page.wait_for_timeout(500)
            m["chipsCidadeNoPainel"] = await page.evaluate("document.querySelectorAll('#grupoCidade [data-filtro]').length")
            await page.screenshot(path=os.path.join(OUT, f"filtros-{w}.png"), full_page=False)
            await page.keyboard.press("Escape")
            medidas["viewports"][f"{w}x{h}"] = m

            if w == 390:
                # histórico: quantas entradas 3 cliques de filtro criam
                antes = await page.evaluate("history.length")
                await page.click("#abrirFiltros"); await page.wait_for_timeout(300)
                for sel in ["#grupoPlanta [data-filtro]:nth-child(1)", "#grupoPlanta [data-filtro]:nth-child(2)", "#grupoVagas [data-filtro]:nth-child(1)"]:
                    try:
                        await page.click(sel); await page.wait_for_timeout(700)
                    except Exception: pass
                depois = await page.evaluate("history.length")
                m["historicoApos3Cliques"] = depois - antes
                m["requestsApiApos3Cliques"] = len(reqs)
                await page.keyboard.press("Escape")
                # estado vazio real: texto + cidades incompatíveis
                await page.goto(BASE + LISTA + "?q=Hekinan&prefeitura=aichi&cidade=nishio%2Ctakahama%2Ckariya", wait_until="networkidle")
                await page.wait_for_timeout(600)
                await page.screenshot(path=os.path.join(OUT, "vazio-390.png"), full_page=True)
                # combinação incoerente
                await page.goto(BASE + LISTA + "?prefeitura=mie&cidade=toyota", wait_until="networkidle")
                await page.wait_for_timeout(600)
                m["mieToyotaTotal"] = await page.evaluate("document.getElementById('contagem').textContent.trim()")
            await ctx.close()

        # ── Ficha ───────────────────────────────────────────────────
        with urllib.request.urlopen(BASE + "/api/casas?porPagina=1") as r:
            d = json.load(r)
        medidas["api"] = {"total": d["total"], "totalAcervo": d["totalAcervo"], "porPagina": d["porPagina"],
                          "prefeituras": [f["valor"] for f in d["facetas"]["prefeituras"]],
                          "cidadesNaFaceta": len(d["facetas"]["cidades"])}
        slug = d["itens"][0]["slug"]
        for (w, h) in [(390, 844), (1440, 900)]:
            ctx = await browser.new_context(viewport={"width": w, "height": h})
            page = await ctx.new_page()
            await page.add_init_script("try{localStorage.setItem('eh_consent_ads', JSON.stringify({v:'1',ok:false}))}catch(e){}")
            await page.goto(BASE + "/comprar/imoveis/" + slug, wait_until="networkidle")
            await page.wait_for_timeout(500)
            medidas["ficha"][f"{w}x{h}"] = await page.evaluate(MEDIR_FICHA)
            medidas["ficha"][f"{w}x{h}"]["slug"] = slug
            await page.screenshot(path=os.path.join(OUT, f"ficha-{w}.png"), full_page=False)
            if w == 390:
                await page.screenshot(path=os.path.join(OUT, f"ficha-{w}-inteira.png"), full_page=True)
            await ctx.close()

        # ── Favoritos: quantas chamadas ─────────────────────────────
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        codigo = d["itens"][0]["codigo"]
        await page.add_init_script(f"try{{localStorage.setItem('eh_casas_favoritas', JSON.stringify(['{codigo}']));localStorage.setItem('eh_consent_ads', JSON.stringify({{v:'1',ok:false}}))}}catch(e){{}}")
        reqs = []
        page.on("request", lambda r: reqs.append(r.url) if "/api/casas" in r.url else None)
        await page.goto(BASE + "/favoritos", wait_until="networkidle")
        await page.wait_for_timeout(800)
        medidas["favoritos"] = {"requestsApi": len(reqs), "exemplo": reqs[:2]}
        await page.screenshot(path=os.path.join(OUT, "favoritos-390.png"), full_page=False)
        await ctx.close()
        await browser.close()

    with open(os.path.join(OUT, "medidas.json"), "w", encoding="utf-8") as f:
        json.dump(medidas, f, ensure_ascii=False, indent=2)
    print(json.dumps(medidas, ensure_ascii=False, indent=2))

asyncio.run(main())
