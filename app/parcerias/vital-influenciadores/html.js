function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function option(value, label, selected) {
  return `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`;
}

function pageShell(content) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Parcerias TikTok · Vital Decor</title>
  <style>
    :root{color-scheme:light;--ink:#171714;--muted:#69655d;--line:#ddd8cc;--paper:#fff;--bg:#f2efe8;--gold:#b9924d;--green:#273d32}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#ede8dc 0,#f7f5ef 48%,#eee9df 100%);color:var(--ink);font-family:Arial,sans-serif;min-height:100vh}
    .wrap{width:min(920px,calc(100% - 28px));margin:34px auto 60px}.hero{background:var(--ink);color:#fff;border-radius:24px;padding:30px;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:end;box-shadow:0 22px 65px rgba(31,27,20,.18)}
    .brand{display:inline-flex;align-items:center}.brand img{display:block;width:190px;max-width:55vw;height:auto}.hero h1{font-family:Georgia,serif;font-weight:500;font-size:clamp(34px,6vw,58px);line-height:.96;margin:26px 0 14px;max-width:650px}.hero p{margin:0;max-width:610px;color:#cfcbc1;line-height:1.55}.badge{border:1px solid #454239;border-radius:16px;padding:16px;min-width:150px}.badge b,.badge span{display:block}.badge b{font-size:28px;color:#e7c780}.badge span{font-size:11px;color:#aaa69b;margin-top:5px}
    form,.card{margin-top:18px;background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:28px;box-shadow:0 16px 50px rgba(31,27,20,.08)}fieldset{border:0;padding:0;margin:0 0 30px}legend{font-family:Georgia,serif;font-size:24px;margin-bottom:6px}.help{display:block;color:var(--muted);font-size:12px;line-height:1.45;margin-bottom:17px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.full{grid-column:1/-1}label{display:grid;gap:7px;font-size:12px;font-weight:800;color:#4f4b43}input,select,textarea{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px 13px;background:#fff;color:var(--ink);font:inherit;font-size:14px;outline:none}input:focus,select:focus,textarea:focus{border-color:var(--gold);box-shadow:0 0 0 4px rgba(185,146,77,.13)}.choice{display:flex;align-items:flex-start;gap:10px;border:1px solid var(--line);border-radius:13px;padding:13px;background:#fbfaf7;font-weight:600;line-height:1.45}.choice input{width:18px;height:18px;margin:1px 0 0;flex:0 0 auto}.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.error{margin:0 0 18px;border:1px solid #e7b8ad;background:#fff0ec;color:#7b3025;border-radius:13px;padding:13px;font-size:13px;font-weight:800}.submit{width:100%;border:0;border-radius:14px;background:var(--green);color:#fff;padding:15px 18px;font-size:14px;font-weight:900;cursor:pointer}.submit:hover{filter:brightness(1.08)}.fine{margin:12px 0 0;text-align:center;color:#837f76;font-size:10px;line-height:1.5}.success{text-align:center;padding:44px 30px}.success i{display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:#e4f1e8;color:#257045;font-style:normal;font-size:28px;margin:0 auto 18px}.success h1{font-family:Georgia,serif;font-size:38px;font-weight:500;margin:0 0 10px}.success p{color:var(--muted);line-height:1.6;max-width:580px;margin:0 auto}.footer{text-align:center;color:#77736a;font-size:11px;margin-top:18px}
    @media(max-width:720px){.wrap{margin-top:14px}.hero{grid-template-columns:1fr;padding:24px}.badge{display:none}form,.card{padding:20px}.grid{grid-template-columns:1fr}.full{grid-column:auto}}
  </style>
</head>
<body>${content}</body>
</html>`;
}

export function influencerFormHtml({ token = '', values = {}, error = '', success = false, alreadySubmitted = false } = {}) {
  if (success || alreadySubmitted) {
    return pageShell(`<main class="wrap"><section class="card success"><i>✓</i><h1>${alreadySubmitted ? 'Formulário já enviado' : 'Cadastro recebido!'}</h1><p>${alreadySubmitted ? 'Sua inscrição já está na nossa triagem. Não é necessário preencher novamente.' : 'Agora nossa equipe vai analisar seu perfil e seus conteúdos. Se houver aderência com as campanhas da Vital Decor, entramos em contato.'}</p></section><p class="footer">Vital Decor · Parcerias com criadores</p></main>`);
  }

  const v = (name) => escapeHtml(values[name] || '');
  const tiktokProfile = escapeHtml(values.tiktokUrl || 'https://www.tiktok.com/@');

  return pageShell(`<main class="wrap">
    <section class="hero">
      <div><div class="brand"><img src="/vital-decor-logo.png" alt="Vital Decor"></div><h1>Crie, indique e cresça com a gente.</h1><p>Conte um pouco sobre seu perfil no TikTok. A inscrição leva cerca de 3 minutos e nos ajuda a encontrar criadores com conteúdo que combina com a Vital.</p></div>
      <div class="badge"><b>3 min</b><span>formulário rápido</span></div>
    </section>
    <form method="post" action="/parcerias/vital-influenciadores" autocomplete="on">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label class="hp" aria-hidden="true">Não preencha<input name="company_site" tabindex="-1" autocomplete="off"></label>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
      <fieldset><legend>Sobre você</legend><span class="help">Dados para contato e conferência do perfil.</span><div class="grid">
        <label>Seu nome<input name="creatorName" required maxlength="120" value="${v('creatorName')}"></label>
        <label>E-mail<input name="email" type="email" required maxlength="160" value="${v('email')}"></label>
        <label>Cidade e estado<input name="cityState" required maxlength="120" placeholder="Ex.: Guarulhos/SP" value="${v('cityState')}"></label>
        <label>Perfil no TikTok<input name="tiktokUrl" required maxlength="300" value="${tiktokProfile}" inputmode="url" autocapitalize="none" autocomplete="off"></label>
        <label class="full">Instagram (opcional)<input name="instagramUrl" maxlength="300" placeholder="https://www.instagram.com/seuperfil" value="${v('instagramUrl')}"></label>
      </div></fieldset>
      <fieldset><legend>Seus números</legend><span class="help">Use uma média aproximada dos seus 10 vídeos mais recentes. Não precisa ser perfeito.</span><div class="grid">
        <label>Principal tema do conteúdo<select name="niche" required><option value="">Selecione</option>${option('casa_decoracao','Casa e decoração',values.niche)}${option('diy_reforma','DIY e reforma',values.niche)}${option('organizacao','Organização',values.niche)}${option('jardinagem','Jardinagem',values.niche)}${option('lifestyle','Lifestyle',values.niche)}${option('maternidade','Maternidade',values.niche)}${option('beleza','Beleza',values.niche)}${option('multinicho','Conteúdo variado',values.niche)}${option('outro','Outro',values.niche)}</select></label>
        <label>Seguidores no TikTok<input name="followers" type="number" min="1" max="1000000000" required inputmode="numeric" value="${v('followers')}"></label>
        <label>Média de visualizações<input name="averageViews" type="number" min="0" max="1000000000" required inputmode="numeric" value="${v('averageViews')}"></label>
        <label>Média de curtidas<input name="averageLikes" type="number" min="0" max="1000000000" required inputmode="numeric" value="${v('averageLikes')}"></label>
        <label>Média de comentários<input name="averageComments" type="number" min="0" max="1000000000" required inputmode="numeric" value="${v('averageComments')}"></label>
        <label>Quantos vídeos publica por semana?<input name="postsPerWeek" type="number" min="0" max="100" required inputmode="numeric" value="${v('postsPerWeek')}"></label>
        <label>% aproximada do público no Brasil<input name="brazilAudiencePercent" type="number" min="0" max="100" required inputmode="numeric" value="${v('brazilAudiencePercent')}"></label>
        <label>Já vendeu como afiliado?<select name="affiliateExperience" required><option value="">Selecione</option>${option('yes','Sim',values.affiliateExperience)}${option('no','Ainda não',values.affiliateExperience)}</select></label>
        <label>Já fez live de vendas?<select name="liveExperience" required><option value="">Selecione</option>${option('yes','Sim',values.liveExperience)}${option('no','Ainda não',values.liveExperience)}</select></label>
      </div></fieldset>
      <fieldset><legend>Seu conteúdo</legend><span class="help">Mande os vídeos que melhor representam seu jeito de criar e vender.</span><div class="grid">
        <label class="full">Link do seu melhor vídeo<input name="topVideo1" type="url" required maxlength="300" placeholder="Link de um vídeo no TikTok" value="${v('topVideo1')}"></label>
        <label>Segundo vídeo (opcional)<input name="topVideo2" type="url" maxlength="300" value="${v('topVideo2')}"></label>
        <label>Terceiro vídeo (opcional)<input name="topVideo3" type="url" maxlength="300" value="${v('topVideo3')}"></label>
        <label class="choice full"><input type="checkbox" name="contentCommitment" value="yes" required${values.contentCommitment === 'yes' ? ' checked' : ''}><span>Tenho disponibilidade para receber produtos e produzir pelo menos 3 conteúdos em até 14 dias após o recebimento.</span></label>
        <label class="choice full"><input type="checkbox" name="consent" value="yes" required${values.consent === 'yes' ? ' checked' : ''}><span>Autorizo a Vital Decor a analisar os dados e perfis informados para avaliar uma possível parceria.</span></label>
      </div></fieldset>
      <button class="submit" type="submit">Enviar minha inscrição</button>
      <p class="fine">Seus dados serão usados somente para a avaliação desta parceria.</p>
    </form>
    <p class="footer">Vital Decor · Parcerias com criadores</p>
  </main>`);
}
