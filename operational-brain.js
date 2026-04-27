'use strict';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toText(value) {
  return String(value == null ? '' : value).trim();
}

function yesNo(value) {
  const normalized = toText(value).toLowerCase();
  return normalized === 'sim' || normalized === 'yes' || normalized === 'true' || normalized === '1';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function detectLocale(localeRaw) {
  const locale = String(localeRaw || '').toLowerCase();
  return locale.startsWith('en') ? 'en-US' : 'pt-BR';
}

function getI18n(localeRaw) {
  const locale = detectLocale(localeRaw);
  if (locale === 'en-US') {
    return {
      level: {
        stable: 'stable',
        attention: 'attention',
        pressure: 'pressure',
        critical: 'critical'
      },
      severity: {
        low: 'low',
        medium: 'medium',
        high: 'high',
        critical: 'critical'
      },
      area: {
        operation: 'Operation',
        technical: 'Technical',
        administrative: 'Administrative',
        consolidation: 'Consolidation'
      },
      text: {
        activeDateMismatchTitle: 'Active date mismatch',
        activeDateMismatchDesc: 'The operation date does not match the selected active date.',
        activeDateMismatchAction: 'Align operation date with the active date to avoid historical inconsistencies.',
        criticalWithoutActionTitle: 'Critical client without action',
        criticalWithoutActionDesc: 'Critical clients were reported without registered action and deadline.',
        criticalWithoutActionAction: 'Register immediate action and due date for each critical client.',
        slaRangeTitle: 'SLA outside expected range',
        slaRangeDesc: 'SLA value should be between 0 and 100.',
        slaRangeAction: 'Correct SLA value and verify data source.',
        executionRangeTitle: 'Execution outside expected range',
        executionRangeDesc: 'Execution value should be between 0 and 100.',
        executionRangeAction: 'Review execution checklist and normalize the percentage.',
        statusConflictTitle: 'Operational status conflict',
        statusConflictDesc: 'Status is stable but escalation/client risk flags are active.',
        statusConflictAction: 'Review status classification or deactivate inconsistent flags.',
        riskThresholdTitle: ({ area, level }) => `${area} risk in ${level} level`,
        riskThresholdDescription: ({ area, value }) => `${area} reached ${value}/100 and requires immediate follow-up.`,
        riskThresholdAction: 'Assign an owner, define due date, and monitor the risk item in the next control cycle.',
        noBlockingIssue: 'No critical blocking issue identified.',
        executiveReading: ({ level, score, topRisk, alertCount }) =>
          `Daily executive reading: level ${level}, score ${score}/100, top risk in ${topRisk}, ${alertCount} active alert(s).`,
        suggestedDecision: {
          critical: 'Escalate immediately with owner, deadline, and executive checkpoint in 2 hours.',
          pressure: 'Activate recovery plan with daily control tower and strict owners.',
          attention: 'Run targeted correction plan and monitor until next update cycle.',
          stable: 'Maintain current operation and focus on preventive actions.'
        },
        nextAction: {
          critical: 'Open war-room now and update stakeholders with action log.',
          pressure: 'Reprioritize backlog and assign one accountable owner per blocker.',
          attention: 'Track corrective actions and re-evaluate score in the next cycle.',
          stable: 'Keep monitoring and preserve current performance baseline.'
        }
      }
    };
  }

  return {
    level: {
      stable: 'stable',
      attention: 'attention',
      pressure: 'pressure',
      critical: 'critical'
    },
    severity: {
      low: 'baixa',
      medium: 'media',
      high: 'alta',
      critical: 'critica'
    },
    area: {
      operation: 'Operacao',
      technical: 'Tecnica',
      administrative: 'Administrativa',
      consolidation: 'Consolidacao'
    },
      text: {
      activeDateMismatchTitle: 'Data ativa divergente',
      activeDateMismatchDesc: 'A data da operacao nao corresponde a data ativa selecionada.',
      activeDateMismatchAction: 'Alinhar a data da operacao com a data ativa para evitar inconsistencias historicas.',
      criticalWithoutActionTitle: 'Cliente critico sem acao',
      criticalWithoutActionDesc: 'Existem clientes criticos informados sem acao e prazo registrados.',
      criticalWithoutActionAction: 'Registrar acao imediata e prazo para cada cliente critico.',
      slaRangeTitle: 'SLA fora da faixa esperada',
      slaRangeDesc: 'O valor de SLA deve estar entre 0 e 100.',
      slaRangeAction: 'Corrigir o valor de SLA e validar a origem da informacao.',
      executionRangeTitle: 'Execucao fora da faixa esperada',
      executionRangeDesc: 'O valor de execucao deve estar entre 0 e 100.',
      executionRangeAction: 'Revisar checklist de execucao e normalizar o percentual.',
      statusConflictTitle: 'Conflito de status operacional',
      statusConflictDesc: 'Status marcado como estavel, porem existem riscos de cliente/escalonamento ativos.',
        statusConflictAction: 'Revisar classificacao de status ou desativar flags inconsistentes.',
        riskThresholdTitle: ({ area, level }) => `Risco de ${area} em nivel ${level}`,
        riskThresholdDescription: ({ area, value }) => `${area} atingiu ${value}/100 e exige acompanhamento imediato.`,
        riskThresholdAction: 'Definir dono, prazo e monitorar este risco no proximo ciclo de controle.',
        noBlockingIssue: 'Nenhum bloqueio critico identificado neste momento.',
      executiveReading: ({ level, score, topRisk, alertCount }) =>
        `Leitura executiva do dia: nivel ${level}, score ${score}/100, maior risco em ${topRisk}, ${alertCount} alerta(s) ativo(s).`,
      suggestedDecision: {
        critical: 'Escalonar imediatamente com dono, prazo e checkpoint executivo em 2 horas.',
        pressure: 'Ativar plano de recuperacao com rito diario e donos definidos.',
        attention: 'Aplicar plano corretivo focado e monitorar no proximo ciclo.',
        stable: 'Manter rotina atual e reforcar acoes preventivas.'
      },
      nextAction: {
        critical: 'Abrir war-room agora e atualizar stakeholders com trilha de acoes.',
        pressure: 'Repriorizar backlog e definir um responsavel por bloqueio.',
        attention: 'Acompanhar correcoes e reavaliar score no proximo ciclo.',
        stable: 'Seguir monitoramento e preservar baseline de performance.'
      }
    }
  };
}

function collectSection(data, prefixes) {
  const payload = {};
  Object.keys(data || {}).forEach(key => {
    if (!prefixes.some(prefix => key.startsWith(prefix))) return;
    payload[key] = data[key];
  });
  return payload;
}

function buildMasterRecord(dateKey, data, extra) {
  const source = (data && typeof data === 'object') ? data : {};
  const fallbackInsights = extra?.insights || {};
  const quality = extra?.quality || {};

  const slaRaw = toText(source.op_sla || source.import_summary_sla);
  const executionRaw = toText(source.import_summary_execucao);
  const execution = executionRaw ? toNumber(executionRaw) : toNumber(source.op_execucao || 0);

  const clientsCritical = Math.max(
    toNumber(source.op_qtd_clientes_criticos),
    toNumber(source.op_criticos),
    toNumber(source.import_summary_criticos)
  );

  const openTickets = Math.max(toNumber(source.import_summary_tickets_pendentes), toNumber(source.tec_tickets_pendentes));
  const lateOrders = Math.max(toNumber(source.import_summary_pedidos_atraso), toNumber(source.op_pedidos_atraso));
  const adminPending = Math.max(toNumber(source.import_summary_pendencias_adm), toNumber(source.adm_qtd_pend));

  return {
    date: dateKey,
    operationDate: toText(source.op_data || ''),
    sections: {
      operation: collectSection(source, ['op_']),
      agenda: collectSection(source, ['ag_']),
      technical: collectSection(source, ['tec_', 'tec-']),
      administrative: collectSection(source, ['adm_', 'adm-']),
      diagnostic: collectSection(source, ['diag_']),
      result: collectSection(source, ['res_']),
      executive: collectSection(source, ['exe_']),
      business: collectSection(source, ['neg_']),
      improvements: collectSection(source, ['melh_']),
      import: collectSection(source, ['import_'])
    },
    metrics: {
      sla: slaRaw ? toNumber(slaRaw) : toNumber(fallbackInsights?.kpis?.sla),
      execution: execution || toNumber(fallbackInsights?.kpis?.execucao),
      criticalClients: clientsCritical,
      criticalCases: Math.max(toNumber(source.op_criticos), toNumber(fallbackInsights?.kpis?.criticos)),
      recurrences: Math.max(toNumber(source.op_reinc), toNumber(fallbackInsights?.kpis?.reincidencias)),
      openTickets,
      lateOrders,
      adminPending,
      escalationRiskFlag: yesNo(source.op_risco_escalonamento),
      clientRiskFlag: yesNo(source.op_risco_cliente) || yesNo(source.tec_risco_cliente) || yesNo(source.adm_risco_cliente),
      delayRiskFlag: yesNo(source.op_risco_atraso),
      qualityIssueCount: toNumber(quality.issueCount),
      osBillingRisk: Math.max(toNumber(source.import_os_alert_faturamento), toNumber(fallbackInsights?.osAudit?.faturamento)),
      osCodeRisk: Math.max(toNumber(source.import_os_alert_codigo), toNumber(fallbackInsights?.osAudit?.codigo)),
      osReportRisk: Math.max(toNumber(source.import_os_alert_laudo), toNumber(fallbackInsights?.osAudit?.laudo)),
      osContractRisk: Math.max(toNumber(source.import_os_alert_contrato), toNumber(fallbackInsights?.osAudit?.contrato))
    }
  };
}

function buildIntegrity(master, localeRaw) {
  const i18n = getI18n(localeRaw);
  const issues = [];
  const m = master.metrics;

  if (master.operationDate && master.operationDate !== master.date) {
    issues.push({
      code: 'ACTIVE_DATE_MISMATCH',
      severity: i18n.severity.high,
      area: i18n.area.consolidation,
      title: i18n.text.activeDateMismatchTitle,
      description: i18n.text.activeDateMismatchDesc,
      suggestedAction: i18n.text.activeDateMismatchAction
    });
  }

  if (m.criticalClients > 0) {
    let missingAction = 0;
    for (let i = 1; i <= 5; i++) {
      const name = toText(master.sections.operation[`op-cli${i}_cliente`]);
      const action = toText(master.sections.operation[`op-cli${i}_acao`]);
      const due = toText(master.sections.operation[`op-cli${i}_prazo`]);
      if ((name || i <= m.criticalClients) && (!action || !due)) missingAction += 1;
    }
    if (missingAction > 0) {
      issues.push({
        code: 'CRITICAL_CLIENT_WITHOUT_ACTION',
        severity: i18n.severity.critical,
        area: i18n.area.operation,
        title: i18n.text.criticalWithoutActionTitle,
        description: i18n.text.criticalWithoutActionDesc,
        suggestedAction: i18n.text.criticalWithoutActionAction
      });
    }
  }

  if (m.sla < 0 || m.sla > 100) {
    issues.push({
      code: 'SLA_OUT_OF_RANGE',
      severity: i18n.severity.high,
      area: i18n.area.operation,
      title: i18n.text.slaRangeTitle,
      description: i18n.text.slaRangeDesc,
      suggestedAction: i18n.text.slaRangeAction
    });
  }

  if (m.execution < 0 || m.execution > 100) {
    issues.push({
      code: 'EXECUTION_OUT_OF_RANGE',
      severity: i18n.severity.high,
      area: i18n.area.operation,
      title: i18n.text.executionRangeTitle,
      description: i18n.text.executionRangeDesc,
      suggestedAction: i18n.text.executionRangeAction
    });
  }

  const status = toText(master.sections.operation.op_status).toLowerCase();
  if ((status === 'estavel' || status === 'stable') && (m.escalationRiskFlag || m.clientRiskFlag)) {
    issues.push({
      code: 'STATUS_CONFLICT',
      severity: i18n.severity.medium,
      area: i18n.area.consolidation,
      title: i18n.text.statusConflictTitle,
      description: i18n.text.statusConflictDesc,
      suggestedAction: i18n.text.statusConflictAction
    });
  }

  return {
    valid: issues.length === 0,
    issueCount: issues.length,
    issues
  };
}

function buildScore(master, integrity) {
  const m = master.metrics;
  let score = 100;
  score -= clamp(m.criticalCases * 8, 0, 24);
  score -= clamp(m.recurrences * 5, 0, 20);
  score -= clamp(m.openTickets * 4, 0, 20);
  score -= clamp(m.lateOrders * 5, 0, 20);
  score -= clamp(m.adminPending * 1.2, 0, 15);
  score -= clamp((100 - clamp(m.sla || 0, 0, 100)) * 0.3, 0, 22);
  score -= clamp((100 - clamp(m.execution || 0, 0, 100)) * 0.25, 0, 20);
  score -= clamp(integrity.issueCount * 6, 0, 30);
  score -= clamp(m.qualityIssueCount * 2, 0, 20);

  const normalized = clamp(Math.round(score), 0, 100);
  let levelKey = 'stable';
  if (normalized < 40) levelKey = 'critical';
  else if (normalized < 60) levelKey = 'pressure';
  else if (normalized < 80) levelKey = 'attention';

  return {
    score: normalized,
    levelKey
  };
}

function buildRisks(master, integrity) {
  const m = master.metrics;
  const issuePenalty = clamp(integrity.issueCount * 6, 0, 30);
  const values = {
    operationalRisk: clamp((m.criticalCases * 9) + (m.recurrences * 6) + (m.openTickets * 5) + issuePenalty, 0, 100),
    clientRisk: clamp((m.clientRiskFlag ? 35 : 0) + (m.criticalClients * 10) + (m.criticalCases * 8), 0, 100),
    slaRisk: clamp((100 - clamp(m.sla || 0, 0, 100)) + (m.delayRiskFlag ? 18 : 0), 0, 100),
    financialRisk: clamp((m.osBillingRisk * 16) + (m.osCodeRisk * 9) + (m.osContractRisk * 11), 0, 100),
    escalationRisk: clamp((m.escalationRiskFlag ? 45 : 0) + (m.criticalCases * 8) + (m.lateOrders * 7), 0, 100),
    recurrenceRisk: clamp((m.recurrences * 17) + (m.openTickets * 5), 0, 100),
    administrativeRisk: clamp((m.adminPending * 6) + (m.osCodeRisk * 7), 0, 100),
    technicalRisk: clamp((m.openTickets * 7) + (m.osReportRisk * 10) + (m.recurrences * 8), 0, 100)
  };
  return values;
}

function topRiskEntry(risks) {
  const entries = Object.entries(risks || {});
  if (!entries.length) return { key: 'operationalRisk', value: 0 };
  const [key, value] = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return { key, value: Number(value) || 0 };
}

function riskAreaLabel(key, localeRaw) {
  const locale = detectLocale(localeRaw);
  const mapPt = {
    operationalRisk: 'Operacao',
    clientRisk: 'Cliente',
    slaRisk: 'SLA',
    financialRisk: 'Financeiro',
    escalationRisk: 'Escalonamento',
    recurrenceRisk: 'Reincidencia',
    administrativeRisk: 'Administrativo',
    technicalRisk: 'Tecnico'
  };
  const mapEn = {
    operationalRisk: 'Operation',
    clientRisk: 'Client',
    slaRisk: 'SLA',
    financialRisk: 'Financial',
    escalationRisk: 'Escalation',
    recurrenceRisk: 'Recurrence',
    administrativeRisk: 'Administrative',
    technicalRisk: 'Technical'
  };
  return (locale === 'en-US' ? mapEn : mapPt)[key] || key;
}

function buildAlerts(master, integrity, risks, localeRaw) {
  const i18n = getI18n(localeRaw);
  const alerts = [];

  integrity.issues.forEach(issue => {
    alerts.push({
      code: issue.code,
      severity: issue.severity,
      area: issue.area,
      title: issue.title,
      description: issue.description,
      suggestedAction: issue.suggestedAction
    });
  });

  Object.entries(risks || {}).forEach(([key, value]) => {
    if (Number(value) < 70) return;
    const areaLabel = riskAreaLabel(key, localeRaw);
    const levelLabel = Number(value) >= 85 ? i18n.severity.critical : i18n.severity.high;
    alerts.push({
      code: `RISK_${key.toUpperCase()}`,
      severity: levelLabel,
      area: areaLabel,
      title: i18n.text.riskThresholdTitle({ area: areaLabel, level: levelLabel }),
      description: i18n.text.riskThresholdDescription({ area: areaLabel, value: Number(value) || 0 }),
      suggestedAction: i18n.text.riskThresholdAction
    });
  });

  return alerts.slice(0, 20);
}

function buildExecutiveDecision(scorePayload, risks, alerts, localeRaw) {
  const i18n = getI18n(localeRaw);
  const topRisk = topRiskEntry(risks);
  const areaLabel = riskAreaLabel(topRisk.key, localeRaw);
  const level = i18n.level[scorePayload.levelKey] || scorePayload.levelKey;
  const topAlert = alerts[0];

  return {
    executiveReading: i18n.text.executiveReading({
      level,
      score: scorePayload.score,
      topRisk: areaLabel,
      alertCount: alerts.length
    }),
    topPriority: topAlert?.title || areaLabel,
    recommendedAction: topAlert?.suggestedAction || i18n.text.noBlockingIssue,
    suggestedDecision: i18n.text.suggestedDecision[scorePayload.levelKey] || i18n.text.suggestedDecision.stable,
    nextExecutiveAction: i18n.text.nextAction[scorePayload.levelKey] || i18n.text.nextAction.stable
  };
}

function buildOperationalBrain(params) {
  const payload = params || {};
  const locale = detectLocale(payload.locale);
  const master = buildMasterRecord(payload.dateKey, payload.data || {}, {
    insights: payload.insights,
    quality: payload.quality
  });
  const integrity = buildIntegrity(master, locale);
  const score = buildScore(master, integrity);
  const risks = buildRisks(master, integrity);
  const alerts = buildAlerts(master, integrity, risks, locale);
  const executive = buildExecutiveDecision(score, risks, alerts, locale);

  return {
    locale,
    generatedAt: new Date().toISOString(),
    masterRecord: master,
    integrity: {
      valid: integrity.valid,
      issueCount: integrity.issueCount,
      issues: integrity.issues
    },
    scoreOperational: {
      value: score.score,
      level: getI18n(locale).level[score.levelKey] || score.levelKey
    },
    risks,
    alerts,
    executiveDecision: executive
  };
}

module.exports = {
  buildOperationalBrain,
  detectLocale
};
