// Static public marketing and legal pages for the TidePlace app.
// These pages intentionally do not depend on the logged-in TidePlace dashboard.
export const publicBase = 'https://social-hub-gui.vercel.app/tideplace';
export const publicContact = 'juliany.bertaglia@gmail.com';

const stylesheet = String.raw\`
:root{color-scheme:light;--ink:#231921;--muted:#72646d;--wine:#762740;--wine-2:#52152d;--bg:#faf7f8;--stroke:#e9dce1}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Arial,Helvetica,sans-serif;line-height:1.7}
a{color:var(--wine);text-underline-offset:3px}
a:focus-visible{outline:3px solid var(--wine);outline-offset:4px;border-radius:3px}
.sitebar{background:#fff;border-bottom:1px solid var(--stroke)}
.shell{width:min(980px,calc(100% - 36px));margin-inline:auto}
.sitebar .shell{display:flex;align-items:center;justify-content:space-between;min-height:85px;gap:18px}
.brand{display:inline-flex;align-items:center;gap:11px;text-decoration:none;color:var(--ink);font-size:19px;font-weight:800;letter-spacing:-.035em}
.brand img{width:36px;height:36px;object-fit:contain}
nav{display:flex;gap:23px;align-items:center;flex-wrap:wrap}
nav a{font-size:13px;text-decoration:none;color:#62515c;font-weight:600}
nav a:hover{color:var(--wine)}
main{padding:53px 0 72px}
.tag{color:var(--wine);font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;margin:0 0 9px}
h1{font-size:clamp(34px,5.7vw,56px);font-weight:760;letter-spacing:-.055em;line-height:1.12;margin:6px 0 20px}
.lead{font-size:clamp(17px,2vw,20px);max-width:780px;color:#625761;line-height:1.7}
h2{font-size:22px;letter-spacing:-.025em;margin:36px 0 9px;line-height:1.35}
h3{font-size:17px;margin:24px 0 7px}
p,li{font-size:15px;color:#4b444b}
ul,ol{padding-left:24px}li{margin-bottom:7px}
.updated{color:var(--muted);font-size:13px;margin:0 0 30px}
.panel{background:#fff;border:1px solid var(--stroke);border-radius:19px;padding:35px 40px;box-shadow:0 12px 35px rgba(41,14,26,.04)}
.callout{background:#f7edf1;border:1px solid #ead7de;padding:15px 19px;border-radius:12px}
.callout p{margin:0}
.cta{display:inline-flex;padding:13px 23px;background:var(--wine);color:#fff;text-decoration:none;border-radius:12px;font-weight:730;font-size:14px;margin:18px 12px 8px 0}
.cta:hover{background:var(--wine-2);color:#fff}
.cta.secondary{background:#fff;border:1px solid #d9c1ca;color:var(--wine)}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px;margin:34px 0}
.tile{background:#fff;border:1px solid var(--stroke);border-radius:16px;padding:21px}
.tile b{font-size:16px}.tile p{margin:7px 0 0;color:var(--muted);font-size:14px}
.pill{display:inline-block;font-size:11px;padding:5px 11px;border-radius:999px;background:#f0e4e9;color:var(--wine);font-weight:700}
footer{border-top:1px solid var(--stroke);padding:28px 0 38px;background:#fff}
footer .shell{display:flex;align-items:flex-start;gap:24px;justify-content:space-between;flex-wrap:wrap}
footer small{font-size:12px;color:#716671}
footer .links{display:flex;flex-wrap:wrap;gap:14px}
footer .links a{font-size:12px}
@media(max-width:640px){
.sitebar .shell{align-items:flex-start;flex-direction:column;padding:15px 0}
nav{gap:12px}
main{padding:32px 0 45px}
.panel{padding:22px 19px}.tiles{grid-template-columns:1fr}
}
\`;

export function publicPage({title,description,canonical,body}) {
  // Static authored HTML only: none of these props come from user input or URL params.
  return \`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="index,follow">
<title>\${title} | TidePlace</title>
<meta name="description" content="\${description}">
<link rel="canonical" href="\${publicBase}\${canonical}">
<style>\${stylesheet}</style>
</head>
<body>
<header class="sitebar"><div class="shell">
<a class="brand" href="/tideplace"><img src="/brand/tideplace-mark.svg" alt=""><span>TIDEPLACE</span></a>
<nav aria-label="Navegação pública"><a href="/tideplace">Sobre</a><a href="/tideplace/termos">Termos de Uso</a><a href="/tideplace/privacidade">Privacidade</a><a href="/">Entrar no painel</a></nav>
</div></header>
<main class="shell">\${body}</main>
<footer><div class="shell">
<small>© 2026 TidePlace · Flow with your audience.<br>Contato: <a href="mailto:\${publicContact}">\${publicContact}</a></small>
<div class="links"><a href="/tideplace">Sobre o TidePlace</a><a href="/tideplace/termos">Termos de Uso</a><a href="/tideplace/privacidade">Política de Privacidade</a></div>
</div></footer>
</body></html>\`;
}

export function publicHtmlResponse(content) {
  return new Response(content,{
    status:200,
    headers:{
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options':'nosniff'
    }
  });
}
