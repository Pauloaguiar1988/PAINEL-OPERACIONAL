function text(value) {
  return String(value == null ? '' : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : [];
}

function buildLaudoStructure(os, analysis) {
  const classification = analysis?.classificacao || {};
  const decision = analysis?.decisao || {};
  const pending = list(analysis?.pendencias);
  const evidences = list(analysis?.evidencias);
  const serviceType = text(classification.tipoAtendimento || classification.serviceType || 'corretiva');
  return {
    objetivo: `Atender a OS ${text(os?.os) || 'sem codigo'} do cliente ${text(os?.cliente) || 'nao informado'} para tratamento ${serviceType}.`,
    cenarioEncontradoDiagnostico: text(os?.diagnostico || os?.laudo || os?.problema || os?.descricao) || 'Diagnostico nao informado; registrar testes executados antes do encerramento.',
    acoesRealizadas: list(os?.acoes || os?.acoesRealizadas).length
      ? list(os?.acoes || os?.acoesRealizadas)
      : ['Validar contrato, garantia, horario, sintomas, evidencias e resultado tecnico.'],
    resultadoStatusFinal: text(os?.resultado || os?.statusFinal || classification.outcomeType) || 'Resultado pendente de confirmacao tecnica.',
    pendenciasResponsaveis: pending.length
      ? pending
      : evidences.map(item => `Tecnico responsavel: anexar evidencia - ${item}`),
    conclusaoTecnica: decision.operacional || 'Conclusao tecnica depende da validacao das evidencias registradas.',
    acompanhamento: analysis?.escalonamento?.necessario
      ? `Acompanhar com ${analysis.escalonamento.destino || analysis.escalonamento.nivel}.`
      : 'Acompanhar somente se houver retorno, divergencia de cobranca ou falha recorrente.'
  };
}

module.exports = { buildLaudoStructure };
