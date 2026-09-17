export const INFLUENCER_CLASSIFICATIONS = {
  prequalified: {
    label: 'Pré-aprovado',
    description: 'Boa aderência. Priorize a análise do perfil.',
  },
  review: {
    label: 'Revisar',
    description: 'Tem potencial, mas precisa de análise manual.',
  },
  low_fit: {
    label: 'Baixa aderência',
    description: 'Não é prioridade neste momento.',
  },
};

function number(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function yes(value) {
  return value === true || String(value || '').toLowerCase() === 'yes';
}

export function calculateInfluencerScore(values) {
  const followers = number(values.followers, 0, 1000000000);
  const averageViews = number(values.averageViews, 0, 1000000000);
  const averageLikes = number(values.averageLikes, 0, 1000000000);
  const averageComments = number(values.averageComments, 0, 1000000000);
  const postsPerWeek = number(values.postsPerWeek, 0, 100);
  const brazilAudiencePercent = number(values.brazilAudiencePercent, 0, 100);
  const niche = String(values.niche || '').toLowerCase();

  let nichePoints = 5;
  if (['casa_decoracao', 'diy_reforma', 'organizacao', 'jardinagem'].includes(niche)) nichePoints = 25;
  else if (['lifestyle', 'maternidade', 'beleza', 'multinicho'].includes(niche)) nichePoints = 15;

  const viewRate = followers > 0 ? averageViews / followers : 0;
  let viewPoints = 0;
  if (viewRate >= 0.5) viewPoints = 20;
  else if (viewRate >= 0.25) viewPoints = 16;
  else if (viewRate >= 0.1) viewPoints = 10;
  else if (viewRate >= 0.05) viewPoints = 5;

  const engagementRate = averageViews > 0
    ? (averageLikes + averageComments) / averageViews
    : 0;
  let engagementPoints = 0;
  if (engagementRate >= 0.08) engagementPoints = 15;
  else if (engagementRate >= 0.04) engagementPoints = 12;
  else if (engagementRate >= 0.02) engagementPoints = 7;
  else if (engagementRate > 0) engagementPoints = 3;

  let consistencyPoints = 0;
  if (postsPerWeek >= 5) consistencyPoints = 10;
  else if (postsPerWeek >= 3) consistencyPoints = 8;
  else if (postsPerWeek >= 1) consistencyPoints = 4;

  let audiencePoints = 0;
  if (brazilAudiencePercent >= 80) audiencePoints = 10;
  else if (brazilAudiencePercent >= 60) audiencePoints = 7;
  else if (brazilAudiencePercent >= 40) audiencePoints = 3;

  const affiliatePoints = yes(values.affiliateExperience) ? 8 : 0;
  const livePoints = yes(values.liveExperience) ? 4 : 0;
  const commitmentPoints = yes(values.contentCommitment) ? 8 : 0;

  const breakdown = {
    niche: nichePoints,
    views: viewPoints,
    engagement: engagementPoints,
    consistency: consistencyPoints,
    brazilAudience: audiencePoints,
    affiliateExperience: affiliatePoints,
    liveExperience: livePoints,
    commitment: commitmentPoints,
  };
  const score = Object.values(breakdown).reduce((total, value) => total + value, 0);
  const classification = score >= 72 ? 'prequalified' : score >= 50 ? 'review' : 'low_fit';

  return {
    score,
    classification,
    breakdown,
    metrics: {
      viewRate: Number((viewRate * 100).toFixed(2)),
      engagementRate: Number((engagementRate * 100).toFixed(2)),
    },
  };
}
