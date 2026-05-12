// Lógica exata do PRD: nunca inventa, score 0 quando sem fontes.
export function calcScore(linkedinDiscovery, newsItems) {
  const newsCount = newsItems?.length ?? 0;
  const hasLinkedin = !!linkedinDiscovery?.url;
  const confianca = linkedinDiscovery?.confianca ?? null;

  // Caso especial: nenhuma fonte
  if (!hasLinkedin && newsCount === 0) {
    return { score_geral: 0, alerta: 'Nenhuma fonte encontrada' };
  }

  let score = 0;
  const alerts = [];

  // LinkedIn
  if (confianca === 'alta') {
    score += 40;
  } else if (confianca === 'média') {
    score += 20;
  } else if (confianca === 'baixa') {
    alerts.push('Perfil LinkedIn ambíguo — verificar manualmente');
  }

  // Notícias
  if (newsCount >= 3) {
    score += 40;
  } else if (newsCount >= 1) {
    score += 20;
  } else {
    alerts.push('Sem notícias encontradas');
  }

  // Bônus recência (< 12 meses)
  if (newsCount > 0) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const hasRecent = newsItems.some(n => n.date && new Date(n.date) >= cutoff);
    if (hasRecent) {
      score = Math.min(100, score + 20);
    } else {
      alerts.push('Notícias desatualizadas — mais recente há mais de 12 meses');
    }
  }

  return {
    score_geral: Math.min(100, score),
    alerta: alerts.length > 0 ? alerts.join('; ') : null,
  };
}
