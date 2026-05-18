function text(value) {
  return String(value == null ? '' : value).toLowerCase();
}

function decideBilling(os, classification) {
  const source = text(`${os?.problema || ''} ${os?.diagnostico || ''} ${os?.laudo || ''} ${os?.observacao || ''}`);
  const warrantyType = String(classification?.warrantyType || '').trim();
  const probableCause = String(classification?.probableCause || '').trim();

  if (probableCause === 'inconclusiva') {
    return {
      cobranca: 'revisao_humana_obrigatoria',
      justificativa: 'Caso inconclusivo: decisao de cobranca depende de revisao humana e evidencias adicionais.',
      reviewRequired: true
    };
  }
  if (warrantyType === 'garantia_servico' || probableCause === 'erro_interno_software') {
    return {
      cobranca: 'sem_debito_total',
      justificativa: 'Erro associado a servico anterior, atualizacao, versao ou intervencao interna.',
      reviewRequired: false
    };
  }
  if (warrantyType === 'garantia_fabrica' && probableCause !== 'mau_uso') {
    return {
      cobranca: 'somente_deslocamento_se_previsto',
      justificativa: 'Garantia de fabrica vigente sem indicio de mau uso; cobrar apenas deslocamento quando previsto.',
      reviewRequired: false
    };
  }
  if (probableCause === 'mau_uso' || probableCause === 'infra_cliente') {
    return {
      cobranca: 'cobranca_aplicavel',
      justificativa: probableCause === 'mau_uso'
        ? 'Mau uso identificado na analise tecnica.'
        : 'Infraestrutura do cliente indicada como causa provavel.',
      reviewRequired: false
    };
  }
  if (probableCause === 'visita_improdutiva' || source.includes('improdut')) {
    return {
      cobranca: 'cobrar_conforme_abertura_os',
      justificativa: 'Visita improdutiva deve seguir regra acordada na abertura da OS.',
      reviewRequired: true
    };
  }
  return {
    cobranca: 'validacao_comercial_necessaria',
    justificativa: 'Regra de cobranca nao totalmente determinada pelos dados disponiveis.',
    reviewRequired: true
  };
}

module.exports = { decideBilling };
