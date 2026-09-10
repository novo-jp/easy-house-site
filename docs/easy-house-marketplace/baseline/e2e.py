# -*- coding: utf-8 -*-
"""
QA de ponta a ponta da busca de imóveis — roda contra o dev-server.

    python3 e2e.py [http://localhost:3400] [pasta-de-saida]

Cobre os fluxos do brief (busca rápida, rascunho de filtros, chips, vazio,
favoritos, comparação, ficha e volta, teclado, sem JS), os 5 viewports e o
axe-core (carregado do cdnjs). Gera screenshots + resultado.json. Cada item
sai como PASSOU / FALHOU com a medida — nada é inferido.
"""
import asyncio, json, os, sys, re, urllib.request
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3400"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "depois")
os.makedirs(OUT, exist_ok=True)
LISTA = "/comprar/imoveis"
VIEWPORTS = [(320, 568), (390, 844), (412, 915), (768, 1024), (1440, 900)]
AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"

R = {"base": BASE, "checks": [], "viewports": {}, "axe": {}, "ficha": {}, "semJs": {}}
def check(nome, ok, medida=None):
    R["checks"].append({"nome": nome, "ok": bool(ok), "medida": medida})
    print(("PASSOU " if ok else "FALHOU ") + nome + (f"  → {medida}" if medida is not None else ""))

SEM_CONSENT = "try{localStorage.setItem('eh_consent_ads', JSON.stringify({status:'denied',version:'1',date:new Date().toISOString()}))}catch(e){}"

MEDIR = """
() => {
  const cards = [...document.querySelectorAll('#resultados .casa')];
  const alt = cards.map(c => c.querySelector('.casa__ver')).filter(Boolean).map(a => a.getBoundingClientRect().height);
  const campo = document.querySelector('#campoBusca');
  let ph = null;
  if (campo) {
    const cs = getComputedStyle(campo); const span = document.createElement('span');
    span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + cs.font; span.textContent = campo.placeholder;
    document.body.appendChild(span); const w = span.getBoundingClientRect().width; span.remove();
    const util = campo.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    ph = { textoPx: Math.round(w), disponivelPx: Math.round(util), cortado: w > util };
  }
  const acima = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().bottom <= window.innerHeight : null; };
  return {
    alturaPagina: document.documentElement.scrollHeight,
    cards: cards.length,
    alturaMediaCard: cards.length ? Math.round(cards.reduce((a,c)=>a+c.getBoundingClientRect().height,0)/cards.length) : null,
    alvoVerDetalhesPx: alt.length ? Math.round(Math.min(...alt)) : null,
    alvoFavoritoPx: (() => { const b = document.querySelector('.acao--favoritar'); return b ? Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)) : null; })(),
    fotoClicavel: cards.filter(c => c.querySelector('a.casa__foto')).length,
    placeholder: ph,
    ariaCurrentNav: [...document.querySelectorAll('.nav [aria-current="page"]')].map(e => e.textContent.trim()),
    botaoVer: (document.getElementById('verResultados')||{}).textContent?.trim().replace(/\\s+/g,' '),
    primeiraDobra: { buscar: acima('.busca-rapida__btn'), planta: acima('#plantaRapida'), contagem: acima('#contagem') },
    h1: document.querySelectorAll('h1').length,
    burger: (document.getElementById('navBurger')||{}).getAttribute?.('aria-label'),
    langJa: document.querySelectorAll('[lang="ja"]').length,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    title: document.title
  };
}
"""

async def opcao(page, id_):
    """Clica numa opção do painel, abrindo o grupo <details> se estiver fechado."""
    await page.evaluate("(id) => { const d = document.getElementById(id).closest('details'); if (d && !d.open) d.open = true; }", id_)
    await page.click(f'label[for="{id_}"]')

async def axe(page, rotulo):
    try:
        await page.add_script_tag(url=AXE)
        res = await page.evaluate("async () => { const r = await axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }); return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, alvo: v.nodes[0] && v.nodes[0].target && v.nodes[0].target[0] })); }")
        graves = [v for v in res if v["impact"] in ("critical", "serious")]
        R["axe"][rotulo] = {"violacoes": res, "critical_serious": len(graves)}
        check(f"axe {rotulo}: sem violações critical/serious", len(graves) == 0, [f"{v['id']}({v['impact']}) x{v['n']} {v['alvo']}" for v in res])
    except Exception as ex:
        R["axe"][rotulo] = {"erro": str(ex)}
        check(f"axe {rotulo}", False, f"não rodou: {ex}")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # ── Sem JavaScript ──────────────────────────────────────────
        ctx = await browser.new_context(java_script_enabled=False, viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        await page.goto(BASE + LISTA, wait_until="load")
        html = await page.content()
        n_cards = len(re.findall(r'<article class="casa"', html))
        R["semJs"] = {"cards": n_cards, "formFiltros": 'id="formFiltros"' in html, "painelVisivel": await page.evaluate("getComputedStyle(document.getElementById('painelFiltros')).display !== 'none'")}
        check("sem JS: HTML inicial traz resultados", n_cards >= 18, n_cards)
        check("sem JS: painel de filtros é um <form> visível", R["semJs"]["formFiltros"] and R["semJs"]["painelVisivel"])
        await page.screenshot(path=os.path.join(OUT, "lista-390-sem-js.png"), full_page=False)
        # chip remove sem JS: link real
        await page.goto(BASE + LISTA + "?cidade=toyota,okazaki", wait_until="load")
        href = await page.get_attribute('.tag-ativa[data-remover="cidades"][data-valor="toyota"]', "href")
        check("sem JS: chip remove por link real", href is not None and "cidade=okazaki" in href and "toyota" not in href, href)
        await page.goto(BASE + LISTA + "?prefeitura=mie&cidade=toyota", wait_until="load")
        check("sem JS: vazio com sugestões como links", await page.locator("#avisoVazio [data-sugestao]").count() >= 1)
        await ctx.close()

        # ── Viewports ───────────────────────────────────────────────
        for (w, h) in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h})
            page = await ctx.new_page()
            await page.add_init_script(SEM_CONSENT)
            await page.goto(BASE + LISTA, wait_until="networkidle")
            m = await page.evaluate(MEDIR)
            R["viewports"][f"{w}x{h}"] = m
            await page.screenshot(path=os.path.join(OUT, f"lista-{w}.png"))
            if w in (390, 1440): await page.screenshot(path=os.path.join(OUT, f"lista-{w}-inteira.png"), full_page=True)
            check(f"{w}: placeholder cabe", m["placeholder"] and not m["placeholder"]["cortado"], m["placeholder"])
            check(f"{w}: sem rolagem horizontal", not m["overflowX"])
            check(f"{w}: exatamente um aria-current na nav", m["ariaCurrentNav"] == ["Casas à venda"], m["ariaCurrentNav"])
            check(f"{w}: alvo 'Ver detalhes' ≥ 44px", (m["alvoVerDetalhesPx"] or 0) >= 44, m["alvoVerDetalhesPx"])
            check(f"{w}: foto do card leva à ficha", m["fotoClicavel"] == m["cards"], f"{m['fotoClicavel']}/{m['cards']}")
            if w <= 412:
                check(f"{w}: primeira dobra tem os 3 campos + Buscar", m["primeiraDobra"]["buscar"] and m["primeiraDobra"]["planta"], m["primeiraDobra"])
            await page.click("#abrirFiltros"); await page.wait_for_timeout(300)
            await page.screenshot(path=os.path.join(OUT, f"filtros-{w}.png"))
            if w == 390:
                await axe(page, "lista+painel-390")
            await page.keyboard.press("Escape")
            await ctx.close()

        # ── Fluxos (390) ────────────────────────────────────────────
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        await page.add_init_script(SEM_CONSENT)
        reqs = []
        page.on("request", lambda r: reqs.append(r.url) if "/api/casas" in r.url else None)
        await page.goto(BASE + LISTA, wait_until="networkidle")
        await axe(page, "lista-390")
        check("carga inicial não chama /api/casas (HTML já veio pronto)", len(reqs) == 0, len(reqs))

        # busca rápida: cidade no texto + preço
        h0 = await page.evaluate("history.length")
        await page.fill("#campoBusca", "Toyota")
        await page.select_option("#precoMaxRapido", index=3)
        await page.click(".busca-rapida__btn")
        await page.wait_for_function("document.getElementById('resultados').getAttribute('aria-busy') === null && /cidade=toyota/.test(location.search)", timeout=8000)
        h1 = await page.evaluate("history.length")
        total = await page.evaluate("Number(document.querySelector('#contagem strong').textContent)")
        check("busca rápida: 'Toyota' vira filtro de cidade e 1 entrada no histórico", "cidade=toyota" in page.url and h1 - h0 == 1 and 0 < total < 769, {"url": page.url, "total": total, "hist": h1 - h0})
        check("busca rápida: chip 'Cidade: Toyota' aparece", await page.locator('.tag-ativa[data-valor="toyota"]').count() == 1)
        await page.screenshot(path=os.path.join(OUT, "busca-toyota-390.png"))

        # rascunho no painel: 3 toques → 0 pushState, contador muda, aplicar → 1
        await page.goto(BASE + LISTA + "?cidade=toyota", wait_until="networkidle")
        total = await page.evaluate("Number(document.querySelector('#contagem strong').textContent)")
        await page.click("#abrirFiltros"); await page.wait_for_timeout(200)
        check("painel: foco vai para o título ao abrir", await page.evaluate("document.activeElement && document.activeElement.id === 'tituloFiltros'"))
        h2 = await page.evaluate("history.length"); r0 = len(reqs)
        await opcao(page, "f-planta-4ldk"); await page.wait_for_timeout(350)
        await opcao(page, "f-entrega-imediata"); await page.wait_for_timeout(350)
        await opcao(page, "f-estacionamento-com"); await page.wait_for_timeout(700)
        h3 = await page.evaluate("history.length")
        n_ver = await page.evaluate("document.getElementById('verResultadosN').textContent")
        check("painel: 3 toques = 0 entradas no histórico", h3 == h2, h3 - h2)
        check("painel: botão diz 'Mostrar N imóveis' com N atualizado", n_ver.isdigit() and int(n_ver) < total, f"Mostrar {n_ver} imóveis (antes {total})")
        check("painel: consultas leves canceláveis (somenteTotal)", any("somenteTotal=1" in u for u in reqs[r0:]), len(reqs) - r0)
        # reconciliação: com Toyota marcada, cidade de Mie fica desabilitada com motivo
        await opcao(page, "f-prefeitura-aichi"); await page.wait_for_timeout(800)
        tsu_disabled = await page.evaluate("(() => { const i = document.querySelector('input[name=cidade][value=tsu]'); return i && i.disabled && (i.closest('.opcao').title || ''); })()")
        check("painel: opção incompatível desabilitada com motivo (Tsu com Aichi)", bool(tsu_disabled) and "Mie" in tsu_disabled, tsu_disabled)
        await page.screenshot(path=os.path.join(OUT, "painel-rascunho-390.png"))
        # foco preso: Tab do último volta ao primeiro
        await page.focus("#verResultados"); await page.keyboard.press("Tab")
        dentro = await page.evaluate("!!document.activeElement.closest('#painelFiltros')")
        check("painel: Tab não escapa do diálogo", dentro)
        # ESC fecha sem aplicar e devolve o foco
        await page.keyboard.press("Escape"); await page.wait_for_timeout(200)
        check("painel: ESC fecha, descarta rascunho e devolve foco ao botão", await page.evaluate("document.getElementById('painelFiltros').hidden && document.activeElement.id === 'abrirFiltros'") and "planta" not in page.url)
        # aplicar de verdade
        await page.click("#abrirFiltros"); await page.wait_for_timeout(200)
        await opcao(page, "f-planta-4ldk"); await page.wait_for_timeout(300)
        h4 = await page.evaluate("history.length")
        await page.click("#verResultados")
        await page.wait_for_function("/planta=4ldk/.test(location.search) && document.getElementById('resultados').getAttribute('aria-busy') === null", timeout=8000)
        h5 = await page.evaluate("history.length")
        check("painel: aplicar = 1 pushState e URL com o filtro", h5 - h4 == 1 and "planta=4ldk" in page.url, page.url)
        check("chips: rótulo completo", await page.locator('.tag-ativa', has_text="Planta: 4LDK").count() == 1)

        # remover chip
        await page.click('.tag-ativa[data-valor="4ldk"]')
        await page.wait_for_function("!/planta/.test(location.search)", timeout=8000)
        check("chips: remover tira o filtro da URL", "planta" not in page.url)

        # ir para a ficha e voltar restaura URL e rolagem
        await page.evaluate("window.scrollTo(0, 900)"); await page.wait_for_timeout(200)
        url_busca = page.url
        y_antes = await page.evaluate("window.scrollY")
        # clique via DOM: o Playwright rolaria o alvo para o centro e a medida 'antes' ficaria errada
        await page.evaluate("document.querySelector('#resultados .casa:nth-child(2) .casa__ver').click()")
        await page.wait_for_url("**/comprar/imoveis/casa-*"); await page.wait_for_load_state("networkidle")
        check("ficha abre pela lista", "/comprar/imoveis/casa-" in page.url, page.url)
        voltar = await page.get_attribute("#voltarBusca", "href")
        check("ficha: 'Voltar para a busca' aponta para a MESMA busca", voltar and voltar in url_busca, voltar)
        R["ficha"]["waLinks"] = await page.locator('a[href*="wa.me"]').count()
        R["ficha"]["ausentes"] = await page.locator('.ausente').count()
        R["ficha"]["verificado"] = await page.locator('.imovel__verificado').count()
        check("ficha: WhatsApp reduzido a hierarquia (≤ 8 links na página inteira, 13 antes)", R["ficha"]["waLinks"] <= 8, R["ficha"]["waLinks"])
        check("ficha: mostra verificação e fonte", R["ficha"]["verificado"] == 1 and await page.locator("#fonte").count() == 1)
        check("ficha: 'Não informado pela fonte' quando falta dado relevante", R["ficha"]["ausentes"] >= 1, R["ficha"]["ausentes"])
        cta = await page.get_attribute('a[data-cta="topo"]', "href")
        codigo = await page.get_attribute("main.imovel", "data-imovel")
        check("ficha: CTA principal leva o código público e nada sensível", codigo in urllib.request.unquote(cta) and not re.search(r"renda|visto|idade", cta), codigo)
        await axe(page, "ficha-390")
        await page.screenshot(path=os.path.join(OUT, "ficha-390.png"))
        await page.screenshot(path=os.path.join(OUT, "ficha-390-inteira.png"), full_page=True)
        # lightbox: foco e ESC
        if await page.locator("[data-abrir-galeria]").count():
            await page.click("[data-abrir-galeria]"); await page.wait_for_timeout(300)
            check("lightbox: foco no fechar ao abrir", await page.evaluate("document.activeElement.hasAttribute('data-fechar-galeria')"))
            await page.keyboard.press("Escape"); await page.wait_for_timeout(200)
            check("lightbox: ESC fecha e devolve o foco", await page.evaluate("!document.getElementById('lightbox').hasAttribute('open') && document.activeElement.hasAttribute('data-abrir-galeria')"))
        await page.go_back(); await page.wait_for_load_state("networkidle"); await page.wait_for_timeout(600)
        y = await page.evaluate("window.scrollY")
        check("voltar da ficha: mesma URL e rolagem restaurada", page.url == url_busca and abs(y - y_antes) < 60, {"url_ok": page.url == url_busca, "antes": y_antes, "depois": y})

        # favoritos e comparação
        await page.click("#resultados .casa:nth-child(1) .acao--favoritar")
        await page.click("#resultados .casa:nth-child(2) .acao--favoritar")
        await page.click("#resultados .casa:nth-child(3) .acao--favoritar")
        check("favoritar: aria-pressed e texto mudam", await page.evaluate("document.querySelector('#resultados .casa:nth-child(1) .acao--favoritar').getAttribute('aria-pressed') === 'true' && document.querySelector('#resultados .casa:nth-child(1) .acao__txt').textContent === 'Salvo'"))
        await page.click("#resultados .casa:nth-child(1) .acao--comparar")
        check("comparar: bandeja só aparece no 2º", await page.evaluate("document.getElementById('bandejaComparar').hidden"))
        await page.click("#resultados .casa:nth-child(2) .acao--comparar")
        await page.click("#resultados .casa:nth-child(3) .acao--comparar")
        check("comparar: bandeja visível com 3", await page.evaluate("!document.getElementById('bandejaComparar').hidden && document.getElementById('bandejaN').textContent === '3'"))
        await page.click("#resultados .casa:nth-child(4) .acao--comparar"); await page.wait_for_timeout(200)
        check("comparar: 4º é recusado com aviso", await page.evaluate("document.getElementById('bandejaN').textContent === '3' && (document.getElementById('avisoComparar')||{}).textContent.includes('3')"))
        await page.screenshot(path=os.path.join(OUT, "favoritos-comparar-390.png"))
        reqs.clear()
        await page.click("#bandejaIr"); await page.wait_for_load_state("networkidle")
        cols = await page.locator(".comparar__tabela thead th.comparar__cabecalho").count()
        check("comparação: 3 colunas, URL compartilhável só com códigos", cols == 3 and "ids=EH-" in page.url and len(reqs) == 1, {"cols": cols, "url": page.url, "reqs": len(reqs)})
        check("comparação: diferenças marcadas com ◆ (não só cor) e 'não informado' quando falta", await page.locator("td.difere").count() >= 1)
        await axe(page, "comparar-390")
        await page.screenshot(path=os.path.join(OUT, "comparar-390.png"), full_page=True)
        reqs.clear()
        await page.goto(BASE + "/favoritos", wait_until="networkidle")
        check("favoritos: UMA consulta com codigos= (17 antes)", len(reqs) == 1 and "codigos=" in reqs[0], reqs)
        check("favoritos: 3 cards", await page.locator("#resultados .casa").count() == 3)
        await page.screenshot(path=os.path.join(OUT, "favoritos-390.png"))

        # consentimento pendente NÃO cobre o botão do painel (defeito real encontrado no QA)
        ctx2 = await browser.new_context(viewport={"width": 390, "height": 844}); pg2 = await ctx2.new_page()
        await pg2.goto(BASE + LISTA, wait_until="networkidle")
        temAviso = await pg2.locator('.eh-cc').count() == 1
        await pg2.click("#abrirFiltros"); await pg2.wait_for_timeout(300)
        cobre = await pg2.evaluate("(() => { const b = document.getElementById('verResultados').getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width/2, b.y + b.height/2); return !el || !el.closest('#verResultados'); })()")
        check("consentimento pendente não cobre 'Mostrar X imóveis'", temAviso and not cobre, {"aviso": temAviso, "cobre": cobre})
        await ctx2.close()

        # menu: rótulo do burger
        await page.click("#navBurger"); await page.wait_for_timeout(200)
        check("menu: rótulo vira 'Fechar menu' quando aberto", await page.get_attribute("#navBurger", "aria-label") == "Fechar menu" and await page.get_attribute("#navBurger", "aria-expanded") == "true")
        await page.keyboard.press("Escape")

        # vazio com diagnóstico
        await page.goto(BASE + LISTA + "?prefeitura=mie&cidade=toyota", wait_until="networkidle")
        sug = await page.locator("#avisoVazio [data-sugestao]").all_text_contents()
        check("vazio: diz qual filtro pesa e oferece remover (sem mudar sozinho)", len(sug) >= 2 and await page.locator("#avisoVazio", has_text="nada muda sozinho").count() == 1, sug)
        await page.screenshot(path=os.path.join(OUT, "vazio-390.png"), full_page=True)

        # parâmetros inválidos / abusivos
        r = await page.goto(BASE + LISTA + "?precoMax=abc&anoMin=5&pagina=99999&cidade=" + ",".join(f"x{i}" for i in range(300)) + "&q=" + "a" * 3000, wait_until="load")
        check("URL abusiva: 200 e aviso discreto, não erro", r.status == 200 and await page.locator(".aviso-param").count() >= 1)
        await ctx.close()

        # ── Desktop: fluxo básico + axe ────────────────────────────
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page(); await page.add_init_script(SEM_CONSENT)
        await page.goto(BASE + LISTA + "?cidade=toyota&planta=4ldk", wait_until="networkidle")
        await axe(page, "lista-1440")
        await page.select_option("#ordenar", "preco_asc")
        await page.wait_for_function("/ordem=preco_asc/.test(location.search) && document.getElementById('resultados').getAttribute('aria-busy') === null", timeout=8000)
        precos = await page.evaluate("[...document.querySelectorAll('#resultados .casa__preco b')].map(b => Number(b.textContent.replace(/\\D/g,'')))")
        check("ordenar por menor preço ordena de fato e explica o critério", precos == sorted(precos) and "barato" in (await page.text_content("#ordemExplica")), precos[:4])
        await page.screenshot(path=os.path.join(OUT, "lista-1440-ordenada.png"))
        await ctx.close()

        # ── 320 px: reflow (WCAG 1.4.10) ───────────────────────────
        ctx = await browser.new_context(viewport={"width": 320, "height": 568})
        page = await ctx.new_page(); await page.add_init_script(SEM_CONSENT)
        await page.goto(BASE + LISTA, wait_until="networkidle")
        check("320px: sem rolagem horizontal (reflow)", not await page.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
        await page.click("#abrirFiltros"); await page.wait_for_timeout(300)
        check("320px: painel sem rolagem horizontal", not await page.evaluate("document.querySelector('.painel__corpo').scrollWidth > document.querySelector('.painel__corpo').clientWidth + 1"))
        await ctx.close()

        # ── Zoom 200% (emulado com viewport metade) ────────────────
        ctx = await browser.new_context(viewport={"width": 720, "height": 450}, device_scale_factor=2)
        page = await ctx.new_page(); await page.add_init_script(SEM_CONSENT)
        await page.goto(BASE + LISTA, wait_until="networkidle")
        await page.evaluate("document.documentElement.style.fontSize = '200%'")
        await page.wait_for_timeout(300)
        check("texto 200%: sem rolagem horizontal", not await page.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
        await page.screenshot(path=os.path.join(OUT, "lista-texto-200.png"))
        await ctx.close()

        # ── API: tempo e carga ─────────────────────────────────────
        import time
        t = time.time(); urllib.request.urlopen(BASE + "/api/casas?cidade=toyota&planta=4ldk&porPagina=24").read(); R["api_ms"] = round((time.time() - t) * 1000)
        t = time.time(); html = urllib.request.urlopen(BASE + LISTA).read(); R["lista_ms"] = round((time.time() - t) * 1000); R["lista_bytes"] = len(html)
        await browser.close()

    R["resumo"] = {"passaram": sum(1 for c in R["checks"] if c["ok"]), "falharam": sum(1 for c in R["checks"] if not c["ok"])}
    with open(os.path.join(OUT, "resultado.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=2)
    print("\n", json.dumps(R["resumo"]), "| api", R["api_ms"], "ms | lista", R["lista_ms"], "ms", R["lista_bytes"], "bytes")

asyncio.run(main())
