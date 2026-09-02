import { CONSENT_TEXT } from './service.js';

function escape(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function signupHtml({ success = false, error = '', values = {} } = {}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#10110f">
<meta name="robots" content="noindex">
<meta name="description" content="Cadastre seu contato para receber novidades do Argo com a equipe do Gui Nonato.">
<title>${success ? 'Cadastro recebido' : 'Novidades do Argo'} | Gui Nonato</title>
<style>
:root{color-scheme:dark;font-family:Arial,Helvetica,sans-serif;background:#10110f;color:#f5f2ea}*{box-sizing:border-box}body{margin:0;min-height:100svh;background:radial-gradient(ellipse at 85% 0,rgba(197,158,75,.14),transparent 55%)}main{width:min(520px,calc(100% - 40px));margin:0 auto;padding:42px 0 30px}.brand{font-size:12px;font-weight:800;letter-spacing:.18em;color:#e7be68}.brand small{display:block;margin-top:7px;color:#8f9287;font-size:10px;letter-spacing:.12em}.card{margin-top:38px;padding:30px;border:1px solid #34372e;border-radius:20px;background:#191b16;box-shadow:0 20px 70px rgba(0,0,0,.15)}.eyebrow{margin:0 0 15px;color:#e7be68;text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:.14em}h1{margin:0;font-size:clamp(32px,7vw,42px);line-height:1.1;letter-spacing:-.035em}h1 span{color:#e7be68}.intro{margin:18px 0 26px;font-size:15px;line-height:1.65;color:#b8bdb0}label.field{display:block;margin:0 0 18px;font-size:13px;font-weight:700}.field input{display:block;width:100%;margin-top:9px;min-height:52px;padding:13px 14px;border:1px solid #454a3d;border-radius:9px;background:#11130f;color:#f5f2ea;font:inherit;font-size:16px}.field input::placeholder{color:#7e8576}.field input:focus{outline:2px solid #e7be68;outline-offset:2px}.consent{display:flex;align-items:flex-start;gap:10px;margin:6px 0 23px;color:#c2c7ba;font-size:13px;line-height:1.5}.consent input{width:19px;height:19px;flex:0 0 19px;margin:1px 0 0;accent-color:#e7be68}button,.primary{display:block;width:100%;min-height:52px;padding:15px 12px;border:0;border-radius:9px;background:#e7be68;color:#17140b;font:inherit;font-size:14px;font-weight:800;text-align:center;text-decoration:none;cursor:pointer}button:hover,.primary:hover{background:#f0cb7a}a:focus-visible,button:focus-visible{outline:3px solid #fff;outline-offset:3px}.note{margin:17px 0 0;color:#8f9787;font-size:11px;line-height:1.65}.note a,footer a{color:#bdc4b4;text-underline-offset:3px}.error{margin:20px 0;padding:12px;border:1px solid #9f5b4e;border-radius:8px;color:#ffcdbe;font-size:14px;line-height:1.5}.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.success-icon{display:grid;place-items:center;width:48px;height:48px;margin-bottom:22px;border:1px solid #728056;border-radius:50%;background:#293021;color:#c0d6a2;font-size:26px}footer{padding:25px 12px;text-align:center;color:#8f9787;font-size:12px;line-height:1.7}footer p{margin:0 0 9px}.privacy{font-size:10px;color:#7a8272}@media(max-width:420px){main{width:calc(100% - 28px);padding-top:28px}.card{padding:24px 20px;margin-top:28px}}
</style>
</head>
<body>
<main>
  <div class="brand">GUI NONATO<small>CONTEÚDO E ECOMMERCE</small></div>
  <section class="card" aria-labelledby="title">
    ${success ? `
    <div class="success-icon" aria-hidden="true">✓</div>
    <p class="eyebrow">Interesse registrado</p>
    <h1 id="title">Você está <span>na lista.</span></h1>
    <p class="intro">Seu cadastro foi recebido. A equipe do Gui poderá entrar em contato pelo WhatsApp com novidades sobre o Argo.</p>
    <a class="primary" href="https://wa.me/5511923990244">Falar com a equipe</a>
    <p class="note">Você pode pedir para sair da lista a qualquer momento pelo WhatsApp da equipe.</p>` : `
    <p class="eyebrow">Novidades do Argo</p>
    <h1 id="title">Fique por dentro.<br><span>No seu tempo.</span></h1>
    <p class="intro">Não consegue ir à Imersão? Deixe seu contato para acompanhar as novidades do Argo.</p>
    ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
    <form method="post" action="/argo/novidades" accept-charset="UTF-8">
      <label class="field" for="name">Seu nome<input id="name" name="name" autocomplete="name" placeholder="Como podemos te chamar?" minlength="2" maxlength="100" value="${escape(values.name)}" required></label>
      <label class="field" for="whatsapp">WhatsApp com DDD<input id="whatsapp" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 91234-5678" minlength="10" maxlength="22" value="${escape(values.whatsapp)}" required></label>
      <div class="trap" aria-hidden="true"><label>Site da empresa<input name="company_site" tabindex="-1" autocomplete="off"></label></div>
      <label class="consent"><input type="checkbox" name="consent" value="yes"${values.consent === 'yes' ? ' checked' : ''} required><span>${escape(CONSENT_TEXT)}</span></label>
      <button type="submit">Quero receber novidades</button>
      <p class="note">Seu nome e WhatsApp serão usados pela equipe do Gui para esse contato. Você pode pedir para sair da lista pelo <a href="https://wa.me/5511923990244">WhatsApp da equipe</a>.</p>
    </form>`}
  </section>
  <footer><p>Quer conhecer a Imersão?<br><a href="https://imersao.guinonato.com/">Veja os detalhes do evento</a></p><a class="privacy" href="/privacidade">Política de privacidade</a></footer>
</main>
</body>
</html>`;
}
