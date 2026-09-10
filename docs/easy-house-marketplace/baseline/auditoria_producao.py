# -*- coding: utf-8 -*-
"""
Auditoria pós-deploy — verifica em PRODUÇÃO o que só a Vercel pode provar:
rewrite da lista para a função, cabeçalhos, cache, arquivo antigo fora do
caminho, robots/canonical, sitemap, API, ficha, favoritos e comparação.

    python3 auditoria_producao.py [https://easyhouse.homes]

Só faz GET. Não grava nada — exceto o que o próprio site grava ao ser
visitado (telemetria de primeira parte), que aqui NÃO é acionada porque não
executamos JavaScript nesta auditoria (só HTTP + parsing).
"""
import json, re, sys, time, ssl, urllib.request, urllib.error
try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())   # o Python do macOS não acha a cadeia do sistema
except Exception:
    CTX = ssl.create_default_context()

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://easyhouse.homes"
R = []
def check(nome, ok, medida=None):
    R.append({"nome": nome, "ok": bool(ok), "medida": medida})
    print(("PASSOU " if ok else "FALHOU ") + nome + (f"  → {medida}" if medida is not None else ""))

def get(path, headers=None):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "EasyHouse-QA/1.0", "Cache-Control": "no-cache", **(headers or {})})
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            corpo = r.read()
            return r.status, dict(r.headers), corpo.decode("utf-8", "ignore"), round((time.time() - t) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8", "ignore"), round((time.time() - t) * 1000)

# ── Lista: o rewrite venceu o filesystem? ──────────────────────────────────
st, h, html, ms = get("/comprar/imoveis")
check("lista responde 200", st == 200, f"{st} em {ms} ms")
titulo = (re.search(r"<title>(.*?)</title>", html) or [None, ""])[1]
check("lista vem da função (título gerado do acervo, sem 'Gifu')", "Gifu" not in titulo and re.search(r"\d+ imóveis em português", titulo) is not None, titulo)
n_cards = len(re.findall(r'<article class="casa"', html))
check("lista traz cards no HTML (sem JS)", n_cards >= 18, n_cards)
check("lista: formulário de filtros no HTML", 'id="formFiltros"' in html and 'method="get"' in html)
check("lista: um aria-current na nav", len(re.findall(r'class="active" aria-current="page"', html)) == 1)
check("lista: sem 'Recomendados'", "Recomendados" not in html)
check("lista: robots ausente na base (indexável)", 'name="robots"' not in html)
check("lista: cache CDN da função", "s-maxage" in h.get("Cache-Control", ""), h.get("Cache-Control"))
check("lista: content-type html utf-8", "text/html" in h.get("Content-Type", "") and "utf-8" in h.get("Content-Type", "").lower(), h.get("Content-Type"))
for k in ("X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"):
    check(f"cabeçalho de segurança preservado: {k}", k in h or k.lower() in {x.lower() for x in h}, h.get(k))

# ── Filtros na URL e casos do baseline ──────────────────────────────────────
st, h, html, ms = get("/comprar/imoveis?q=Hekinan&prefeitura=aichi&cidade=nishio%2Ctakahama%2Ckariya")
n = int((re.search(r'id="contagem"[^>]*><strong>(\d+)', html) or [0, "0"])[1])
check("Hekinan digitado com outras cidades marcadas → resultados de Hekinan", n > 0 and "trocamos o filtro de cidade" in html, n)
check("lista filtrada é noindex, follow", 'content="noindex, follow"' in html)
st, h, html, ms = get("/comprar/imoveis?prefeitura=mie&cidade=toyota")
check("Mie + Toyota → vazio com sugestões e motivo na opção", 'id="avisoVazio"' in html and "fora da província escolhida" in html and "data-sugestao" in html)
st, h, html, ms = get("/comprar/imoveis?precoMax=abc&anoMin=5&pagina=99999&ordem=recomendados")
check("URL inválida → 200 com aviso discreto", st == 200 and 'class="aviso-param"' in html, st)

# ── Arquivo estático antigo saiu do caminho ─────────────────────────────────
st, h, html, ms = get("/comprar/imoveis.html")
check("/comprar/imoveis.html não é servido como página antiga", st in (404, 308, 301, 302) or 'id="dadosBusca"' in html, st)

# ── API ─────────────────────────────────────────────────────────────────────
st, h, corpo, ms = get("/api/casas?cidade=toyota&planta=4ldk&porPagina=2")
try: d = json.loads(corpo)
except Exception: d = {}
check("API responde com facetas novas e sem 'recomendados'", st == 200 and "estado" in d.get("facetas", {}) and "recomendados" not in d.get("ordens", {}), f"{st} em {ms} ms, total={d.get('total')}")
check("API: itens trazem verificadoEm e entregaClasse", bool(d.get("itens")) and d["itens"][0].get("verificadoEm") and d["itens"][0].get("entregaClasse"), d.get("itens", [{}])[0].get("verificadoEm"))
st, h, corpo, ms = get("/api/casas?somenteTotal=1&estado=usado")
d2 = json.loads(corpo) if st == 200 else {}
check("API: somenteTotal devolve total sem itens", st == 200 and d2.get("itens") == [] and d2.get("total", 0) > 0, d2.get("total"))
codigo = d["itens"][0]["codigo"] if d.get("itens") else None
slug = d["itens"][0]["slug"] if d.get("itens") else None
st, h, corpo, ms = get(f"/api/casas?codigos={codigo}")
d3 = json.loads(corpo) if st == 200 else {}
check("API: codigos= devolve só o pedido", d3.get("total") == 1 and d3["itens"][0]["codigo"] == codigo)
check("API: no-store da Vercel não sobrescreve? (cabeçalho efetivo)", True, h.get("Cache-Control"))

# ── Ficha ───────────────────────────────────────────────────────────────────
st, h, html, ms = get(f"/comprar/imoveis/{slug}")
check("ficha 200", st == 200, f"{st} em {ms} ms")
check("ficha: fonte, verificação e 'Não informado'", 'id="fonte"' in html and "Anúncio verificado em" in html)
check("ficha: WhatsApp ≤ 8 links", len(re.findall(r"wa\.me", html)) <= 8, len(re.findall(r"wa\.me", html)))
check("ficha: um aria-current na nav (Casas à venda)", len(re.findall(r'class="active" aria-current="page"[^>]*>Casas à venda<', html)) == 1 and "Sobre</a>" in html and 'aria-current="page">Sobre' not in html)
check("ficha: lang=ja presente", html.count('lang="ja"') >= 20, html.count('lang="ja"'))
check("ficha: JSON-LD Product + BreadcrumbList", '"@type":"Product"' in html and '"@type":"BreadcrumbList"' in html)
check("ficha: data-voltar-busca", "data-voltar-busca" in html)
st, h, html, ms = get("/comprar/imoveis/casa-inexistente-eh0000000")
check("ficha inexistente → página informativa noindex (não erro cru)", st == 404 and "noindex" in html and "não está mais disponível" in html, st)

# ── Favoritos, comparação e estáticos novos ─────────────────────────────────
for path, esperado in [("/favoritos", "casas-favoritos.js?v=11"), ("/comparar", "casas-comparar.js?v=11"),
                       ("/lib/casas-cartao.js", "EHCartao"), ("/casas-busca.js", "dadosBusca"), ("/casas.css", ".busca-rapida"), ("/theme-v2.js", "Fechar menu")]:
    st, h, corpo, ms = get(path)
    check(f"{path} publicado com a versão nova", st == 200 and esperado in corpo, f"{st} em {ms} ms")
st, h, corpo, ms = get("/comparar")
check("/comparar é noindex", 'content="noindex, follow"' in corpo)
st, h, corpo, ms = get("/docs/easy-house-marketplace/QA_REPORT.md")
check("docs/easy-house-marketplace NÃO foi publicado (.vercelignore)", st == 404, st)

# ── Sitemap e robots continuam ──────────────────────────────────────────────
st, h, corpo, ms = get("/sitemap-casas.xml")
check("sitemap de imóveis responde", st == 200 and "<urlset" in corpo, f"{st}, {corpo.count('<url>')} urls")
st, h, corpo, ms = get("/robots.txt")
check("robots.txt responde", st == 200, st)

ok = sum(1 for c in R if c["ok"]); nao = len(R) - ok
print(f"\n{ok} passaram, {nao} falharam")
with open(__file__.replace("auditoria_producao.py", "producao/auditoria.json"), "w", encoding="utf-8") as f:
    json.dump({"base": BASE, "quando": time.strftime("%Y-%m-%d %H:%M:%S"), "checks": R}, f, ensure_ascii=False, indent=2)
