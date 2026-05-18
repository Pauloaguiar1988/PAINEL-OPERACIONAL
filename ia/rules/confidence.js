function hasText(value) {
  return String(value == null ? '' : value).trim().length > 0;
}

function calculateConfidence(os, analysis) {
  const classification = analysis?.classificacao || {};
  const decision = analysis?.decisao || {};
  const evidences = Array.isArray(analysis?.evidencias) ? analysis.evidencias : [];
  const pending = Array.isArray(analysis?.pendencias) ? analysis.pendencias : [];
  const probableCause = String(classification.probableCause || '');
  const billing = String(decision.cobranca || '');

  const missingBase = !hasText(os?.os) || !hasText(os?.cliente) || !hasText(os?.problema || os?.descricao);
  const lowCause = probableCause === 'inconclusiva';
  const billingDivergent = billing.includes('revisao') || billing.includes('validacao');
  const weakEvidence = evidences.length === 0 || pending.length > 0;

  if (missingBase || lowCause || billingDivergent) {
    return { geral: 'baixa', motivo: 'Dados incompletos, causa inconclusiva ou cobranca dependente de revisao.' };
  }
  if (weakEvidence) {
    return { geral: 'media', motivo: 'Dados principais presentes, mas ainda ha pouca evidencia ou pendencias.' };
  }
  return { geral: 'alta', motivo: 'Causa, solucao e regra de cobranca compativeis com evidencias informadas.' };
}

module.exports = { calculateConfidence };
