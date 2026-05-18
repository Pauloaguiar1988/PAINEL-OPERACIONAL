function text(value) {
  return String(value == null ? '' : value).toLowerCase();
}

function classifyServiceType(os) {
  const source = text(`${os?.tipoAtendimento || ''} ${os?.problema || ''} ${os?.descricao || ''} ${os?.diagnostico || ''}`);
  if (source.includes('instal')) return 'instalacao';
  if (source.includes('prevent')) return 'preventiva';
  if (source.includes('orient')) return 'orientacao';
  if (source.includes('valid')) return 'validacao';
  if (source.includes('software') || source.includes('sistema') || source.includes('atualiza')) return 'software';
  return 'corretiva';
}

function classifyWarrantyType(os) {
  const source = text(`${os?.garantia || ''} ${os?.cobertura || ''} ${os?.observacao || ''} ${os?.laudo || ''}`);
  if (source.includes('garantia de fabrica') || source.includes('garantia fabrica')) return 'garantia_fabrica';
  if (source.includes('garantia de servico') || source.includes('retorno') || source.includes('erro anterior')) return 'garantia_servico';
  if (source.includes('contrato')) return 'contrato';
  if (source.includes('fora') || source.includes('sem garantia') || source.includes('avulso')) return 'fora_garantia';
  return 'nao_identificado';
}

function classifyProbableCause(os) {
  const source = text(`${os?.causaRaiz || ''} ${os?.causa || ''} ${os?.problema || ''} ${os?.diagnostico || ''} ${os?.laudo || ''}`);
  if ((source.includes('mau uso') || source.includes('uso indevido')) && !source.includes('sem mau uso') && !source.includes('nao houve mau uso') && !source.includes('não houve mau uso')) return 'mau_uso';
  if (source.includes('infra') || source.includes('rede') || source.includes('energia') || source.includes('cliente')) return 'infra_cliente';
  if (source.includes('atualiza') || source.includes('versao') || source.includes('intervencao anterior') || source.includes('erro anterior')) return 'erro_interno_software';
  if (source.includes('bug') || source.includes('produto') || source.includes('firmware')) return 'bug_produto';
  if (source.includes('improdut') || source.includes('sem acesso') || source.includes('cliente ausente')) return 'visita_improdutiva';
  if (source.includes('teste') || source.includes('substitui') || source.includes('ajuste')) return 'falha_tecnica_identificada';
  return 'inconclusiva';
}

function classifyOutcomeType(os) {
  const source = text(`${os?.resultado || ''} ${os?.status || ''} ${os?.laudo || ''} ${os?.proximaAcao || ''}`);
  if (source.includes('resol') || source.includes('normalizado') || source.includes('conclu')) return 'resolvido';
  if (source.includes('pend')) return 'pendente';
  if (source.includes('improdut')) return 'improdutivo';
  if (source.includes('escal')) return 'escalonado';
  return 'em_validacao';
}

function classifyTipoLaudo(os) {
  const serviceType = classifyServiceType(os);
  const cause = classifyProbableCause(os);
  if (cause === 'visita_improdutiva') return 'laudo_improdutivo';
  return `laudo_${serviceType}`;
}

module.exports = {
  classifyServiceType,
  classifyWarrantyType,
  classifyProbableCause,
  classifyOutcomeType,
  classifyTipoLaudo
};
