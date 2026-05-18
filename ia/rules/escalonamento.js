function text(value) {
  return String(value == null ? '' : value).toLowerCase();
}

function decideEscalation(os, classification, confidence) {
  const source = text(`${os?.problema || ''} ${os?.diagnostico || ''} ${os?.laudo || ''} ${os?.observacao || ''}`);
  const cause = String(classification?.probableCause || '');
  const billing = text(os?.decisaoCobranca || os?.cobranca || '');

  if (billing.includes('contrato') || billing.includes('proposta') || billing.includes('negoci') || billing.includes('comercial')) {
    return { necessario: true, nivel: 'comercial', destino: 'Comercial', justificativa: 'Caso envolve contrato, proposta, negociacao ou cobranca sensivel.' };
  }
  if (cause === 'bug_produto' || source.includes('bug') || source.includes('firmware')) {
    return { necessario: true, nivel: 'engenharia', destino: 'Engenharia', justificativa: 'Ha indicio de bug, firmware ou falha de produto.' };
  }
  if ((source.includes('sap') || source.includes('base') || source.includes('cadastro')) && confidence?.geral !== 'baixa') {
    return { necessario: true, nivel: 'sap', destino: 'SAP', justificativa: 'SAP somente apos evidencia tecnica suficiente.' };
  }
  if (confidence?.geral === 'baixa' || cause === 'inconclusiva') {
    return { necessario: true, nivel: 'nivel_1_tecnico_lider', destino: 'Bruno / tecnico lider', justificativa: 'Tecnico deve esgotar testes e acionar o tecnico lider antes de SAP.' };
  }
  return { necessario: false, nivel: 'nenhum', destino: '', justificativa: 'Sem escalonamento necessario com os dados atuais.' };
}

module.exports = { decideEscalation };
