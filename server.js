const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { buildOperationalBrain, detectLocale } = require('./operational-brain');
const { buildAnalyticsTaxonomy } = require('./analytics-taxonomy');
const {
  HISTORICAL_ANALYTICS_SCHEMA,
  HISTORICAL_ANALYTICS_VERSION,
  DEFAULT_CLIENT_INACTIVITY_THRESHOLDS,
  sanitizeHistoricalNormalization,
  normalizeHistoricalFilters,
  resolveDefaultHistoricalWorkbookPath,
  importHistoricalWorkbook,
  buildHistoricalComparativesView,
  buildHistoricalIntelligenceView,
  buildPanelModularBlueprint,
  buildEmptyHistoricalStore
} = require('./historical-intelligence');
const {
  LAUDO_STANDARDS_VERSION,
  buildLaudoStandardsPayload
} = require('./laudo-standards');

let sqlLib = null;
try {
  sqlLib = require('mssql');
} catch (_) {
  sqlLib = null;
}

let xlsxLib = null;
try {
  xlsxLib = require('xlsx');
} catch (_) {
  xlsxLib = null;
}

let pdfParseLib = null;
try {
  const pdfModule = require('pdf-parse');
  pdfParseLib = pdfModule?.PDFParse || null;
} catch (_) {
  pdfParseLib = null;
}

let nodemailerLib = null;
try {
  nodemailerLib = require('nodemailer');
} catch (_) {
  nodemailerLib = null;
}

function loadEnvFileIntoProcess(filePath) {
  if (!fs.existsSync(filePath)) return;
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (_) {
    return;
  }
  const text = String(raw || '').replace(/^\uFEFF/, '');
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = String(lineRaw || '').trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadProjectEnvFiles(rootDir) {
  loadEnvFileIntoProcess(path.join(rootDir, '.env'));
  loadEnvFileIntoProcess(path.join(rootDir, '.env.local'));
}

function envFlag(name, fallback) {
  const raw = String(process.env[name] || fallback || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'sim'].includes(raw);
}

const ROOT = __dirname;
loadProjectEnvFiles(ROOT);

const app = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.PAINEL_HOST || '0.0.0.0';
const OFFICIAL_ROOT = 'C:\\Painel_Operacional_Corrigido';
const APP_ENV = String(process.env.NODE_ENV || 'development').trim().toLowerCase() || 'development';
const REQUESTED_ENFORCE_OFFICIAL_ROOT = !['0', 'false', 'nao', 'no'].includes(
  String(process.env.PAINEL_ENFORCE_OFFICIAL_ROOT || '1').trim().toLowerCase()
);
const ROOT_BYPASS_ALLOWED = envFlag('PAINEL_ALLOW_ROOT_BYPASS', '0') && APP_ENV !== 'production';
const ENFORCE_OFFICIAL_ROOT = REQUESTED_ENFORCE_OFFICIAL_ROOT || !ROOT_BYPASS_ALLOWED;
const ALLOW_LEGACY_SQL_CREDENTIAL_FILE = envFlag('PAINEL_ALLOW_LEGACY_SQL_CREDENTIAL_FILE', '0');
const ALLOW_INSECURE_BOOTSTRAP_DEFAULTS = envFlag('PAINEL_ALLOW_INSECURE_BOOTSTRAP_DEFAULTS', '0');
let APP_VERSION = '0.0.0';
try {
  APP_VERSION = String(require('./package.json')?.version || '0.0.0');
} catch (_) {
  APP_VERSION = '0.0.0';
}

function normalizeComparablePath(value) {
  return path.resolve(String(value || '')).replace(/[\\/]+/g, '\\').toLowerCase();
}

const ROOT_NORMALIZED = normalizeComparablePath(ROOT);
const OFFICIAL_ROOT_NORMALIZED = normalizeComparablePath(OFFICIAL_ROOT);
const DATA_DIR = path.join(ROOT, 'data');
const ANALYTICS_DIR = path.join(DATA_DIR, 'analytics');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const DATA_FILE = path.join(DATA_DIR, 'records.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');
const ORG_CONFIG_FILE = path.join(DATA_DIR, 'organization-config.json');
const HISTORICAL_ANALYTICS_FILE = path.join(ANALYTICS_DIR, 'historical-service-analytics.json');
const HISTORICAL_ANALYTICS_AUDIT_DIR = path.join(ANALYTICS_DIR, 'history');
const HISTORICAL_ANALYTICS_INTEGRITY_AUDIT_FILE = path.join(HISTORICAL_ANALYTICS_AUDIT_DIR, 'historical-integrity-audit.json');
const BACKUP_FILE = path.join(BACKUP_DIR, 'latest-records-backup.json');
const SMTP_CONFIG_FILE = path.join(DATA_DIR, 'smtp-config.json');
const LOGIN_ATTEMPT_FILE = path.join(DATA_DIR, 'login-attempts.json');
const SQL_CREDENTIAL_FILE = path.join(DATA_DIR, 'credencial_sql_dmpacesso.txt');
const STORAGE_REQUESTED_MODE = String(process.env.PAINEL_STORAGE || 'auto').toLowerCase();
const DATA_SCHEMA_VERSION = 2;
const STARTED_AT = new Date().toISOString();
const SESSION_TTL_MS = 60 * 60 * 1000;
const SESSION_HEADER = 'x-auth-token';
const SESSION_ACTIVITY_HEADER = 'x-user-active-at';
const SESSION_ACTIVITY_MAX_AGE_MS = 2 * 60 * 1000;
const DEFAULT_ADMIN_USER = 'admin_campinas';
const DEFAULT_ADMIN_PASSWORD = String(process.env.PAINEL_BOOTSTRAP_ADMIN_PASSWORD || '').trim();
const DEFAULT_TECH_LEAD_USER = 'lider_tecnico';
const DEFAULT_TECH_LEAD_PASSWORD = String(process.env.PAINEL_BOOTSTRAP_TECH_PASSWORD || '').trim();
const INSECURE_FALLBACK_ADMIN_PASSWORD = 'admin_change_me_2026';
const INSECURE_FALLBACK_TECH_PASSWORD = 'tech_change_me_2026';
const VALID_ROLES = new Set(['admin', 'lider_tecnico', 'lider_administrativo']);
const PANEL_SECTIONS = [
  'painel',
  'operacao',
  'agenda',
  'tecnico',
  'administrativo',
  'diagnostico',
  'resultado',
  'executivo',
  'negocio',
  'melhorias',
  'historico'
];
const ROLE_DEFAULT_MENU_PERMISSIONS = {
  admin: PANEL_SECTIONS.slice(),
  lider_tecnico: ['painel', 'agenda', 'tecnico'],
  lider_administrativo: ['painel', 'agenda', 'administrativo']
};
const PASSWORD_RESET_FILE = path.join(DATA_DIR, 'password-reset-requests.json');
const PASSWORD_RESET_OUTBOX_FILE = path.join(DATA_DIR, 'password-reset-outbox.json');
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const PASSWORD_MIN_LENGTH = Number(process.env.PAINEL_PASSWORD_MIN_LENGTH || 10);
const LOGIN_ATTEMPT_WINDOW_MS = Number(process.env.PAINEL_LOGIN_WINDOW_MS || (15 * 60 * 1000));
const LOGIN_MAX_ATTEMPTS = Number(process.env.PAINEL_LOGIN_MAX_ATTEMPTS || 5);
const LOGIN_LOCK_MS = Number(process.env.PAINEL_LOGIN_LOCK_MS || (15 * 60 * 1000));
const FORGOT_COOLDOWN_MS = Number(process.env.PAINEL_FORGOT_COOLDOWN_MS || 45 * 1000);
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const JSON_AUDIT_MAX_ITEMS = 5000;
const IMPORT_DIR = path.join(DATA_DIR, 'import', 'campinas');
const IMPORT_STATE_FILE = path.join(DATA_DIR, 'import-state.json');
const IMPORT_SUPPORTED_EXT = new Set(['.xlsx', '.xls', '.csv', '.pdf']);
const IMPORT_POLL_INTERVAL_MS = Math.max(60000, Number(process.env.PAINEL_IMPORT_POLL_MS || 60000));
const PRICING_DIR = path.join(DATA_DIR, 'pricing');
const PRICING_CONFIG_FILE = path.join(DATA_DIR, 'pricing-config.json');
const PRICING_CATALOG_FILE = path.join(DATA_DIR, 'pricing-catalog.json');
const PRICING_PRIMARY_WORKBOOK_NAME = 'TABELA_DE_PRECO_CLIENTE_FINAL.xlsx';
const PRICING_RECONCILIATION_VERSION = 10;
const PRICING_REVIEW_QUEUE_FILE = path.join(DATA_DIR, 'pricing-review-queue.json');
const PRICING_REVIEW_MAX_ITEMS = 8000;
const PRICING_REVIEW_ALLOWED_STATUSES = new Set([
  'pendente',
  'em_analise',
  'confirmado_peca',
  'nao_peca',
  'resolvido_auto'
]);
const REVIEW_WORKFLOW_FILE = path.join(DATA_DIR, 'review-queue-workflow.json');
const REVIEW_WORKFLOW_SCHEMA_VERSION = 1;
const REVIEW_WORKFLOW_MAX_ITEMS = 12000;
const REVIEW_WORKFLOW_MAX_HISTORY = 120;
const REVIEW_WORKFLOW_ALLOWED_STATUSES = new Set([
  'novo',
  'em_revisao',
  'ajustado',
  'validado',
  'encerrado',
  'descartado'
]);
const REVIEW_WORKFLOW_OPEN_STATUSES = new Set([
  'novo',
  'em_revisao',
  'ajustado',
  'validado'
]);
const REVIEW_WORKFLOW_ALLOWED_DECISION_TYPES = new Set([
  'aceite',
  'ajuste',
  'revisao',
  'encerramento',
  'descarte'
]);
const REVIEW_WORKFLOW_ALLOWED_DECISION_RESULTS = new Set([
  'aprovado',
  'solicitar_ajuste',
  'nao_procede',
  'encerrado_com_acao',
  'encerrado_sem_acao'
]);
const HISTORICAL_INTEGRITY_STRICT = !['0', 'false', 'nao', 'no'].includes(
  String(process.env.PAINEL_HISTORICAL_STRICT_INTEGRITY || '1').trim().toLowerCase()
);
const HISTORICAL_INTEGRITY_ALLOW_LOSS = envFlag('PAINEL_ALLOW_HISTORICAL_INTEGRITY_LOSS', '0');
const HISTORICAL_INTEGRITY_AUDIT_MAX_ITEMS = Math.max(20, Number(process.env.PAINEL_HISTORICAL_INTEGRITY_AUDIT_MAX || 200));
const TECH_TICKETS_FILE = path.join(DATA_DIR, 'campinas-tech-tickets.json');
const TECH_LINKS_FILE = path.join(DATA_DIR, 'campinas-tech-links.json');
const EXPORT_DIR = path.join(DATA_DIR, 'export');
const EXECUTIVE_MONTHLY_EXPORT_DIR = path.join(EXPORT_DIR, 'executivo_mensal');
const EXECUTIVE_MONTHLY_JOB_STATUS_FILE = path.join(EXECUTIVE_MONTHLY_EXPORT_DIR, 'job-status.json');
const EXECUTIVE_QUARTERLY_EXPORT_DIR = path.join(EXPORT_DIR, 'executivo_trimestral');
const EXECUTIVE_QUARTERLY_JOB_STATUS_FILE = path.join(EXECUTIVE_QUARTERLY_EXPORT_DIR, 'job-status.json');
const UNIFIED_REPORT_CSV_FILE = path.join(EXPORT_DIR, 'relatorio_unificado_todas_abas.csv');
const UNIFIED_REPORT_JSON_FILE = path.join(EXPORT_DIR, 'relatorio_unificado_todas_abas.json');
const DEFAULT_LOOKER_URL = 'https://lookerstudio.google.com/u/0/reporting/ae9776d6-6257-43f0-a2a8-3661eb392f33/page/JySjD';
const DEFAULT_PORTAL_CLIENTE_URL = 'https://portal-do-cliente-c7ec1b8e.base44.app/teves';
const DEFAULT_POWER_BI_URL = 'https://app.powerbi.com/groups/me/reports/c6f1f21b-6ce3-4489-87d6-2e80f06938e2/ReportSectiondafaea5d868ed5733b2e?experience=power-bi';
const DEFAULT_ORG_CONFIG = Object.freeze({
  companyName: 'Tagus-Tec',
  tenantKey: 'tagus_tec',
  unitName: 'Campinas',
  unitKey: 'campinas',
  timezone: 'America/Sao_Paulo',
  localeDefault: 'pt-BR',
  updatedAt: ''
});
const SERVER_LOG_FILE = path.join(LOG_DIR, 'server.log');
const ACCESS_LOG_FILE = path.join(LOG_DIR, 'access.log');
const LOG_MAX_BYTES = Number(process.env.PAINEL_LOG_MAX_BYTES || (2 * 1024 * 1024));
const LOG_MAX_FILES = Number(process.env.PAINEL_LOG_MAX_FILES || 12);
const BACKUP_SNAPSHOT_INTERVAL_MS = Number(process.env.PAINEL_BACKUP_INTERVAL_MS || (10 * 60 * 1000));
const BACKUP_RETENTION_DAYS = Number(process.env.PAINEL_BACKUP_RETENTION_DAYS || 14);
const BACKUP_MAX_SNAPSHOTS = Number(process.env.PAINEL_BACKUP_MAX_FILES || 300);
const TECH_TICKET_AUDIT_MAX_ITEMS = 150;
const EXEC_MONTHLY_JOB_ENABLED = !['0', 'false', 'nao', 'no'].includes(normalizeKey(process.env.PAINEL_EXEC_MONTHLY_JOB_ENABLED || '1'));
const EXEC_MONTHLY_JOB_INTERVAL_MS = Math.max(5 * 60 * 1000, Number(process.env.PAINEL_EXEC_MONTHLY_JOB_INTERVAL_MS || (30 * 60 * 1000)));
const EXEC_MONTHLY_JOB_MODE = ['close_window', 'rolling'].includes(normalizeKey(process.env.PAINEL_EXEC_MONTHLY_JOB_MODE || 'close_window'))
  ? normalizeKey(process.env.PAINEL_EXEC_MONTHLY_JOB_MODE || 'close_window')
  : 'close_window';
const EXEC_MONTHLY_JOB_WINDOW_DAY = Math.max(1, Math.min(28, Number(process.env.PAINEL_EXEC_MONTHLY_JOB_WINDOW_DAY || 1)));
const EXEC_MONTHLY_JOB_WINDOW_HOUR = Math.max(0, Math.min(23, Number(process.env.PAINEL_EXEC_MONTHLY_JOB_WINDOW_HOUR || 6)));
const EXEC_MONTHLY_JOB_WINDOW_MINUTE = Math.max(0, Math.min(59, Number(process.env.PAINEL_EXEC_MONTHLY_JOB_WINDOW_MINUTE || 10)));
const EXEC_MONTHLY_JOB_LOOKBACK_MONTHS = Math.max(1, Math.min(12, Number(process.env.PAINEL_EXEC_MONTHLY_JOB_LOOKBACK_MONTHS || 3)));
const EXEC_MONTHLY_JOB_MAX_MONTHS_PER_RUN = Math.max(1, Math.min(6, Number(process.env.PAINEL_EXEC_MONTHLY_JOB_MAX_MONTHS_PER_RUN || 3)));
const EXEC_MONTHLY_JOB_RECHECK_MS = Math.max(5 * 60 * 1000, Number(process.env.PAINEL_EXEC_MONTHLY_JOB_RECHECK_MS || (60 * 60 * 1000)));
const EXEC_MONTHLY_JOB_HISTORY_LIMIT = 120;
const EXEC_QUARTERLY_JOB_ENABLED = !['0', 'false', 'nao', 'no'].includes(normalizeKey(process.env.PAINEL_EXEC_QUARTERLY_JOB_ENABLED || '1'));
const EXEC_QUARTERLY_JOB_INTERVAL_MS = Math.max(15 * 60 * 1000, Number(process.env.PAINEL_EXEC_QUARTERLY_JOB_INTERVAL_MS || (3 * 60 * 60 * 1000)));
const EXEC_QUARTERLY_JOB_MODE = ['close_window', 'rolling'].includes(normalizeKey(process.env.PAINEL_EXEC_QUARTERLY_JOB_MODE || 'close_window'))
  ? normalizeKey(process.env.PAINEL_EXEC_QUARTERLY_JOB_MODE || 'close_window')
  : 'close_window';
const EXEC_QUARTERLY_JOB_WINDOW_DAY = Math.max(1, Math.min(28, Number(process.env.PAINEL_EXEC_QUARTERLY_JOB_WINDOW_DAY || 2)));
const EXEC_QUARTERLY_JOB_WINDOW_HOUR = Math.max(0, Math.min(23, Number(process.env.PAINEL_EXEC_QUARTERLY_JOB_WINDOW_HOUR || 7)));
const EXEC_QUARTERLY_JOB_WINDOW_MINUTE = Math.max(0, Math.min(59, Number(process.env.PAINEL_EXEC_QUARTERLY_JOB_WINDOW_MINUTE || 0)));
const EXEC_QUARTERLY_JOB_LOOKBACK_QUARTERS = Math.max(1, Math.min(12, Number(process.env.PAINEL_EXEC_QUARTERLY_JOB_LOOKBACK_QUARTERS || 4)));
const EXEC_QUARTERLY_JOB_MAX_QUARTERS_PER_RUN = Math.max(1, Math.min(8, Number(process.env.PAINEL_EXEC_QUARTERLY_JOB_MAX_QUARTERS_PER_RUN || 4)));
const EXEC_QUARTERLY_JOB_RECHECK_MS = Math.max(30 * 60 * 1000, Number(process.env.PAINEL_EXEC_QUARTERLY_JOB_RECHECK_MS || (6 * 60 * 60 * 1000)));
const EXEC_QUARTERLY_JOB_HISTORY_LIMIT = 120;

const streamClients = new Set();
const sessions = new Map();
const forgotRequestCooldownMap = new Map();
const maintenanceTimers = [];
const bootStatus = {
  requestedStorageMode: STORAGE_REQUESTED_MODE,
  activeStorageMode: 'json',
  sqlEnabled: false,
  sqlError: null,
  officialRoot: OFFICIAL_ROOT,
  officialRootRequestedEnforce: REQUESTED_ENFORCE_OFFICIAL_ROOT,
  rootBypassAllowed: ROOT_BYPASS_ALLOWED,
  officialRootEnforced: ENFORCE_OFFICIAL_ROOT,
  officialRootMatch: ROOT_NORMALIZED === OFFICIAL_ROOT_NORMALIZED,
  allowLegacySqlCredentialFile: ALLOW_LEGACY_SQL_CREDENTIAL_FILE,
  allowInsecureBootstrapDefaults: ALLOW_INSECURE_BOOTSTRAP_DEFAULTS
};

let storage = null;
let sqlPoolPromise = null;
let legacySqlCredentialWarningIssued = false;
let importWatchHandle = null;
let importScanTimer = 0;
let importScanRunning = false;
let importPollHandle = 0;
let serverHandle = null;
let lastBackupFingerprint = '';
let shutdownInProgress = false;
let executiveMonthlyJobRunning = false;
let executiveQuarterlyJobRunning = false;
let historicalAnalyticsCache = null;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(ROOT));
app.use((req, res, next) => {
  const startedAt = Date.now();
  const method = String(req.method || '').toUpperCase();
  const pathName = req.originalUrl || req.url || '';
  const shouldLog = pathName.startsWith('/api/');
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  res.on('finish', () => {
    if (!shouldLog) return;
    const elapsed = Date.now() - startedAt;
    writeAccessLog({
      method,
      path: pathName,
      status: res.statusCode,
      ms: elapsed,
      ip,
      actor: req.authUser?.username || ''
    });
  });
  next();
});

function ensureDirectories() {
[DATA_DIR, ANALYTICS_DIR, HISTORICAL_ANALYTICS_AUDIT_DIR, BACKUP_DIR, IMPORT_DIR, LOG_DIR, EXPORT_DIR, EXECUTIVE_MONTHLY_EXPORT_DIR, EXECUTIVE_QUARTERLY_EXPORT_DIR, PRICING_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  if (!fs.existsSync(DATA_FILE)) writeJsonFileAtomic(DATA_FILE, {});
  if (!fs.existsSync(AUDIT_FILE)) writeJsonFileAtomic(AUDIT_FILE, []);
  if (!fs.existsSync(LOGIN_ATTEMPT_FILE)) writeJsonFileAtomic(LOGIN_ATTEMPT_FILE, []);
  if (!fs.existsSync(PASSWORD_RESET_FILE)) writeJsonFileAtomic(PASSWORD_RESET_FILE, []);
  if (!fs.existsSync(PASSWORD_RESET_OUTBOX_FILE)) writeJsonFileAtomic(PASSWORD_RESET_OUTBOX_FILE, []);
  if (!fs.existsSync(SMTP_CONFIG_FILE)) {
    writeJsonFileAtomic(SMTP_CONFIG_FILE, {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: '',
      updatedAt: ''
    });
  }
  if (!fs.existsSync(PRICING_CONFIG_FILE)) {
    writeJsonFileAtomic(PRICING_CONFIG_FILE, {
      lookerUrl: DEFAULT_LOOKER_URL,
      portalClienteUrl: DEFAULT_PORTAL_CLIENTE_URL,
      powerBiUrl: DEFAULT_POWER_BI_URL,
      catalogWorkbookPath: path.join(PRICING_DIR, PRICING_PRIMARY_WORKBOOK_NAME),
      catalogAutoSync: true,
      updatedAt: '',
      campinas: {
        deslocamento: 0,
        primeiraHora: 0,
        adicional30min: 0
      }
    });
  }
  if (!fs.existsSync(PRICING_CATALOG_FILE)) {
    writeJsonFileAtomic(PRICING_CATALOG_FILE, {
      updatedAt: '',
      sourceFile: '',
      items: []
    });
  }
  if (!fs.existsSync(PRICING_REVIEW_QUEUE_FILE)) {
    writeJsonFileAtomic(PRICING_REVIEW_QUEUE_FILE, {
      schemaVersion: 1,
      updatedAt: '',
      items: []
    });
  }
  if (!fs.existsSync(REVIEW_WORKFLOW_FILE)) {
    writeJsonFileAtomic(REVIEW_WORKFLOW_FILE, {
      schemaVersion: REVIEW_WORKFLOW_SCHEMA_VERSION,
      updatedAt: '',
      items: []
    });
  }
  if (!fs.existsSync(TECH_TICKETS_FILE)) {
    writeJsonFileAtomic(TECH_TICKETS_FILE, {
      schemaVersion: 1,
      updatedAt: '',
      items: []
    });
  }
  if (!fs.existsSync(TECH_LINKS_FILE)) {
    writeJsonFileAtomic(TECH_LINKS_FILE, buildDefaultTechLinks());
  }
  if (!fs.existsSync(EXECUTIVE_MONTHLY_JOB_STATUS_FILE)) {
    writeJsonFileAtomic(EXECUTIVE_MONTHLY_JOB_STATUS_FILE, {
      schema: 'executive_monthly_job_status_v1',
      config: {
        enabled: EXEC_MONTHLY_JOB_ENABLED,
        intervalMs: EXEC_MONTHLY_JOB_INTERVAL_MS,
        mode: EXEC_MONTHLY_JOB_MODE,
        windowDay: EXEC_MONTHLY_JOB_WINDOW_DAY,
        windowHour: EXEC_MONTHLY_JOB_WINDOW_HOUR,
        windowMinute: EXEC_MONTHLY_JOB_WINDOW_MINUTE,
        lookbackMonths: EXEC_MONTHLY_JOB_LOOKBACK_MONTHS,
        maxMonthsPerRun: EXEC_MONTHLY_JOB_MAX_MONTHS_PER_RUN,
        recheckMs: EXEC_MONTHLY_JOB_RECHECK_MS
      },
      running: false,
      lastRunAt: '',
      lastSuccessAt: '',
      lastErrorAt: '',
      lastOutcome: 'idle',
      lastMessage: '',
      counters: {
        runs: 0,
        processedMonths: 0,
        cacheHit: 0,
        cacheMiss: 0,
        errors: 0
      },
      byScopeMonth: {},
      recentRuns: []
    });
  }
  if (!fs.existsSync(EXECUTIVE_QUARTERLY_JOB_STATUS_FILE)) {
    writeJsonFileAtomic(EXECUTIVE_QUARTERLY_JOB_STATUS_FILE, {
      schema: 'executive_quarterly_job_status_v1',
      config: {
        enabled: EXEC_QUARTERLY_JOB_ENABLED,
        intervalMs: EXEC_QUARTERLY_JOB_INTERVAL_MS,
        mode: EXEC_QUARTERLY_JOB_MODE,
        windowDay: EXEC_QUARTERLY_JOB_WINDOW_DAY,
        windowHour: EXEC_QUARTERLY_JOB_WINDOW_HOUR,
        windowMinute: EXEC_QUARTERLY_JOB_WINDOW_MINUTE,
        lookbackQuarters: EXEC_QUARTERLY_JOB_LOOKBACK_QUARTERS,
        maxQuartersPerRun: EXEC_QUARTERLY_JOB_MAX_QUARTERS_PER_RUN,
        recheckMs: EXEC_QUARTERLY_JOB_RECHECK_MS
      },
      running: false,
      lastRunAt: '',
      lastSuccessAt: '',
      lastErrorAt: '',
      lastOutcome: 'idle',
      lastMessage: '',
      counters: {
        runs: 0,
        processedQuarters: 0,
        cacheHit: 0,
        cacheMiss: 0,
        errors: 0
      },
      byScopeQuarter: {},
      recentRuns: []
    });
  }
  if (!fs.existsSync(ORG_CONFIG_FILE)) {
    writeJsonFileAtomic(ORG_CONFIG_FILE, {
      ...DEFAULT_ORG_CONFIG
    });
  }
  if (!fs.existsSync(HISTORICAL_ANALYTICS_FILE)) {
    writeJsonFileAtomic(HISTORICAL_ANALYTICS_FILE, buildEmptyHistoricalStore({
      locale: DEFAULT_ORG_CONFIG.localeDefault
    }));
  }
  if (!fs.existsSync(HISTORICAL_ANALYTICS_INTEGRITY_AUDIT_FILE)) {
    writeJsonFileAtomic(HISTORICAL_ANALYTICS_INTEGRITY_AUDIT_FILE, {
      schema: 'historical_integrity_audit_v1',
      updatedAt: '',
      strictMode: HISTORICAL_INTEGRITY_STRICT,
      allowLoss: HISTORICAL_INTEGRITY_ALLOW_LOSS,
      entries: []
    });
  }
}

function readJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw || 'null');
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function writeJsonFileAtomic(filePath, value) {
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(tempFile, filePath);
}

function normalizeHistoricalThresholds(rawLike) {
  const raw = (rawLike && typeof rawLike === 'object') ? rawLike : {};
  const activeMaxDays = Math.max(1, Math.min(365, Math.round(toNumber(raw.activeMaxDays || DEFAULT_CLIENT_INACTIVITY_THRESHOLDS.activeMaxDays))));
  const attentionMaxDays = Math.max(activeMaxDays + 1, Math.min(540, Math.round(toNumber(raw.attentionMaxDays || DEFAULT_CLIENT_INACTIVITY_THRESHOLDS.attentionMaxDays))));
  const alertMaxDays = Math.max(attentionMaxDays + 1, Math.min(720, Math.round(toNumber(raw.alertMaxDays || DEFAULT_CLIENT_INACTIVITY_THRESHOLDS.alertMaxDays))));
  return { activeMaxDays, attentionMaxDays, alertMaxDays };
}

function incrementBucketCounter(mapLike, keyLike, deltaLike) {
  const map = (mapLike && typeof mapLike === 'object') ? mapLike : {};
  const key = String(keyLike || '').trim();
  if (!key) return;
  const delta = Math.max(0, Number(deltaLike || 1));
  map[key] = Math.max(0, Number(map[key] || 0)) + delta;
}

function normalizeHistoricalBucketKey(valueLike, fallbackLike) {
  const raw = String(valueLike == null ? '' : valueLike).trim();
  if (!raw) return String(fallbackLike || 'nao_identificado');
  const key = normalizeKey(raw);
  return key || String(fallbackLike || 'nao_identificado');
}

function normalizeNovoRetornoBucket(valueLike) {
  const key = normalizeHistoricalBucketKey(valueLike, '');
  if (key.includes('retorno')) return 'retorno';
  if (key.includes('novo')) return 'novo';
  return 'nao_identificado';
}

function buildHistoricalIntegritySnapshot(rowsLike) {
  const rows = Array.isArray(rowsLike) ? rowsLike : [];
  const byYear = {};
  const byMonth = {};
  const byClient = {};
  const byCnpj = {};
  const byTechnician = {};
  const byNovoRetorno = {};
  const bySigla = {};
  const osSet = new Set();
  let withLaudoRows = 0;
  let missingDateRows = 0;
  let missingClientRows = 0;
  let missingCnpjRows = 0;
  let missingTechnicianRows = 0;

  rows.forEach((row, index) => {
    const dateKey = normalizeDateKey(row?.dateRef || row?.dateAtendimento || row?.dateEmissao || row?.dateN1);
    if (dateKey) {
      incrementBucketCounter(byYear, dateKey.slice(0, 4), 1);
      incrementBucketCounter(byMonth, dateKey.slice(0, 7), 1);
    } else {
      missingDateRows += 1;
    }

    const osId = String(row?.osId || '').trim();
    const osKey = osId ? normalizeString(osId).toUpperCase() : `__sem_os_${index + 1}`;
    osSet.add(osKey);

    const clientKey = normalizeHistoricalBucketKey(row?.clientKey || row?.clientName, 'nao_identificado');
    const cnpjKey = normalizeHistoricalBucketKey(row?.cnpjNormalized || row?.cnpjRaw || row?.cnpj, 'sem_cnpj');
    const technicianKey = normalizeHistoricalBucketKey(row?.technicianKey || row?.technicianName || row?.attendantName, 'nao_identificado');
    const novoRetornoBucket = normalizeNovoRetornoBucket(row?.novoRetorno);
    const siglaKey = normalizeHistoricalBucketKey(row?.sigla, 'nao_identificado');
    if (clientKey === 'nao_identificado') missingClientRows += 1;
    if (cnpjKey === 'sem_cnpj') missingCnpjRows += 1;
    if (technicianKey === 'nao_identificado') missingTechnicianRows += 1;

    incrementBucketCounter(byClient, clientKey, 1);
    incrementBucketCounter(byCnpj, cnpjKey, 1);
    incrementBucketCounter(byTechnician, technicianKey, 1);
    incrementBucketCounter(byNovoRetorno, novoRetornoBucket, 1);
    incrementBucketCounter(bySigla, siglaKey, 1);

    const hasLaudo = String(row?.laudoOk || '').trim()
      || String(row?.motivoLaudo || '').trim()
      || String(row?.laudo || '').trim()
      || String(row?.observacao || '').trim();
    if (hasLaudo) withLaudoRows += 1;
  });

  const snapshot = {
    generatedAt: nowIso(),
    totalRows: rows.length,
    totalOsUnique: osSet.size,
    withLaudoRows,
    byYear,
    byMonth,
    byClient,
    byCnpj,
    byTechnician,
    byNovoRetorno,
    bySigla,
    missing: {
      date: missingDateRows,
      client: missingClientRows,
      cnpj: missingCnpjRows,
      technician: missingTechnicianRows
    },
    coverage: {
      uniqueClients: Object.keys(byClient).length,
      uniqueCnpj: Object.keys(byCnpj).filter((key) => key !== 'sem_cnpj').length,
      uniqueTechnicians: Object.keys(byTechnician).length,
      uniqueSiglas: Object.keys(bySigla).length
    }
  };

  const signatureBase = {
    totalRows: snapshot.totalRows,
    totalOsUnique: snapshot.totalOsUnique,
    withLaudoRows: snapshot.withLaudoRows,
    byYear: snapshot.byYear,
    byMonth: snapshot.byMonth,
    byClient: snapshot.byClient,
    byCnpj: snapshot.byCnpj,
    byTechnician: snapshot.byTechnician,
    byNovoRetorno: snapshot.byNovoRetorno,
    bySigla: snapshot.bySigla,
    missing: snapshot.missing
  };
  snapshot.signature = crypto.createHash('sha256').update(JSON.stringify(signatureBase)).digest('hex');
  return snapshot;
}

function diffHistoricalIntegrityMap(beforeMapLike, afterMapLike, dimension) {
  const beforeMap = (beforeMapLike && typeof beforeMapLike === 'object') ? beforeMapLike : {};
  const afterMap = (afterMapLike && typeof afterMapLike === 'object') ? afterMapLike : {};
  const examples = [];
  let droppedItems = 0;
  let droppedTotal = 0;

  Object.keys(beforeMap).forEach((key) => {
    const before = Math.max(0, Number(beforeMap[key] || 0));
    const after = Math.max(0, Number(afterMap[key] || 0));
    if (after >= before) return;
    droppedItems += 1;
    const delta = before - after;
    droppedTotal += delta;
    if (examples.length < 12) {
      examples.push({ key, before, after, delta });
    }
  });

  if (droppedItems <= 0 || droppedTotal <= 0) return null;
  return {
    dimension,
    droppedItems,
    droppedTotal,
    examples
  };
}

function sumHistoricalCounterMap(mapLike) {
  const map = (mapLike && typeof mapLike === 'object') ? mapLike : {};
  return Object.values(map).reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0);
}

function buildAggregateIntegrityDiff(beforeMapLike, afterMapLike, dimension) {
  const beforeMap = (beforeMapLike && typeof beforeMapLike === 'object') ? beforeMapLike : {};
  const afterMap = (afterMapLike && typeof afterMapLike === 'object') ? afterMapLike : {};
  const beforeTotal = sumHistoricalCounterMap(beforeMap);
  const afterTotal = sumHistoricalCounterMap(afterMap);
  const beforeUnique = Object.keys(beforeMap).length;
  const afterUnique = Object.keys(afterMap).length;
  const uniqueDrop = Math.max(0, beforeUnique - afterUnique);
  const totalDrop = Math.max(0, beforeTotal - afterTotal);
  if (totalDrop <= 0 && uniqueDrop <= 0) return null;
  return {
    dimension,
    beforeTotal,
    afterTotal,
    totalDrop,
    beforeUnique,
    afterUnique,
    uniqueDrop
  };
}

function buildHistoricalIntegrityLossReport(beforeSnapshotLike, afterSnapshotLike) {
  const before = (beforeSnapshotLike && typeof beforeSnapshotLike === 'object') ? beforeSnapshotLike : buildHistoricalIntegritySnapshot([]);
  const after = (afterSnapshotLike && typeof afterSnapshotLike === 'object') ? afterSnapshotLike : buildHistoricalIntegritySnapshot([]);
  const losses = [];

  if (after.totalRows < before.totalRows) {
    losses.push({
      dimension: 'totalRows',
      before: before.totalRows,
      after: after.totalRows,
      delta: before.totalRows - after.totalRows
    });
  }

  if (after.totalOsUnique < before.totalOsUnique) {
    losses.push({
      dimension: 'totalOsUnique',
      before: before.totalOsUnique,
      after: after.totalOsUnique,
      delta: before.totalOsUnique - after.totalOsUnique
    });
  }

  if (after.withLaudoRows < before.withLaudoRows) {
    losses.push({
      dimension: 'withLaudoRows',
      before: before.withLaudoRows,
      after: after.withLaudoRows,
      delta: before.withLaudoRows - after.withLaudoRows
    });
  }

  [
    ['byYear', 'byYear'],
    ['byMonth', 'byMonth'],
    ['byNovoRetorno', 'byNovoRetorno']
  ].forEach(([field, dimension]) => {
    const diff = diffHistoricalIntegrityMap(before[field], after[field], dimension);
    if (diff) losses.push(diff);
  });

  ['byClient', 'byCnpj', 'byTechnician', 'bySigla'].forEach((field) => {
    const diff = buildAggregateIntegrityDiff(before[field], after[field], field);
    if (diff && (diff.totalDrop > 0 || diff.uniqueDrop > Math.max(50, Math.ceil(diff.beforeUnique * 0.1)))) {
      losses.push(diff);
    }
  });

  const criticalLosses = losses.filter((item) => Number(item?.delta || item?.droppedTotal || 0) > 0);
  return {
    hasLosses: criticalLosses.length > 0,
    lossCount: criticalLosses.length,
    losses: criticalLosses
  };
}

function appendHistoricalIntegrityAudit(entryLike) {
  const entry = (entryLike && typeof entryLike === 'object') ? entryLike : {};
  const store = readJsonFile(HISTORICAL_ANALYTICS_INTEGRITY_AUDIT_FILE, {
    schema: 'historical_integrity_audit_v1',
    updatedAt: '',
    strictMode: HISTORICAL_INTEGRITY_STRICT,
    allowLoss: HISTORICAL_INTEGRITY_ALLOW_LOSS,
    entries: []
  });
  const entries = Array.isArray(store.entries) ? store.entries.slice() : [];
  entries.unshift({
    ...entry,
    checkedAt: String(entry.checkedAt || nowIso())
  });
  if (entries.length > HISTORICAL_INTEGRITY_AUDIT_MAX_ITEMS) entries.length = HISTORICAL_INTEGRITY_AUDIT_MAX_ITEMS;
  const payload = {
    schema: 'historical_integrity_audit_v1',
    updatedAt: nowIso(),
    strictMode: HISTORICAL_INTEGRITY_STRICT,
    allowLoss: HISTORICAL_INTEGRITY_ALLOW_LOSS,
    entries
  };
  writeJsonFileAtomic(HISTORICAL_ANALYTICS_INTEGRITY_AUDIT_FILE, payload);
  return payload;
}

function readHistoricalIntegrityAuditStore() {
  return readJsonFile(HISTORICAL_ANALYTICS_INTEGRITY_AUDIT_FILE, {
    schema: 'historical_integrity_audit_v1',
    updatedAt: '',
    strictMode: HISTORICAL_INTEGRITY_STRICT,
    allowLoss: HISTORICAL_INTEGRITY_ALLOW_LOSS,
    entries: []
  });
}

function readHistoricalAnalyticsStore() {
  const fallbackLocale = readOrganizationConfig()?.localeDefault || DEFAULT_ORG_CONFIG.localeDefault;
  const fallback = buildEmptyHistoricalStore({ locale: fallbackLocale });
  const saved = readJsonFile(HISTORICAL_ANALYTICS_FILE, fallback);
  if (!saved || typeof saved !== 'object') return fallback;
  const rows = Array.isArray(saved.rows) ? saved.rows : [];
  const normalization = sanitizeHistoricalNormalization(saved.normalization || fallback.normalization);
  const integritySnapshot = buildHistoricalIntegritySnapshot(rows);
  const integritySaved = (saved.integrity && typeof saved.integrity === 'object') ? saved.integrity : {};
  const importHistory = Array.isArray(saved.importHistory) ? saved.importHistory.slice(0, 120) : [];
  const merged = {
    ...fallback,
    ...saved,
    schema: HISTORICAL_ANALYTICS_SCHEMA,
    version: HISTORICAL_ANALYTICS_VERSION,
    thresholds: normalizeHistoricalThresholds(saved.thresholds),
    source: {
      ...(fallback.source || {}),
      ...((saved.source && typeof saved.source === 'object') ? saved.source : {})
    },
    normalization,
    integrity: {
      strictMode: HISTORICAL_INTEGRITY_STRICT,
      allowLoss: HISTORICAL_INTEGRITY_ALLOW_LOSS,
      checkedAt: String(integritySaved.checkedAt || ''),
      blockedOnLoss: !!integritySaved.blockedOnLoss,
      lossCount: Math.max(0, Number(integritySaved.lossCount || 0)),
      losses: Array.isArray(integritySaved.losses) ? integritySaved.losses : [],
      snapshot: (integritySaved.snapshot && typeof integritySaved.snapshot === 'object')
        ? integritySaved.snapshot
        : integritySnapshot
    },
    importHistory,
    immutability: {
      policyVersion: 'historical_immutability_v1',
      keepOriginalSnapshot: true,
      keepNormalizedSnapshot: true,
      keepAnalysisSnapshot: true,
      updateMode: 'merge_versioned'
    },
    rows
  };
  historicalAnalyticsCache = merged;
  return merged;
}

function writeHistoricalAnalyticsStore(nextStoreLike, optionsLike) {
  const options = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
  const strictMode = options.strictMode === false ? false : HISTORICAL_INTEGRITY_STRICT;
  const allowLoss = !!options.allowLoss || HISTORICAL_INTEGRITY_ALLOW_LOSS;
  const store = (nextStoreLike && typeof nextStoreLike === 'object')
    ? nextStoreLike
    : buildEmptyHistoricalStore({ locale: readOrganizationConfig()?.localeDefault || DEFAULT_ORG_CONFIG.localeDefault });
  const normalization = sanitizeHistoricalNormalization(store.normalization);
  const payloadRows = Array.isArray(store.rows) ? store.rows : [];

  const previousStore = readJsonFile(HISTORICAL_ANALYTICS_FILE, buildEmptyHistoricalStore({
    locale: readOrganizationConfig()?.localeDefault || DEFAULT_ORG_CONFIG.localeDefault
  }));
  const previousRows = Array.isArray(previousStore?.rows) ? previousStore.rows : [];
  const beforeSnapshot = buildHistoricalIntegritySnapshot(previousRows);
  const afterSnapshot = buildHistoricalIntegritySnapshot(payloadRows);
  const lossReport = buildHistoricalIntegrityLossReport(beforeSnapshot, afterSnapshot);
  const checkedAt = nowIso();

  if (strictMode && lossReport.hasLosses && !allowLoss) {
    appendHistoricalIntegrityAudit({
      checkedAt,
      blocked: true,
      strictMode,
      allowLoss,
      beforeSnapshot,
      afterSnapshot,
      lossReport,
      sourceSignature: String(store?.source?.workbookSignature || ''),
      sourceWorkbook: String(store?.source?.workbookName || ''),
      reason: 'historical-integrity-loss-blocked'
    });
    const err = new Error('Integridade do histórico bloqueou a gravação: perda detectada em dimensões críticas.');
    err.code = 'HISTORICAL_INTEGRITY_LOSS_BLOCKED';
    err.details = {
      checkedAt,
      strictMode,
      allowLoss,
      beforeSnapshot,
      afterSnapshot,
      lossReport
    };
    throw err;
  }

  let backupFile = '';
  try {
    if (fs.existsSync(HISTORICAL_ANALYTICS_FILE)) {
      const stamp = checkedAt.replace(/[:.]/g, '-');
      backupFile = path.join(HISTORICAL_ANALYTICS_AUDIT_DIR, `historical-service-analytics.${stamp}.bak.json`);
      fs.copyFileSync(HISTORICAL_ANALYTICS_FILE, backupFile);
    }
  } catch (err) {
    writeServerLog('warn', 'historical-integrity-backup-failed', {
      error: err?.message || String(err)
    });
  }

  const previousHistory = Array.isArray(previousStore?.importHistory) ? previousStore.importHistory : [];
  const importHistoryEntry = {
    at: checkedAt,
    sourceSignature: String(store?.source?.workbookSignature || ''),
    sourceWorkbook: String(store?.source?.workbookName || ''),
    importedRows: Math.max(0, Number(store?.source?.importedRows || 0)),
    normalizedRows: payloadRows.length,
    beforeSignature: beforeSnapshot.signature,
    afterSignature: afterSnapshot.signature,
    hasLosses: !!lossReport.hasLosses,
    lossCount: Math.max(0, Number(lossReport.lossCount || 0)),
    blockedOnLoss: false,
    backupFile
  };
  const importHistory = [importHistoryEntry, ...previousHistory]
    .filter((item) => item && typeof item === 'object')
    .slice(0, 120);

  const payload = {
    ...store,
    schema: HISTORICAL_ANALYTICS_SCHEMA,
    version: HISTORICAL_ANALYTICS_VERSION,
    thresholds: normalizeHistoricalThresholds(store.thresholds),
    normalization,
    rows: payloadRows,
    immutability: {
      policyVersion: 'historical_immutability_v1',
      keepOriginalSnapshot: true,
      keepNormalizedSnapshot: true,
      keepAnalysisSnapshot: true,
      updateMode: 'merge_versioned'
    },
    integrity: {
      checkedAt,
      strictMode,
      allowLoss,
      blockedOnLoss: false,
      lossCount: Math.max(0, Number(lossReport.lossCount || 0)),
      losses: Array.isArray(lossReport.losses) ? lossReport.losses : [],
      snapshot: afterSnapshot,
      beforeSnapshot
    },
    importHistory
  };

  writeJsonFileAtomic(HISTORICAL_ANALYTICS_FILE, payload);
  appendHistoricalIntegrityAudit({
    checkedAt,
    blocked: false,
    strictMode,
    allowLoss,
    beforeSnapshot,
    afterSnapshot,
    lossReport,
    sourceSignature: String(store?.source?.workbookSignature || ''),
    sourceWorkbook: String(store?.source?.workbookName || ''),
    backupFile
  });
  historicalAnalyticsCache = payload;
  return payload;
}

function getHistoricalAnalyticsStore() {
  if (historicalAnalyticsCache && typeof historicalAnalyticsCache === 'object') return historicalAnalyticsCache;
  return readHistoricalAnalyticsStore();
}

function resolveHistoricalAnalyticsReferenceDate(dateLike) {
  const dateKey = normalizeDateKey(dateLike);
  return dateKey || getLocalISODate(new Date());
}

function buildHistoricalIntelligencePayload(referenceDate, localeRaw, filtersLike) {
  const locale = detectLocale(localeRaw);
  const reference = resolveHistoricalAnalyticsReferenceDate(referenceDate);
  const store = getHistoricalAnalyticsStore();
  const filters = normalizeHistoricalFilters(filtersLike || {});
  const view = buildHistoricalIntelligenceView(store, reference, locale, {
    thresholds: normalizeHistoricalThresholds(store.thresholds),
    filters
  });
  return view;
}

function getHistoricalAnalyticsStatus(localeRaw) {
  const locale = detectLocale(localeRaw);
  const store = getHistoricalAnalyticsStore();
  const source = (store.source && typeof store.source === 'object') ? store.source : {};
  const rows = Array.isArray(store.rows) ? store.rows : [];
  const integrity = (store.integrity && typeof store.integrity === 'object') ? store.integrity : {};
  const integritySnapshot = (integrity.snapshot && typeof integrity.snapshot === 'object')
    ? integrity.snapshot
    : buildHistoricalIntegritySnapshot(rows);
  const importHistory = Array.isArray(store.importHistory) ? store.importHistory : [];
  return {
    ok: true,
    schema: HISTORICAL_ANALYTICS_SCHEMA,
    version: HISTORICAL_ANALYTICS_VERSION,
    locale,
    available: !!source.exists && rows.length > 0,
    source: {
      exists: !!source.exists,
      workbookPath: String(source.workbookPath || ''),
      workbookName: String(source.workbookName || ''),
      workbookSignature: String(source.workbookSignature || ''),
      importedRows: Math.max(0, Number(source.importedRows || 0)),
      normalizedRows: rows.length,
      generatedAt: String(store.generatedAt || '')
    },
    normalization: (store.normalization && typeof store.normalization === 'object')
      ? store.normalization
      : {},
    thresholds: normalizeHistoricalThresholds(store.thresholds),
    integrity: {
      checkedAt: String(integrity.checkedAt || ''),
      strictMode: HISTORICAL_INTEGRITY_STRICT,
      allowLoss: HISTORICAL_INTEGRITY_ALLOW_LOSS,
      blockedOnLoss: !!integrity.blockedOnLoss,
      lossCount: Math.max(0, Number(integrity.lossCount || 0)),
      snapshot: integritySnapshot
    },
    importHistorySummary: {
      totalEntries: importHistory.length,
      lastAt: String(importHistory[0]?.at || ''),
      lastSourceSignature: String(importHistory[0]?.sourceSignature || ''),
      lastSourceWorkbook: String(importHistory[0]?.sourceWorkbook || '')
    },
    panelModularBlueprint: buildPanelModularBlueprint(locale)
  };
}

function buildHistoricalMergeKey(rowLike, indexLike) {
  const row = (rowLike && typeof rowLike === 'object') ? rowLike : {};
  const index = Math.max(0, Number(indexLike || 0));
  const dateRef = normalizeDateKey(row.dateRef || row.dateAtendimento || row.dateEmissao || row.dateN1);
  const osId = normalizeString(row.osId || '').toUpperCase() || `SEM_OS_${index + 1}`;
  const cnpj = normalizeString(row.cnpjNormalized || row.cnpjRaw || row.cnpj || '').replace(/\D+/g, '');
  const clientKey = normalizeKey(row.clientKey || row.clientName || row.clientIdentityKey || `cliente_${index + 1}`);
  const filialKey = normalizeKey(row.filialKey || row.unidade || row.filial || '');
  return `${dateRef}|${osId}|${cnpj || clientKey}|${filialKey || 'sem_filial'}`;
}

function buildHistoricalRowDigest(rowLike) {
  const row = (rowLike && typeof rowLike === 'object') ? rowLike : {};
  const payload = {
    dateRef: normalizeDateKey(row.dateRef || row.dateAtendimento || row.dateEmissao || row.dateN1),
    osId: String(row.osId || '').trim(),
    clientKey: String(row.clientKey || row.clientIdentityKey || '').trim(),
    cnpj: String(row.cnpjNormalized || row.cnpjRaw || '').replace(/\D+/g, ''),
    technicianKey: String(row.technicianKey || row.technicianName || '').trim(),
    modalidade: String(row.modalidade || '').trim(),
    sigla: String(row.sigla || '').trim(),
    apontamento: String(row.apontamento || '').trim(),
    warrantyStatus: String(row.warrantyStatus || '').trim(),
    warrantyType: String(row.warrantyType || '').trim(),
    probableCause: String(row.probableCause || '').trim(),
    outcomeType: String(row.outcomeType || '').trim(),
    laudoOk: String(row.laudoOk || '').trim(),
    motivoLaudo: String(row.motivoLaudo || '').trim(),
    equipamento: String(row.equipamento || row.modelo || '').trim(),
    numeroSerie: String(row.numeroSerie || '').trim()
  };
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function mergeHistoricalAnalyticsRows(previousRowsLike, incomingRowsLike) {
  const previousRows = Array.isArray(previousRowsLike) ? previousRowsLike : [];
  const incomingRows = Array.isArray(incomingRowsLike) ? incomingRowsLike : [];
  const now = nowIso();
  const previousMap = new Map();
  previousRows.forEach((row, index) => {
    previousMap.set(buildHistoricalMergeKey(row, index), row);
  });

  const consumed = new Set();
  const mergedRows = [];
  let inserted = 0;
  let mergedUpdated = 0;
  let mergedUnchanged = 0;

  incomingRows.forEach((incomingRow, index) => {
    const key = buildHistoricalMergeKey(incomingRow, index);
    const existing = previousMap.get(key);
    consumed.add(key);
    if (!existing) {
      mergedRows.push({
        ...incomingRow,
        mergeMeta: {
          source: 'incremental_import',
          importedAt: now,
          revision: 1,
          status: 'new'
        }
      });
      inserted += 1;
      return;
    }

    const existingDigest = buildHistoricalRowDigest(existing);
    const incomingDigest = buildHistoricalRowDigest(incomingRow);
    if (existingDigest === incomingDigest) {
      mergedRows.push({
        ...existing,
        cnpjRaw: incomingRow.cnpjRaw || existing.cnpjRaw || '',
        cnpjNormalized: incomingRow.cnpjNormalized || existing.cnpjNormalized || '',
        clientIdentityComposite: incomingRow.clientIdentityComposite || existing.clientIdentityComposite || '',
        clientIdentityQuality: incomingRow.clientIdentityQuality || existing.clientIdentityQuality || '',
        mergeMeta: {
          ...(existing.mergeMeta && typeof existing.mergeMeta === 'object' ? existing.mergeMeta : {}),
          source: 'incremental_import',
          importedAt: now,
          revision: Math.max(1, Number(existing?.mergeMeta?.revision || 1)),
          status: 'unchanged'
        }
      });
      mergedUnchanged += 1;
      return;
    }

    const revision = Math.max(1, Number(existing?.mergeMeta?.revision || 1)) + 1;
    mergedRows.push({
      ...existing,
      ...incomingRow,
      recordUid: existing.recordUid || incomingRow.recordUid,
      originalSnapshot: existing.originalSnapshot || incomingRow.originalSnapshot || {},
      normalizedSnapshot: incomingRow.normalizedSnapshot || existing.normalizedSnapshot || {},
      analysisSnapshot: incomingRow.analysisSnapshot || existing.analysisSnapshot || {},
      lineage: {
        ...(existing.lineage && typeof existing.lineage === 'object' ? existing.lineage : {}),
        ...(incomingRow.lineage && typeof incomingRow.lineage === 'object' ? incomingRow.lineage : {}),
        updatedAt: now,
        updateMode: 'merge_versioned',
        previousRecordUid: existing.recordUid || '',
        revision
      },
      mergeMeta: {
        ...(existing.mergeMeta && typeof existing.mergeMeta === 'object' ? existing.mergeMeta : {}),
        source: 'incremental_import',
        importedAt: now,
        revision,
        previousDigest: existingDigest,
        currentDigest: incomingDigest,
        status: 'merged'
      }
    });
    mergedUpdated += 1;
  });

  const preservedRows = [];
  previousMap.forEach((row, key) => {
    if (consumed.has(key)) return;
    preservedRows.push({
      ...row,
      mergeMeta: {
        ...(row.mergeMeta && typeof row.mergeMeta === 'object' ? row.mergeMeta : {}),
        source: 'incremental_import',
        importedAt: now,
        revision: Math.max(1, Number(row?.mergeMeta?.revision || 1)),
        status: 'preserved'
      }
    });
  });

  const finalRows = [...mergedRows, ...preservedRows].sort((a, b) => {
    const dateCmp = String(a?.dateRef || '').localeCompare(String(b?.dateRef || ''));
    if (dateCmp !== 0) return dateCmp;
    const osCmp = String(a?.osId || '').localeCompare(String(b?.osId || ''));
    if (osCmp !== 0) return osCmp;
    return String(a?.recordUid || '').localeCompare(String(b?.recordUid || ''));
  });

  return {
    rows: finalRows,
    mergeReport: {
      previousRows: previousRows.length,
      incomingRows: incomingRows.length,
      inserted,
      mergedUpdated,
      mergedUnchanged,
      preservedRows: preservedRows.length,
      finalRows: finalRows.length
    }
  };
}

function runHistoricalAnalyticsImport(options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const locale = detectLocale(opts.locale || readOrganizationConfig()?.localeDefault || DEFAULT_ORG_CONFIG.localeDefault);
  const currentStore = getHistoricalAnalyticsStore();
  const previousRows = Array.isArray(currentStore?.rows) ? currentStore.rows : [];
  const thresholds = normalizeHistoricalThresholds(opts.thresholds || currentStore.thresholds);
  const importResult = importHistoricalWorkbook(opts.filePath, {
    locale,
    referenceDate: resolveHistoricalAnalyticsReferenceDate(opts.referenceDate),
    thresholds
  });
  if (!importResult?.ok) {
    return {
      ok: false,
      error: importResult?.error || 'Falha ao importar historico analitico.',
      store: getHistoricalAnalyticsStore()
    };
  }

  const incomingStore = (importResult.store && typeof importResult.store === 'object') ? importResult.store : {};
  const incomingRows = Array.isArray(incomingStore.rows) ? incomingStore.rows : [];
  const merged = mergeHistoricalAnalyticsRows(previousRows, incomingRows);
  const nextStore = {
    ...incomingStore,
    rows: merged.rows,
    source: {
      ...(incomingStore.source && typeof incomingStore.source === 'object' ? incomingStore.source : {}),
      mergeMode: 'incremental_preserve_history'
    }
  };

  let saved = null;
  try {
    saved = writeHistoricalAnalyticsStore(nextStore, {
      strictMode: HISTORICAL_INTEGRITY_STRICT,
      allowLoss: HISTORICAL_INTEGRITY_ALLOW_LOSS
    });
  } catch (error) {
    return {
      ok: false,
      imported: false,
      error: error?.message || 'Falha ao persistir historico analitico.',
      code: String(error?.code || ''),
      details: (error && typeof error.details === 'object') ? error.details : {},
      mergeReport: merged.mergeReport
    };
  }
  return {
    ok: true,
    imported: true,
    store: saved,
    importMeta: {
      ...(importResult.importMeta || {}),
      mergeReport: merged.mergeReport
    }
  };
}

function computeHistoricalWorkbookSignature(filePath) {
  const pathValue = String(filePath || '').trim();
  if (!pathValue || !fs.existsSync(pathValue)) return '';
  try {
    const stat = fs.statSync(pathValue);
    return `${Number(stat.size || 0)}:${Math.round(Number(stat.mtimeMs || 0))}`;
  } catch (_) {
    return '';
  }
}

function syncHistoricalAnalyticsAtStartup(localeRaw) {
  const locale = detectLocale(localeRaw || readOrganizationConfig()?.localeDefault || DEFAULT_ORG_CONFIG.localeDefault);
  const store = getHistoricalAnalyticsStore();
  const workbookPath = resolveDefaultHistoricalWorkbookPath({});
  if (!workbookPath || !fs.existsSync(workbookPath)) {
    return {
      ok: true,
      imported: false,
      skipped: true,
      reason: 'workbook-missing',
      workbookPath: ''
    };
  }
  const currentSignature = computeHistoricalWorkbookSignature(workbookPath);
  const previousSignature = String(store?.source?.workbookSignature || '').trim();
  const hasRows = Array.isArray(store?.rows) && store.rows.length > 0;
  if (hasRows && currentSignature && previousSignature && currentSignature === previousSignature) {
    return {
      ok: true,
      imported: false,
      skipped: true,
      reason: 'signature-match',
      workbookPath,
      workbookSignature: currentSignature
    };
  }
  return runHistoricalAnalyticsImport({
    filePath: workbookPath,
    locale,
    referenceDate: getLocalISODate(new Date()),
    thresholds: store?.thresholds
  });
}

function buildHistoricalInsightsAttachment(referenceDate, localeRaw, osAuditItemsLike, filtersLike) {
  const locale = detectLocale(localeRaw);
  const store = getHistoricalAnalyticsStore();
  const reference = resolveHistoricalAnalyticsReferenceDate(referenceDate);
  const filters = normalizeHistoricalFilters(filtersLike || {});
  const historicalIntelligence = buildHistoricalIntelligenceView(store, reference, locale, {
    thresholds: normalizeHistoricalThresholds(store.thresholds),
    filters
  });
  const osAuditItems = Array.isArray(osAuditItemsLike) ? osAuditItemsLike : [];
  const historicalRows = Array.isArray(store.rows) ? store.rows : [];
  const laudoStandards = buildLaudoStandardsPayload({
    locale,
    osAuditItems,
    historicalRows
  });
  const panelModularBlueprint = historicalIntelligence?.panelModularBlueprint || buildPanelModularBlueprint(locale);
  return {
    historicalIntelligence,
    laudoStandards,
    panelModularBlueprint
  };
}

function toCsvCell(value) {
  const raw = value == null
    ? ''
    : (typeof value === 'object' ? JSON.stringify(value) : String(value));
  const normalized = raw.replace(/\r?\n/g, ' ').trim();
  if (/[;"\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

async function buildUnifiedReportFromStore() {
  const rows = [];
  let loadedFromStorage = false;

  if (storage && typeof storage.listRecords === 'function' && typeof storage.getRecord === 'function') {
    try {
      const recordList = await storage.listRecords(STORAGE_ALL_SCOPE);
      const records = await Promise.all((Array.isArray(recordList) ? recordList : []).map(async item => {
        const dateKey = normalizeDateKey(item?.date);
        if (!dateKey) return null;
        const scope = normalizeStorageScope({
          tenantKey: item?.tenantKey,
          unitKey: item?.unitKey,
          companyName: item?.companyName,
          unitName: item?.unitName
        });
        const rec = await storage.getRecord(dateKey, scope);
        const data = (rec?.data && typeof rec.data === 'object') ? rec.data : {};
        return {
          tenantKey: scope.tenantKey,
          unitKey: scope.unitKey,
          date: dateKey,
          savedAt: rec?.savedAt || '',
          schemaVersion: Number(rec?.schemaVersion || rec?.data?.__schemaVersion || DATA_SCHEMA_VERSION),
          validationStatus: rec?.validationStatus || 'ready',
          data
        };
      }));

      rows.push(...records.filter(item => !!item));
      rows.sort((a, b) => {
        const dateCmp = String(a.date || '').localeCompare(String(b.date || ''));
        if (dateCmp !== 0) return dateCmp;
        const tenantCmp = String(a.tenantKey || '').localeCompare(String(b.tenantKey || ''));
        if (tenantCmp !== 0) return tenantCmp;
        return String(a.unitKey || '').localeCompare(String(b.unitKey || ''));
      });
      loadedFromStorage = true;
    } catch (err) {
      writeServerLog('warn', 'unified-report-storage-read-failed', {
        error: err?.message || String(err)
      });
    }
  }

  if (!loadedFromStorage) {
    const store = readJsonFile(DATA_FILE, {});
    const items = Object.keys(store || {})
      .map(key => ({ key, parsed: parseScopedRecordKey(key) }))
      .filter(item => !!item.parsed)
      .sort((a, b) => {
        const dateCmp = String(a.parsed.date || '').localeCompare(String(b.parsed.date || ''));
        if (dateCmp !== 0) return dateCmp;
        const tenantCmp = String(a.parsed.tenantKey || '').localeCompare(String(b.parsed.tenantKey || ''));
        if (tenantCmp !== 0) return tenantCmp;
        return String(a.parsed.unitKey || '').localeCompare(String(b.parsed.unitKey || ''));
      });

    items.forEach(item => {
      const dateKey = item.parsed.date;
      const rec = store[item.key] || {};
      const data = (rec.data && typeof rec.data === 'object') ? rec.data : {};
      rows.push({
        tenantKey: item.parsed.tenantKey,
        unitKey: item.parsed.unitKey,
        date: dateKey,
        savedAt: rec.savedAt || '',
        schemaVersion: Number(rec.schemaVersion || rec.data?.__schemaVersion || DATA_SCHEMA_VERSION),
        validationStatus: rec.validationStatus || 'ready',
        data
      });
    });
  }

  const dynamicKeySet = new Set();
  rows.forEach(row => {
    Object.keys(row.data || {}).forEach(key => dynamicKeySet.add(key));
  });

  const dataKeys = Array.from(dynamicKeySet).sort((a, b) => a.localeCompare(b));
  const columns = ['tenantKey', 'unitKey', 'date', 'savedAt', 'schemaVersion', 'validationStatus', ...dataKeys];
  const csvLines = [columns.join(';')];

  rows.forEach(row => {
    const values = [
      row.tenantKey || '',
      row.unitKey || '',
      row.date,
      row.savedAt,
      row.schemaVersion,
      row.validationStatus,
      ...dataKeys.map(key => row.data?.[key] ?? '')
    ];
    csvLines.push(values.map(toCsvCell).join(';'));
  });

  return {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    columns,
    firstDate: rows[0]?.date || '',
    lastDate: rows[rows.length - 1]?.date || '',
    csvText: csvLines.join('\n')
  };
}

async function writeUnifiedReportFiles(reason) {
  const payload = await buildUnifiedReportFromStore();
  fs.writeFileSync(UNIFIED_REPORT_CSV_FILE, payload.csvText, 'utf-8');
  writeJsonFileAtomic(UNIFIED_REPORT_JSON_FILE, {
    generatedAt: payload.generatedAt,
    totalRows: payload.totalRows,
    columns: payload.columns,
    firstDate: payload.firstDate,
    lastDate: payload.lastDate,
    sourceDataFile: DATA_FILE,
    csvFile: UNIFIED_REPORT_CSV_FILE,
    reason: String(reason || 'runtime')
  });
  writeServerLog('info', 'unified-report-updated', {
    rows: payload.totalRows,
    columns: payload.columns.length,
    reason: String(reason || 'runtime')
  });
  return payload;
}

async function safeRefreshUnifiedReport(reason) {
  try {
    return await writeUnifiedReportFiles(reason);
  } catch (err) {
    writeServerLog('error', 'unified-report-failed', {
      reason: String(reason || 'runtime'),
      error: err.message || String(err)
    });
    return null;
  }
}

function getUnifiedReportStatus() {
  const summary = readJsonFile(UNIFIED_REPORT_JSON_FILE, null);
  const csvExists = fs.existsSync(UNIFIED_REPORT_CSV_FILE);
  const csvStats = csvExists ? fs.statSync(UNIFIED_REPORT_CSV_FILE) : null;
  return {
    csvFile: UNIFIED_REPORT_CSV_FILE,
    jsonFile: UNIFIED_REPORT_JSON_FILE,
    exists: csvExists,
    sizeBytes: Number(csvStats?.size || 0),
    updatedAt: csvStats?.mtime ? new Date(csvStats.mtime).toISOString() : '',
    generatedAt: summary?.generatedAt || '',
    totalRows: Number(summary?.totalRows || 0),
    columns: Array.isArray(summary?.columns) ? summary.columns.length : 0,
    firstDate: summary?.firstDate || '',
    lastDate: summary?.lastDate || ''
  };
}

function sanitizeFileSegment(value, fallback, maxLen) {
  const cleaned = normalizeKey(value || '');
  const safe = cleaned.replace(/[^a-z0-9_-]/g, '_');
  const limit = Math.max(8, Math.min(Number(maxLen || 40), 120));
  return (safe || fallback || 'scope').slice(0, limit);
}

function buildExecutiveMonthlyExportPaths(dateKeyLike, scopeLike) {
  const dateKey = normalizeDateKey(dateKeyLike) || getLocalISODate(new Date());
  const scope = normalizeStorageScope(scopeLike);
  const monthKey = dateKey.slice(0, 7);
  const tenantSafe = sanitizeFileSegment(scope.tenantKey || 'tenant', 'tenant', 48);
  const unitSafe = sanitizeFileSegment(scope.unitKey || 'unit', 'unit', 48);
  const scopeDir = `${tenantSafe}_${unitSafe}`;
  const dir = path.join(EXECUTIVE_MONTHLY_EXPORT_DIR, scopeDir, monthKey);
  const baseName = `relatorio_executivo_${monthKey}_${tenantSafe}_${unitSafe}`;
  return {
    dateKey,
    monthKey,
    scope,
    dir,
    baseName,
    pdfFile: path.join(dir, `${baseName}.pdf`),
    excelFile: path.join(dir, `${baseName}.xlsx`),
    jsonFile: path.join(dir, `${baseName}.json`)
  };
}

function getFileSnapshot(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, sizeBytes: 0, updatedAt: '' };
  }
  const stats = fs.statSync(filePath);
  return {
    exists: true,
    sizeBytes: Number(stats.size || 0),
    updatedAt: stats.mtime ? new Date(stats.mtime).toISOString() : ''
  };
}

function getExecutiveMonthlyExportStatus(dateKeyLike, scopeLike) {
  const paths = buildExecutiveMonthlyExportPaths(dateKeyLike, scopeLike);
  const meta = readJsonFile(paths.jsonFile, null);
  const pdf = getFileSnapshot(paths.pdfFile);
  const excel = getFileSnapshot(paths.excelFile);
  return {
    date: paths.dateKey,
    month: paths.monthKey,
    tenantKey: paths.scope.tenantKey,
    unitKey: paths.scope.unitKey,
    directory: paths.dir,
    baseName: paths.baseName,
    signature: toText(meta?.signature || ''),
    generatedAt: toText(meta?.generatedAt || ''),
    cacheHitCount: Math.max(0, toNumber(meta?.cacheHitCount || 0)),
    files: {
      pdf: {
        path: paths.pdfFile,
        ...pdf
      },
      excel: {
        path: paths.excelFile,
        ...excel
      },
      json: {
        path: paths.jsonFile,
        ...getFileSnapshot(paths.jsonFile)
      }
    },
    monthlySummary: {
      sampleDays: Math.max(0, toNumber(meta?.monthlySummary?.sampleDays)),
      totalOs: Math.max(0, toNumber(meta?.monthlySummary?.totalOs)),
      reviewOpen: Math.max(0, toNumber(meta?.monthlySummary?.reviewOpen)),
      quality: toText(meta?.monthlySummary?.classificationQuality || '')
    }
  };
}

function buildExecutiveQuarterlyExportPaths(quarterKeyLike, scopeLike) {
  const quarterKey = normalizeQuarterKey(quarterKeyLike) || quarterKeyFromMonthKey(getLocalISODate(new Date()).slice(0, 7));
  const scope = normalizeStorageScope(scopeLike);
  const tenantSafe = sanitizeFileSegment(scope.tenantKey || 'tenant', 'tenant', 48);
  const unitSafe = sanitizeFileSegment(scope.unitKey || 'unit', 'unit', 48);
  const scopeDir = `${tenantSafe}_${unitSafe}`;
  const dir = path.join(EXECUTIVE_QUARTERLY_EXPORT_DIR, scopeDir, quarterKey);
  const baseName = `relatorio_executivo_trimestral_${quarterKey}_${tenantSafe}_${unitSafe}`;
  return {
    quarterKey,
    scope,
    dir,
    baseName,
    pdfFile: path.join(dir, `${baseName}.pdf`),
    excelFile: path.join(dir, `${baseName}.xlsx`),
    jsonFile: path.join(dir, `${baseName}.json`)
  };
}

function getExecutiveQuarterlyExportStatus(quarterKeyLike, scopeLike) {
  const paths = buildExecutiveQuarterlyExportPaths(quarterKeyLike, scopeLike);
  const meta = readJsonFile(paths.jsonFile, null);
  const pdf = getFileSnapshot(paths.pdfFile);
  const excel = getFileSnapshot(paths.excelFile);
  return {
    quarter: paths.quarterKey,
    tenantKey: paths.scope.tenantKey,
    unitKey: paths.scope.unitKey,
    directory: paths.dir,
    baseName: paths.baseName,
    signature: toText(meta?.signature || ''),
    generatedAt: toText(meta?.generatedAt || ''),
    cacheHitCount: Math.max(0, toNumber(meta?.cacheHitCount || 0)),
    files: {
      pdf: {
        path: paths.pdfFile,
        ...pdf
      },
      excel: {
        path: paths.excelFile,
        ...excel
      },
      json: {
        path: paths.jsonFile,
        ...getFileSnapshot(paths.jsonFile)
      }
    },
    quarterlySummary: {
      totalOs: Math.max(0, toNumber(meta?.quarterlySummary?.totalOs)),
      sampleDays: Math.max(0, toNumber(meta?.quarterlySummary?.sampleDays)),
      monthsWithData: Math.max(0, toNumber(meta?.quarterlySummary?.monthsWithData)),
      reviewOpen: Math.max(0, toNumber(meta?.quarterlySummary?.reviewOpen)),
      quality: toText(meta?.quarterlySummary?.classificationQuality || '')
    }
  };
}

function getExecutiveMonthlyJobConfig() {
  return {
    enabled: EXEC_MONTHLY_JOB_ENABLED,
    intervalMs: EXEC_MONTHLY_JOB_INTERVAL_MS,
    mode: EXEC_MONTHLY_JOB_MODE,
    windowDay: EXEC_MONTHLY_JOB_WINDOW_DAY,
    windowHour: EXEC_MONTHLY_JOB_WINDOW_HOUR,
    windowMinute: EXEC_MONTHLY_JOB_WINDOW_MINUTE,
    lookbackMonths: EXEC_MONTHLY_JOB_LOOKBACK_MONTHS,
    maxMonthsPerRun: EXEC_MONTHLY_JOB_MAX_MONTHS_PER_RUN,
    recheckMs: EXEC_MONTHLY_JOB_RECHECK_MS
  };
}

function getExecutiveQuarterlyJobConfig() {
  return {
    enabled: EXEC_QUARTERLY_JOB_ENABLED,
    intervalMs: EXEC_QUARTERLY_JOB_INTERVAL_MS,
    mode: EXEC_QUARTERLY_JOB_MODE,
    windowDay: EXEC_QUARTERLY_JOB_WINDOW_DAY,
    windowHour: EXEC_QUARTERLY_JOB_WINDOW_HOUR,
    windowMinute: EXEC_QUARTERLY_JOB_WINDOW_MINUTE,
    lookbackQuarters: EXEC_QUARTERLY_JOB_LOOKBACK_QUARTERS,
    maxQuartersPerRun: EXEC_QUARTERLY_JOB_MAX_QUARTERS_PER_RUN,
    recheckMs: EXEC_QUARTERLY_JOB_RECHECK_MS
  };
}

function sanitizeExecutiveMonthlyJobStore(storeLike) {
  const store = (storeLike && typeof storeLike === 'object') ? storeLike : {};
  const counters = (store.counters && typeof store.counters === 'object') ? store.counters : {};
  const byScopeMonth = (store.byScopeMonth && typeof store.byScopeMonth === 'object') ? store.byScopeMonth : {};
  const recentRuns = Array.isArray(store.recentRuns) ? store.recentRuns : [];
  return {
    schema: 'executive_monthly_job_status_v1',
    config: {
      ...getExecutiveMonthlyJobConfig(),
      ...(store.config && typeof store.config === 'object' ? store.config : {})
    },
    running: !!store.running,
    lastRunAt: toText(store.lastRunAt || ''),
    lastSuccessAt: toText(store.lastSuccessAt || ''),
    lastErrorAt: toText(store.lastErrorAt || ''),
    lastOutcome: toText(store.lastOutcome || 'idle') || 'idle',
    lastMessage: toText(store.lastMessage || ''),
    counters: {
      runs: Math.max(0, toNumber(counters.runs)),
      processedMonths: Math.max(0, toNumber(counters.processedMonths)),
      cacheHit: Math.max(0, toNumber(counters.cacheHit)),
      cacheMiss: Math.max(0, toNumber(counters.cacheMiss)),
      errors: Math.max(0, toNumber(counters.errors))
    },
    byScopeMonth,
    recentRuns: recentRuns.slice(-EXEC_MONTHLY_JOB_HISTORY_LIMIT)
  };
}

function sanitizeExecutiveQuarterlyJobStore(storeLike) {
  const store = (storeLike && typeof storeLike === 'object') ? storeLike : {};
  const counters = (store.counters && typeof store.counters === 'object') ? store.counters : {};
  const byScopeQuarter = (store.byScopeQuarter && typeof store.byScopeQuarter === 'object') ? store.byScopeQuarter : {};
  const recentRuns = Array.isArray(store.recentRuns) ? store.recentRuns : [];
  return {
    schema: 'executive_quarterly_job_status_v1',
    config: {
      ...getExecutiveQuarterlyJobConfig(),
      ...(store.config && typeof store.config === 'object' ? store.config : {})
    },
    running: !!store.running,
    lastRunAt: toText(store.lastRunAt || ''),
    lastSuccessAt: toText(store.lastSuccessAt || ''),
    lastErrorAt: toText(store.lastErrorAt || ''),
    lastOutcome: toText(store.lastOutcome || 'idle') || 'idle',
    lastMessage: toText(store.lastMessage || ''),
    counters: {
      runs: Math.max(0, toNumber(counters.runs)),
      processedQuarters: Math.max(0, toNumber(counters.processedQuarters)),
      cacheHit: Math.max(0, toNumber(counters.cacheHit)),
      cacheMiss: Math.max(0, toNumber(counters.cacheMiss)),
      errors: Math.max(0, toNumber(counters.errors))
    },
    byScopeQuarter,
    recentRuns: recentRuns.slice(-EXEC_QUARTERLY_JOB_HISTORY_LIMIT)
  };
}

function readExecutiveMonthlyJobStore() {
  const loaded = readJsonFile(EXECUTIVE_MONTHLY_JOB_STATUS_FILE, null);
  return sanitizeExecutiveMonthlyJobStore(loaded);
}

function readExecutiveQuarterlyJobStore() {
  const loaded = readJsonFile(EXECUTIVE_QUARTERLY_JOB_STATUS_FILE, null);
  return sanitizeExecutiveQuarterlyJobStore(loaded);
}

function writeExecutiveMonthlyJobStore(storeLike) {
  const clean = sanitizeExecutiveMonthlyJobStore(storeLike);
  writeJsonFileAtomic(EXECUTIVE_MONTHLY_JOB_STATUS_FILE, clean);
  return clean;
}

function writeExecutiveQuarterlyJobStore(storeLike) {
  const clean = sanitizeExecutiveQuarterlyJobStore(storeLike);
  writeJsonFileAtomic(EXECUTIVE_QUARTERLY_JOB_STATUS_FILE, clean);
  return clean;
}

function getDateTimePartsInTimezone(dateLike, timezoneLike) {
  const date = dateLike instanceof Date ? dateLike : new Date();
  const timeZone = toText(timezoneLike || DEFAULT_ORG_CONFIG.timezone) || DEFAULT_ORG_CONFIG.timezone;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const map = {};
  parts.forEach(part => {
    if (part && part.type) map[part.type] = part.value;
  });
  const year = Number(map.year || 0);
  const month = Number(map.month || 0);
  const day = Number(map.day || 0);
  const hour = Number(map.hour || 0);
  const minute = Number(map.minute || 0);
  const second = Number(map.second || 0);
  const dateKey = (year > 0 && month > 0 && day > 0)
    ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : getLocalISODate(date);
  const monthKey = dateKey.slice(0, 7);
  return {
    timeZone,
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateKey,
    monthKey
  };
}

function shiftMonthKey(monthKeyLike, deltaLike) {
  const monthKey = toText(monthKeyLike || '');
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const delta = Number(deltaLike || 0);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(delta)) return '';
  const dt = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthLastDateKey(monthKeyLike) {
  const monthKey = toText(monthKeyLike || '');
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeQuarterKey(valueLike) {
  const raw = toText(valueLike || '').trim().toUpperCase();
  const m = raw.match(/^(\d{4})(?:[-_/ ]?Q?([1-4]))$/);
  if (!m) return '';
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(quarter) || quarter < 1 || quarter > 4) return '';
  return `${String(year).padStart(4, '0')}-Q${quarter}`;
}

function quarterKeyFromMonthKey(monthKeyLike) {
  const monthKey = toText(monthKeyLike || '');
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return '';
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${String(year).padStart(4, '0')}-Q${quarter}`;
}

function buildQuarterMonthKeys(quarterKeyLike) {
  const quarterKey = normalizeQuarterKey(quarterKeyLike);
  if (!quarterKey) return [];
  const m = quarterKey.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return [];
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  const startMonth = ((quarter - 1) * 3) + 1;
  return [
    `${String(year).padStart(4, '0')}-${String(startMonth).padStart(2, '0')}`,
    `${String(year).padStart(4, '0')}-${String(startMonth + 1).padStart(2, '0')}`,
    `${String(year).padStart(4, '0')}-${String(startMonth + 2).padStart(2, '0')}`
  ];
}

function getQuarterReferenceDateKey(quarterKeyLike) {
  const months = buildQuarterMonthKeys(quarterKeyLike);
  const lastMonth = months[months.length - 1] || '';
  return getMonthLastDateKey(lastMonth);
}

function formatMonthKeyLabel(monthKeyLike, localeRaw) {
  const monthKey = toText(monthKeyLike || '');
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const locale = detectLocale(localeRaw);
  try {
    const d = new Date(`${monthKey}-01T12:00:00`);
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
  } catch (_) {
    return monthKey;
  }
}

function formatQuarterKeyLabel(quarterKeyLike, localeRaw) {
  const quarterKey = normalizeQuarterKey(quarterKeyLike);
  if (!quarterKey) return '';
  const locale = detectLocale(localeRaw);
  const m = quarterKey.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return quarterKey;
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  if (locale === 'en-US') return `Q${quarter} ${year}`;
  return `${year} - T${quarter}`;
}

function shiftQuarterKey(quarterKeyLike, deltaLike) {
  const quarterKey = normalizeQuarterKey(quarterKeyLike);
  if (!quarterKey) return '';
  const m = quarterKey.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return '';
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  const delta = Number(deltaLike || 0);
  if (!Number.isFinite(year) || !Number.isFinite(quarter) || !Number.isFinite(delta)) return '';
  const quarterIndex = (year * 4) + (quarter - 1) + delta;
  const targetYear = Math.floor(quarterIndex / 4);
  const targetQuarter = (quarterIndex % 4) + 1;
  return `${String(targetYear).padStart(4, '0')}-Q${targetQuarter}`;
}

function isQuarterOpeningMonth(monthLike) {
  const month = Number(monthLike || 0);
  return month === 1 || month === 4 || month === 7 || month === 10;
}

function buildExecutiveMonthlyScopeMonthKey(scopeLike, monthKeyLike) {
  const scope = normalizeStorageScope(scopeLike);
  const monthKey = toText(monthKeyLike || '');
  return `${scope.tenantKey}::${scope.unitKey}::${monthKey}`;
}

function buildExecutiveQuarterlyScopeQuarterKey(scopeLike, quarterKeyLike) {
  const scope = normalizeStorageScope(scopeLike);
  const quarterKey = normalizeQuarterKey(quarterKeyLike);
  return `${scope.tenantKey}::${scope.unitKey}::${quarterKey}`;
}

function shouldRunMonthByRecheck(storeLike, scopeLike, monthKeyLike, nowMsLike, forceLike) {
  if (forceLike === true) return true;
  const store = sanitizeExecutiveMonthlyJobStore(storeLike);
  const scopeMonthKey = buildExecutiveMonthlyScopeMonthKey(scopeLike, monthKeyLike);
  const row = (store.byScopeMonth && typeof store.byScopeMonth === 'object') ? store.byScopeMonth[scopeMonthKey] : null;
  if (!row) return true;
  const nowMs = Number(nowMsLike || Date.now());
  const lastAttemptMs = Date.parse(toText(row.lastAttemptAt || '')) || 0;
  if (!lastAttemptMs) return true;
  return (nowMs - lastAttemptMs) >= EXEC_MONTHLY_JOB_RECHECK_MS;
}

function shouldRunQuarterByRecheck(storeLike, scopeLike, quarterKeyLike, nowMsLike, forceLike) {
  if (forceLike === true) return true;
  const store = sanitizeExecutiveQuarterlyJobStore(storeLike);
  const scopeQuarterKey = buildExecutiveQuarterlyScopeQuarterKey(scopeLike, quarterKeyLike);
  const row = (store.byScopeQuarter && typeof store.byScopeQuarter === 'object') ? store.byScopeQuarter[scopeQuarterKey] : null;
  if (!row) return true;
  const nowMs = Number(nowMsLike || Date.now());
  const lastAttemptMs = Date.parse(toText(row.lastAttemptAt || '')) || 0;
  if (!lastAttemptMs) return true;
  return (nowMs - lastAttemptMs) >= EXEC_QUARTERLY_JOB_RECHECK_MS;
}

function getExecutiveMonthlyJobStatusSnapshot(scopeLike) {
  const scope = normalizeStorageScope(scopeLike);
  const store = readExecutiveMonthlyJobStore();
  const entries = Object.entries((store.byScopeMonth && typeof store.byScopeMonth === 'object') ? store.byScopeMonth : {})
    .filter(([key]) => key.startsWith(`${scope.tenantKey}::${scope.unitKey}::`))
    .map(([scopeMonthKey, rowRaw]) => {
      const row = (rowRaw && typeof rowRaw === 'object') ? rowRaw : {};
      return {
        scopeMonthKey,
        month: toText(row.month || ''),
        date: toText(row.date || ''),
        signature: toText(row.signature || ''),
        cached: row.cached === true,
        status: toText(row.status || ''),
        success: row.success === true,
        error: toText(row.error || ''),
        lastAttemptAt: toText(row.lastAttemptAt || ''),
        lastSuccessAt: toText(row.lastSuccessAt || ''),
        files: (row.files && typeof row.files === 'object') ? row.files : {}
      };
    })
    .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))
    .slice(0, 12);
  return {
    ...store,
    running: executiveMonthlyJobRunning || store.running === true,
    scopedHistory: entries
  };
}

function getExecutiveQuarterlyJobStatusSnapshot(scopeLike) {
  const scope = normalizeStorageScope(scopeLike);
  const store = readExecutiveQuarterlyJobStore();
  const entries = Object.entries((store.byScopeQuarter && typeof store.byScopeQuarter === 'object') ? store.byScopeQuarter : {})
    .filter(([key]) => key.startsWith(`${scope.tenantKey}::${scope.unitKey}::`))
    .map(([scopeQuarterKey, rowRaw]) => {
      const row = (rowRaw && typeof rowRaw === 'object') ? rowRaw : {};
      return {
        scopeQuarterKey,
        quarter: normalizeQuarterKey(row.quarter || ''),
        signature: toText(row.signature || ''),
        cached: row.cached === true,
        status: toText(row.status || ''),
        success: row.success === true,
        error: toText(row.error || ''),
        lastAttemptAt: toText(row.lastAttemptAt || ''),
        lastSuccessAt: toText(row.lastSuccessAt || ''),
        files: (row.files && typeof row.files === 'object') ? row.files : {}
      };
    })
    .sort((a, b) => String(b.quarter || '').localeCompare(String(a.quarter || '')))
    .slice(0, 12);
  return {
    ...store,
    running: executiveQuarterlyJobRunning || store.running === true,
    scopedHistory: entries
  };
}

function normalizePdfAsciiText(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapPdfTextLine(line, maxChars) {
  const safeMax = Math.max(28, Math.min(Number(maxChars || 100), 150));
  const clean = normalizePdfAsciiText(line || '');
  if (!clean) return [''];
  const words = clean.split(' ').filter(Boolean);
  const out = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if ((current.length + 1 + word.length) <= safeMax) {
      current = `${current} ${word}`;
      continue;
    }
    out.push(current);
    current = word;
  }
  if (current) out.push(current);
  return out.length ? out : [''];
}

function escapePdfText(value) {
  return normalizePdfAsciiText(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimpleTextPdfBuffer(linesLike, options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = Math.max(20, toNumber(opts.marginLeft || 42));
  const marginTop = Math.max(20, toNumber(opts.marginTop || 48));
  const marginBottom = Math.max(20, toNumber(opts.marginBottom || 44));
  const lineHeight = Math.max(10, toNumber(opts.lineHeight || 14));
  const maxChars = Math.max(40, toNumber(opts.maxChars || 102));
  const maxLinesPerPage = Math.max(18, Math.floor((pageHeight - marginTop - marginBottom) / lineHeight));
  const sourceLines = Array.isArray(linesLike) ? linesLike : [];

  const wrapped = [];
  for (const lineRaw of sourceLines) {
    const line = String(lineRaw == null ? '' : lineRaw);
    if (!line.trim()) {
      wrapped.push('');
      continue;
    }
    wrapped.push(...wrapPdfTextLine(line, maxChars));
  }
  if (!wrapped.length) wrapped.push('Relatorio sem dados para o periodo selecionado.');

  const pages = [];
  for (let i = 0; i < wrapped.length; i += maxLinesPerPage) {
    pages.push(wrapped.slice(i, i + maxLinesPerPage));
  }

  const objects = [''];
  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontId = nextId++;
  const pageIds = [];

  for (const pageLines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    const contentOps = [
      'BT',
      '/F1 11 Tf',
      `${Math.round(lineHeight * 100) / 100} TL`,
      `1 0 0 1 ${marginLeft} ${pageHeight - marginTop} Tm`
    ];
    pageLines.forEach(line => {
      if (!String(line || '').trim()) {
        contentOps.push('T*');
        return;
      }
      contentOps.push(`(${escapePdfText(line)}) Tj`);
      contentOps.push('T*');
    });
    contentOps.push('ET');
    const content = contentOps.join('\n');
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  }

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdfText = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdfText, 'ascii');
    pdfText += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdfText, 'ascii');
  pdfText += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdfText += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdfText += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdfText, 'ascii');
}

function toExportList(listLike, mapper, limitLike) {
  const list = Array.isArray(listLike) ? listLike : [];
  const max = Math.max(1, Math.min(Number(limitLike || 9999), 10000));
  return list
    .slice(0, max)
    .map((itemRaw, index) => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      return mapper(item, index);
    });
}

function buildExecutiveMonthlyPdfLines(executiveMonthlyLike, contextLike) {
  const em = (executiveMonthlyLike && typeof executiveMonthlyLike === 'object') ? executiveMonthlyLike : {};
  const context = (contextLike && typeof contextLike === 'object') ? contextLike : {};
  const locale = detectLocale(em.locale || context.locale);
  const isEn = locale === 'en-US';
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const period = (em.period && typeof em.period === 'object') ? em.period : {};
  const overview = (em.overview && typeof em.overview === 'object') ? em.overview : {};
  const quality = (em.quality && typeof em.quality === 'object') ? em.quality : {};
  const reviewQueue = (em.reviewQueue && typeof em.reviewQueue === 'object') ? em.reviewQueue : {};
  const narrative = (em.narrative && typeof em.narrative === 'object') ? em.narrative : {};
  const org = readOrganizationConfig();

  const lines = [];
  lines.push(isEn ? 'MONTHLY EXECUTIVE REPORT - OPERATIONAL COCKPIT' : 'RELATORIO EXECUTIVO MENSAL - COCKPIT OPERACIONAL');
  lines.push(isEn ? `Company: ${org.companyName || 'Tagus-Tec'} | Unit: ${org.unitName || 'Campinas'}` : `Empresa: ${org.companyName || 'Tagus-Tec'} | Unidade: ${org.unitName || 'Campinas'}`);
  lines.push(isEn ? `Period: ${period.label || period.month || ''} | Reference date: ${period.referenceDate || ''}` : `Periodo: ${period.label || period.month || ''} | Data de referencia: ${period.referenceDate || ''}`);
  lines.push(isEn ? `Generated at: ${em.generatedAt || ''}` : `Gerado em: ${em.generatedAt || ''}`);
  lines.push('');

  lines.push(isEn ? '1) MONTH OVERVIEW' : '1) OVERVIEW DO MES');
  lines.push(isEn
    ? `Total WO: ${nf.format(toNumber(overview.totalOs))} | Sampled days: ${nf.format(toNumber(overview.sampleDays))}`
    : `Total de O.S.: ${nf.format(toNumber(overview.totalOs))} | Dias amostrados: ${nf.format(toNumber(overview.sampleDays))}`);
  lines.push(isEn
    ? `Rework: ${nf.format(toNumber(overview.reworkCount))} (${nf.format(toNumber(overview.reworkRatePct))}%) | Critical events: ${nf.format(toNumber(overview.criticalCount))} (${nf.format(toNumber(overview.criticalRatePct))}%)`
    : `Retrabalho: ${nf.format(toNumber(overview.reworkCount))} (${nf.format(toNumber(overview.reworkRatePct))}%) | Eventos criticos: ${nf.format(toNumber(overview.criticalCount))} (${nf.format(toNumber(overview.criticalRatePct))}%)`);
  lines.push(isEn
    ? `Records with alert: ${nf.format(toNumber(overview.recordsWithAlert))} | Estimated financial risk: ${nf.format(toNumber(overview.financialRiskEstimated))}`
    : `Registros com alerta: ${nf.format(toNumber(overview.recordsWithAlert))} | Risco financeiro estimado: ${nf.format(toNumber(overview.financialRiskEstimated))}`);
  if (overview.produtoTop) lines.push(isEn ? `Most incident equipment: ${overview.produtoTop}` : `Equipamento mais incidente: ${overview.produtoTop}`);
  lines.push('');

  lines.push(isEn ? '2) MAIN MIX' : '2) MIX PRINCIPAL');
  const serviceType = toExportList(em?.mix?.serviceType, item => `${item.label || item.key || ''}: ${nf.format(toNumber(item.count))} (${nf.format(toNumber(item.ratePct))}%)`, 5);
  const warrantyStatus = toExportList(em?.mix?.warrantyStatus, item => `${item.label || item.key || ''}: ${nf.format(toNumber(item.count))} (${nf.format(toNumber(item.ratePct))}%)`, 5);
  const warrantyType = toExportList(em?.mix?.warrantyType, item => `${item.label || item.key || ''}: ${nf.format(toNumber(item.count))} (${nf.format(toNumber(item.ratePct))}%)`, 5);
  lines.push(isEn ? 'Service type:' : 'Tipo de atendimento:');
  (serviceType.length ? serviceType : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Warranty status:' : 'Status de garantia:');
  (warrantyStatus.length ? warrantyStatus : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Warranty type:' : 'Tipo de garantia:');
  (warrantyType.length ? warrantyType : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push('');

  lines.push(isEn ? '3) MAIN RANKINGS' : '3) RANKINGS PRINCIPAIS');
  lines.push(isEn ? 'Top equipment:' : 'Top equipamentos:');
  const topEquipment = toExportList(em?.rankings?.topEquipment, item => `${item.equipment || '-'} | WO: ${nf.format(toNumber(item.totalOs))} | Share: ${nf.format(toNumber(item.sharePct))}%`, 6);
  (topEquipment.length ? topEquipment : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Top probable causes:' : 'Top causas provaveis:');
  const topCause = toExportList(em?.rankings?.topProbableCause, item => `${item.label || item.key || ''}: ${nf.format(toNumber(item.count))} (${nf.format(toNumber(item.ratePct))}%)`, 6);
  (topCause.length ? topCause : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Top outcomes:' : 'Top desfechos:');
  const topOutcome = toExportList(em?.rankings?.topOutcome, item => `${item.label || item.key || ''}: ${nf.format(toNumber(item.count))} (${nf.format(toNumber(item.ratePct))}%)`, 6);
  (topOutcome.length ? topOutcome : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push('');

  lines.push(isEn ? '4) CLASSIFICATION QUALITY' : '4) QUALIDADE DA CLASSIFICACAO');
  lines.push(isEn
    ? `Level: ${quality.classificationQuality || 'n/a'} | Avg confidence: ${nf.format(toNumber(quality.avgConfidencePct))}% | Coverage: ${nf.format(toNumber(quality.coveragePct))}%`
    : `Nivel: ${quality.classificationQuality || 'n/a'} | Confianca media: ${nf.format(toNumber(quality.avgConfidencePct))}% | Cobertura: ${nf.format(toNumber(quality.coveragePct))}%`);
  lines.push(isEn
    ? `Not identified: ${nf.format(toNumber(quality.percentNaoIdentificado))}% | Undefined: ${nf.format(toNumber(quality.percentIndefinido))}%`
    : `Nao identificado: ${nf.format(toNumber(quality.percentNaoIdentificado))}% | Indefinido: ${nf.format(toNumber(quality.percentIndefinido))}%`);
  lines.push('');

  lines.push(isEn ? '5) REVIEW QUEUE (MONTH)' : '5) REVIEW QUEUE (MES)');
  lines.push(isEn
    ? `Total: ${nf.format(toNumber(reviewQueue.total))} | Open: ${nf.format(toNumber(reviewQueue.open))} | Overdue: ${nf.format(toNumber(reviewQueue.overdue))} | Highest priority: ${reviewQueue.highestPriority || 'none'}`
    : `Total: ${nf.format(toNumber(reviewQueue.total))} | Abertos: ${nf.format(toNumber(reviewQueue.open))} | Atrasados: ${nf.format(toNumber(reviewQueue.overdue))} | Maior prioridade: ${reviewQueue.highestPriority || 'none'}`);
  const openItems = toExportList(reviewQueue.openItems, item => `${item.code || '-'} | ${item.priority || 'medium'} | ${item.status || 'novo'} | ${item.reviewReason || ''}`, 8);
  (openItems.length ? openItems : [isEn ? 'No open review items' : 'Sem itens abertos']).forEach(text => lines.push(` - ${text}`));
  lines.push('');

  lines.push(isEn ? '6) EXECUTIVE NARRATIVE' : '6) NARRATIVA EXECUTIVA');
  lines.push(` - ${narrative.executiveSummary || (isEn ? 'No summary available.' : 'Sem resumo disponivel.')}`);
  lines.push(isEn ? 'Key findings:' : 'Principais achados:');
  (Array.isArray(narrative.keyFindings) && narrative.keyFindings.length ? narrative.keyFindings : [isEn ? 'No findings listed.' : 'Sem achados listados.'])
    .slice(0, 10)
    .forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Recommended actions:' : 'Acoes recomendadas:');
  (Array.isArray(narrative.recommendedActions) && narrative.recommendedActions.length ? narrative.recommendedActions : [isEn ? 'No action listed.' : 'Sem acao listada.'])
    .slice(0, 10)
    .forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Data quality limitations:' : 'Limitacoes de qualidade de dado:');
  (Array.isArray(narrative.dataQualityLimitations) && narrative.dataQualityLimitations.length ? narrative.dataQualityLimitations : [isEn ? 'No limitation listed.' : 'Sem limitacao listada.'])
    .slice(0, 10)
    .forEach(text => lines.push(` - ${text}`));

  return lines;
}

function buildExecutiveMonthlyExcelWorkbook(executiveMonthlyLike, localeRaw) {
  if (!xlsxLib) throw new Error('Biblioteca xlsx indisponivel para exportacao Excel.');
  const em = (executiveMonthlyLike && typeof executiveMonthlyLike === 'object') ? executiveMonthlyLike : {};
  const locale = detectLocale(localeRaw || em.locale);
  const wb = xlsxLib.utils.book_new();
  const addJsonSheet = (name, rowsLike) => {
    const rows = Array.isArray(rowsLike) && rowsLike.length ? rowsLike : [{ info: locale === 'en-US' ? 'No data' : 'Sem dados' }];
    const sheet = xlsxLib.utils.json_to_sheet(rows);
    xlsxLib.utils.book_append_sheet(wb, sheet, String(name || 'sheet').slice(0, 31));
  };

  const period = (em.period && typeof em.period === 'object') ? em.period : {};
  const overview = (em.overview && typeof em.overview === 'object') ? em.overview : {};
  const quality = (em.quality && typeof em.quality === 'object') ? em.quality : {};
  const reviewQueue = (em.reviewQueue && typeof em.reviewQueue === 'object') ? em.reviewQueue : {};
  const narrative = (em.narrative && typeof em.narrative === 'object') ? em.narrative : {};

  addJsonSheet('overview', [
    { metric: 'month', value: period.month || '' },
    { metric: 'label', value: period.label || '' },
    { metric: 'referenceDate', value: period.referenceDate || '' },
    { metric: 'sampleDays', value: toNumber(period.sampleDays) },
    { metric: 'totalOs', value: toNumber(overview.totalOs) },
    { metric: 'reworkCount', value: toNumber(overview.reworkCount) },
    { metric: 'reworkRatePct', value: toNumber(overview.reworkRatePct) },
    { metric: 'criticalCount', value: toNumber(overview.criticalCount) },
    { metric: 'criticalRatePct', value: toNumber(overview.criticalRatePct) },
    { metric: 'recordsWithAlert', value: toNumber(overview.recordsWithAlert) },
    { metric: 'financialRiskEstimated', value: toNumber(overview.financialRiskEstimated) },
    { metric: 'produtoTop', value: overview.produtoTop || '' }
  ]);

  addJsonSheet('mix_serviceType', toExportList(em?.mix?.serviceType, item => ({
    key: item.key || '',
    label: item.label || '',
    count: toNumber(item.count),
    ratePct: toNumber(item.ratePct)
  }), 400));

  addJsonSheet('warranty', [
    ...toExportList(em?.mix?.warrantyStatus, item => ({
      category: 'status',
      key: item.key || '',
      label: item.label || '',
      count: toNumber(item.count),
      ratePct: toNumber(item.ratePct)
    }), 400),
    ...toExportList(em?.mix?.warrantyType, item => ({
      category: 'type',
      key: item.key || '',
      label: item.label || '',
      count: toNumber(item.count),
      ratePct: toNumber(item.ratePct)
    }), 400)
  ]);

  addJsonSheet('top_equipment', toExportList(em?.rankings?.topEquipment, item => ({
    equipment: item.equipment || '',
    totalOs: toNumber(item.totalOs),
    sharePct: toNumber(item.sharePct),
    confidenceAvgPct: toNumber(item.confidenceAvgPct),
    topCauseKey: item?.topCause?.key || '',
    topCauseLabel: item?.topCause?.label || '',
    topOutcomeKey: item?.topOutcome?.key || '',
    topOutcomeLabel: item?.topOutcome?.label || ''
  }), 400));

  addJsonSheet('probableCause', toExportList(em?.rankings?.topProbableCause, item => ({
    key: item.key || '',
    label: item.label || '',
    count: toNumber(item.count),
    ratePct: toNumber(item.ratePct)
  }), 400));

  addJsonSheet('outcome', toExportList(em?.rankings?.topOutcome, item => ({
    key: item.key || '',
    label: item.label || '',
    count: toNumber(item.count),
    ratePct: toNumber(item.ratePct)
  }), 400));

  addJsonSheet('technicianConcentration', toExportList(em?.rankings?.technicianConcentration, item => ({
    technician: item.technician || '',
    totalOs: toNumber(item.totalOs),
    sharePct: toNumber(item.sharePct),
    confidenceAvgPct: toNumber(item.confidenceAvgPct),
    topServiceTypeKey: item?.topServiceType?.key || '',
    topServiceTypeLabel: item?.topServiceType?.label || '',
    topOutcomeKey: item?.topOutcome?.key || '',
    topOutcomeLabel: item?.topOutcome?.label || ''
  }), 400));

  addJsonSheet('locationConcentration', toExportList(em?.rankings?.locationConcentration, item => ({
    location: item.location || '',
    totalOs: toNumber(item.totalOs),
    sharePct: toNumber(item.sharePct),
    confidenceAvgPct: toNumber(item.confidenceAvgPct),
    topCauseKey: item?.topCause?.key || '',
    topCauseLabel: item?.topCause?.label || ''
  }), 400));

  addJsonSheet('reviewQueue', [
    {
      type: 'summary',
      total: toNumber(reviewQueue.total),
      open: toNumber(reviewQueue.open),
      overdue: toNumber(reviewQueue.overdue),
      highestPriority: reviewQueue.highestPriority || '',
      nextDueAt: reviewQueue.nextDueAt || ''
    },
    ...toExportList(reviewQueue.openItems, item => ({
      type: 'item',
      workflowId: item.workflowId || '',
      code: item.code || '',
      priority: item.priority || '',
      status: item.status || '',
      reviewReason: item.reviewReason || '',
      impact: item.impact || '',
      recommendedReviewer: item.recommendedReviewer || '',
      dueAt: item.dueAt || '',
      lastAction: item.lastAction || '',
      lastActionAt: item.lastActionAt || ''
    }), 1000)
  ]);

  addJsonSheet('quality', [
    { metric: 'classificationQuality', value: quality.classificationQuality || '' },
    { metric: 'avgConfidencePct', value: toNumber(quality.avgConfidencePct) },
    { metric: 'coveragePct', value: toNumber(quality.coveragePct) },
    { metric: 'percentNaoIdentificado', value: toNumber(quality.percentNaoIdentificado) },
    { metric: 'percentIndefinido', value: toNumber(quality.percentIndefinido) },
    ...Object.entries((quality.axisQuality && typeof quality.axisQuality === 'object') ? quality.axisQuality : {}).map(([axis, values]) => {
      const row = (values && typeof values === 'object') ? values : {};
      return {
        metric: `axisQuality.${axis}`,
        value: JSON.stringify(row)
      };
    })
  ]);

  addJsonSheet('narrative', [
    { section: 'executiveSummary', text: narrative.executiveSummary || '' },
    ...toExportList(narrative.keyFindings, (item, index) => ({ section: 'keyFindings', order: index + 1, text: item || '' }), 100),
    ...toExportList(narrative.monthRisks, (item, index) => ({ section: 'monthRisks', order: index + 1, text: item || '' }), 100),
    ...toExportList(narrative.recommendedActions, (item, index) => ({ section: 'recommendedActions', order: index + 1, text: item || '' }), 100),
    ...toExportList(narrative.humanReviewPoints, (item, index) => ({ section: 'humanReviewPoints', order: index + 1, text: item || '' }), 100),
    ...toExportList(narrative.dataQualityLimitations, (item, index) => ({ section: 'dataQualityLimitations', order: index + 1, text: item || '' }), 100)
  ]);

  return wb;
}

function computeExecutiveMonthlySignature(executiveMonthlyLike) {
  const em = (executiveMonthlyLike && typeof executiveMonthlyLike === 'object') ? executiveMonthlyLike : {};
  const period = (em.period && typeof em.period === 'object') ? em.period : {};
  const narrative = (em.narrative && typeof em.narrative === 'object') ? em.narrative : {};
  const reviewQueue = (em.reviewQueue && typeof em.reviewQueue === 'object') ? em.reviewQueue : {};
  const signatureBase = {
    period: {
      month: toText(period.month || ''),
      label: toText(period.label || ''),
      referenceDate: toText(period.referenceDate || ''),
      sampleDays: toNumber(period.sampleDays),
      dates: Array.isArray(period.dates) ? period.dates : []
    },
    overview: em.overview || {},
    mix: em.mix || {},
    rankings: em.rankings || {},
    quality: em.quality || {},
    reviewQueue: {
      total: toNumber(reviewQueue.total),
      open: toNumber(reviewQueue.open),
      overdue: toNumber(reviewQueue.overdue),
      highestPriority: toText(reviewQueue.highestPriority || ''),
      nextDueAt: toText(reviewQueue.nextDueAt || ''),
      byStatus: reviewQueue.byStatus || {},
      byPriority: reviewQueue.byPriority || {},
      requiresHumanReview: reviewQueue.requiresHumanReview === true,
      openItems: Array.isArray(reviewQueue.openItems) ? reviewQueue.openItems : []
    },
    narrative: {
      executiveSummary: toText(narrative.executiveSummary || ''),
      keyFindings: Array.isArray(narrative.keyFindings) ? narrative.keyFindings : [],
      monthRisks: Array.isArray(narrative.monthRisks) ? narrative.monthRisks : [],
      recommendedActions: Array.isArray(narrative.recommendedActions) ? narrative.recommendedActions : [],
      humanReviewPoints: Array.isArray(narrative.humanReviewPoints) ? narrative.humanReviewPoints : [],
      dataQualityLimitations: Array.isArray(narrative.dataQualityLimitations) ? narrative.dataQualityLimitations : []
    }
  };
  return crypto.createHash('sha256').update(JSON.stringify(signatureBase)).digest('hex');
}

async function buildMonthlyExecutiveBundleForDate(dateKeyLike, scopeLike, localeRaw, actorLike) {
  const dateKey = normalizeDateKey(dateKeyLike) || getLocalISODate(new Date());
  const scope = normalizeStorageScope(scopeLike);
  const locale = detectLocale(localeRaw);
  const monthlyOs = await buildMonthlyOsAggregate(dateKey, scope, locale);
  let reviewWorkflowMonthly = null;
  if (monthlyOs?.detailedAnalytics) {
    reviewWorkflowMonthly = mergeReviewWorkflowIntoDetailed(scope, dateKey, monthlyOs.detailedAnalytics, actorLike);
    if (reviewWorkflowMonthly?.detailed) monthlyOs.detailedAnalytics = reviewWorkflowMonthly.detailed;
  }
  monthlyOs.executiveMonthly = buildMonthlyExecutiveExport(monthlyOs, locale);
  return {
    dateKey,
    scope,
    locale,
    monthKey: monthlyOs.month || dateKey.slice(0, 7),
    monthlyOs,
    executiveMonthly: monthlyOs.executiveMonthly,
    reviewWorkflowMonthly
  };
}

async function generateExecutiveMonthlyExports(dateKeyLike, scopeLike, localeRaw, actorLike, optionsLike) {
  const opts = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
  const force = opts.force === true;
  const bundle = await buildMonthlyExecutiveBundleForDate(dateKeyLike, scopeLike, localeRaw, actorLike);
  const paths = buildExecutiveMonthlyExportPaths(bundle.dateKey, bundle.scope);
  const signature = computeExecutiveMonthlySignature(bundle.executiveMonthly);
  const previousMeta = readJsonFile(paths.jsonFile, null);
  const cacheReady = !force
    && previousMeta
    && toText(previousMeta.signature || '') === signature
    && fs.existsSync(paths.pdfFile)
    && fs.existsSync(paths.excelFile);

  if (cacheReady) {
    const hitCount = Math.max(0, toNumber(previousMeta.cacheHitCount || 0)) + 1;
    const nextMeta = {
      ...previousMeta,
      cacheHitCount: hitCount,
      lastAccessAt: nowIso()
    };
    writeJsonFileAtomic(paths.jsonFile, nextMeta);
    return {
      ...bundle,
      paths,
      signature,
      cached: true,
      meta: nextMeta
    };
  }

  fs.mkdirSync(paths.dir, { recursive: true });

  const pdfLines = buildExecutiveMonthlyPdfLines(bundle.executiveMonthly, {
    locale: bundle.locale,
    scope: bundle.scope
  });
  const pdfBuffer = buildSimpleTextPdfBuffer(pdfLines, {
    locale: bundle.locale
  });
  fs.writeFileSync(paths.pdfFile, pdfBuffer);

  const workbook = buildExecutiveMonthlyExcelWorkbook(bundle.executiveMonthly, bundle.locale);
  xlsxLib.writeFile(workbook, paths.excelFile, { bookType: 'xlsx' });

  const meta = {
    schema: 'monthly_executive_export_bundle_v1',
    generatedAt: nowIso(),
    lastAccessAt: nowIso(),
    cacheHitCount: 0,
    signature,
    locale: bundle.locale,
    date: bundle.dateKey,
    month: bundle.monthKey,
    tenantKey: bundle.scope.tenantKey,
    unitKey: bundle.scope.unitKey,
    files: {
      pdf: paths.pdfFile,
      excel: paths.excelFile
    },
    monthlySummary: {
      sampleDays: Math.max(0, toNumber(bundle.executiveMonthly?.period?.sampleDays)),
      totalOs: Math.max(0, toNumber(bundle.executiveMonthly?.overview?.totalOs)),
      reviewOpen: Math.max(0, toNumber(bundle.executiveMonthly?.reviewQueue?.open)),
      classificationQuality: toText(bundle.executiveMonthly?.quality?.classificationQuality || '')
    },
    executiveMonthly: bundle.executiveMonthly
  };
  writeJsonFileAtomic(paths.jsonFile, meta);
  writeServerLog('info', 'executive-monthly-export-generated', {
    month: bundle.monthKey,
    date: bundle.dateKey,
    tenantKey: bundle.scope.tenantKey,
    unitKey: bundle.scope.unitKey,
    totalOs: meta.monthlySummary.totalOs,
    sampleDays: meta.monthlySummary.sampleDays,
    signature
  });

  return {
    ...bundle,
    paths,
    signature,
    cached: false,
    meta
  };
}

function buildExecutiveMonthlyJobTargets(scopeLike, localeRaw, optionsLike) {
  const opts = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
  const force = opts.force === true;
  const org = readOrganizationConfig();
  const scope = normalizeStorageScope(scopeLike || org);
  const locale = detectLocale(localeRaw || org.localeDefault || 'pt-BR');
  const tzParts = getDateTimePartsInTimezone(new Date(), org.timezone || DEFAULT_ORG_CONFIG.timezone);
  const currentMonth = tzParts.monthKey;
  const targets = [];

  const windowReached = tzParts.day > EXEC_MONTHLY_JOB_WINDOW_DAY
    || (tzParts.day === EXEC_MONTHLY_JOB_WINDOW_DAY && (
      tzParts.hour > EXEC_MONTHLY_JOB_WINDOW_HOUR
      || (tzParts.hour === EXEC_MONTHLY_JOB_WINDOW_HOUR && tzParts.minute >= EXEC_MONTHLY_JOB_WINDOW_MINUTE)
    ));

  if (EXEC_MONTHLY_JOB_MODE === 'rolling') {
    targets.push(currentMonth);
  }
  if (windowReached || force || EXEC_MONTHLY_JOB_MODE !== 'close_window') {
    targets.push(shiftMonthKey(currentMonth, -1));
  }
  for (let back = 2; back <= EXEC_MONTHLY_JOB_LOOKBACK_MONTHS; back += 1) {
    const mk = shiftMonthKey(currentMonth, -back);
    if (mk) targets.push(mk);
  }

  const uniqueTargets = Array.from(new Set(targets.filter(Boolean)))
    .slice(0, EXEC_MONTHLY_JOB_MAX_MONTHS_PER_RUN)
    .map(monthKey => ({
      monthKey,
      dateKey: monthKey === currentMonth ? tzParts.dateKey : getMonthLastDateKey(monthKey)
    }))
    .filter(item => normalizeDateKey(item.dateKey));

  return {
    force,
    scope,
    locale,
    tzParts,
    windowReached,
    targets: uniqueTargets
  };
}

async function runExecutiveMonthlyAutoJob(triggerLike, optionsLike) {
  const trigger = toText(triggerLike || 'interval') || 'interval';
  const opts = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
  const force = opts.force === true;
  const actor = (opts.actor && typeof opts.actor === 'object')
    ? opts.actor
    : {
        username: 'system_auto_export',
        displayName: 'System Auto Export',
        role: 'admin',
        tenantKey: readOrganizationConfig().tenantKey,
        unitKey: readOrganizationConfig().unitKey
      };

  const storeBefore = readExecutiveMonthlyJobStore();
  if (!force && !EXEC_MONTHLY_JOB_ENABLED) {
    return {
      ok: false,
      skipped: true,
      reason: 'disabled',
      trigger,
      status: storeBefore
    };
  }
  if (executiveMonthlyJobRunning) {
    return {
      ok: false,
      skipped: true,
      reason: 'running',
      trigger,
      status: storeBefore
    };
  }

  executiveMonthlyJobRunning = true;
  const startedAt = nowIso();
  const startedMs = Date.now();
  const runLog = {
    at: startedAt,
    trigger,
    force,
    months: [],
    processed: 0,
    skippedByWindow: false,
    skippedByRecheck: 0,
    cacheHit: 0,
    cacheMiss: 0,
    errors: 0,
    success: true,
    message: ''
  };

  const store = sanitizeExecutiveMonthlyJobStore(storeBefore);
  store.running = true;
  store.lastRunAt = startedAt;
  store.lastOutcome = 'running';
  store.lastMessage = '';
  store.counters.runs = Math.max(0, toNumber(store.counters.runs)) + 1;
  writeExecutiveMonthlyJobStore(store);

  try {
    const plan = buildExecutiveMonthlyJobTargets(opts.scope, opts.locale, { force });
    if (!plan.targets.length) {
      runLog.skippedByWindow = true;
      runLog.message = 'janela ainda nao atingida para fechamento mensal';
    } else {
      for (const target of plan.targets) {
        const scopeMonthKey = buildExecutiveMonthlyScopeMonthKey(plan.scope, target.monthKey);
        if (!shouldRunMonthByRecheck(store, plan.scope, target.monthKey, startedMs, force)) {
          runLog.skippedByRecheck += 1;
          runLog.months.push({
            month: target.monthKey,
            date: target.dateKey,
            skipped: true,
            reason: 'recheck_cooldown'
          });
          continue;
        }
        const monthRow = {
          month: target.monthKey,
          date: target.dateKey,
          lastAttemptAt: nowIso(),
          trigger,
          status: 'running',
          success: false,
          cached: false,
          signature: '',
          error: '',
          files: {}
        };
        store.byScopeMonth[scopeMonthKey] = {
          ...(store.byScopeMonth[scopeMonthKey] && typeof store.byScopeMonth[scopeMonthKey] === 'object' ? store.byScopeMonth[scopeMonthKey] : {}),
          ...monthRow
        };
        writeExecutiveMonthlyJobStore(store);

        try {
          const result = await generateExecutiveMonthlyExports(target.dateKey, plan.scope, plan.locale, actor, { force: false });
          const exportStatus = getExecutiveMonthlyExportStatus(target.dateKey, plan.scope);
          runLog.processed += 1;
          if (result.cached) runLog.cacheHit += 1;
          else runLog.cacheMiss += 1;
          runLog.months.push({
            month: target.monthKey,
            date: target.dateKey,
            success: true,
            cached: result.cached === true,
            signature: result.signature,
            files: exportStatus.files
          });
          store.counters.processedMonths = Math.max(0, toNumber(store.counters.processedMonths)) + 1;
          if (result.cached) store.counters.cacheHit = Math.max(0, toNumber(store.counters.cacheHit)) + 1;
          else store.counters.cacheMiss = Math.max(0, toNumber(store.counters.cacheMiss)) + 1;
          store.byScopeMonth[scopeMonthKey] = {
            ...(store.byScopeMonth[scopeMonthKey] && typeof store.byScopeMonth[scopeMonthKey] === 'object' ? store.byScopeMonth[scopeMonthKey] : {}),
            month: target.monthKey,
            date: target.dateKey,
            trigger,
            status: 'success',
            success: true,
            cached: result.cached === true,
            signature: toText(result.signature || ''),
            lastAttemptAt: nowIso(),
            lastSuccessAt: nowIso(),
            error: '',
            files: exportStatus.files,
            monthlySummary: exportStatus.monthlySummary
          };
        } catch (errMonth) {
          runLog.errors += 1;
          runLog.success = false;
          const errText = errMonth?.message || String(errMonth);
          runLog.months.push({
            month: target.monthKey,
            date: target.dateKey,
            success: false,
            error: errText
          });
          store.counters.errors = Math.max(0, toNumber(store.counters.errors)) + 1;
          store.byScopeMonth[scopeMonthKey] = {
            ...(store.byScopeMonth[scopeMonthKey] && typeof store.byScopeMonth[scopeMonthKey] === 'object' ? store.byScopeMonth[scopeMonthKey] : {}),
            month: target.monthKey,
            date: target.dateKey,
            trigger,
            status: 'error',
            success: false,
            cached: false,
            signature: '',
            lastAttemptAt: nowIso(),
            error: errText
          };
          writeServerLog('error', 'executive-monthly-job-month-failed', {
            trigger,
            month: target.monthKey,
            date: target.dateKey,
            tenantKey: plan.scope.tenantKey,
            unitKey: plan.scope.unitKey,
            error: errText
          });
        }
        writeExecutiveMonthlyJobStore(store);
      }
    }
    if (runLog.success && runLog.processed > 0) {
      store.lastSuccessAt = nowIso();
      store.lastOutcome = 'success';
      store.lastMessage = `processado(s): ${runLog.processed} | cache hit: ${runLog.cacheHit} | cache miss: ${runLog.cacheMiss}`;
    } else if (runLog.success && runLog.processed === 0) {
      store.lastOutcome = runLog.skippedByWindow ? 'skipped_window' : 'skipped';
      store.lastMessage = runLog.skippedByWindow
        ? 'janela de fechamento ainda nao atingida'
        : 'nenhum mes elegivel para processamento neste ciclo';
    } else {
      store.lastOutcome = 'error';
      store.lastErrorAt = nowIso();
      store.lastMessage = `falhas: ${runLog.errors} | processados: ${runLog.processed}`;
    }
    runLog.message = store.lastMessage;
    runLog.completedAt = nowIso();
    store.running = false;
    store.recentRuns = Array.isArray(store.recentRuns) ? store.recentRuns : [];
    store.recentRuns.push(runLog);
    store.recentRuns = store.recentRuns.slice(-EXEC_MONTHLY_JOB_HISTORY_LIMIT);
    writeExecutiveMonthlyJobStore(store);
    writeServerLog('info', 'executive-monthly-job-run', {
      trigger,
      force,
      success: runLog.success,
      processed: runLog.processed,
      skippedByRecheck: runLog.skippedByRecheck,
      cacheHit: runLog.cacheHit,
      cacheMiss: runLog.cacheMiss,
      errors: runLog.errors
    });
    return {
      ok: true,
      trigger,
      force,
      result: runLog,
      status: getExecutiveMonthlyJobStatusSnapshot(opts.scope || readOrganizationConfig())
    };
  } catch (err) {
    const errText = err?.message || String(err);
    const failStore = readExecutiveMonthlyJobStore();
    failStore.running = false;
    failStore.lastOutcome = 'error';
    failStore.lastErrorAt = nowIso();
    failStore.lastMessage = errText;
    failStore.counters.errors = Math.max(0, toNumber(failStore.counters.errors)) + 1;
    failStore.recentRuns = Array.isArray(failStore.recentRuns) ? failStore.recentRuns : [];
    failStore.recentRuns.push({
      at: startedAt,
      completedAt: nowIso(),
      trigger,
      force,
      success: false,
      processed: runLog.processed,
      errors: runLog.errors + 1,
      message: errText
    });
    failStore.recentRuns = failStore.recentRuns.slice(-EXEC_MONTHLY_JOB_HISTORY_LIMIT);
    writeExecutiveMonthlyJobStore(failStore);
    writeServerLog('error', 'executive-monthly-job-failed', {
      trigger,
      force,
      error: errText
    });
    return {
      ok: false,
      trigger,
      force,
      error: errText,
      status: getExecutiveMonthlyJobStatusSnapshot(opts.scope || readOrganizationConfig())
    };
  } finally {
    executiveMonthlyJobRunning = false;
  }
}

function addCountToMap(targetMap, keyLike, valueLike) {
  const key = normalizeKey(keyLike || '');
  const value = Math.max(0, toNumber(valueLike));
  if (!key || !value) return;
  targetMap.set(key, (targetMap.get(key) || 0) + value);
}

function topCounterEntry(counterMapLike, localeRaw, totalBaseLike) {
  const counterMap = counterMapLike instanceof Map ? counterMapLike : new Map();
  const locale = detectLocale(localeRaw);
  const totalBase = Math.max(0, toNumber(totalBaseLike));
  let bestKey = '';
  let bestCount = 0;
  counterMap.forEach((countRaw, keyRaw) => {
    const count = Math.max(0, toNumber(countRaw));
    if (count > bestCount) {
      bestCount = count;
      bestKey = normalizeKey(keyRaw || '');
    }
  });
  if (!bestKey || !bestCount) return null;
  return {
    key: bestKey,
    label: translateTaxonomyKey(bestKey, locale),
    count: bestCount,
    ratePct: Math.round(pct(bestCount, totalBase) * 100) / 100
  };
}

function normalizeQuarterlyQualityLevel(avgConfidencePctLike, coveragePctLike, notIdentifiedPctLike, undefinedPctLike, monthLevelsLike) {
  const avgConfidencePct = Math.max(0, toNumber(avgConfidencePctLike));
  const coveragePct = Math.max(0, toNumber(coveragePctLike));
  const notIdentifiedPct = Math.max(0, toNumber(notIdentifiedPctLike));
  const undefinedPct = Math.max(0, toNumber(undefinedPctLike));
  const monthLevels = Array.isArray(monthLevelsLike) ? monthLevelsLike.map(level => normalizeKey(level || '')).filter(Boolean) : [];
  const rank = { low: 0, medium: 1, high: 2 };
  const worstMonth = monthLevels.reduce((acc, level) => (rank[level] ?? -1) < (rank[acc] ?? 99) ? level : acc, 'high');
  let derived = 'low';
  if (avgConfidencePct >= 82 && coveragePct >= 82 && notIdentifiedPct <= 18 && undefinedPct <= 18) derived = 'high';
  else if (avgConfidencePct >= 68 && coveragePct >= 65 && notIdentifiedPct <= 32 && undefinedPct <= 32) derived = 'medium';
  return (rank[worstMonth] ?? 0) < (rank[derived] ?? 0) ? worstMonth : derived;
}

function buildQuarterlyExecutiveNarrative(payloadLike, localeRaw) {
  const locale = detectLocale(localeRaw);
  const isEn = locale === 'en-US';
  const payload = (payloadLike && typeof payloadLike === 'object') ? payloadLike : {};
  const period = (payload.period && typeof payload.period === 'object') ? payload.period : {};
  const overview = (payload.overview && typeof payload.overview === 'object') ? payload.overview : {};
  const quality = (payload.quality && typeof payload.quality === 'object') ? payload.quality : {};
  const mix = (payload.mix && typeof payload.mix === 'object') ? payload.mix : {};
  const rankings = (payload.rankings && typeof payload.rankings === 'object') ? payload.rankings : {};
  const reviewQueue = (payload.reviewQueue && typeof payload.reviewQueue === 'object') ? payload.reviewQueue : {};

  const mainService = getTopDistributionItem(mix.serviceType);
  const topWarranty = getTopDistributionItem(mix.warrantyStatus);
  const topEquipment = getTopDistributionItem(rankings.topEquipment);
  const topCause = getTopDistributionItem(rankings.topProbableCause);
  const topOutcome = getTopDistributionItem(rankings.topOutcome);
  const monthRows = Array.isArray(period.months) ? period.months : [];
  const monthsWithData = monthRows.filter(row => toNumber(row?.totalOs) > 0 || toNumber(row?.sampleDays) > 0).length;
  const openReview = Math.max(0, toNumber(reviewQueue.open));
  const overdueReview = Math.max(0, toNumber(reviewQueue.overdue));

  const executiveSummary = isEn
    ? `${period.label || period.quarter || ''}: ${toNumber(overview.totalOs)} WO consolidated across ${monthsWithData} month(s), ${toNumber(overview.sampleDays)} sampled day(s), quality ${quality.classificationQuality || 'low'} (${toNumber(quality.avgConfidencePct)}% confidence).`
    : `${period.label || period.quarter || ''}: ${toNumber(overview.totalOs)} O.S. consolidadas em ${monthsWithData} mes(es), ${toNumber(overview.sampleDays)} dia(s) amostrados, qualidade ${quality.classificationQuality || 'low'} (${toNumber(quality.avgConfidencePct)}% confianca).`;

  const keyFindings = [];
  if (mainService) {
    keyFindings.push(isEn
      ? `Dominant service type: ${mainService.label} (${mainService.ratePct}%).`
      : `Tipo de atendimento dominante: ${mainService.label} (${mainService.ratePct}%).`);
  }
  if (topWarranty) {
    keyFindings.push(isEn
      ? `Predominant warranty status: ${topWarranty.label} (${topWarranty.ratePct}%).`
      : `Status de garantia predominante: ${topWarranty.label} (${topWarranty.ratePct}%).`);
  }
  if (topEquipment) {
    keyFindings.push(isEn
      ? `Top equipment concentration: ${topEquipment.equipment} (${topEquipment.totalOs} WO / ${topEquipment.sharePct}%).`
      : `Maior concentracao em equipamento: ${topEquipment.equipment} (${topEquipment.totalOs} O.S. / ${topEquipment.sharePct}%).`);
  }
  if (topCause && topOutcome) {
    keyFindings.push(isEn
      ? `Most recurrent cause/outcome: ${topCause.label} -> ${topOutcome.label}.`
      : `Par causa/desfecho mais recorrente: ${topCause.label} -> ${topOutcome.label}.`);
  }

  const quarterRisks = [];
  if (toNumber(overview.reworkRatePct) >= 8) quarterRisks.push(isEn
    ? `Rework sustained above threshold (${toNumber(overview.reworkRatePct)}%).`
    : `Retrabalho sustentado acima da faixa (${toNumber(overview.reworkRatePct)}%).`);
  if (toNumber(overview.criticalRatePct) >= 35) quarterRisks.push(isEn
    ? `Critical events concentration remained high (${toNumber(overview.criticalRatePct)}%).`
    : `Concentracao de eventos criticos manteve-se elevada (${toNumber(overview.criticalRatePct)}%).`);
  if (openReview > 0) quarterRisks.push(isEn
    ? `${openReview} review queue item(s) remain open${overdueReview > 0 ? `, ${overdueReview} overdue` : ''}.`
    : `${openReview} item(ns) na fila de revisao seguem abertos${overdueReview > 0 ? `, ${overdueReview} atrasado(s)` : ''}.`);
  if (toNumber(quality.percentNaoIdentificado) >= 18 || toNumber(quality.percentIndefinido) >= 18) quarterRisks.push(isEn
    ? 'Classification quality indicates high not-identified/undefined volume.'
    : 'Qualidade da classificacao indica volume elevado de nao identificado/indefinido.');
  if (!quarterRisks.length) {
    quarterRisks.push(isEn ? 'No structural quarterly risk spike identified.' : 'Sem pico de risco estrutural no trimestre.');
  }

  const recommendedActions = [];
  if (topEquipment && topCause) recommendedActions.push(isEn
    ? `Assign owner, reduction target, and track this risk in the next operational cycle for ${topEquipment.equipment} (focus: ${topCause.label}).`
    : `Definir responsavel, meta de reducao e acompanhar este risco no proximo ciclo operacional para ${topEquipment.equipment} (foco: ${topCause.label}).`);
  if (openReview > 0) recommendedActions.push(isEn
    ? 'Run weekly governance cycle to close review queue with owner and due date.'
    : 'Executar ciclo semanal de governanca para fechar fila de revisao com dono e prazo.');
  if (toNumber(quality.avgConfidencePct) < 70) recommendedActions.push(isEn
    ? 'Standardize technical report fields to improve taxonomy confidence.'
    : 'Padronizar campos do laudo tecnico para elevar confianca da taxonomia.');
  if (!recommendedActions.length) {
    recommendedActions.push(isEn
      ? 'Keep operating rhythm and monitor monthly concentration indicators.'
      : 'Manter cadencia operacional e acompanhar indicadores mensais de concentracao.');
  }

  const humanReviewPoints = toExportList(reviewQueue.openItems, item => `${item.code || '-'} | ${item.priority || 'medium'} | ${item.reviewReason || ''}`, 8);
  if (!humanReviewPoints.length) {
    humanReviewPoints.push(isEn ? 'No pending human review trigger in the quarter.' : 'Sem gatilho pendente de revisao humana no trimestre.');
  }

  const dataQualityLimitations = [];
  if (toNumber(overview.sampleDays) < 12) dataQualityLimitations.push(isEn
    ? `Quarter sample still low (${toNumber(overview.sampleDays)} sampled day(s)).`
    : `Amostra trimestral ainda baixa (${toNumber(overview.sampleDays)} dia(s) amostrados).`);
  if (toNumber(quality.avgConfidencePct) < 70) dataQualityLimitations.push(isEn
    ? `Average confidence below 70% (${toNumber(quality.avgConfidencePct)}%).`
    : `Confianca media abaixo de 70% (${toNumber(quality.avgConfidencePct)}%).`);
  if (toNumber(quality.percentNaoIdentificado) > 0) dataQualityLimitations.push(isEn
    ? `${toNumber(quality.percentNaoIdentificado)}% not identified classifications.`
    : `${toNumber(quality.percentNaoIdentificado)}% de classificacoes nao identificadas.`);
  if (toNumber(quality.percentIndefinido) > 0) dataQualityLimitations.push(isEn
    ? `${toNumber(quality.percentIndefinido)}% undefined cause/outcome classifications.`
    : `${toNumber(quality.percentIndefinido)}% de causa/desfecho indefinido.`);
  if (!dataQualityLimitations.length) {
    dataQualityLimitations.push(isEn ? 'No critical data quality limitation detected.' : 'Sem limitacao critica de qualidade detectada.');
  }

  return {
    locale,
    generatedAt: nowIso(),
    executiveSummary,
    keyFindings: keyFindings.slice(0, 10),
    quarterRisks: quarterRisks.slice(0, 10),
    recommendedActions: recommendedActions.slice(0, 10),
    humanReviewPoints: humanReviewPoints.slice(0, 10),
    dataQualityLimitations: dataQualityLimitations.slice(0, 10)
  };
}

function buildQuarterlyExecutiveExport(bundleLike, localeRaw) {
  const bundle = (bundleLike && typeof bundleLike === 'object') ? bundleLike : {};
  const locale = detectLocale(localeRaw || bundle.locale);
  const quarterKey = normalizeQuarterKey(bundle.quarterKey) || quarterKeyFromMonthKey(getLocalISODate(new Date()).slice(0, 7));
  const monthKeys = Array.isArray(bundle.monthKeys) && bundle.monthKeys.length
    ? bundle.monthKeys
    : buildQuarterMonthKeys(quarterKey);
  const monthlyBundlesRaw = Array.isArray(bundle.monthlyBundles) ? bundle.monthlyBundles : [];
  const monthMap = new Map();
  monthlyBundlesRaw.forEach(monthBundleRaw => {
    const monthBundle = (monthBundleRaw && typeof monthBundleRaw === 'object') ? monthBundleRaw : {};
    const monthKey = toText(monthBundle.monthKey || monthBundle.executiveMonthly?.period?.month || '').slice(0, 7);
    if (monthKey) monthMap.set(monthKey, monthBundle);
  });

  const periodMonths = monthKeys.map(monthKey => {
    const monthBundle = monthMap.get(monthKey) || {};
    const em = (monthBundle.executiveMonthly && typeof monthBundle.executiveMonthly === 'object')
      ? monthBundle.executiveMonthly
      : {};
    const period = (em.period && typeof em.period === 'object') ? em.period : {};
    const overview = (em.overview && typeof em.overview === 'object') ? em.overview : {};
    const quality = (em.quality && typeof em.quality === 'object') ? em.quality : {};
    const reviewQueue = (em.reviewQueue && typeof em.reviewQueue === 'object') ? em.reviewQueue : {};
    return {
      month: monthKey,
      label: toText(period.label || formatMonthKeyLabel(monthKey, locale)),
      referenceDate: normalizeDateKey(period.referenceDate || monthBundle.dateKey || '') || '',
      sampleDays: Math.max(0, toNumber(period.sampleDays)),
      totalOs: Math.max(0, toNumber(overview.totalOs)),
      classificationQuality: toText(quality.classificationQuality || 'low'),
      avgConfidencePct: Math.round(toNumber(quality.avgConfidencePct) * 100) / 100,
      coveragePct: Math.round(toNumber(quality.coveragePct) * 100) / 100,
      percentNaoIdentificado: Math.round(toNumber(quality.percentNaoIdentificado) * 100) / 100,
      percentIndefinido: Math.round(toNumber(quality.percentIndefinido) * 100) / 100,
      reviewOpen: Math.max(0, toNumber(reviewQueue.open)),
      reviewOverdue: Math.max(0, toNumber(reviewQueue.overdue))
    };
  });

  const monthsWithData = periodMonths.filter(row => row.totalOs > 0 || row.sampleDays > 0).length;
  const totalOs = periodMonths.reduce((acc, row) => acc + Math.max(0, toNumber(row.totalOs)), 0);
  const sampleDays = periodMonths.reduce((acc, row) => acc + Math.max(0, toNumber(row.sampleDays)), 0);
  const qualityWeightTotal = periodMonths.reduce((acc, row) => acc + Math.max(1, toNumber(row.totalOs) || toNumber(row.sampleDays)), 0);
  const avgConfidencePct = qualityWeightTotal
    ? Math.round((periodMonths.reduce((acc, row) => acc + (toNumber(row.avgConfidencePct) * Math.max(1, toNumber(row.totalOs) || toNumber(row.sampleDays))), 0) / qualityWeightTotal) * 100) / 100
    : 0;
  const coveragePct = qualityWeightTotal
    ? Math.round((periodMonths.reduce((acc, row) => acc + (toNumber(row.coveragePct) * Math.max(1, toNumber(row.totalOs) || toNumber(row.sampleDays))), 0) / qualityWeightTotal) * 100) / 100
    : 0;
  const percentNaoIdentificado = qualityWeightTotal
    ? Math.round((periodMonths.reduce((acc, row) => acc + (toNumber(row.percentNaoIdentificado) * Math.max(1, toNumber(row.totalOs) || toNumber(row.sampleDays))), 0) / qualityWeightTotal) * 100) / 100
    : 0;
  const percentIndefinido = qualityWeightTotal
    ? Math.round((periodMonths.reduce((acc, row) => acc + (toNumber(row.percentIndefinido) * Math.max(1, toNumber(row.totalOs) || toNumber(row.sampleDays))), 0) / qualityWeightTotal) * 100) / 100
    : 0;

  const serviceTypeCounter = new Map();
  const warrantyStatusCounter = new Map();
  const warrantyTypeCounter = new Map();
  const probableCauseCounter = new Map();
  const outcomeCounter = new Map();
  const produtoTopCounter = new Map();
  const equipmentCounter = new Map();
  const technicianCounter = new Map();
  const locationCounter = new Map();
  const axisQualityMap = new Map();
  const queueByStatus = { novo: 0, em_revisao: 0, ajustado: 0, validado: 0, encerrado: 0, descartado: 0 };
  const queueByPriority = { critical: 0, high: 0, medium: 0, low: 0 };
  const reviewQueueOpenMap = new Map();

  let reworkCount = 0;
  let criticalCount = 0;
  let recordsWithAlert = 0;
  let financialRiskEstimated = 0;
  let queueTotal = 0;
  let queueOpenFromSummary = 0;
  let queueOverdueFromSummary = 0;
  let requiresHumanReview = false;

  for (const monthBundleRaw of monthlyBundlesRaw) {
    const monthBundle = (monthBundleRaw && typeof monthBundleRaw === 'object') ? monthBundleRaw : {};
    const em = (monthBundle.executiveMonthly && typeof monthBundle.executiveMonthly === 'object')
      ? monthBundle.executiveMonthly
      : {};
    const overview = (em.overview && typeof em.overview === 'object') ? em.overview : {};
    const quality = (em.quality && typeof em.quality === 'object') ? em.quality : {};
    const reviewQueue = (em.reviewQueue && typeof em.reviewQueue === 'object') ? em.reviewQueue : {};
    const monthKey = toText(em?.period?.month || monthBundle.monthKey || '');

    reworkCount += Math.max(0, toNumber(overview.reworkCount));
    criticalCount += Math.max(0, toNumber(overview.criticalCount));
    recordsWithAlert += Math.max(0, toNumber(overview.recordsWithAlert));
    financialRiskEstimated += Math.max(0, toNumber(overview.financialRiskEstimated));
    queueTotal += Math.max(0, toNumber(reviewQueue.total));
    queueOpenFromSummary += Math.max(0, toNumber(reviewQueue.open));
    queueOverdueFromSummary += Math.max(0, toNumber(reviewQueue.overdue));
    if (reviewQueue.requiresHumanReview === true) requiresHumanReview = true;

    addCountToMap(produtoTopCounter, normalizeKey(overview.produtoTop || ''), Math.max(0, toNumber(overview.totalOs)));

    toExportList(em?.mix?.serviceType, item => item, 100).forEach(item => addCountToMap(serviceTypeCounter, item.key || item.label, item.count));
    toExportList(em?.mix?.warrantyStatus, item => item, 100).forEach(item => addCountToMap(warrantyStatusCounter, item.key || item.label, item.count));
    toExportList(em?.mix?.warrantyType, item => item, 100).forEach(item => addCountToMap(warrantyTypeCounter, item.key || item.label, item.count));
    toExportList(em?.rankings?.topProbableCause, item => item, 200).forEach(item => addCountToMap(probableCauseCounter, item.key || item.label, item.count));
    toExportList(em?.rankings?.topOutcome, item => item, 200).forEach(item => addCountToMap(outcomeCounter, item.key || item.label, item.count));

    toExportList(em?.rankings?.topEquipment, item => item, 200).forEach(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      const equipment = toText(item.equipment || '');
      const equipmentKey = normalizeKey(equipment || 'nao_identificado');
      const total = Math.max(0, toNumber(item.totalOs));
      if (!total) return;
      const current = equipmentCounter.get(equipmentKey) || {
        equipment: equipment || translateTaxonomyKey('nao_identificado', locale),
        totalOs: 0,
        confidenceWeighted: 0,
        confidenceWeight: 0,
        causeCounter: new Map(),
        outcomeCounter: new Map()
      };
      current.totalOs += total;
      current.confidenceWeighted += Math.max(0, toNumber(item.confidenceAvgPct)) * total;
      current.confidenceWeight += total;
      if (item?.topCause?.key) addCountToMap(current.causeCounter, item.topCause.key, total);
      if (item?.topOutcome?.key) addCountToMap(current.outcomeCounter, item.topOutcome.key, total);
      equipmentCounter.set(equipmentKey, current);
    });

    toExportList(em?.rankings?.technicianConcentration, item => item, 200).forEach(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      const technician = toText(item.technician || '');
      const techKey = normalizeKey(technician || 'nao_identificado');
      const total = Math.max(0, toNumber(item.totalOs));
      if (!total) return;
      const current = technicianCounter.get(techKey) || {
        technician: technician || (locale === 'en-US' ? 'Not identified technician' : 'Tecnico nao identificado'),
        totalOs: 0,
        confidenceWeighted: 0,
        confidenceWeight: 0,
        serviceTypeCounter: new Map(),
        outcomeCounter: new Map()
      };
      current.totalOs += total;
      current.confidenceWeighted += Math.max(0, toNumber(item.confidenceAvgPct)) * total;
      current.confidenceWeight += total;
      if (item?.topServiceType?.key) addCountToMap(current.serviceTypeCounter, item.topServiceType.key, total);
      if (item?.topOutcome?.key) addCountToMap(current.outcomeCounter, item.topOutcome.key, total);
      technicianCounter.set(techKey, current);
    });

    toExportList(em?.rankings?.locationConcentration, item => item, 200).forEach(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      const location = toText(item.location || '');
      const locationKey = normalizeKey(location || 'nao_identificado');
      const total = Math.max(0, toNumber(item.totalOs));
      if (!total) return;
      const current = locationCounter.get(locationKey) || {
        location: location || (locale === 'en-US' ? 'Not identified location' : 'Local nao identificado'),
        totalOs: 0,
        confidenceWeighted: 0,
        confidenceWeight: 0,
        causeCounter: new Map()
      };
      current.totalOs += total;
      current.confidenceWeighted += Math.max(0, toNumber(item.confidenceAvgPct)) * total;
      current.confidenceWeight += total;
      if (item?.topCause?.key) addCountToMap(current.causeCounter, item.topCause.key, total);
      locationCounter.set(locationKey, current);
    });

    Object.entries((quality.axisQuality && typeof quality.axisQuality === 'object') ? quality.axisQuality : {}).forEach(([axis, rowRaw]) => {
      const axisKey = normalizeKey(axis || '');
      if (!axisKey) return;
      const row = (rowRaw && typeof rowRaw === 'object') ? rowRaw : {};
      const axisCurrent = axisQualityMap.get(axisKey) || {};
      Object.entries(row).forEach(([metricKeyRaw, valueRaw]) => {
        const metricKey = normalizeKey(metricKeyRaw || '');
        if (!metricKey) return;
        const numeric = toNumber(valueRaw);
        if (!Number.isFinite(numeric)) return;
        const currentMetric = axisCurrent[metricKey] || { weighted: 0, weight: 0 };
        const weight = Math.max(1, Math.max(0, toNumber(overview.totalOs)) || Math.max(0, toNumber(overview.sampleDays)));
        currentMetric.weighted += numeric * weight;
        currentMetric.weight += weight;
        axisCurrent[metricKey] = currentMetric;
      });
      axisQualityMap.set(axisKey, axisCurrent);
    });

    Object.entries((reviewQueue.byStatus && typeof reviewQueue.byStatus === 'object') ? reviewQueue.byStatus : {}).forEach(([statusKey, count]) => {
      const normalizedStatus = normalizeReviewWorkflowStatus(statusKey || 'novo');
      queueByStatus[normalizedStatus] = toNumber(queueByStatus[normalizedStatus]) + Math.max(0, toNumber(count));
    });
    Object.entries((reviewQueue.byPriority && typeof reviewQueue.byPriority === 'object') ? reviewQueue.byPriority : {}).forEach(([priorityKey, count]) => {
      const normalizedPriority = normalizeReviewWorkflowPriority(priorityKey || 'medium');
      queueByPriority[normalizedPriority] = toNumber(queueByPriority[normalizedPriority]) + Math.max(0, toNumber(count));
    });

    toExportList(reviewQueue.openItems, item => item, 200).forEach(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      const status = normalizeReviewWorkflowStatus(item.status || 'novo');
      if (status === 'encerrado' || status === 'descartado') return;
      const workflowId = toText(item.workflowId || '');
      const code = toText(item.code || '');
      const dedupeKey = workflowId || `${monthKey}::${code}::${toText(item.reviewReason || '')}::${toText(item.dueAt || '')}`;
      const candidate = {
        workflowId,
        code,
        priority: normalizeReviewWorkflowPriority(item.priority || 'medium'),
        status,
        reviewReason: toText(item.reviewReason || ''),
        impact: toText(item.impact || ''),
        recommendedReviewer: toText(item.recommendedReviewer || ''),
        dueAt: normalizeReviewWorkflowDateTime(item.dueAt || '') || '',
        lastAction: toText(item.lastAction || ''),
        lastActionAt: normalizeReviewWorkflowDateTime(item.lastActionAt || '') || '',
        historyPreview: Array.isArray(item.historyPreview) ? item.historyPreview.slice(0, 2) : [],
        month: monthKey
      };
      const existing = reviewQueueOpenMap.get(dedupeKey);
      if (!existing) {
        reviewQueueOpenMap.set(dedupeKey, candidate);
      } else {
        const existingTs = Date.parse(toText(existing.lastActionAt || '')) || 0;
        const candidateTs = Date.parse(toText(candidate.lastActionAt || '')) || 0;
        if (candidateTs >= existingTs) reviewQueueOpenMap.set(dedupeKey, candidate);
      }
    });
  }

  const serviceType = Array.from(serviceTypeCounter.entries())
    .map(([key, count]) => ({ key, label: translateTaxonomyKey(key, locale), count, ratePct: Math.round(pct(count, totalOs) * 100) / 100 }))
    .sort((a, b) => b.count - a.count || b.ratePct - a.ratePct || a.label.localeCompare(b.label))
    .slice(0, 8);
  const warrantyStatus = Array.from(warrantyStatusCounter.entries())
    .map(([key, count]) => ({ key, label: translateTaxonomyKey(key, locale), count, ratePct: Math.round(pct(count, totalOs) * 100) / 100 }))
    .sort((a, b) => b.count - a.count || b.ratePct - a.ratePct || a.label.localeCompare(b.label))
    .slice(0, 6);
  const warrantyType = Array.from(warrantyTypeCounter.entries())
    .map(([key, count]) => ({ key, label: translateTaxonomyKey(key, locale), count, ratePct: Math.round(pct(count, totalOs) * 100) / 100 }))
    .sort((a, b) => b.count - a.count || b.ratePct - a.ratePct || a.label.localeCompare(b.label))
    .slice(0, 6);
  const topProbableCause = Array.from(probableCauseCounter.entries())
    .map(([key, count]) => ({ key, label: translateTaxonomyKey(key, locale), count, ratePct: Math.round(pct(count, totalOs) * 100) / 100 }))
    .sort((a, b) => b.count - a.count || b.ratePct - a.ratePct || a.label.localeCompare(b.label))
    .slice(0, 8);
  const topOutcome = Array.from(outcomeCounter.entries())
    .map(([key, count]) => ({ key, label: translateTaxonomyKey(key, locale), count, ratePct: Math.round(pct(count, totalOs) * 100) / 100 }))
    .sort((a, b) => b.count - a.count || b.ratePct - a.ratePct || a.label.localeCompare(b.label))
    .slice(0, 8);

  const topEquipment = Array.from(equipmentCounter.values())
    .map(row => ({
      equipment: row.equipment,
      totalOs: Math.max(0, toNumber(row.totalOs)),
      sharePct: Math.round(pct(toNumber(row.totalOs), totalOs) * 100) / 100,
      confidenceAvgPct: row.confidenceWeight ? Math.round((row.confidenceWeighted / row.confidenceWeight) * 100) / 100 : 0,
      topCause: topCounterEntry(row.causeCounter, locale, row.totalOs),
      topOutcome: topCounterEntry(row.outcomeCounter, locale, row.totalOs)
    }))
    .filter(row => row.totalOs > 0)
    .sort((a, b) => b.totalOs - a.totalOs || b.sharePct - a.sharePct || a.equipment.localeCompare(b.equipment))
    .slice(0, 10);

  const technicianConcentration = Array.from(technicianCounter.values())
    .map(row => ({
      technician: row.technician,
      totalOs: Math.max(0, toNumber(row.totalOs)),
      sharePct: Math.round(pct(toNumber(row.totalOs), totalOs) * 100) / 100,
      confidenceAvgPct: row.confidenceWeight ? Math.round((row.confidenceWeighted / row.confidenceWeight) * 100) / 100 : 0,
      topServiceType: topCounterEntry(row.serviceTypeCounter, locale, row.totalOs),
      topOutcome: topCounterEntry(row.outcomeCounter, locale, row.totalOs)
    }))
    .filter(row => row.totalOs > 0)
    .sort((a, b) => b.totalOs - a.totalOs || b.sharePct - a.sharePct || a.technician.localeCompare(b.technician))
    .slice(0, 10);

  const locationConcentration = Array.from(locationCounter.values())
    .map(row => ({
      location: row.location,
      totalOs: Math.max(0, toNumber(row.totalOs)),
      sharePct: Math.round(pct(toNumber(row.totalOs), totalOs) * 100) / 100,
      confidenceAvgPct: row.confidenceWeight ? Math.round((row.confidenceWeighted / row.confidenceWeight) * 100) / 100 : 0,
      topCause: topCounterEntry(row.causeCounter, locale, row.totalOs)
    }))
    .filter(row => row.totalOs > 0)
    .sort((a, b) => b.totalOs - a.totalOs || b.sharePct - a.sharePct || a.location.localeCompare(b.location))
    .slice(0, 10);

  const axisQuality = {};
  axisQualityMap.forEach((axisValues, axisKey) => {
    axisQuality[axisKey] = {};
    Object.entries(axisValues).forEach(([metricKey, payload]) => {
      const metric = (payload && typeof payload === 'object') ? payload : {};
      const weight = Math.max(0, toNumber(metric.weight));
      const weighted = Math.max(0, toNumber(metric.weighted));
      axisQuality[axisKey][metricKey] = weight > 0 ? Math.round((weighted / weight) * 100) / 100 : 0;
    });
  });

  const reviewQueueOpenItems = sortReviewQueueForExecutive(Array.from(reviewQueueOpenMap.values()))
    .slice(0, 20)
    .map(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      return {
        workflowId: toText(item.workflowId || ''),
        code: toText(item.code || ''),
        priority: normalizeReviewWorkflowPriority(item.priority || 'medium'),
        status: normalizeReviewWorkflowStatus(item.status || 'novo'),
        reviewReason: toText(item.reviewReason || ''),
        impact: toText(item.impact || ''),
        recommendedReviewer: toText(item.recommendedReviewer || ''),
        dueAt: normalizeReviewWorkflowDateTime(item.dueAt || '') || '',
        lastAction: toText(item.lastAction || ''),
        lastActionAt: normalizeReviewWorkflowDateTime(item.lastActionAt || '') || '',
        historyPreview: Array.isArray(item.historyPreview) ? item.historyPreview.slice(0, 2) : [],
        month: toText(item.month || '')
      };
    });

  if (!queueByPriority.critical && !queueByPriority.high && !queueByPriority.medium && !queueByPriority.low && reviewQueueOpenItems.length) {
    reviewQueueOpenItems.forEach(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      const level = normalizeReviewWorkflowPriority(item.priority || 'medium');
      queueByPriority[level] = toNumber(queueByPriority[level]) + 1;
    });
  }

  const nowMs = Date.now();
  const queueOpen = reviewQueueOpenItems.length || Math.max(0, queueOpenFromSummary);
  const queueOverdue = reviewQueueOpenItems.filter(item => {
    const dueMs = Date.parse(toText(item.dueAt || '')) || 0;
    if (!dueMs) return false;
    const status = normalizeReviewWorkflowStatus(item.status || 'novo');
    return status !== 'encerrado' && status !== 'descartado' && dueMs < nowMs;
  }).length || Math.max(0, queueOverdueFromSummary);
  const nextDueAt = reviewQueueOpenItems
    .map(item => normalizeReviewWorkflowDateTime(item.dueAt || ''))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)))[0] || '';

  const qualityLevel = normalizeQuarterlyQualityLevel(
    avgConfidencePct,
    coveragePct,
    percentNaoIdentificado,
    percentIndefinido,
    periodMonths.map(item => item.classificationQuality)
  );

  const referenceDate = normalizeDateKey(bundle.referenceDate || periodMonths.map(row => row.referenceDate).filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || '')
    || getQuarterReferenceDateKey(quarterKey)
    || getLocalISODate(new Date());
  const quarterLabel = formatQuarterKeyLabel(quarterKey, locale);
  const produtoTop = (() => {
    const firstEquipment = topEquipment[0]?.equipment || '';
    if (firstEquipment) return firstEquipment;
    let best = '';
    let bestCount = 0;
    produtoTopCounter.forEach((count, key) => {
      if (count > bestCount) {
        bestCount = count;
        best = key;
      }
    });
    return best ? String(best).replace(/_/g, ' ') : '';
  })();

  const executivePayload = {
    version: 'v1',
    locale,
    generatedAt: nowIso(),
    period: {
      quarter: quarterKey,
      label: quarterLabel,
      referenceDate,
      sampleDays,
      totalOs,
      monthsWithData,
      months: periodMonths
    },
    overview: {
      totalOs,
      sampleDays,
      monthsWithData,
      reworkCount,
      reworkRatePct: Math.round(pct(reworkCount, totalOs) * 100) / 100,
      criticalCount,
      criticalRatePct: Math.round(pct(criticalCount, totalOs) * 100) / 100,
      recordsWithAlert,
      financialRiskEstimated: Math.round(financialRiskEstimated * 100) / 100,
      produtoTop: toText(produtoTop || '')
    },
    mix: {
      serviceType,
      warrantyStatus,
      warrantyType
    },
    rankings: {
      topEquipment,
      topProbableCause,
      topOutcome,
      technicianConcentration,
      locationConcentration
    },
    quality: {
      classificationQuality: qualityLevel,
      avgConfidencePct,
      coveragePct,
      percentNaoIdentificado,
      percentIndefinido,
      axisQuality
    },
    reviewQueue: {
      total: Math.max(queueTotal, queueOpen),
      open: queueOpen,
      overdue: queueOverdue,
      highestPriority: resolveReviewQueueHighestPriority(queueByPriority),
      nextDueAt,
      byStatus: queueByStatus,
      byPriority: queueByPriority,
      requiresHumanReview: requiresHumanReview || queueOpen > 0,
      openItems: reviewQueueOpenItems
    }
  };

  executivePayload.narrative = buildQuarterlyExecutiveNarrative(executivePayload, locale);
  executivePayload.exportReady = {
    schema: 'quarterly_executive_export_v1',
    generatedAt: executivePayload.generatedAt,
    locale,
    period: executivePayload.period,
    sections: [
      { id: 'overview', title: locale === 'en-US' ? 'Executive quarterly overview' : 'Resumo executivo trimestral' },
      { id: 'mix', title: locale === 'en-US' ? 'Service and warranty mix' : 'Mix de atendimento e garantia' },
      { id: 'rankings', title: locale === 'en-US' ? 'Concentration rankings' : 'Rankings de concentracao' },
      { id: 'risks', title: locale === 'en-US' ? 'Risk and governance' : 'Risco e governanca' },
      { id: 'narrative', title: locale === 'en-US' ? 'Executive narrative' : 'Narrativa executiva' }
    ],
    tables: {
      months: executivePayload.period.months,
      serviceType: executivePayload.mix.serviceType,
      warrantyStatus: executivePayload.mix.warrantyStatus,
      warrantyType: executivePayload.mix.warrantyType,
      topEquipment: executivePayload.rankings.topEquipment,
      topProbableCause: executivePayload.rankings.topProbableCause,
      topOutcome: executivePayload.rankings.topOutcome,
      technicianConcentration: executivePayload.rankings.technicianConcentration,
      locationConcentration: executivePayload.rankings.locationConcentration,
      reviewQueue: executivePayload.reviewQueue.openItems
    },
    suggestedFiles: {
      pdf: `relatorio_executivo_trimestral_${quarterKey}.pdf`,
      excel: `relatorio_executivo_trimestral_${quarterKey}.xlsx`,
      json: `relatorio_executivo_trimestral_${quarterKey}.json`
    }
  };

  return executivePayload;
}

function buildExecutiveQuarterlyPdfLines(executiveQuarterlyLike, contextLike) {
  const eq = (executiveQuarterlyLike && typeof executiveQuarterlyLike === 'object') ? executiveQuarterlyLike : {};
  const context = (contextLike && typeof contextLike === 'object') ? contextLike : {};
  const locale = detectLocale(eq.locale || context.locale);
  const isEn = locale === 'en-US';
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const period = (eq.period && typeof eq.period === 'object') ? eq.period : {};
  const overview = (eq.overview && typeof eq.overview === 'object') ? eq.overview : {};
  const quality = (eq.quality && typeof eq.quality === 'object') ? eq.quality : {};
  const reviewQueue = (eq.reviewQueue && typeof eq.reviewQueue === 'object') ? eq.reviewQueue : {};
  const narrative = (eq.narrative && typeof eq.narrative === 'object') ? eq.narrative : {};
  const org = readOrganizationConfig();

  const lines = [];
  lines.push(isEn ? 'QUARTERLY EXECUTIVE REPORT - OPERATIONAL COCKPIT' : 'RELATORIO EXECUTIVO TRIMESTRAL - COCKPIT OPERACIONAL');
  lines.push(isEn ? `Company: ${org.companyName || 'Tagus-Tec'} | Unit: ${org.unitName || 'Campinas'}` : `Empresa: ${org.companyName || 'Tagus-Tec'} | Unidade: ${org.unitName || 'Campinas'}`);
  lines.push(isEn ? `Quarter: ${period.label || period.quarter || ''} | Reference date: ${period.referenceDate || ''}` : `Trimestre: ${period.label || period.quarter || ''} | Data de referencia: ${period.referenceDate || ''}`);
  lines.push(isEn ? `Generated at: ${eq.generatedAt || ''}` : `Gerado em: ${eq.generatedAt || ''}`);
  lines.push('');

  lines.push(isEn ? '1) QUARTER OVERVIEW' : '1) OVERVIEW DO TRIMESTRE');
  lines.push(isEn
    ? `Total WO: ${nf.format(toNumber(overview.totalOs))} | Sampled days: ${nf.format(toNumber(overview.sampleDays))} | Months with data: ${nf.format(toNumber(overview.monthsWithData))}`
    : `Total de O.S.: ${nf.format(toNumber(overview.totalOs))} | Dias amostrados: ${nf.format(toNumber(overview.sampleDays))} | Meses com base: ${nf.format(toNumber(overview.monthsWithData))}`);
  lines.push(isEn
    ? `Rework: ${nf.format(toNumber(overview.reworkCount))} (${nf.format(toNumber(overview.reworkRatePct))}%) | Critical events: ${nf.format(toNumber(overview.criticalCount))} (${nf.format(toNumber(overview.criticalRatePct))}%)`
    : `Retrabalho: ${nf.format(toNumber(overview.reworkCount))} (${nf.format(toNumber(overview.reworkRatePct))}%) | Eventos criticos: ${nf.format(toNumber(overview.criticalCount))} (${nf.format(toNumber(overview.criticalRatePct))}%)`);
  lines.push(isEn
    ? `Records with alert: ${nf.format(toNumber(overview.recordsWithAlert))} | Estimated financial risk: ${nf.format(toNumber(overview.financialRiskEstimated))}`
    : `Registros com alerta: ${nf.format(toNumber(overview.recordsWithAlert))} | Risco financeiro estimado: ${nf.format(toNumber(overview.financialRiskEstimated))}`);
  if (overview.produtoTop) lines.push(isEn ? `Most incident equipment: ${overview.produtoTop}` : `Equipamento mais incidente: ${overview.produtoTop}`);
  lines.push('');

  lines.push(isEn ? '2) MONTH BREAKDOWN' : '2) QUEBRA MENSAL');
  const monthRows = Array.isArray(period.months) ? period.months : [];
  (monthRows.length ? monthRows : [{ label: isEn ? 'No data' : 'Sem dados', totalOs: 0, sampleDays: 0, classificationQuality: 'low' }])
    .slice(0, 6)
    .forEach(rowRaw => {
      const row = (rowRaw && typeof rowRaw === 'object') ? rowRaw : {};
      lines.push(` - ${row.label || row.month || '-'} | OS: ${nf.format(toNumber(row.totalOs))} | Days: ${nf.format(toNumber(row.sampleDays))} | Quality: ${row.classificationQuality || 'low'}`);
    });
  lines.push('');

  lines.push(isEn ? '3) MAIN MIX' : '3) MIX PRINCIPAL');
  const serviceType = toExportList(eq?.mix?.serviceType, item => `${item.label || item.key || ''}: ${nf.format(toNumber(item.count))} (${nf.format(toNumber(item.ratePct))}%)`, 6);
  const warrantyStatus = toExportList(eq?.mix?.warrantyStatus, item => `${item.label || item.key || ''}: ${nf.format(toNumber(item.count))} (${nf.format(toNumber(item.ratePct))}%)`, 6);
  lines.push(isEn ? 'Service type:' : 'Tipo de atendimento:');
  (serviceType.length ? serviceType : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Warranty status:' : 'Status de garantia:');
  (warrantyStatus.length ? warrantyStatus : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push('');

  lines.push(isEn ? '4) MAIN RANKINGS' : '4) RANKINGS PRINCIPAIS');
  lines.push(isEn ? 'Top equipment:' : 'Top equipamentos:');
  const topEquipment = toExportList(eq?.rankings?.topEquipment, item => `${item.equipment || '-'} | WO: ${nf.format(toNumber(item.totalOs))} | Share: ${nf.format(toNumber(item.sharePct))}%`, 8);
  (topEquipment.length ? topEquipment : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Top probable causes:' : 'Top causas provaveis:');
  const topCause = toExportList(eq?.rankings?.topProbableCause, item => `${item.label || item.key || ''}: ${nf.format(toNumber(item.count))} (${nf.format(toNumber(item.ratePct))}%)`, 8);
  (topCause.length ? topCause : [isEn ? 'No data' : 'Sem dados']).forEach(text => lines.push(` - ${text}`));
  lines.push('');

  lines.push(isEn ? '5) CLASSIFICATION QUALITY' : '5) QUALIDADE DA CLASSIFICACAO');
  lines.push(isEn
    ? `Level: ${quality.classificationQuality || 'n/a'} | Avg confidence: ${nf.format(toNumber(quality.avgConfidencePct))}% | Coverage: ${nf.format(toNumber(quality.coveragePct))}%`
    : `Nivel: ${quality.classificationQuality || 'n/a'} | Confianca media: ${nf.format(toNumber(quality.avgConfidencePct))}% | Cobertura: ${nf.format(toNumber(quality.coveragePct))}%`);
  lines.push(isEn
    ? `Not identified: ${nf.format(toNumber(quality.percentNaoIdentificado))}% | Undefined: ${nf.format(toNumber(quality.percentIndefinido))}%`
    : `Nao identificado: ${nf.format(toNumber(quality.percentNaoIdentificado))}% | Indefinido: ${nf.format(toNumber(quality.percentIndefinido))}%`);
  lines.push('');

  lines.push(isEn ? '6) REVIEW QUEUE (QUARTER)' : '6) REVIEW QUEUE (TRIMESTRE)');
  lines.push(isEn
    ? `Total: ${nf.format(toNumber(reviewQueue.total))} | Open: ${nf.format(toNumber(reviewQueue.open))} | Overdue: ${nf.format(toNumber(reviewQueue.overdue))} | Highest priority: ${reviewQueue.highestPriority || 'none'}`
    : `Total: ${nf.format(toNumber(reviewQueue.total))} | Abertos: ${nf.format(toNumber(reviewQueue.open))} | Atrasados: ${nf.format(toNumber(reviewQueue.overdue))} | Maior prioridade: ${reviewQueue.highestPriority || 'none'}`);
  const openItems = toExportList(reviewQueue.openItems, item => `${item.code || '-'} | ${item.priority || 'medium'} | ${item.status || 'novo'} | ${item.reviewReason || ''}`, 10);
  (openItems.length ? openItems : [isEn ? 'No open review items' : 'Sem itens abertos']).forEach(text => lines.push(` - ${text}`));
  lines.push('');

  lines.push(isEn ? '7) EXECUTIVE NARRATIVE' : '7) NARRATIVA EXECUTIVA');
  lines.push(` - ${narrative.executiveSummary || (isEn ? 'No summary available.' : 'Sem resumo disponivel.')}`);
  lines.push(isEn ? 'Key findings:' : 'Principais achados:');
  (Array.isArray(narrative.keyFindings) && narrative.keyFindings.length ? narrative.keyFindings : [isEn ? 'No findings listed.' : 'Sem achados listados.'])
    .slice(0, 10)
    .forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Quarter risks:' : 'Riscos do trimestre:');
  (Array.isArray(narrative.quarterRisks) && narrative.quarterRisks.length ? narrative.quarterRisks : [isEn ? 'No risks listed.' : 'Sem riscos listados.'])
    .slice(0, 10)
    .forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Recommended actions:' : 'Acoes recomendadas:');
  (Array.isArray(narrative.recommendedActions) && narrative.recommendedActions.length ? narrative.recommendedActions : [isEn ? 'No action listed.' : 'Sem acao listada.'])
    .slice(0, 10)
    .forEach(text => lines.push(` - ${text}`));
  lines.push(isEn ? 'Data quality limitations:' : 'Limitacoes de qualidade de dado:');
  (Array.isArray(narrative.dataQualityLimitations) && narrative.dataQualityLimitations.length ? narrative.dataQualityLimitations : [isEn ? 'No limitation listed.' : 'Sem limitacao listada.'])
    .slice(0, 10)
    .forEach(text => lines.push(` - ${text}`));

  return lines;
}

function buildExecutiveQuarterlyExcelWorkbook(executiveQuarterlyLike, localeRaw) {
  if (!xlsxLib) throw new Error('Biblioteca xlsx indisponivel para exportacao Excel.');
  const eq = (executiveQuarterlyLike && typeof executiveQuarterlyLike === 'object') ? executiveQuarterlyLike : {};
  const locale = detectLocale(localeRaw || eq.locale);
  const wb = xlsxLib.utils.book_new();
  const addJsonSheet = (name, rowsLike) => {
    const rows = Array.isArray(rowsLike) && rowsLike.length ? rowsLike : [{ info: locale === 'en-US' ? 'No data' : 'Sem dados' }];
    const sheet = xlsxLib.utils.json_to_sheet(rows);
    xlsxLib.utils.book_append_sheet(wb, sheet, String(name || 'sheet').slice(0, 31));
  };

  const period = (eq.period && typeof eq.period === 'object') ? eq.period : {};
  const overview = (eq.overview && typeof eq.overview === 'object') ? eq.overview : {};
  const quality = (eq.quality && typeof eq.quality === 'object') ? eq.quality : {};
  const reviewQueue = (eq.reviewQueue && typeof eq.reviewQueue === 'object') ? eq.reviewQueue : {};
  const narrative = (eq.narrative && typeof eq.narrative === 'object') ? eq.narrative : {};

  addJsonSheet('overview', [
    { metric: 'quarter', value: period.quarter || '' },
    { metric: 'label', value: period.label || '' },
    { metric: 'referenceDate', value: period.referenceDate || '' },
    { metric: 'sampleDays', value: toNumber(period.sampleDays) },
    { metric: 'monthsWithData', value: toNumber(period.monthsWithData) },
    { metric: 'totalOs', value: toNumber(overview.totalOs) },
    { metric: 'reworkCount', value: toNumber(overview.reworkCount) },
    { metric: 'reworkRatePct', value: toNumber(overview.reworkRatePct) },
    { metric: 'criticalCount', value: toNumber(overview.criticalCount) },
    { metric: 'criticalRatePct', value: toNumber(overview.criticalRatePct) },
    { metric: 'recordsWithAlert', value: toNumber(overview.recordsWithAlert) },
    { metric: 'financialRiskEstimated', value: toNumber(overview.financialRiskEstimated) },
    { metric: 'produtoTop', value: overview.produtoTop || '' }
  ]);

  addJsonSheet('months', toExportList(period.months, item => ({
    month: item.month || '',
    label: item.label || '',
    referenceDate: item.referenceDate || '',
    sampleDays: toNumber(item.sampleDays),
    totalOs: toNumber(item.totalOs),
    classificationQuality: item.classificationQuality || '',
    avgConfidencePct: toNumber(item.avgConfidencePct),
    coveragePct: toNumber(item.coveragePct),
    percentNaoIdentificado: toNumber(item.percentNaoIdentificado),
    percentIndefinido: toNumber(item.percentIndefinido),
    reviewOpen: toNumber(item.reviewOpen),
    reviewOverdue: toNumber(item.reviewOverdue)
  }), 12));

  addJsonSheet('mix_serviceType', toExportList(eq?.mix?.serviceType, item => ({
    key: item.key || '',
    label: item.label || '',
    count: toNumber(item.count),
    ratePct: toNumber(item.ratePct)
  }), 400));

  addJsonSheet('warranty', [
    ...toExportList(eq?.mix?.warrantyStatus, item => ({
      category: 'status',
      key: item.key || '',
      label: item.label || '',
      count: toNumber(item.count),
      ratePct: toNumber(item.ratePct)
    }), 400),
    ...toExportList(eq?.mix?.warrantyType, item => ({
      category: 'type',
      key: item.key || '',
      label: item.label || '',
      count: toNumber(item.count),
      ratePct: toNumber(item.ratePct)
    }), 400)
  ]);

  addJsonSheet('top_equipment', toExportList(eq?.rankings?.topEquipment, item => ({
    equipment: item.equipment || '',
    totalOs: toNumber(item.totalOs),
    sharePct: toNumber(item.sharePct),
    confidenceAvgPct: toNumber(item.confidenceAvgPct),
    topCauseKey: item?.topCause?.key || '',
    topCauseLabel: item?.topCause?.label || '',
    topOutcomeKey: item?.topOutcome?.key || '',
    topOutcomeLabel: item?.topOutcome?.label || ''
  }), 400));

  addJsonSheet('probableCause', toExportList(eq?.rankings?.topProbableCause, item => ({
    key: item.key || '',
    label: item.label || '',
    count: toNumber(item.count),
    ratePct: toNumber(item.ratePct)
  }), 400));

  addJsonSheet('outcome', toExportList(eq?.rankings?.topOutcome, item => ({
    key: item.key || '',
    label: item.label || '',
    count: toNumber(item.count),
    ratePct: toNumber(item.ratePct)
  }), 400));

  addJsonSheet('technicianConcentration', toExportList(eq?.rankings?.technicianConcentration, item => ({
    technician: item.technician || '',
    totalOs: toNumber(item.totalOs),
    sharePct: toNumber(item.sharePct),
    confidenceAvgPct: toNumber(item.confidenceAvgPct),
    topServiceTypeKey: item?.topServiceType?.key || '',
    topServiceTypeLabel: item?.topServiceType?.label || '',
    topOutcomeKey: item?.topOutcome?.key || '',
    topOutcomeLabel: item?.topOutcome?.label || ''
  }), 400));

  addJsonSheet('locationConcentration', toExportList(eq?.rankings?.locationConcentration, item => ({
    location: item.location || '',
    totalOs: toNumber(item.totalOs),
    sharePct: toNumber(item.sharePct),
    confidenceAvgPct: toNumber(item.confidenceAvgPct),
    topCauseKey: item?.topCause?.key || '',
    topCauseLabel: item?.topCause?.label || ''
  }), 400));

  addJsonSheet('reviewQueue', [
    {
      type: 'summary',
      total: toNumber(reviewQueue.total),
      open: toNumber(reviewQueue.open),
      overdue: toNumber(reviewQueue.overdue),
      highestPriority: reviewQueue.highestPriority || '',
      nextDueAt: reviewQueue.nextDueAt || ''
    },
    ...toExportList(reviewQueue.openItems, item => ({
      type: 'item',
      workflowId: item.workflowId || '',
      code: item.code || '',
      month: item.month || '',
      priority: item.priority || '',
      status: item.status || '',
      reviewReason: item.reviewReason || '',
      impact: item.impact || '',
      recommendedReviewer: item.recommendedReviewer || '',
      dueAt: item.dueAt || '',
      lastAction: item.lastAction || '',
      lastActionAt: item.lastActionAt || ''
    }), 1200)
  ]);

  addJsonSheet('quality', [
    { metric: 'classificationQuality', value: quality.classificationQuality || '' },
    { metric: 'avgConfidencePct', value: toNumber(quality.avgConfidencePct) },
    { metric: 'coveragePct', value: toNumber(quality.coveragePct) },
    { metric: 'percentNaoIdentificado', value: toNumber(quality.percentNaoIdentificado) },
    { metric: 'percentIndefinido', value: toNumber(quality.percentIndefinido) },
    ...Object.entries((quality.axisQuality && typeof quality.axisQuality === 'object') ? quality.axisQuality : {}).map(([axis, values]) => {
      const row = (values && typeof values === 'object') ? values : {};
      return {
        metric: `axisQuality.${axis}`,
        value: JSON.stringify(row)
      };
    })
  ]);

  addJsonSheet('narrative', [
    { section: 'executiveSummary', text: narrative.executiveSummary || '' },
    ...toExportList(narrative.keyFindings, (item, index) => ({ section: 'keyFindings', order: index + 1, text: item || '' }), 100),
    ...toExportList(narrative.quarterRisks, (item, index) => ({ section: 'quarterRisks', order: index + 1, text: item || '' }), 100),
    ...toExportList(narrative.recommendedActions, (item, index) => ({ section: 'recommendedActions', order: index + 1, text: item || '' }), 100),
    ...toExportList(narrative.humanReviewPoints, (item, index) => ({ section: 'humanReviewPoints', order: index + 1, text: item || '' }), 100),
    ...toExportList(narrative.dataQualityLimitations, (item, index) => ({ section: 'dataQualityLimitations', order: index + 1, text: item || '' }), 100)
  ]);

  return wb;
}

function computeExecutiveQuarterlySignature(executiveQuarterlyLike) {
  const eq = (executiveQuarterlyLike && typeof executiveQuarterlyLike === 'object') ? executiveQuarterlyLike : {};
  const period = (eq.period && typeof eq.period === 'object') ? eq.period : {};
  const narrative = (eq.narrative && typeof eq.narrative === 'object') ? eq.narrative : {};
  const reviewQueue = (eq.reviewQueue && typeof eq.reviewQueue === 'object') ? eq.reviewQueue : {};
  const signatureBase = {
    period: {
      quarter: toText(period.quarter || ''),
      label: toText(period.label || ''),
      referenceDate: toText(period.referenceDate || ''),
      sampleDays: toNumber(period.sampleDays),
      totalOs: toNumber(period.totalOs),
      monthsWithData: toNumber(period.monthsWithData),
      months: Array.isArray(period.months) ? period.months : []
    },
    overview: eq.overview || {},
    mix: eq.mix || {},
    rankings: eq.rankings || {},
    quality: eq.quality || {},
    reviewQueue: {
      total: toNumber(reviewQueue.total),
      open: toNumber(reviewQueue.open),
      overdue: toNumber(reviewQueue.overdue),
      highestPriority: toText(reviewQueue.highestPriority || ''),
      nextDueAt: toText(reviewQueue.nextDueAt || ''),
      byStatus: reviewQueue.byStatus || {},
      byPriority: reviewQueue.byPriority || {},
      requiresHumanReview: reviewQueue.requiresHumanReview === true,
      openItems: Array.isArray(reviewQueue.openItems) ? reviewQueue.openItems : []
    },
    narrative: {
      executiveSummary: toText(narrative.executiveSummary || ''),
      keyFindings: Array.isArray(narrative.keyFindings) ? narrative.keyFindings : [],
      quarterRisks: Array.isArray(narrative.quarterRisks) ? narrative.quarterRisks : [],
      recommendedActions: Array.isArray(narrative.recommendedActions) ? narrative.recommendedActions : [],
      humanReviewPoints: Array.isArray(narrative.humanReviewPoints) ? narrative.humanReviewPoints : [],
      dataQualityLimitations: Array.isArray(narrative.dataQualityLimitations) ? narrative.dataQualityLimitations : []
    }
  };
  return crypto.createHash('sha256').update(JSON.stringify(signatureBase)).digest('hex');
}

async function buildQuarterlyExecutiveBundleForQuarter(quarterKeyLike, scopeLike, localeRaw, actorLike) {
  const org = readOrganizationConfig();
  const locale = detectLocale(localeRaw || org.localeDefault || 'pt-BR');
  const scope = normalizeStorageScope(scopeLike || org);
  const quarterKey = normalizeQuarterKey(quarterKeyLike)
    || quarterKeyFromMonthKey(getDateTimePartsInTimezone(new Date(), org.timezone || DEFAULT_ORG_CONFIG.timezone).monthKey)
    || quarterKeyFromMonthKey(getLocalISODate(new Date()).slice(0, 7));
  const monthKeys = buildQuarterMonthKeys(quarterKey);
  const tzParts = getDateTimePartsInTimezone(new Date(), org.timezone || DEFAULT_ORG_CONFIG.timezone);
  const currentMonth = tzParts.monthKey;

  const monthlyBundles = [];
  for (const monthKey of monthKeys) {
    const dateKey = monthKey === currentMonth ? tzParts.dateKey : getMonthLastDateKey(monthKey);
    if (!normalizeDateKey(dateKey)) continue;
    const monthBundle = await buildMonthlyExecutiveBundleForDate(dateKey, scope, locale, actorLike);
    monthlyBundles.push(monthBundle);
  }

  const executiveQuarterly = buildQuarterlyExecutiveExport({
    quarterKey,
    monthKeys,
    monthlyBundles,
    locale,
    scope,
    referenceDate: getQuarterReferenceDateKey(quarterKey)
  }, locale);

  return {
    quarterKey,
    scope,
    locale,
    monthKeys,
    monthlyBundles,
    executiveQuarterly
  };
}

async function generateExecutiveQuarterlyExports(quarterKeyLike, scopeLike, localeRaw, actorLike, optionsLike) {
  const opts = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
  const force = opts.force === true;
  const bundle = await buildQuarterlyExecutiveBundleForQuarter(quarterKeyLike, scopeLike, localeRaw, actorLike);
  const paths = buildExecutiveQuarterlyExportPaths(bundle.quarterKey, bundle.scope);
  const signature = computeExecutiveQuarterlySignature(bundle.executiveQuarterly);
  const previousMeta = readJsonFile(paths.jsonFile, null);
  const cacheReady = !force
    && previousMeta
    && toText(previousMeta.signature || '') === signature
    && fs.existsSync(paths.pdfFile)
    && fs.existsSync(paths.excelFile);

  if (cacheReady) {
    const hitCount = Math.max(0, toNumber(previousMeta.cacheHitCount || 0)) + 1;
    const nextMeta = {
      ...previousMeta,
      cacheHitCount: hitCount,
      lastAccessAt: nowIso()
    };
    writeJsonFileAtomic(paths.jsonFile, nextMeta);
    return {
      ...bundle,
      paths,
      signature,
      cached: true,
      meta: nextMeta
    };
  }

  fs.mkdirSync(paths.dir, { recursive: true });

  const pdfLines = buildExecutiveQuarterlyPdfLines(bundle.executiveQuarterly, {
    locale: bundle.locale,
    scope: bundle.scope
  });
  const pdfBuffer = buildSimpleTextPdfBuffer(pdfLines, { locale: bundle.locale });
  fs.writeFileSync(paths.pdfFile, pdfBuffer);

  const workbook = buildExecutiveQuarterlyExcelWorkbook(bundle.executiveQuarterly, bundle.locale);
  xlsxLib.writeFile(workbook, paths.excelFile, { bookType: 'xlsx' });

  const meta = {
    schema: 'quarterly_executive_export_bundle_v1',
    generatedAt: nowIso(),
    lastAccessAt: nowIso(),
    cacheHitCount: 0,
    signature,
    locale: bundle.locale,
    quarter: bundle.quarterKey,
    tenantKey: bundle.scope.tenantKey,
    unitKey: bundle.scope.unitKey,
    files: {
      pdf: paths.pdfFile,
      excel: paths.excelFile
    },
    quarterlySummary: {
      totalOs: Math.max(0, toNumber(bundle.executiveQuarterly?.overview?.totalOs)),
      sampleDays: Math.max(0, toNumber(bundle.executiveQuarterly?.overview?.sampleDays)),
      monthsWithData: Math.max(0, toNumber(bundle.executiveQuarterly?.overview?.monthsWithData)),
      reviewOpen: Math.max(0, toNumber(bundle.executiveQuarterly?.reviewQueue?.open)),
      classificationQuality: toText(bundle.executiveQuarterly?.quality?.classificationQuality || '')
    },
    executiveQuarterly: bundle.executiveQuarterly
  };
  writeJsonFileAtomic(paths.jsonFile, meta);
  writeServerLog('info', 'executive-quarterly-export-generated', {
    quarter: bundle.quarterKey,
    tenantKey: bundle.scope.tenantKey,
    unitKey: bundle.scope.unitKey,
    totalOs: meta.quarterlySummary.totalOs,
    sampleDays: meta.quarterlySummary.sampleDays,
    monthsWithData: meta.quarterlySummary.monthsWithData,
    signature
  });

  return {
    ...bundle,
    paths,
    signature,
    cached: false,
    meta
  };
}

function buildExecutiveQuarterlyJobTargets(scopeLike, localeRaw, optionsLike) {
  const opts = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
  const force = opts.force === true;
  const org = readOrganizationConfig();
  const scope = normalizeStorageScope(scopeLike || org);
  const locale = detectLocale(localeRaw || org.localeDefault || 'pt-BR');
  const tzParts = getDateTimePartsInTimezone(new Date(), org.timezone || DEFAULT_ORG_CONFIG.timezone);
  const currentQuarter = quarterKeyFromMonthKey(tzParts.monthKey);
  const targets = [];

  const windowReached = isQuarterOpeningMonth(tzParts.month) && (
    tzParts.day > EXEC_QUARTERLY_JOB_WINDOW_DAY
    || (tzParts.day === EXEC_QUARTERLY_JOB_WINDOW_DAY && (
      tzParts.hour > EXEC_QUARTERLY_JOB_WINDOW_HOUR
      || (tzParts.hour === EXEC_QUARTERLY_JOB_WINDOW_HOUR && tzParts.minute >= EXEC_QUARTERLY_JOB_WINDOW_MINUTE)
    ))
  );

  if (EXEC_QUARTERLY_JOB_MODE === 'rolling') {
    targets.push(currentQuarter);
  }
  if (windowReached || force || EXEC_QUARTERLY_JOB_MODE !== 'close_window') {
    targets.push(shiftQuarterKey(currentQuarter, -1));
  }
  for (let back = 2; back <= EXEC_QUARTERLY_JOB_LOOKBACK_QUARTERS; back += 1) {
    const qk = shiftQuarterKey(currentQuarter, -back);
    if (qk) targets.push(qk);
  }
  if (force && !targets.length) targets.push(currentQuarter);

  const uniqueTargets = Array.from(new Set(targets.filter(Boolean)))
    .slice(0, EXEC_QUARTERLY_JOB_MAX_QUARTERS_PER_RUN)
    .map(quarterKey => ({
      quarterKey,
      referenceDate: quarterKey === currentQuarter ? tzParts.dateKey : getQuarterReferenceDateKey(quarterKey)
    }))
    .filter(item => normalizeQuarterKey(item.quarterKey) && normalizeDateKey(item.referenceDate));

  return {
    force,
    scope,
    locale,
    tzParts,
    windowReached,
    currentQuarter,
    targets: uniqueTargets
  };
}

async function runExecutiveQuarterlyAutoJob(triggerLike, optionsLike) {
  const trigger = toText(triggerLike || 'interval') || 'interval';
  const opts = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
  const force = opts.force === true;
  const actor = (opts.actor && typeof opts.actor === 'object')
    ? opts.actor
    : {
        username: 'system_auto_export',
        displayName: 'System Auto Export',
        role: 'admin',
        tenantKey: readOrganizationConfig().tenantKey,
        unitKey: readOrganizationConfig().unitKey
      };

  const storeBefore = readExecutiveQuarterlyJobStore();
  if (!force && !EXEC_QUARTERLY_JOB_ENABLED) {
    return {
      ok: false,
      skipped: true,
      reason: 'disabled',
      trigger,
      status: storeBefore
    };
  }
  if (executiveQuarterlyJobRunning) {
    return {
      ok: false,
      skipped: true,
      reason: 'running',
      trigger,
      status: storeBefore
    };
  }

  executiveQuarterlyJobRunning = true;
  const startedAt = nowIso();
  const startedMs = Date.now();
  const runLog = {
    at: startedAt,
    trigger,
    force,
    quarters: [],
    processed: 0,
    skippedByWindow: false,
    skippedByRecheck: 0,
    cacheHit: 0,
    cacheMiss: 0,
    errors: 0,
    success: true,
    message: ''
  };

  const store = sanitizeExecutiveQuarterlyJobStore(storeBefore);
  store.running = true;
  store.lastRunAt = startedAt;
  store.lastOutcome = 'running';
  store.lastMessage = '';
  store.counters.runs = Math.max(0, toNumber(store.counters.runs)) + 1;
  writeExecutiveQuarterlyJobStore(store);

  try {
    const plan = buildExecutiveQuarterlyJobTargets(opts.scope, opts.locale, { force });
    if (!plan.targets.length) {
      runLog.skippedByWindow = true;
      runLog.message = 'janela ainda nao atingida para fechamento trimestral';
    } else {
      for (const target of plan.targets) {
        const scopeQuarterKey = buildExecutiveQuarterlyScopeQuarterKey(plan.scope, target.quarterKey);
        if (!shouldRunQuarterByRecheck(store, plan.scope, target.quarterKey, startedMs, force)) {
          runLog.skippedByRecheck += 1;
          runLog.quarters.push({
            quarter: target.quarterKey,
            referenceDate: target.referenceDate,
            skipped: true,
            reason: 'recheck_cooldown'
          });
          continue;
        }

        const quarterRow = {
          quarter: target.quarterKey,
          referenceDate: target.referenceDate,
          lastAttemptAt: nowIso(),
          trigger,
          status: 'running',
          success: false,
          cached: false,
          signature: '',
          error: '',
          files: {}
        };
        store.byScopeQuarter[scopeQuarterKey] = {
          ...(store.byScopeQuarter[scopeQuarterKey] && typeof store.byScopeQuarter[scopeQuarterKey] === 'object' ? store.byScopeQuarter[scopeQuarterKey] : {}),
          ...quarterRow
        };
        writeExecutiveQuarterlyJobStore(store);

        try {
          const result = await generateExecutiveQuarterlyExports(target.quarterKey, plan.scope, plan.locale, actor, { force: false });
          const exportStatus = getExecutiveQuarterlyExportStatus(target.quarterKey, plan.scope);
          runLog.processed += 1;
          if (result.cached) runLog.cacheHit += 1;
          else runLog.cacheMiss += 1;
          runLog.quarters.push({
            quarter: target.quarterKey,
            referenceDate: target.referenceDate,
            success: true,
            cached: result.cached === true,
            signature: result.signature,
            files: exportStatus.files
          });
          store.counters.processedQuarters = Math.max(0, toNumber(store.counters.processedQuarters)) + 1;
          if (result.cached) store.counters.cacheHit = Math.max(0, toNumber(store.counters.cacheHit)) + 1;
          else store.counters.cacheMiss = Math.max(0, toNumber(store.counters.cacheMiss)) + 1;
          store.byScopeQuarter[scopeQuarterKey] = {
            ...(store.byScopeQuarter[scopeQuarterKey] && typeof store.byScopeQuarter[scopeQuarterKey] === 'object' ? store.byScopeQuarter[scopeQuarterKey] : {}),
            quarter: target.quarterKey,
            referenceDate: target.referenceDate,
            trigger,
            status: 'success',
            success: true,
            cached: result.cached === true,
            signature: toText(result.signature || ''),
            lastAttemptAt: nowIso(),
            lastSuccessAt: nowIso(),
            error: '',
            files: exportStatus.files,
            quarterlySummary: exportStatus.quarterlySummary
          };
        } catch (errQuarter) {
          runLog.errors += 1;
          runLog.success = false;
          const errText = errQuarter?.message || String(errQuarter);
          runLog.quarters.push({
            quarter: target.quarterKey,
            referenceDate: target.referenceDate,
            success: false,
            error: errText
          });
          store.counters.errors = Math.max(0, toNumber(store.counters.errors)) + 1;
          store.byScopeQuarter[scopeQuarterKey] = {
            ...(store.byScopeQuarter[scopeQuarterKey] && typeof store.byScopeQuarter[scopeQuarterKey] === 'object' ? store.byScopeQuarter[scopeQuarterKey] : {}),
            quarter: target.quarterKey,
            referenceDate: target.referenceDate,
            trigger,
            status: 'error',
            success: false,
            cached: false,
            signature: '',
            lastAttemptAt: nowIso(),
            error: errText
          };
          writeServerLog('error', 'executive-quarterly-job-quarter-failed', {
            trigger,
            quarter: target.quarterKey,
            referenceDate: target.referenceDate,
            tenantKey: plan.scope.tenantKey,
            unitKey: plan.scope.unitKey,
            error: errText
          });
        }
        writeExecutiveQuarterlyJobStore(store);
      }
    }

    if (runLog.success && runLog.processed > 0) {
      store.lastSuccessAt = nowIso();
      store.lastOutcome = 'success';
      store.lastMessage = `processado(s): ${runLog.processed} | cache hit: ${runLog.cacheHit} | cache miss: ${runLog.cacheMiss}`;
    } else if (runLog.success && runLog.processed === 0) {
      store.lastOutcome = runLog.skippedByWindow ? 'skipped_window' : 'skipped';
      store.lastMessage = runLog.skippedByWindow
        ? 'janela de fechamento ainda nao atingida'
        : 'nenhum trimestre elegivel para processamento neste ciclo';
    } else {
      store.lastOutcome = 'error';
      store.lastErrorAt = nowIso();
      store.lastMessage = `falhas: ${runLog.errors} | processados: ${runLog.processed}`;
    }
    runLog.message = store.lastMessage;
    runLog.completedAt = nowIso();
    store.running = false;
    store.recentRuns = Array.isArray(store.recentRuns) ? store.recentRuns : [];
    store.recentRuns.push(runLog);
    store.recentRuns = store.recentRuns.slice(-EXEC_QUARTERLY_JOB_HISTORY_LIMIT);
    writeExecutiveQuarterlyJobStore(store);
    writeServerLog('info', 'executive-quarterly-job-run', {
      trigger,
      force,
      success: runLog.success,
      processed: runLog.processed,
      skippedByRecheck: runLog.skippedByRecheck,
      cacheHit: runLog.cacheHit,
      cacheMiss: runLog.cacheMiss,
      errors: runLog.errors
    });
    return {
      ok: true,
      trigger,
      force,
      result: runLog,
      status: getExecutiveQuarterlyJobStatusSnapshot(opts.scope || readOrganizationConfig())
    };
  } catch (err) {
    const errText = err?.message || String(err);
    const failStore = readExecutiveQuarterlyJobStore();
    failStore.running = false;
    failStore.lastOutcome = 'error';
    failStore.lastErrorAt = nowIso();
    failStore.lastMessage = errText;
    failStore.counters.errors = Math.max(0, toNumber(failStore.counters.errors)) + 1;
    failStore.recentRuns = Array.isArray(failStore.recentRuns) ? failStore.recentRuns : [];
    failStore.recentRuns.push({
      at: startedAt,
      completedAt: nowIso(),
      trigger,
      force,
      success: false,
      processed: runLog.processed,
      errors: runLog.errors + 1,
      message: errText
    });
    failStore.recentRuns = failStore.recentRuns.slice(-EXEC_QUARTERLY_JOB_HISTORY_LIMIT);
    writeExecutiveQuarterlyJobStore(failStore);
    writeServerLog('error', 'executive-quarterly-job-failed', {
      trigger,
      force,
      error: errText
    });
    return {
      ok: false,
      trigger,
      force,
      error: errText,
      status: getExecutiveQuarterlyJobStatusSnapshot(opts.scope || readOrganizationConfig())
    };
  } finally {
    executiveQuarterlyJobRunning = false;
  }
}

function rotateLogFileIfNeeded(filePath, maxBytes, maxFiles) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (Number(stats.size || 0) < Number(maxBytes || 0)) return;
    const keep = Math.max(2, Number(maxFiles || 6));
    for (let i = keep - 1; i >= 1; i--) {
      const older = `${filePath}.${i}`;
      const newer = `${filePath}.${i + 1}`;
      if (fs.existsSync(older)) {
        if (i === keep - 1) fs.unlinkSync(older);
        else fs.renameSync(older, newer);
      }
    }
    fs.renameSync(filePath, `${filePath}.1`);
  } catch (_) {}
}

function appendRotatingLogLine(filePath, lineText) {
  try {
    rotateLogFileIfNeeded(filePath, LOG_MAX_BYTES, LOG_MAX_FILES);
    fs.appendFileSync(filePath, `${lineText}\n`, 'utf-8');
  } catch (_) {}
}

function asSafeText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function writeServerLog(level, message, meta) {
  const payload = {
    at: nowIso(),
    level: asSafeText(level || 'info') || 'info',
    msg: asSafeText(message || ''),
    meta: meta && typeof meta === 'object' ? meta : undefined
  };
  appendRotatingLogLine(SERVER_LOG_FILE, JSON.stringify(payload));
}

function writeAccessLog(entry) {
  const payload = {
    at: nowIso(),
    method: entry?.method || '',
    path: entry?.path || '',
    status: Number(entry?.status || 0),
    ms: Number(entry?.ms || 0),
    ip: asSafeText(entry?.ip || ''),
    actor: asSafeText(entry?.actor || '')
  };
  appendRotatingLogLine(ACCESS_LOG_FILE, JSON.stringify(payload));
}

function installConsoleLogBridge() {
  const nativeLog = console.log.bind(console);
  const nativeWarn = console.warn.bind(console);
  const nativeError = console.error.bind(console);

  console.log = (...args) => {
    nativeLog(...args);
    writeServerLog('info', args.map(item => asSafeText(item)).join(' '));
  };
  console.warn = (...args) => {
    nativeWarn(...args);
    writeServerLog('warn', args.map(item => asSafeText(item)).join(' '));
  };
  console.error = (...args) => {
    nativeError(...args);
    writeServerLog('error', args.map(item => asSafeText(item)).join(' '));
  };
}

function normalizeString(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeScopeKey(value, fallback) {
  const key = normalizeKey(value);
  if (key) return key;
  const fallbackKey = normalizeKey(fallback);
  return fallbackKey || 'default';
}

function readOrganizationConfig() {
  const loaded = readJsonFile(ORG_CONFIG_FILE, DEFAULT_ORG_CONFIG) || DEFAULT_ORG_CONFIG;
  const companyName = asSafeText(loaded.companyName || DEFAULT_ORG_CONFIG.companyName) || DEFAULT_ORG_CONFIG.companyName;
  const unitName = asSafeText(loaded.unitName || DEFAULT_ORG_CONFIG.unitName) || DEFAULT_ORG_CONFIG.unitName;
  const tenantKey = normalizeScopeKey(loaded.tenantKey || companyName, DEFAULT_ORG_CONFIG.tenantKey);
  const unitKey = normalizeScopeKey(loaded.unitKey || unitName, DEFAULT_ORG_CONFIG.unitKey);
  const localeDefault = String(loaded.localeDefault || DEFAULT_ORG_CONFIG.localeDefault || 'pt-BR').toLowerCase().startsWith('en')
    ? 'en-US'
    : 'pt-BR';
  return {
    ...DEFAULT_ORG_CONFIG,
    ...loaded,
    companyName,
    tenantKey,
    unitName,
    unitKey,
    timezone: asSafeText(loaded.timezone || DEFAULT_ORG_CONFIG.timezone) || DEFAULT_ORG_CONFIG.timezone,
    localeDefault,
    updatedAt: asSafeText(loaded.updatedAt || '')
  };
}

function writeOrganizationConfig(nextConfig) {
  const current = readOrganizationConfig();
  const merged = {
    ...current,
    ...(nextConfig || {})
  };
  merged.companyName = asSafeText(merged.companyName || current.companyName || DEFAULT_ORG_CONFIG.companyName) || DEFAULT_ORG_CONFIG.companyName;
  merged.unitName = asSafeText(merged.unitName || current.unitName || DEFAULT_ORG_CONFIG.unitName) || DEFAULT_ORG_CONFIG.unitName;
  merged.tenantKey = normalizeScopeKey(merged.tenantKey || merged.companyName, current.tenantKey || DEFAULT_ORG_CONFIG.tenantKey);
  merged.unitKey = normalizeScopeKey(merged.unitKey || merged.unitName, current.unitKey || DEFAULT_ORG_CONFIG.unitKey);
  merged.timezone = asSafeText(merged.timezone || current.timezone || DEFAULT_ORG_CONFIG.timezone) || DEFAULT_ORG_CONFIG.timezone;
  merged.localeDefault = String(merged.localeDefault || current.localeDefault || DEFAULT_ORG_CONFIG.localeDefault).toLowerCase().startsWith('en')
    ? 'en-US'
    : 'pt-BR';
  merged.updatedAt = nowIso();
  writeJsonFileAtomic(ORG_CONFIG_FILE, merged);
  return merged;
}

function normalizeUserScope(userLike, orgConfig) {
  const org = orgConfig || readOrganizationConfig();
  const user = (userLike && typeof userLike === 'object') ? userLike : {};
  const tenantKey = normalizeScopeKey(user.tenantKey || org.tenantKey, org.tenantKey);
  const unitKey = normalizeScopeKey(user.unitKey || org.unitKey, org.unitKey);
  const companyName = asSafeText(user.companyName || org.companyName) || org.companyName;
  const unitName = asSafeText(user.unitName || org.unitName) || org.unitName;
  return { tenantKey, unitKey, companyName, unitName };
}

const RECORD_SCOPE_SEPARATOR = '::';
const STORAGE_ALL_SCOPE = Object.freeze({ all: true });

function isAllScope(scopeLike) {
  return !!(scopeLike && typeof scopeLike === 'object' && scopeLike.all === true);
}

function normalizeStorageScope(scopeLike, options) {
  const opts = options || {};
  if (isAllScope(scopeLike) && opts.allowAll !== false) return STORAGE_ALL_SCOPE;

  const org = readOrganizationConfig();
  const source = (scopeLike && typeof scopeLike === 'object') ? scopeLike : {};
  const tenantKey = normalizeScopeKey(source.tenantKey || org.tenantKey, org.tenantKey);
  const unitKey = normalizeScopeKey(source.unitKey || org.unitKey, org.unitKey);
  const companyName = asSafeText(source.companyName || (tenantKey === org.tenantKey ? org.companyName : tenantKey)) || org.companyName;
  const unitName = asSafeText(source.unitName || (unitKey === org.unitKey ? org.unitName : unitKey)) || org.unitName;
  return { tenantKey, unitKey, companyName, unitName };
}

function composeScopedRecordKey(scopeLike, dateKey) {
  const scope = normalizeStorageScope(scopeLike);
  return `${scope.tenantKey}${RECORD_SCOPE_SEPARATOR}${scope.unitKey}${RECORD_SCOPE_SEPARATOR}${dateKey}`;
}

function parseScopedRecordKey(storeKey) {
  const key = String(storeKey || '').trim();
  if (!key) return null;

  if (DATE_KEY_REGEX.test(key)) {
    const defaultScope = normalizeStorageScope(readOrganizationConfig());
    return {
      ...defaultScope,
      date: key,
      storeKey: composeScopedRecordKey(defaultScope, key),
      legacy: true
    };
  }

  const parts = key.split(RECORD_SCOPE_SEPARATOR);
  if (parts.length !== 3) return null;
  const dateKey = normalizeDateKey(parts[2]);
  if (!dateKey) return null;

  const scope = normalizeStorageScope({
    tenantKey: parts[0],
    unitKey: parts[1]
  });
  return {
    ...scope,
    date: dateKey,
    storeKey: composeScopedRecordKey(scope, dateKey),
    legacy: false
  };
}

function isSameScope(leftScope, rightScope) {
  const left = normalizeStorageScope(leftScope);
  const right = normalizeStorageScope(rightScope);
  return left.tenantKey === right.tenantKey && left.unitKey === right.unitKey;
}

function buildDefaultTechLinks() {
  return {
    schemaVersion: 1,
    updatedAt: '',
    categories: {
      tecnico: [
        {
          id: 'pricing_looker',
          title: 'Tabela de servicos (Looker)',
          url: DEFAULT_LOOKER_URL,
          description: 'Consulta de codigo, valor e regra de servico.'
        },
        {
          id: 'portal_cliente',
          title: 'Portal do cliente',
          url: DEFAULT_PORTAL_CLIENTE_URL,
          description: 'Consulta operacional de atendimento e cliente.'
        }
      ],
      operacional: [
        {
          id: 'painel_local',
          title: 'Painel local Campinas',
          url: `http://localhost:${PORT}`,
          description: 'Acesso rapido ao cockpit da unidade.'
        },
        {
          id: 'power_bi',
          title: 'BI operacional',
          url: DEFAULT_POWER_BI_URL,
          description: 'Visao consolidada para gestor e diretoria.'
        }
      ],
      administrativo: [
        {
          id: 'smtp_config',
          title: 'Configuracao de e-mail',
          url: '#configuracoes',
          description: 'Validar envio e fluxo de recuperacao de senha.'
        }
      ]
    }
  };
}

function normalizeTechLinksPayload(rawPayload) {
  const fallback = buildDefaultTechLinks();
  const payload = (rawPayload && typeof rawPayload === 'object') ? rawPayload : {};
  const rawCategories = (payload.categories && typeof payload.categories === 'object') ? payload.categories : {};
  const categories = {};

  ['tecnico', 'operacional', 'administrativo'].forEach(category => {
    const rows = Array.isArray(rawCategories[category]) ? rawCategories[category] : [];
    categories[category] = rows
      .map(item => {
        const idBase = asSafeText(item?.id || item?.title || '');
        const id = normalizeKey(idBase) || `${category}_${Math.floor(Math.random() * 100000)}`;
        const title = asSafeText(item?.title || '');
        const url = asSafeText(item?.url || '');
        const description = asSafeText(item?.description || '');
        if (!title || !url) return null;
        return { id, title, url, description };
      })
      .filter(Boolean)
      .slice(0, 60);
  });

  return {
    schemaVersion: 1,
    updatedAt: asSafeText(payload.updatedAt || ''),
    categories: {
      tecnico: categories.tecnico.length ? categories.tecnico : fallback.categories.tecnico,
      operacional: categories.operacional.length ? categories.operacional : fallback.categories.operacional,
      administrativo: categories.administrativo.length ? categories.administrativo : fallback.categories.administrativo
    }
  };
}

function readTechLinksStore() {
  return normalizeTechLinksPayload(readJsonFile(TECH_LINKS_FILE, buildDefaultTechLinks()));
}

function writeTechLinksStore(nextPayload, actor) {
  const normalized = normalizeTechLinksPayload(nextPayload);
  normalized.updatedAt = nowIso();
  writeJsonFileAtomic(TECH_LINKS_FILE, normalized);
  writeServerLog('info', 'tech-links-updated', {
    by: asSafeText(actor || 'system') || 'system',
    tecnico: normalized.categories.tecnico.length,
    operacional: normalized.categories.operacional.length,
    administrativo: normalized.categories.administrativo.length
  });
  return normalized;
}

function normalizeTechTicketStatus(value) {
  const normalized = normalizeKey(value);
  const allowed = new Set(['aberto', 'em_andamento', 'aguardando_cliente', 'concluido', 'cancelado']);
  return allowed.has(normalized) ? normalized : 'aberto';
}

function normalizeTechTicketPriority(value) {
  const normalized = normalizeKey(value);
  const allowed = new Set(['baixa', 'media', 'alta', 'critica']);
  return allowed.has(normalized) ? normalized : 'media';
}

function normalizeTechTicketText(value, maxLength) {
  return asSafeText(String(value == null ? '' : value)).slice(0, Math.max(0, Number(maxLength || 500)));
}

function normalizeTechTicketDate(value) {
  const parsed = parseDateValue(value);
  return parsed || getLocalISODate(new Date());
}

function readTechTicketStore() {
  const parsed = readJsonFile(TECH_TICKETS_FILE, { schemaVersion: 1, updatedAt: '', items: [] });
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return {
    schemaVersion: 1,
    updatedAt: asSafeText(parsed?.updatedAt || ''),
    items: items.filter(item => item && typeof item === 'object')
  };
}

function writeTechTicketStore(store) {
  const safeStore = store && typeof store === 'object' ? store : { schemaVersion: 1, updatedAt: '', items: [] };
  safeStore.schemaVersion = 1;
  safeStore.items = Array.isArray(safeStore.items) ? safeStore.items : [];
  safeStore.updatedAt = nowIso();
  writeJsonFileAtomic(TECH_TICKETS_FILE, safeStore);
}

function buildTechTicketId(scopeLike, openedDate, existingIds) {
  const scope = normalizeStorageScope(scopeLike);
  const dateKey = normalizeDateKey(openedDate) || getLocalISODate(new Date());
  const compactDate = dateKey.replace(/-/g, '');
  const unitTag = String(scope.unitKey || 'cps').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CPS';
  const used = new Set(Array.isArray(existingIds) ? existingIds.map(item => String(item || '')) : []);
  for (let i = 0; i < 1000; i += 1) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const id = `TK-${unitTag}-${compactDate}-${suffix}`;
    if (!used.has(id)) return id;
  }
  return `TK-${unitTag}-${compactDate}-${Date.now().toString().slice(-5)}`;
}

function normalizeTechTicketActor(userLike) {
  const actor = (userLike && typeof userLike === 'object') ? userLike : {};
  return {
    username: normalizeTechTicketText(actor.username || 'system', 120) || 'system',
    displayName: normalizeTechTicketText(actor.displayName || actor.username || 'Sistema', 120) || 'Sistema'
  };
}

function buildTechTicketHistoryEntry(action, actorLike, payload) {
  const actor = normalizeTechTicketActor(actorLike);
  const data = (payload && typeof payload === 'object') ? payload : {};
  return {
    at: nowIso(),
    action: normalizeTechTicketText(action || 'update', 60) || 'update',
    by: actor.username,
    byName: actor.displayName,
    status: normalizeTechTicketStatus(data.status || ''),
    nextAction: normalizeTechTicketText(data.nextAction || '', 500),
    notes: normalizeTechTicketText(data.notes || data.observacoes || '', 1200)
  };
}

function normalizeTechTicketForStore(rawInput, options) {
  const opts = options || {};
  const scope = normalizeStorageScope(opts.scope);
  const actor = normalizeTechTicketActor(opts.actor);
  const source = (rawInput && typeof rawInput === 'object') ? rawInput : {};
  const openedDate = normalizeTechTicketDate(source.openedDate || source.dataAbertura || source.date || '');

  const normalized = {
    ticketId: normalizeTechTicketText(source.ticketId || source.id || '', 40),
    tenantKey: scope.tenantKey,
    unitKey: scope.unitKey,
    companyName: scope.companyName,
    unitName: scope.unitName,
    openedDate,
    openedAt: asSafeText(source.openedAt || nowIso()) || nowIso(),
    createdBy: normalizeTechTicketText(source.createdBy || actor.username, 120) || actor.username,
    createdByName: normalizeTechTicketText(source.createdByName || actor.displayName, 120) || actor.displayName,
    cliente: normalizeTechTicketText(source.cliente, 180),
    unidade: normalizeTechTicketText(source.unidade || scope.unitName, 180) || scope.unitName,
    osId: normalizeTechTicketText(source.osId || source.os || source.numeroOS, 80),
    tecnico: normalizeTechTicketText(source.tecnico || actor.displayName, 120),
    contexto: normalizeTechTicketText(source.contexto, 220),
    title: normalizeTechTicketText(source.title || source.titulo || source.assunto, 220),
    description: normalizeTechTicketText(source.description || source.descricao, 2000),
    priority: normalizeTechTicketPriority(source.priority || source.prioridade),
    status: normalizeTechTicketStatus(source.status),
    andamento: normalizeTechTicketText(source.andamento, 1200),
    responsavelAtual: normalizeTechTicketText(source.responsavelAtual || source.responsavel, 120),
    nextAction: normalizeTechTicketText(source.nextAction || source.proximaAcao, 500),
    observacoes: normalizeTechTicketText(source.observacoes, 1800),
    billingTag: normalizeTechTicketText(source.billingTag || source.faturamentoTag, 60),
    linkedRecordDate: normalizeDateKey(source.linkedRecordDate || source.dataReferencia || openedDate) || openedDate,
    updatedAt: asSafeText(source.updatedAt || nowIso()) || nowIso(),
    updatedBy: normalizeTechTicketText(source.updatedBy || actor.username, 120) || actor.username,
    updatedByName: normalizeTechTicketText(source.updatedByName || actor.displayName, 120) || actor.displayName,
    history: Array.isArray(source.history) ? source.history.filter(item => item && typeof item === 'object').slice(0, TECH_TICKET_AUDIT_MAX_ITEMS) : []
  };

  if (!normalized.title) {
    normalized.title = normalized.cliente
      ? `Ticket Campinas - ${normalized.cliente}`
      : 'Ticket Campinas';
  }
  if (!normalized.responsavelAtual) normalized.responsavelAtual = normalized.tecnico || actor.displayName;
  return normalized;
}

function validateTechTicketPayload(payload) {
  const source = (payload && typeof payload === 'object') ? payload : {};
  const errors = [];
  if (!normalizeTechTicketText(source.cliente, 180)) errors.push('cliente');
  if (!normalizeTechTicketText(source.description || source.descricao, 2000)) errors.push('descricao');
  if (!normalizeTechTicketText(source.unidade, 180)) errors.push('unidade');
  return {
    ok: errors.length === 0,
    missing: errors
  };
}

function listTechTicketsFromStore(scopeLike, options) {
  const scope = normalizeStorageScope(scopeLike);
  const opts = options || {};
  const mineOnly = opts.mineOnly === true;
  const statusFilter = normalizeTechTicketText(opts.status || '', 40).toLowerCase();
  const actor = normalizeTechTicketText(opts.actor || '', 120).toLowerCase();
  const limit = Math.max(1, Math.min(Number(opts.limit || 250), 1000));
  const store = readTechTicketStore();
  return store.items
    .filter(item => isSameScope(item, scope))
    .filter(item => !statusFilter || String(item.status || '').toLowerCase() === statusFilter)
    .filter(item => {
      if (!mineOnly || !actor) return true;
      return String(item.createdBy || '').toLowerCase() === actor || String(item.tecnico || '').toLowerCase() === actor;
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, limit);
}

function getTechTicketFromStore(scopeLike, ticketId) {
  const scope = normalizeStorageScope(scopeLike);
  const id = normalizeTechTicketText(ticketId || '', 60);
  if (!id) return null;
  const store = readTechTicketStore();
  return store.items.find(item => String(item.ticketId || '') === id && isSameScope(item, scope)) || null;
}

function createTechTicketInStore(scopeLike, payload, actorLike) {
  const scope = normalizeStorageScope(scopeLike);
  const actor = normalizeTechTicketActor(actorLike);
  const validation = validateTechTicketPayload(payload);
  if (!validation.ok) {
    const label = validation.missing.join(', ');
    throw new Error(`Campos obrigatorios ausentes: ${label}.`);
  }
  const store = readTechTicketStore();
  const ticket = normalizeTechTicketForStore(payload, { scope, actor });
  ticket.ticketId = buildTechTicketId(scope, ticket.openedDate, store.items.map(item => item.ticketId));
  ticket.createdBy = actor.username;
  ticket.createdByName = actor.displayName;
  ticket.updatedBy = actor.username;
  ticket.updatedByName = actor.displayName;
  ticket.openedAt = nowIso();
  ticket.updatedAt = ticket.openedAt;
  ticket.history = [
    buildTechTicketHistoryEntry('create', actor, {
      status: ticket.status,
      nextAction: ticket.nextAction,
      notes: ticket.observacoes
    })
  ];
  store.items.unshift(ticket);
  writeTechTicketStore(store);
  writeServerLog('info', 'tech-ticket-created', {
    ticketId: ticket.ticketId,
    tenantKey: ticket.tenantKey,
    unitKey: ticket.unitKey,
    by: actor.username,
    status: ticket.status,
    priority: ticket.priority
  });
  return ticket;
}

function updateTechTicketInStore(scopeLike, ticketId, patchPayload, actorLike) {
  const scope = normalizeStorageScope(scopeLike);
  const actor = normalizeTechTicketActor(actorLike);
  const id = normalizeTechTicketText(ticketId || '', 60);
  if (!id) throw new Error('Ticket invalido.');
  const store = readTechTicketStore();
  const idx = store.items.findIndex(item => String(item.ticketId || '') === id && isSameScope(item, scope));
  if (idx < 0) return null;
  const current = store.items[idx];
  const patch = normalizeTechTicketForStore({ ...current, ...(patchPayload || {}) }, { scope, actor });
  patch.ticketId = current.ticketId;
  patch.createdBy = current.createdBy;
  patch.createdByName = current.createdByName;
  patch.openedAt = current.openedAt;
  patch.updatedAt = nowIso();
  patch.updatedBy = actor.username;
  patch.updatedByName = actor.displayName;
  const history = Array.isArray(current.history) ? current.history.slice(0, TECH_TICKET_AUDIT_MAX_ITEMS) : [];
  history.unshift(buildTechTicketHistoryEntry('update', actor, {
    status: patch.status,
    nextAction: patch.nextAction,
    notes: patch.observacoes
  }));
  patch.history = history.slice(0, TECH_TICKET_AUDIT_MAX_ITEMS);
  store.items[idx] = patch;
  writeTechTicketStore(store);
  writeServerLog('info', 'tech-ticket-updated', {
    ticketId: patch.ticketId,
    tenantKey: patch.tenantKey,
    unitKey: patch.unitKey,
    by: actor.username,
    status: patch.status,
    priority: patch.priority
  });
  return patch;
}

function parseCurrencyFlexible(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100;
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function readPricingConfig() {
  const base = {
    lookerUrl: DEFAULT_LOOKER_URL,
    portalClienteUrl: DEFAULT_PORTAL_CLIENTE_URL,
    powerBiUrl: DEFAULT_POWER_BI_URL,
    catalogWorkbookPath: path.join(PRICING_DIR, PRICING_PRIMARY_WORKBOOK_NAME),
    catalogAutoSync: true,
    updatedAt: '',
    campinas: {
      deslocamento: 0,
      primeiraHora: 0,
      adicional30min: 0
    }
  };
  const loaded = readJsonFile(PRICING_CONFIG_FILE, base) || base;
  return {
    ...base,
    ...loaded,
    catalogWorkbookPath: asSafeText(loaded.catalogWorkbookPath || base.catalogWorkbookPath),
    catalogAutoSync: loaded.catalogAutoSync !== false,
    campinas: {
      ...base.campinas,
      ...(loaded.campinas || {})
    }
  };
}

function writePricingConfig(next) {
  const current = readPricingConfig();
  const merged = {
    ...current,
    ...(next || {}),
    campinas: {
      ...current.campinas,
      ...((next && next.campinas) || {})
    },
    updatedAt: new Date().toISOString()
  };
  merged.catalogWorkbookPath = asSafeText(merged.catalogWorkbookPath || current.catalogWorkbookPath || '');
  merged.catalogAutoSync = merged.catalogAutoSync !== false;
  writeJsonFileAtomic(PRICING_CONFIG_FILE, merged);
  return merged;
}

function readPricingCatalog() {
  const base = { updatedAt: '', sourceFile: '', sourceSize: 0, sourceMtimeMs: 0, items: [] };
  const loaded = readJsonFile(PRICING_CATALOG_FILE, base) || base;
  const items = Array.isArray(loaded.items) ? loaded.items : [];
  return {
    ...base,
    ...loaded,
    sourceFile: asSafeText(loaded.sourceFile || ''),
    sourceSize: Number(loaded.sourceSize || 0),
    sourceMtimeMs: Number(loaded.sourceMtimeMs || 0),
    items
  };
}

function listSheetRowsAsArrays(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return xlsxLib.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

function extractCatalogFromInicioSheet(workbook) {
  const rows = listSheetRowsAsArrays(workbook, 'INÍCIO');
  if (!rows.length) return [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(v => normalizeString(v).toLowerCase());
    if (row.includes('código') && row.includes('descrição')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const header = rows[headerIdx].map(v => normalizeKey(v));
  const idxCode = header.findIndex(h => h === 'codigo');
  const idxDesc = header.findIndex(h => h === 'descricao');
  const idxTipo = header.findIndex(h => h === 'tipo');
  const idxFaturado = header.findIndex(h => h.includes('faturado_por'));
  if (idxCode < 0 || idxDesc < 0) return [];

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const code = normalizeString(row[idxCode]).toUpperCase();
    const description = normalizeString(row[idxDesc]);
    if (!code || !description) continue;
    items.push({
      code,
      description,
      type: normalizeString(row[idxTipo]),
      billedBy: normalizeString(row[idxFaturado]),
      source: 'INICIO'
    });
  }
  return items;
}

function extractCatalogFromSheetByHeaders(workbook, sheetName, headersHint) {
  const rows = listSheetRowsAsArrays(workbook, sheetName);
  if (!rows.length) return [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const rowNorm = rows[i].map(v => normalizeKey(v));
    const matches = headersHint.filter(h => rowNorm.includes(h)).length;
    if (matches >= Math.max(2, headersHint.length - 1)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const header = rows[headerIdx].map(v => normalizeKey(v));
  const idxCode = header.findIndex(h => h === 'codigo' || h === 'codigo_produto');
  const idxDesc = header.findIndex(h => h === 'descricao' || h === 'servico');
  const idxMensal = header.findIndex(h => h.includes('valor_mensal'));
  const idxAnual = header.findIndex(h => h.includes('valor_anual'));
  if (idxCode < 0 || idxDesc < 0) return [];

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const code = normalizeString(row[idxCode]).toUpperCase();
    const description = normalizeString(row[idxDesc]);
    if (!code || !description) continue;
    items.push({
      code,
      description,
      monthly: parseCurrencyFlexible(row[idxMensal]),
      yearly: parseCurrencyFlexible(row[idxAnual]),
      source: sheetName
    });
  }
  return items;
}

function findFirstHeaderIndexByAliases(headerNorm, aliases) {
  for (const alias of aliases) {
    const aliasKey = normalizeKey(alias);
    const idx = headerNorm.findIndex(h => h === aliasKey || h.includes(aliasKey));
    if (idx >= 0) return idx;
  }
  return -1;
}

function extractCatalogFromSheetByAliases(workbook, sheetName, aliasMapLike) {
  const rows = listSheetRowsAsArrays(workbook, sheetName);
  if (!rows.length) return [];
  const aliasMap = (aliasMapLike && typeof aliasMapLike === 'object') ? aliasMapLike : {};
  const codeAliases = Array.isArray(aliasMap.code) ? aliasMap.code : [];
  const descAliases = Array.isArray(aliasMap.description) ? aliasMap.description : [];
  const monthlyAliases = Array.isArray(aliasMap.monthly) ? aliasMap.monthly : [];
  const yearlyAliases = Array.isArray(aliasMap.yearly) ? aliasMap.yearly : [];
  const typeAliases = Array.isArray(aliasMap.type) ? aliasMap.type : [];
  const billedByAliases = Array.isArray(aliasMap.billedBy) ? aliasMap.billedBy : [];
  if (!codeAliases.length || !descAliases.length) return [];

  let headerIdx = -1;
  let idxCode = -1;
  let idxDesc = -1;
  let idxMonthly = -1;
  let idxYearly = -1;
  let idxType = -1;
  let idxBilledBy = -1;

  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const headerNorm = rows[i].map(v => normalizeKey(v));
    const codeIdxCandidate = findFirstHeaderIndexByAliases(headerNorm, codeAliases);
    const descIdxCandidate = findFirstHeaderIndexByAliases(headerNorm, descAliases);
    if (codeIdxCandidate < 0 || descIdxCandidate < 0) continue;
    headerIdx = i;
    idxCode = codeIdxCandidate;
    idxDesc = descIdxCandidate;
    idxMonthly = findFirstHeaderIndexByAliases(headerNorm, monthlyAliases);
    idxYearly = findFirstHeaderIndexByAliases(headerNorm, yearlyAliases);
    idxType = findFirstHeaderIndexByAliases(headerNorm, typeAliases);
    idxBilledBy = findFirstHeaderIndexByAliases(headerNorm, billedByAliases);
    break;
  }

  if (headerIdx < 0 || idxCode < 0 || idxDesc < 0) return [];

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const code = normalizeString(row[idxCode]).toUpperCase();
    const description = normalizeString(row[idxDesc]);
    if (!code || !description) continue;
    items.push({
      code,
      description,
      type: idxType >= 0 ? normalizeString(row[idxType]) : '',
      billedBy: idxBilledBy >= 0 ? normalizeString(row[idxBilledBy]) : '',
      monthly: idxMonthly >= 0 ? parseCurrencyFlexible(row[idxMonthly]) : null,
      yearly: idxYearly >= 0 ? parseCurrencyFlexible(row[idxYearly]) : null,
      source: sheetName
    });
  }
  return items;
}

function importPricingCatalogFromWorkbook(filePath) {
  if (!xlsxLib) throw new Error('Biblioteca xlsx indisponivel.');
  if (!fs.existsSync(filePath)) throw new Error('Arquivo de tabela de precos nao encontrado.');
  const sourceStat = fs.statSync(filePath);
  const workbook = xlsxLib.readFile(filePath, { cellDates: true });
  const packs = [];
  packs.push(...extractCatalogFromInicioSheet(workbook));
  packs.push(...extractCatalogFromSheetByHeaders(workbook, 'Valor Contrato de Suporte', ['codigo', 'descricao', 'valor_mensal', 'valor_anual']));
  packs.push(...extractCatalogFromSheetByHeaders(workbook, 'Valor BPO', ['codigo_produto', 'servico', 'valor_mensal']));
  packs.push(...extractCatalogFromSheetByHeaders(workbook, 'Valor Módulos Extras', ['codigo', 'descricao', 'valor_mensal']));
  packs.push(...extractCatalogFromSheetByHeaders(workbook, 'Valor Franquia', ['codigo', 'descricao', 'valor_mensal']));
  for (const sheetName of workbook.SheetNames || []) {
    packs.push(...extractCatalogFromSheetByAliases(workbook, sheetName, {
      code: ['da1_codpro', 'codigo_produto', 'codigo', 'codpro', 'cod_produto'],
      description: ['b1_desc', 'descricao', 'servico', 'nome'],
      monthly: ['da1_prcven', 'preco_tab', 'preco', 'valor', 'valor_mensal'],
      type: ['da1_codtab', 'tipo'],
      billedBy: ['faturado_por', 'billed_by']
    }));
  }

  const byCode = new Map();
  for (const item of packs) {
    const code = normalizeString(item.code).toUpperCase();
    if (!code || code === '-' || code.length < 2 || !/[A-Z0-9]/.test(code)) continue;
    const prev = byCode.get(code);
    byCode.set(code, {
      code,
      description: item.description || prev?.description || '',
      type: item.type || prev?.type || '',
      billedBy: item.billedBy || prev?.billedBy || '',
      monthly: item.monthly != null ? item.monthly : (prev?.monthly ?? null),
      yearly: item.yearly != null ? item.yearly : (prev?.yearly ?? null),
      source: prev?.source ? `${prev.source}|${item.source}` : item.source
    });
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    sourceFile: filePath,
    sourceSize: Number(sourceStat.size || 0),
    sourceMtimeMs: Math.round(Number(sourceStat.mtimeMs || 0)),
    items: Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code))
  };
  writeJsonFileAtomic(PRICING_CATALOG_FILE, payload);
  return payload;
}

function findDefaultPricingWorkbook() {
  const preferredPath = resolvePricingWorkbookPathFromConfig();
  if (preferredPath) return preferredPath;

  const centralizedPath = path.join(PRICING_DIR, PRICING_PRIMARY_WORKBOOK_NAME);
  if (fs.existsSync(centralizedPath)) return centralizedPath;

  const seededPath = seedCentralizedPricingWorkbook();
  if (seededPath) return seededPath;

  const downloads = path.join(os.homedir(), 'Downloads');
  const candidateFolders = [PRICING_DIR, downloads].filter(folder => fs.existsSync(folder));
  const candidates = [];
  for (const folder of candidateFolders) {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (_) {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.xlsx?$/i.test(entry.name)) continue;
      const fullPath = path.join(folder, entry.name);
      let stat = null;
      try {
        stat = fs.statSync(fullPath);
      } catch (_) {
        stat = null;
      }
      if (!stat) continue;
      const score = scorePricingWorkbookFileName(entry.name);
      if (score <= 0) continue;
      candidates.push({
        fullPath,
        score,
        mtimeMs: Number(stat.mtimeMs || 0)
      });
    }
  }

  if (!candidates.length) return '';
  candidates.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs || String(a.fullPath).localeCompare(String(b.fullPath)));
  return candidates[0].fullPath;
}

function ensurePricingCatalogLoaded() {
  const syncResult = syncPricingCatalogFromWorkbookIfChanged('ensure-loaded');
  if (syncResult?.catalog && Array.isArray(syncResult.catalog.items)) return syncResult.catalog;
  const catalog = readPricingCatalog();
  if (Array.isArray(catalog.items) && catalog.items.length > 0) return catalog;
  const defaultFile = findDefaultPricingWorkbook();
  if (!defaultFile) return catalog;
  try {
    return importPricingCatalogFromWorkbook(defaultFile);
  } catch (_) {
    return catalog;
  }
}

function scorePricingWorkbookFileName(fileNameLike) {
  const normalized = normalizeKey(path.basename(String(fileNameLike || '')));
  if (!normalized) return 0;
  let score = 0;
  if (normalized.includes('tabela')) score += 3;
  if (normalized.includes('preco')) score += 3;
  if (normalized.includes('cliente')) score += 2;
  if (normalized.includes('final')) score += 2;
  if (normalized.includes('tagus')) score += 1;
  if (normalized.includes('servic')) score += 1;
  if (normalized.includes('2026')) score += 1;
  return score;
}

function resolvePricingWorkbookPathFromConfig(configLike) {
  const config = (configLike && typeof configLike === 'object') ? configLike : readPricingConfig();
  const configured = asSafeText(config.catalogWorkbookPath || '');
  if (!configured) return '';
  const candidate = path.isAbsolute(configured) ? configured : path.join(ROOT, configured);
  return fs.existsSync(candidate) ? candidate : '';
}

function seedCentralizedPricingWorkbook() {
  const centralPath = path.join(PRICING_DIR, PRICING_PRIMARY_WORKBOOK_NAME);
  if (fs.existsSync(centralPath)) return centralPath;
  const downloads = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloads)) return '';

  let entries = [];
  try {
    entries = fs.readdirSync(downloads, { withFileTypes: true });
  } catch (_) {
    entries = [];
  }
  const candidates = entries
    .filter(entry => entry.isFile() && /\.xlsx?$/i.test(entry.name))
    .map(entry => ({
      name: entry.name,
      path: path.join(downloads, entry.name),
      score: scorePricingWorkbookFileName(entry.name)
    }))
    .filter(item => item.score >= 6)
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
  if (!candidates.length) return '';

  try {
    fs.copyFileSync(candidates[0].path, centralPath);
    writeServerLog('info', 'pricing-workbook-seeded', {
      source: candidates[0].path,
      destination: centralPath
    });
    return centralPath;
  } catch (err) {
    writeServerLog('warn', 'Falha ao centralizar planilha de precos.', {
      source: candidates[0].path,
      destination: centralPath,
      error: err?.message || String(err)
    });
    return '';
  }
}

function syncPricingCatalogFromWorkbookIfChanged(reason, explicitFilePathLike) {
  const config = readPricingConfig();
  if (config.catalogAutoSync === false && !explicitFilePathLike) {
    return { ok: true, imported: false, skipped: true, reason: 'auto-sync-disabled', catalog: readPricingCatalog() };
  }

  const explicitFilePath = asSafeText(explicitFilePathLike || '');
  const workbookPath = explicitFilePath || resolvePricingWorkbookPathFromConfig(config) || findDefaultPricingWorkbook();
  if (!workbookPath || !fs.existsSync(workbookPath)) {
    return { ok: false, imported: false, skipped: true, reason: 'workbook-not-found', catalog: readPricingCatalog() };
  }

  const stat = fs.statSync(workbookPath);
  const nextSize = Number(stat.size || 0);
  const nextMtimeMs = Math.round(Number(stat.mtimeMs || 0));
  const catalog = readPricingCatalog();
  const catalogSource = asSafeText(catalog.sourceFile || '');
  const sameSourcePath = !!catalogSource
    && path.resolve(catalogSource).toLowerCase() === path.resolve(workbookPath).toLowerCase();
  const sameFingerprint = sameSourcePath
    && Number(catalog.sourceSize || 0) === nextSize
    && Math.round(Number(catalog.sourceMtimeMs || 0)) === nextMtimeMs;
  const hasCatalogData = Array.isArray(catalog.items) && catalog.items.length > 0;

  if (sameFingerprint && hasCatalogData) {
    return {
      ok: true,
      imported: false,
      skipped: true,
      reason: 'no-change',
      filePath: workbookPath,
      catalog
    };
  }

  const updatedCatalog = importPricingCatalogFromWorkbook(workbookPath);
  writeServerLog('info', 'pricing-catalog-synced', {
    reason: asSafeText(reason || 'sync'),
    sourceFile: workbookPath,
    items: Array.isArray(updatedCatalog.items) ? updatedCatalog.items.length : 0,
    sourceSize: Number(updatedCatalog.sourceSize || 0),
    sourceMtimeMs: Number(updatedCatalog.sourceMtimeMs || 0)
  });

  return {
    ok: true,
    imported: true,
    skipped: false,
    reason: 'updated',
    filePath: workbookPath,
    catalog: updatedCatalog
  };
}

function normalizePricingReviewStatus(value, fallback = 'pendente') {
  const normalized = normalizeKey(value);
  if (PRICING_REVIEW_ALLOWED_STATUSES.has(normalized)) return normalized;
  const fallbackNormalized = normalizeKey(fallback);
  if (!fallbackNormalized) return '';
  return PRICING_REVIEW_ALLOWED_STATUSES.has(fallbackNormalized) ? fallbackNormalized : 'pendente';
}

function normalizePricingReviewText(value, maxLength) {
  return asSafeText(String(value == null ? '' : value)).slice(0, Math.max(0, Number(maxLength || 300)));
}

function isPricingReviewOpenStatus(statusLike) {
  const status = normalizePricingReviewStatus(statusLike);
  return status === 'pendente' || status === 'em_analise' || status === 'confirmado_peca';
}

function getPricingReviewReasonLabel(reasonLike) {
  const reason = normalizeKey(reasonLike);
  if (reason === 'codigo_peca_ausente') return 'Sem codigo de peca na observacao/laudo';
  if (reason === 'codigo_nao_encontrado_catalogo') return 'Codigo de peca fora do catalogo oficial';
  return 'Revisao manual de codigo';
}

function readPricingReviewQueueStore() {
  const parsed = readJsonFile(PRICING_REVIEW_QUEUE_FILE, { schemaVersion: 1, updatedAt: '', items: [] });
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return {
    schemaVersion: 1,
    updatedAt: asSafeText(parsed?.updatedAt || ''),
    items: items.filter(item => item && typeof item === 'object')
  };
}

function writePricingReviewQueueStore(storeLike) {
  const safeStore = (storeLike && typeof storeLike === 'object')
    ? { ...storeLike }
    : { schemaVersion: 1, updatedAt: '', items: [] };
  safeStore.schemaVersion = 1;
  safeStore.updatedAt = nowIso();
  safeStore.items = Array.isArray(safeStore.items) ? safeStore.items : [];
  safeStore.items = safeStore.items
    .filter(item => item && typeof item === 'object')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, PRICING_REVIEW_MAX_ITEMS);
  writeJsonFileAtomic(PRICING_REVIEW_QUEUE_FILE, safeStore);
}

function buildPricingReviewQueueId(scopeLike, dateKey, codeRaw, reasonRaw) {
  const scope = normalizeStorageScope(scopeLike);
  const safeDate = normalizeDateKey(dateKey) || getLocalISODate(new Date());
  const code = normalizePricingReviewText(codeRaw || 'SEM_CODIGO', 80).toUpperCase() || 'SEM_CODIGO';
  const reason = normalizeKey(reasonRaw || 'codigo_nao_encontrado_catalogo') || 'codigo_nao_encontrado_catalogo';
  const hashBase = `${scope.tenantKey}|${scope.unitKey}|${safeDate}|${code}|${reason}`;
  const hash = crypto.createHash('sha1').update(hashBase).digest('hex').slice(0, 10).toUpperCase();
  return `PRQ-${safeDate.replace(/-/g, '')}-${hash}`;
}

function collectPricingReviewCandidates(osItemsLike, catalogIndexLike) {
  const items = Array.isArray(osItemsLike) ? osItemsLike : [];
  const catalogIndex = catalogIndexLike || buildPricingCatalogIndex([]);
  const grouped = new Map();

  for (const sourceItem of items) {
    const item = normalizeOsAuditItemPieceFields(sourceItem);
    const requirePrice = item.pecaRequerPreco === true || shouldRequirePriceValidation({
      partCode: item.codigoPeca || '',
      coverageType: item.cobertura || '',
      observation: item.observacao || '',
      laudo: item.laudo || ''
    });
    if (!requirePrice) continue;

    const partCode = normalizeServiceCodeValue(item.codigoPeca || '');
    const matchedCatalog = partCode ? resolvePricingCatalogEntry(catalogIndex, partCode) : null;
    if (matchedCatalog) continue;

    const reason = partCode ? 'codigo_nao_encontrado_catalogo' : 'codigo_peca_ausente';
    const codeKey = partCode || 'SEM_CODIGO';
    const groupKey = `${reason}|${codeKey}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        reason,
        code: partCode,
        codeDisplay: codeKey,
        occurrences: 0,
        osSet: new Set(),
        operationalCodeSet: new Set(),
        clientSet: new Set(),
        examples: []
      });
    }
    const bucket = grouped.get(groupKey);
    bucket.occurrences += 1;
    if (item.os) bucket.osSet.add(String(item.os));
    if (item.codigoOperacional) bucket.operationalCodeSet.add(String(item.codigoOperacional));
    if (item.cliente) bucket.clientSet.add(normalizePricingReviewText(item.cliente, 180));
    if (bucket.examples.length < 6) {
      bucket.examples.push({
        os: normalizePricingReviewText(item.os, 60),
        cliente: normalizePricingReviewText(item.cliente, 180),
        codigoOperacional: normalizePricingReviewText(item.codigoOperacional || item.codigo, 80),
        codigoPeca: normalizePricingReviewText(partCode, 80),
        observacao: normalizePricingReviewText(item.observacao, 220)
      });
    }
  }

  return Array.from(grouped.values())
    .map(candidate => ({
      reason: candidate.reason,
      reasonLabel: getPricingReviewReasonLabel(candidate.reason),
      code: candidate.code,
      codeDisplay: candidate.codeDisplay,
      occurrences: candidate.occurrences,
      osList: Array.from(candidate.osSet).slice(0, 30),
      operationalCodes: Array.from(candidate.operationalCodeSet).slice(0, 20),
      clients: Array.from(candidate.clientSet).slice(0, 20),
      examples: candidate.examples
    }))
    .sort((a, b) => b.occurrences - a.occurrences || String(a.codeDisplay).localeCompare(String(b.codeDisplay)));
}

function summarizePricingReviewQueueItems(itemsLike) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const summary = {
    total: items.length,
    open: 0,
    pendente: 0,
    emAnalise: 0,
    confirmadoPeca: 0,
    naoPeca: 0,
    resolvidoAuto: 0
  };
  for (const item of items) {
    const status = normalizePricingReviewStatus(item.status || 'pendente');
    if (isPricingReviewOpenStatus(status)) summary.open += 1;
    if (status === 'pendente') summary.pendente += 1;
    if (status === 'em_analise') summary.emAnalise += 1;
    if (status === 'confirmado_peca') summary.confirmadoPeca += 1;
    if (status === 'nao_peca') summary.naoPeca += 1;
    if (status === 'resolvido_auto') summary.resolvidoAuto += 1;
  }
  return summary;
}

function upsertPricingReviewQueueFromCandidates(scopeLike, dateKey, candidatesLike, actorLike, catalogUpdatedAt) {
  const scope = normalizeStorageScope(scopeLike);
  const date = normalizeDateKey(dateKey);
  if (!date) return { created: 0, updated: 0, autoResolved: 0, totalOpen: 0 };

  const actor = normalizeTechTicketActor(actorLike);
  const candidates = Array.isArray(candidatesLike) ? candidatesLike : [];
  const now = nowIso();
  const store = readPricingReviewQueueStore();
  const currentItems = Array.isArray(store.items) ? store.items.slice() : [];
  const touched = new Set();
  let created = 0;
  let updated = 0;
  let autoResolved = 0;

  const upsertOne = (candidateRaw) => {
    const candidate = (candidateRaw && typeof candidateRaw === 'object') ? candidateRaw : {};
    const reason = normalizeKey(candidate.reason || 'codigo_nao_encontrado_catalogo') || 'codigo_nao_encontrado_catalogo';
    const codeDisplay = normalizePricingReviewText(candidate.codeDisplay || candidate.code || 'SEM_CODIGO', 80).toUpperCase() || 'SEM_CODIGO';
    const queueId = buildPricingReviewQueueId(scope, date, codeDisplay, reason);
    touched.add(queueId);

    const normalizedOs = Array.isArray(candidate.osList) ? candidate.osList.map(item => normalizePricingReviewText(item, 60)).filter(Boolean) : [];
    const normalizedOps = Array.isArray(candidate.operationalCodes) ? candidate.operationalCodes.map(item => normalizePricingReviewText(item, 80)).filter(Boolean) : [];
    const normalizedClients = Array.isArray(candidate.clients) ? candidate.clients.map(item => normalizePricingReviewText(item, 180)).filter(Boolean) : [];
    const normalizedExamples = Array.isArray(candidate.examples)
      ? candidate.examples
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          os: normalizePricingReviewText(item.os, 60),
          cliente: normalizePricingReviewText(item.cliente, 180),
          codigoOperacional: normalizePricingReviewText(item.codigoOperacional, 80),
          codigoPeca: normalizePricingReviewText(item.codigoPeca, 80),
          observacao: normalizePricingReviewText(item.observacao, 240)
        }))
        .slice(0, 6)
      : [];

    const idx = currentItems.findIndex(item => String(item.queueId || '') === queueId && isSameScope(item, scope));
    if (idx < 0) {
      created += 1;
      currentItems.unshift({
        queueId,
        tenantKey: scope.tenantKey,
        unitKey: scope.unitKey,
        companyName: scope.companyName,
        unitName: scope.unitName,
        date,
        code: codeDisplay === 'SEM_CODIGO' ? '' : codeDisplay,
        codeDisplay,
        reason,
        reasonLabel: getPricingReviewReasonLabel(reason),
        status: 'pendente',
        notes: '',
        mappedCatalogCode: '',
        occurrences: Math.max(1, toNumber(candidate.occurrences)),
        osCount: normalizedOs.length,
        osList: normalizedOs.slice(0, 30),
        operationalCodes: normalizedOps.slice(0, 20),
        clients: normalizedClients.slice(0, 20),
        examples: normalizedExamples,
        catalogUpdatedAt: asSafeText(catalogUpdatedAt || ''),
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        createdBy: actor.username,
        updatedAt: now,
        updatedBy: actor.username
      });
      return;
    }

    const current = { ...currentItems[idx] };
    const prevStatus = normalizePricingReviewStatus(current.status || 'pendente');
    let nextStatus = prevStatus;
    if (prevStatus === 'resolvido_auto') nextStatus = 'pendente';
    current.status = nextStatus;
    current.reason = reason;
    current.reasonLabel = getPricingReviewReasonLabel(reason);
    current.code = codeDisplay === 'SEM_CODIGO' ? '' : codeDisplay;
    current.codeDisplay = codeDisplay;
    current.occurrences = Math.max(1, toNumber(candidate.occurrences));
    current.osCount = normalizedOs.length;
    current.osList = normalizedOs.slice(0, 30);
    current.operationalCodes = normalizedOps.slice(0, 20);
    current.clients = normalizedClients.slice(0, 20);
    current.examples = normalizedExamples;
    current.catalogUpdatedAt = asSafeText(catalogUpdatedAt || '');
    current.lastSeenAt = now;
    current.updatedAt = now;
    current.updatedBy = actor.username;
    current.updated = true;
    currentItems[idx] = current;
    updated += 1;
  };

  candidates.forEach(upsertOne);

  for (let i = 0; i < currentItems.length; i += 1) {
    const item = currentItems[i];
    if (!item || typeof item !== 'object') continue;
    if (!isSameScope(item, scope)) continue;
    if (normalizeDateKey(item.date) !== date) continue;
    if (touched.has(String(item.queueId || ''))) continue;
    const status = normalizePricingReviewStatus(item.status || 'pendente');
    if (status === 'pendente' || status === 'em_analise' || status === 'confirmado_peca') {
      currentItems[i] = {
        ...item,
        status: 'resolvido_auto',
        updatedAt: now,
        updatedBy: actor.username,
        autoResolvedAt: now
      };
      autoResolved += 1;
    }
  }

  store.items = currentItems;
  writePricingReviewQueueStore(store);
  const scopedDayItems = currentItems.filter(item => isSameScope(item, scope) && normalizeDateKey(item.date) === date);
  const summary = summarizePricingReviewQueueItems(scopedDayItems);
  return {
    created,
    updated,
    autoResolved,
    total: scopedDayItems.length,
    totalOpen: summary.open,
    summary
  };
}

function listPricingReviewQueueFromStore(scopeLike, options) {
  const scope = normalizeStorageScope(scopeLike);
  const opts = options || {};
  const filterDate = normalizeDateKey(opts.date);
  const filterStatus = normalizePricingReviewStatus(opts.status || '', '');
  const openOnly = opts.openOnly === true;
  const limit = Math.max(1, Math.min(Number(opts.limit || 300), 2000));
  const store = readPricingReviewQueueStore();
  return store.items
    .filter(item => isSameScope(item, scope))
    .filter(item => !filterDate || normalizeDateKey(item.date) === filterDate)
    .filter(item => !filterStatus || normalizePricingReviewStatus(item.status || '') === filterStatus)
    .filter(item => !openOnly || isPricingReviewOpenStatus(item.status))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, limit);
}

function updatePricingReviewQueueItem(scopeLike, queueId, patchLike, actorLike) {
  const scope = normalizeStorageScope(scopeLike);
  const id = normalizePricingReviewText(queueId || '', 60);
  if (!id) return null;
  const actor = normalizeTechTicketActor(actorLike);
  const patch = (patchLike && typeof patchLike === 'object') ? patchLike : {};
  const store = readPricingReviewQueueStore();
  const idx = store.items.findIndex(item => String(item.queueId || '') === id && isSameScope(item, scope));
  if (idx < 0) return null;

  const current = { ...store.items[idx] };
  const nextStatus = normalizePricingReviewStatus(
    patch.status,
    normalizePricingReviewStatus(current.status || 'pendente')
  );
  const updated = {
    ...current,
    status: nextStatus,
    notes: normalizePricingReviewText(patch.notes != null ? patch.notes : current.notes, 1600),
    mappedCatalogCode: normalizePricingReviewText(patch.mappedCatalogCode != null ? patch.mappedCatalogCode : current.mappedCatalogCode, 80).toUpperCase(),
    updatedAt: nowIso(),
    updatedBy: actor.username,
    updatedByName: actor.displayName
  };
  if (!isPricingReviewOpenStatus(nextStatus)) {
    updated.closedAt = updated.updatedAt;
  }
  store.items[idx] = updated;
  writePricingReviewQueueStore(store);
  return updated;
}

function buildPricingReviewQueueSummary(scopeLike, dateKey) {
  const scope = normalizeStorageScope(scopeLike);
  const date = normalizeDateKey(dateKey);
  const store = readPricingReviewQueueStore();
  const dayItems = store.items.filter(item => isSameScope(item, scope) && (!date || normalizeDateKey(item.date) === date));
  const summary = summarizePricingReviewQueueItems(dayItems);
  const openItems = dayItems
    .filter(item => isPricingReviewOpenStatus(item.status))
    .sort((a, b) => toNumber(b.occurrences) - toNumber(a.occurrences))
    .slice(0, 20);
  return {
    ...summary,
    topOpenCodes: openItems.map(item => ({
      queueId: item.queueId,
      code: item.codeDisplay || 'SEM_CODIGO',
      reason: item.reason,
      reasonLabel: item.reasonLabel || getPricingReviewReasonLabel(item.reason),
      occurrences: toNumber(item.occurrences),
      status: normalizePricingReviewStatus(item.status || 'pendente')
    }))
  };
}

function syncPricingReviewQueueForRecord(paramsLike) {
  const params = (paramsLike && typeof paramsLike === 'object') ? paramsLike : {};
  const scope = normalizeStorageScope(params.scope);
  const dateKey = normalizeDateKey(params.dateKey);
  if (!dateKey) return { created: 0, updated: 0, autoResolved: 0, total: 0, totalOpen: 0 };
  const data = (params.data && typeof params.data === 'object') ? params.data : {};
  const osItems = parseOsAuditFromData(data);
  const pricingCatalog = ensurePricingCatalogLoaded();
  const catalogIndex = buildPricingCatalogIndex(pricingCatalog.items || []);
  const candidates = collectPricingReviewCandidates(osItems, catalogIndex);
  return upsertPricingReviewQueueFromCandidates(
    scope,
    dateKey,
    candidates,
    params.actor || { username: 'system', displayName: 'Sistema' },
    pricingCatalog.updatedAt || ''
  );
}

function normalizeReviewWorkflowText(value, maxLength) {
  return asSafeText(String(value == null ? '' : value)).slice(0, Math.max(0, Number(maxLength || 300)));
}

function normalizeReviewWorkflowPriority(value, fallback = 'medium') {
  const normalized = normalizeKey(value);
  if (normalized === 'critica') return 'critical';
  if (normalized === 'alta') return 'high';
  if (normalized === 'media') return 'medium';
  if (normalized === 'baixa') return 'low';
  if (['critical', 'high', 'medium', 'low', 'none'].includes(normalized)) return normalized;
  const fallbackNormalized = normalizeKey(fallback);
  if (fallbackNormalized === 'critica') return 'critical';
  if (fallbackNormalized === 'alta') return 'high';
  if (fallbackNormalized === 'media') return 'medium';
  if (fallbackNormalized === 'baixa') return 'low';
  if (['critical', 'high', 'medium', 'low', 'none'].includes(fallbackNormalized)) return fallbackNormalized;
  return 'medium';
}

function normalizeReviewWorkflowStatus(value, fallback = 'novo') {
  const normalized = normalizeKey(value);
  if (REVIEW_WORKFLOW_ALLOWED_STATUSES.has(normalized)) return normalized;
  const fallbackNormalized = normalizeKey(fallback);
  if (!fallbackNormalized) return '';
  return REVIEW_WORKFLOW_ALLOWED_STATUSES.has(fallbackNormalized) ? fallbackNormalized : 'novo';
}

function isReviewWorkflowOpenStatus(statusLike) {
  return REVIEW_WORKFLOW_OPEN_STATUSES.has(normalizeReviewWorkflowStatus(statusLike, 'novo'));
}

function normalizeReviewDecisionType(value, fallback = '') {
  const normalized = normalizeKey(value);
  const aliases = {
    aceitar: 'aceite',
    aceite: 'aceite',
    ajustar: 'ajuste',
    ajuste: 'ajuste',
    revisar: 'revisao',
    revisao: 'revisao',
    encerrar: 'encerramento',
    encerramento: 'encerramento',
    descartar: 'descarte',
    descarte: 'descarte'
  };
  const resolved = aliases[normalized] || normalized;
  if (REVIEW_WORKFLOW_ALLOWED_DECISION_TYPES.has(resolved)) return resolved;
  const fallbackResolved = aliases[normalizeKey(fallback)] || normalizeKey(fallback);
  if (REVIEW_WORKFLOW_ALLOWED_DECISION_TYPES.has(fallbackResolved)) return fallbackResolved;
  return '';
}

function normalizeReviewDecisionResult(value, fallback = '') {
  const normalized = normalizeKey(value);
  const aliases = {
    aprovado: 'aprovado',
    solicitar_ajuste: 'solicitar_ajuste',
    ajuste: 'solicitar_ajuste',
    nao_procede: 'nao_procede',
    encerrado_com_acao: 'encerrado_com_acao',
    encerrado_sem_acao: 'encerrado_sem_acao'
  };
  const resolved = aliases[normalized] || normalized;
  if (REVIEW_WORKFLOW_ALLOWED_DECISION_RESULTS.has(resolved)) return resolved;
  const fallbackResolved = aliases[normalizeKey(fallback)] || normalizeKey(fallback);
  if (REVIEW_WORKFLOW_ALLOWED_DECISION_RESULTS.has(fallbackResolved)) return fallbackResolved;
  return '';
}

function normalizeReviewWorkflowDateTime(value) {
  if (value == null || value === '') return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function normalizeReviewWorkflowReference(referenceLike, fallbackDateLike) {
  const source = (referenceLike && typeof referenceLike === 'object') ? referenceLike : {};
  const fallbackDate = normalizeDateKey(fallbackDateLike) || getLocalISODate(new Date());
  const periodType = normalizeKey(source.periodType || source.type) === 'monthly' ? 'monthly' : 'daily';

  if (periodType === 'monthly') {
    const baseRaw = String(source.referenceKey || source.referenceDate || source.date || fallbackDate).trim();
    const dateKey = normalizeDateKey(baseRaw);
    if (dateKey) {
      return {
        periodType: 'monthly',
        referenceKey: dateKey.slice(0, 7),
        referenceDate: dateKey
      };
    }
    const monthMatch = baseRaw.match(/^(\d{4})-(\d{2})/);
    const monthKey = monthMatch ? `${monthMatch[1]}-${monthMatch[2]}` : fallbackDate.slice(0, 7);
    return {
      periodType: 'monthly',
      referenceKey: monthKey,
      referenceDate: `${monthKey}-01`
    };
  }

  const dailyDate = normalizeDateKey(source.referenceKey || source.referenceDate || source.date || fallbackDate) || fallbackDate;
  return {
    periodType: 'daily',
    referenceKey: dailyDate,
    referenceDate: dailyDate
  };
}

function addBusinessDays(baseDateLike, businessDays) {
  const totalDays = Math.max(0, Number(businessDays || 0));
  const date = new Date(baseDateLike instanceof Date ? baseDateLike.getTime() : Date.now());
  if (!Number.isFinite(date.getTime())) return new Date();
  if (totalDays <= 0) return date;
  let remaining = totalDays;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

function buildReviewWorkflowDefaultDueAt(priorityLike) {
  const priority = normalizeReviewWorkflowPriority(priorityLike, 'medium');
  const now = new Date();
  let dueDate = new Date(now.getTime());
  if (priority === 'critical') {
    dueDate = new Date(now.getTime() + (4 * 60 * 60 * 1000));
  } else if (priority === 'high') {
    dueDate = addBusinessDays(now, 1);
  } else if (priority === 'low') {
    dueDate = addBusinessDays(now, 5);
  } else {
    dueDate = addBusinessDays(now, 3);
  }
  return dueDate.toISOString();
}

function normalizeReviewWorkflowActor(actorLike) {
  const actor = normalizeTechTicketActor(actorLike);
  return {
    username: actor.username || 'system',
    displayName: actor.displayName || actor.username || 'Sistema',
    role: normalizeRole(actorLike?.role || 'admin')
  };
}

function buildReviewWorkflowRecommendedReviewerReason(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const explicit = normalizeReviewWorkflowText(item.recommendedReviewerReason, 260);
  if (explicit) return explicit;
  const code = normalizeReviewWorkflowText(item.code, 80);
  const reason = normalizeReviewWorkflowText(item.reviewReason, 220);
  if (code && reason) return `Trigger ${code}: ${reason}`;
  if (reason) return reason;
  if (code) return `Trigger ${code} requer validacao humana.`;
  return 'Item priorizado para revisao guiada.';
}

function normalizeReviewWorkflowDecision(decisionLike, fallbackTypeLike) {
  const source = (decisionLike && typeof decisionLike === 'object') ? decisionLike : {};
  const defaultType = normalizeReviewDecisionType(fallbackTypeLike);
  const type = normalizeReviewDecisionType(source.type, defaultType);
  const hasActionEvidence = normalizeReviewWorkflowText(source.evidenceComplementary, 1400).length > 0
    || normalizeReviewWorkflowText(source.observation, 1400).length > 0;
  const fallbackResultByType = {
    aceite: 'aprovado',
    ajuste: 'solicitar_ajuste',
    revisao: 'solicitar_ajuste',
    encerramento: hasActionEvidence ? 'encerrado_com_acao' : 'encerrado_sem_acao',
    descarte: 'nao_procede'
  };
  const result = normalizeReviewDecisionResult(source.result, fallbackResultByType[type] || '');
  return {
    type,
    result,
    observation: normalizeReviewWorkflowText(source.observation, 1800),
    evidenceComplementary: normalizeReviewWorkflowText(source.evidenceComplementary, 1800),
    at: normalizeReviewWorkflowDateTime(source.at),
    byUser: normalizeReviewWorkflowText(source.byUser, 120),
    byRole: normalizeRole(source.byRole || 'lider_tecnico')
  };
}

function readReviewWorkflowStore() {
  const parsed = readJsonFile(REVIEW_WORKFLOW_FILE, {
    schemaVersion: REVIEW_WORKFLOW_SCHEMA_VERSION,
    updatedAt: '',
    items: []
  });
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return {
    schemaVersion: REVIEW_WORKFLOW_SCHEMA_VERSION,
    updatedAt: normalizeReviewWorkflowText(parsed?.updatedAt || '', 50),
    items: items.filter(item => item && typeof item === 'object')
  };
}

function writeReviewWorkflowStore(storeLike) {
  const safeStore = (storeLike && typeof storeLike === 'object')
    ? { ...storeLike }
    : { schemaVersion: REVIEW_WORKFLOW_SCHEMA_VERSION, updatedAt: '', items: [] };
  safeStore.schemaVersion = REVIEW_WORKFLOW_SCHEMA_VERSION;
  safeStore.updatedAt = nowIso();
  safeStore.items = Array.isArray(safeStore.items) ? safeStore.items : [];
  safeStore.items = safeStore.items
    .filter(item => item && typeof item === 'object')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, REVIEW_WORKFLOW_MAX_ITEMS);
  writeJsonFileAtomic(REVIEW_WORKFLOW_FILE, safeStore);
}

function buildReviewWorkflowId(scopeLike, referenceLike, codeLike) {
  const scope = normalizeStorageScope(scopeLike);
  const reference = normalizeReviewWorkflowReference(referenceLike, getLocalISODate(new Date()));
  const code = normalizeKey(codeLike || 'review_item') || 'review_item';
  const hashBase = `${scope.tenantKey}|${scope.unitKey}|${reference.periodType}|${reference.referenceKey}|${code}`;
  const hash = crypto.createHash('sha1').update(hashBase).digest('hex').slice(0, 10).toUpperCase();
  const dateCompact = reference.referenceKey.replace(/-/g, '');
  return `RWQ-${dateCompact}-${hash}`;
}

function buildReviewWorkflowHistoryEntry(actionLike, fromStatusLike, toStatusLike, actorLike, payloadLike) {
  const actor = normalizeReviewWorkflowActor(actorLike);
  const payload = (payloadLike && typeof payloadLike === 'object') ? payloadLike : {};
  const action = normalizeReviewWorkflowText(actionLike || 'atualizacao', 80) || 'atualizacao';
  const decision = normalizeReviewWorkflowDecision(payload.decision, '');
  return {
    eventId: crypto.randomBytes(8).toString('hex'),
    at: nowIso(),
    action,
    fromStatus: normalizeReviewWorkflowStatus(fromStatusLike || 'novo'),
    toStatus: normalizeReviewWorkflowStatus(toStatusLike || fromStatusLike || 'novo'),
    byUser: actor.username,
    byName: actor.displayName,
    byRole: actor.role,
    ownerUser: normalizeReviewWorkflowText(payload.ownerUser, 120),
    dueAt: normalizeReviewWorkflowDateTime(payload.dueAt),
    note: normalizeReviewWorkflowText(payload.note || payload.observation, 1400),
    decision: decision.type
      ? {
          type: decision.type,
          result: decision.result,
          observation: decision.observation
        }
      : null
  };
}

function buildReviewWorkflowHistoryPreview(historyLike) {
  const history = Array.isArray(historyLike) ? historyLike : [];
  return history
    .slice(-2)
    .reverse()
    .map(event => ({
      at: normalizeReviewWorkflowText(event?.at || '', 60),
      action: normalizeReviewWorkflowText(event?.action || '', 80),
      status: normalizeReviewWorkflowStatus(event?.toStatus || event?.fromStatus || 'novo'),
      byUser: normalizeReviewWorkflowText(event?.byUser || '', 120),
      byRole: normalizeRole(event?.byRole || 'lider_tecnico'),
      note: normalizeReviewWorkflowText(event?.note || '', 240),
      decisionType: normalizeReviewDecisionType(event?.decision?.type || '', ''),
      decisionResult: normalizeReviewDecisionResult(event?.decision?.result || '', '')
    }));
}

function summarizeReviewWorkflowItems(itemsLike) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const byStatus = {
    novo: 0,
    em_revisao: 0,
    ajustado: 0,
    validado: 0,
    encerrado: 0,
    descartado: 0
  };
  let open = 0;
  let overdue = 0;
  const nowTs = Date.now();

  for (const item of items) {
    const status = normalizeReviewWorkflowStatus(item?.status || 'novo');
    if (Object.prototype.hasOwnProperty.call(byStatus, status)) byStatus[status] += 1;
    if (isReviewWorkflowOpenStatus(status)) {
      open += 1;
      const dueAtIso = normalizeReviewWorkflowDateTime(item?.dueAt);
      if (dueAtIso) {
        const dueTs = Date.parse(dueAtIso);
        if (Number.isFinite(dueTs) && dueTs < nowTs) overdue += 1;
      }
    }
  }

  return {
    total: items.length,
    open,
    overdue,
    byStatus
  };
}

function matchesReviewWorkflowContext(itemLike, scopeLike, referenceLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const scope = normalizeStorageScope(scopeLike);
  const reference = normalizeReviewWorkflowReference(referenceLike, getLocalISODate(new Date()));
  const itemRef = normalizeReviewWorkflowReference(item, reference.referenceDate);
  return isSameScope(item, scope)
    && itemRef.periodType === reference.periodType
    && itemRef.referenceKey === reference.referenceKey;
}

function normalizeReviewWorkflowCandidate(itemLike, fallbackIndex) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const code = normalizeReviewWorkflowText(item.code || `review_item_${fallbackIndex + 1}`, 80);
  if (!code) return null;
  const reviewer = normalizeReviewWorkflowText(item.recommendedReviewer || 'gestor_operacional', 80) || 'gestor_operacional';
  return {
    code,
    priority: normalizeReviewWorkflowPriority(item.priority || 'medium'),
    reviewReason: normalizeReviewWorkflowText(item.reviewReason, 260),
    impact: normalizeReviewWorkflowText(item.impact, 260),
    recommendedReviewer: reviewer,
    recommendedReviewerReason: buildReviewWorkflowRecommendedReviewerReason(item),
    reviewChecklist: Array.from(new Set((Array.isArray(item.reviewChecklist) ? item.reviewChecklist : [])
      .map(line => normalizeReviewWorkflowText(line, 260))
      .filter(Boolean))).slice(0, 12),
    evidence: Array.from(new Set((Array.isArray(item.evidence) ? item.evidence : [])
      .map(line => normalizeReviewWorkflowText(line, 260))
      .filter(Boolean))).slice(0, 18),
    limitations: Array.from(new Set((Array.isArray(item.limitations) ? item.limitations : [])
      .map(line => normalizeReviewWorkflowText(line, 260))
      .filter(Boolean))).slice(0, 12)
  };
}

function upsertReviewWorkflowFromQueue(scopeLike, referenceLike, queueItemsLike, actorLike) {
  const scope = normalizeStorageScope(scopeLike);
  const reference = normalizeReviewWorkflowReference(referenceLike, getLocalISODate(new Date()));
  const actor = normalizeReviewWorkflowActor(actorLike);
  const store = readReviewWorkflowStore();
  const now = nowIso();
  const touched = new Set();
  let created = 0;
  let updated = 0;
  let reopened = 0;
  let autoClosed = 0;
  let changed = false;

  const candidates = (Array.isArray(queueItemsLike) ? queueItemsLike : [])
    .map((item, index) => normalizeReviewWorkflowCandidate(item, index))
    .filter(Boolean);

  for (const candidate of candidates) {
    const workflowId = buildReviewWorkflowId(scope, reference, candidate.code);
    touched.add(workflowId);
    const idx = store.items.findIndex(item => String(item?.workflowId || '') === workflowId && matchesReviewWorkflowContext(item, scope, reference));
    if (idx < 0) {
      const status = 'novo';
      const dueAt = buildReviewWorkflowDefaultDueAt(candidate.priority);
      const history = [
        buildReviewWorkflowHistoryEntry('detected', status, status, actor, {
          note: 'Item criado automaticamente a partir da fila guiada.',
          ownerUser: '',
          dueAt
        })
      ];
      store.items.unshift({
        workflowId,
        tenantKey: scope.tenantKey,
        unitKey: scope.unitKey,
        companyName: scope.companyName,
        unitName: scope.unitName,
        periodType: reference.periodType,
        referenceKey: reference.referenceKey,
        referenceDate: reference.referenceDate,
        code: candidate.code,
        priority: candidate.priority,
        reviewReason: candidate.reviewReason,
        impact: candidate.impact,
        recommendedReviewer: candidate.recommendedReviewer,
        recommendedReviewerReason: candidate.recommendedReviewerReason,
        reviewChecklist: candidate.reviewChecklist,
        evidence: candidate.evidence,
        limitations: candidate.limitations,
        status,
        ownerUser: '',
        ownerRole: '',
        dueAt,
        decision: {
          type: '',
          result: '',
          observation: '',
          evidenceComplementary: '',
          at: '',
          byUser: '',
          byRole: ''
        },
        version: 1,
        createdAt: now,
        createdBy: actor.username,
        createdByRole: actor.role,
        updatedAt: now,
        updatedBy: actor.username,
        updatedByRole: actor.role,
        lastAction: 'detected',
        lastActionAt: now,
        lastActorUser: actor.username,
        lastActorRole: actor.role,
        history
      });
      created += 1;
      changed = true;
      continue;
    }

    const current = { ...store.items[idx] };
    const previousStatus = normalizeReviewWorkflowStatus(current.status || 'novo');
    const isClosed = previousStatus === 'encerrado' || previousStatus === 'descartado';
    let nextStatus = previousStatus;
    let nextVersion = Math.max(1, Number(current.version || 1));
    let itemChanged = false;
    const history = Array.isArray(current.history) ? current.history.slice(0, REVIEW_WORKFLOW_MAX_HISTORY) : [];

    if (isClosed) {
      nextStatus = 'novo';
      reopened += 1;
      itemChanged = true;
      current.closedAt = '';
      history.push(buildReviewWorkflowHistoryEntry('auto_reopen', previousStatus, nextStatus, actor, {
        note: 'Trigger reapareceu na leitura atual.'
      }));
    }

    const assignField = (key, value) => {
      if (String(current[key] || '') !== String(value || '')) {
        current[key] = value;
        itemChanged = true;
      }
    };
    assignField('priority', candidate.priority);
    assignField('reviewReason', candidate.reviewReason);
    assignField('impact', candidate.impact);
    assignField('recommendedReviewer', candidate.recommendedReviewer);
    assignField('recommendedReviewerReason', candidate.recommendedReviewerReason);
    if (JSON.stringify(current.reviewChecklist || []) !== JSON.stringify(candidate.reviewChecklist)) {
      current.reviewChecklist = candidate.reviewChecklist;
      itemChanged = true;
    }
    if (JSON.stringify(current.evidence || []) !== JSON.stringify(candidate.evidence)) {
      current.evidence = candidate.evidence;
      itemChanged = true;
    }
    if (JSON.stringify(current.limitations || []) !== JSON.stringify(candidate.limitations)) {
      current.limitations = candidate.limitations;
      itemChanged = true;
    }
    if (!normalizeReviewWorkflowDateTime(current.dueAt)) {
      current.dueAt = buildReviewWorkflowDefaultDueAt(candidate.priority);
      itemChanged = true;
    }

    if (itemChanged) {
      nextVersion += 1;
      current.status = nextStatus;
      current.version = nextVersion;
      current.updatedAt = now;
      current.updatedBy = actor.username;
      current.updatedByRole = actor.role;
      current.lastAction = isClosed ? 'auto_reopen' : 'sync_update';
      current.lastActionAt = now;
      current.lastActorUser = actor.username;
      current.lastActorRole = actor.role;
      if (!isClosed) {
        history.push(buildReviewWorkflowHistoryEntry('sync_update', previousStatus, nextStatus, actor, {
          note: 'Item atualizado com a leitura mais recente da fila guiada.',
          ownerUser: current.ownerUser,
          dueAt: current.dueAt
        }));
      }
      current.history = history.slice(-REVIEW_WORKFLOW_MAX_HISTORY);
      store.items[idx] = current;
      updated += 1;
      changed = true;
    }
  }

  for (let i = 0; i < store.items.length; i += 1) {
    const item = store.items[i];
    if (!matchesReviewWorkflowContext(item, scope, reference)) continue;
    if (touched.has(String(item.workflowId || ''))) continue;
    const status = normalizeReviewWorkflowStatus(item.status || 'novo');
    if (!isReviewWorkflowOpenStatus(status)) continue;
    const next = { ...item };
    const closedStatus = 'encerrado';
    const observation = 'Encerrado automaticamente: trigger nao apareceu na leitura atual.';
    next.status = closedStatus;
    next.decision = {
      ...normalizeReviewWorkflowDecision(next.decision, 'encerramento'),
      type: 'encerramento',
      result: 'encerrado_sem_acao',
      observation,
      at: now,
      byUser: actor.username,
      byRole: actor.role
    };
    next.version = Math.max(1, Number(next.version || 1)) + 1;
    next.updatedAt = now;
    next.updatedBy = actor.username;
    next.updatedByRole = actor.role;
    next.lastAction = 'auto_encerramento';
    next.lastActionAt = now;
    next.lastActorUser = actor.username;
    next.lastActorRole = actor.role;
    next.closedAt = now;
    const history = Array.isArray(next.history) ? next.history.slice(-REVIEW_WORKFLOW_MAX_HISTORY) : [];
    history.push(buildReviewWorkflowHistoryEntry('auto_encerramento', status, closedStatus, actor, {
      note: observation,
      decision: next.decision,
      ownerUser: next.ownerUser,
      dueAt: next.dueAt
    }));
    next.history = history.slice(-REVIEW_WORKFLOW_MAX_HISTORY);
    store.items[i] = next;
    autoClosed += 1;
    changed = true;
  }

  if (changed) writeReviewWorkflowStore(store);
  if (changed) {
    writeServerLog('info', 'review-workflow-sync', {
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      periodType: reference.periodType,
      referenceKey: reference.referenceKey,
      created,
      updated,
      reopened,
      autoClosed
    });
  }

  const contextItems = store.items.filter(item => matchesReviewWorkflowContext(item, scope, reference));
  return {
    changed,
    created,
    updated,
    reopened,
    autoClosed,
    total: contextItems.length,
    summary: summarizeReviewWorkflowItems(contextItems)
  };
}

function listReviewWorkflowItems(scopeLike, options) {
  const scope = normalizeStorageScope(scopeLike);
  const opts = (options && typeof options === 'object') ? options : {};
  const reference = normalizeReviewWorkflowReference({
    periodType: opts.periodType || 'daily',
    referenceKey: opts.referenceKey || opts.referenceDate || opts.date,
    referenceDate: opts.referenceDate || opts.date
  }, opts.fallbackDate || getLocalISODate(new Date()));
  const limit = Math.max(1, Math.min(Number(opts.limit || 200), 1000));
  const statusFilter = normalizeReviewWorkflowStatus(opts.status || '', '');

  const store = readReviewWorkflowStore();
  return store.items
    .filter(item => matchesReviewWorkflowContext(item, scope, reference))
    .filter(item => !statusFilter || normalizeReviewWorkflowStatus(item.status || 'novo') === statusFilter)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, limit)
    .map(item => ({
      ...item,
      status: normalizeReviewWorkflowStatus(item.status || 'novo'),
      priority: normalizeReviewWorkflowPriority(item.priority || 'medium'),
      version: Math.max(1, Number(item.version || 1)),
      historyPreview: buildReviewWorkflowHistoryPreview(item.history)
    }));
}

function canActorMutateReviewWorkflowItem(actorLike, itemLike, decisionTypeLike) {
  const actor = normalizeReviewWorkflowActor(actorLike);
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const role = normalizeRole(actor.role);
  const reviewer = normalizeKey(item.recommendedReviewer || '');
  const ownerUser = normalizeKey(item.ownerUser || '');
  const actorUser = normalizeKey(actor.username || '');
  const decisionType = normalizeReviewDecisionType(decisionTypeLike);

  if (role === 'admin') return true;
  if (!decisionType) return false;
  if (decisionType === 'descarte') return false;
  if (ownerUser && ownerUser === actorUser) return true;

  if (role === 'lider_tecnico') {
    return reviewer === 'lider_tecnico' || reviewer === 'engenharia_tecnica';
  }
  if (role === 'lider_administrativo') {
    return reviewer === 'lider_administrativo';
  }
  return false;
}

function resolveReviewStatusByDecision(decisionTypeLike, currentStatusLike) {
  const decisionType = normalizeReviewDecisionType(decisionTypeLike);
  const currentStatus = normalizeReviewWorkflowStatus(currentStatusLike || 'novo');
  if (!decisionType) return currentStatus;
  if (decisionType === 'aceite') return 'validado';
  if (decisionType === 'ajuste') return 'ajustado';
  if (decisionType === 'revisao') return 'em_revisao';
  if (decisionType === 'encerramento') return 'encerrado';
  if (decisionType === 'descarte') return 'descartado';
  return currentStatus;
}

function applyReviewWorkflowAction(scopeLike, workflowIdLike, payloadLike, actorLike) {
  const scope = normalizeStorageScope(scopeLike);
  const workflowId = normalizeReviewWorkflowText(workflowIdLike, 80);
  const actor = normalizeReviewWorkflowActor(actorLike);
  const payload = (payloadLike && typeof payloadLike === 'object') ? payloadLike : {};
  if (!workflowId) return { ok: false, error: 'workflow_id_invalid' };

  const expectedVersion = Number(payload.expectedVersion);
  if (!Number.isFinite(expectedVersion) || expectedVersion <= 0) {
    return { ok: false, error: 'expected_version_required' };
  }

  const actionType = normalizeReviewDecisionType(
    payload.action || payload.decisionType || payload?.decision?.type,
    ''
  );
  if (!actionType) return { ok: false, error: 'action_invalid' };

  const store = readReviewWorkflowStore();
  const idx = store.items.findIndex(item => String(item?.workflowId || '') === workflowId && isSameScope(item, scope));
  if (idx < 0) return { ok: false, error: 'not_found' };

  const current = { ...store.items[idx] };
  const currentVersion = Math.max(1, Number(current.version || 1));
  if (currentVersion !== expectedVersion) {
    return {
      ok: false,
      error: 'version_conflict',
      current: {
        workflowId: current.workflowId,
        version: currentVersion,
        status: normalizeReviewWorkflowStatus(current.status || 'novo'),
        updatedAt: current.updatedAt || '',
        lastAction: current.lastAction || '',
        lastActorUser: current.lastActorUser || '',
        lastActorRole: current.lastActorRole || ''
      }
    };
  }

  if (!canActorMutateReviewWorkflowItem(actor, current, actionType)) {
    return { ok: false, error: 'forbidden' };
  }

  const nextStatus = resolveReviewStatusByDecision(actionType, current.status);
  const decision = normalizeReviewWorkflowDecision(
    {
      ...(payload.decision || {}),
      type: actionType,
      result: payload?.decision?.result || payload.result
    },
    actionType
  );
  if (!decision.result) {
    decision.result = normalizeReviewDecisionResult('', actionType === 'descarte' ? 'nao_procede' : (actionType === 'encerramento' ? 'encerrado_sem_acao' : 'aprovado'));
  }

  const ownerUser = normalizeReviewWorkflowText(
    Object.prototype.hasOwnProperty.call(payload, 'ownerUser')
      ? payload.ownerUser
      : (current.ownerUser || (actionType === 'revisao' ? actor.username : '')),
    120
  );
  const ownerRole = ownerUser
    ? normalizeRole(Object.prototype.hasOwnProperty.call(payload, 'ownerRole') ? payload.ownerRole : (current.ownerRole || actor.role))
    : '';
  const dueAt = Object.prototype.hasOwnProperty.call(payload, 'dueAt')
    ? normalizeReviewWorkflowDateTime(payload.dueAt) || current.dueAt || buildReviewWorkflowDefaultDueAt(current.priority || 'medium')
    : (normalizeReviewWorkflowDateTime(current.dueAt) || buildReviewWorkflowDefaultDueAt(current.priority || 'medium'));
  const reviewReason = normalizeReviewWorkflowText(
    Object.prototype.hasOwnProperty.call(payload, 'reviewReason') ? payload.reviewReason : current.reviewReason,
    260
  );
  const recommendedReviewer = normalizeReviewWorkflowText(
    Object.prototype.hasOwnProperty.call(payload, 'recommendedReviewer') ? payload.recommendedReviewer : current.recommendedReviewer,
    80
  ) || current.recommendedReviewer || 'gestor_operacional';
  const recommendedReviewerReason = normalizeReviewWorkflowText(
    Object.prototype.hasOwnProperty.call(payload, 'recommendedReviewerReason')
      ? payload.recommendedReviewerReason
      : current.recommendedReviewerReason,
    260
  ) || buildReviewWorkflowRecommendedReviewerReason({
    code: current.code,
    reviewReason,
    recommendedReviewer
  });

  const now = nowIso();
  const updated = {
    ...current,
    status: nextStatus,
    ownerUser,
    ownerRole,
    dueAt,
    reviewReason,
    recommendedReviewer,
    recommendedReviewerReason,
    decision: {
      ...decision,
      at: now,
      byUser: actor.username,
      byRole: actor.role
    },
    version: currentVersion + 1,
    updatedAt: now,
    updatedBy: actor.username,
    updatedByRole: actor.role,
    lastAction: actionType,
    lastActionAt: now,
    lastActorUser: actor.username,
    lastActorRole: actor.role
  };
  if (nextStatus === 'encerrado' || nextStatus === 'descartado') {
    updated.closedAt = now;
  }

  const history = Array.isArray(current.history) ? current.history.slice(-REVIEW_WORKFLOW_MAX_HISTORY) : [];
  history.push(buildReviewWorkflowHistoryEntry(actionType, current.status, nextStatus, actor, {
    note: normalizeReviewWorkflowText(payload.note || payload.observation || payload?.decision?.observation, 1400),
    ownerUser: updated.ownerUser,
    dueAt: updated.dueAt,
    decision: updated.decision
  }));
  updated.history = history.slice(-REVIEW_WORKFLOW_MAX_HISTORY);
  store.items[idx] = updated;
  writeReviewWorkflowStore(store);
  writeServerLog('info', 'review-workflow-action', {
    tenantKey: scope.tenantKey,
    unitKey: scope.unitKey,
    workflowId,
    action: actionType,
    status: nextStatus,
    actor: actor.username,
    actorRole: actor.role,
    version: updated.version
  });

  const reference = normalizeReviewWorkflowReference(updated, updated.referenceDate || getLocalISODate(new Date()));
  const scopedItems = store.items.filter(item => matchesReviewWorkflowContext(item, scope, reference));
  return {
    ok: true,
    item: {
      ...updated,
      historyPreview: buildReviewWorkflowHistoryPreview(updated.history)
    },
    summary: summarizeReviewWorkflowItems(scopedItems)
  };
}

function mergeReviewWorkflowIntoDetailed(scopeLike, fallbackDate, detailedLike, actorLike) {
  const scope = normalizeStorageScope(scopeLike);
  const actor = normalizeReviewWorkflowActor(actorLike);
  const detailed = (detailedLike && typeof detailedLike === 'object')
    ? { ...detailedLike }
    : {};
  const queue = Array.isArray(detailed.reviewQueue) ? detailed.reviewQueue : [];
  const period = (detailed.period && typeof detailed.period === 'object') ? detailed.period : {};
  const reference = normalizeReviewWorkflowReference({
    periodType: period.type || 'daily',
    referenceKey: period.referenceDate || fallbackDate,
    referenceDate: period.referenceDate || fallbackDate
  }, normalizeDateKey(fallbackDate) || getLocalISODate(new Date()));

  const sync = upsertReviewWorkflowFromQueue(scope, reference, queue, actor);
  const workflowItems = listReviewWorkflowItems(scope, {
    periodType: reference.periodType,
    referenceKey: reference.referenceKey,
    limit: 600
  });
  const workflowMap = new Map(workflowItems.map(item => [String(item.workflowId || ''), item]));
  const mergedQueue = queue.map((itemRaw, index) => {
    const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
    const code = normalizeReviewWorkflowText(item.code || `review_item_${index + 1}`, 80);
    const workflowId = buildReviewWorkflowId(scope, reference, code);
    const workflow = workflowMap.get(workflowId);
    return {
      ...item,
      code,
      workflowId,
      status: normalizeReviewWorkflowStatus(workflow?.status || 'novo'),
      ownerUser: normalizeReviewWorkflowText(workflow?.ownerUser || '', 120),
      dueAt: normalizeReviewWorkflowDateTime(workflow?.dueAt || '') || '',
      lastAction: normalizeReviewWorkflowText(workflow?.lastAction || 'detected', 80) || 'detected',
      lastActionAt: normalizeReviewWorkflowDateTime(workflow?.lastActionAt || workflow?.updatedAt || '') || '',
      lastActorUser: normalizeReviewWorkflowText(workflow?.lastActorUser || '', 120),
      lastActorRole: normalizeRole(workflow?.lastActorRole || 'lider_tecnico'),
      historyPreview: buildReviewWorkflowHistoryPreview(workflow?.history),
      version: Math.max(1, Number(workflow?.version || 1)),
      recommendedReviewer: normalizeReviewWorkflowText(workflow?.recommendedReviewer || item.recommendedReviewer || 'gestor_operacional', 80),
      recommendedReviewerReason: normalizeReviewWorkflowText(
        workflow?.recommendedReviewerReason || item.recommendedReviewerReason || buildReviewWorkflowRecommendedReviewerReason(item),
        260
      )
    };
  });

  const workflowSummary = summarizeReviewWorkflowItems(workflowItems);
  const existingSummary = (detailed.reviewQueueSummary && typeof detailed.reviewQueueSummary === 'object')
    ? { ...detailed.reviewQueueSummary }
    : {};

  detailed.reviewQueue = mergedQueue;
  detailed.reviewQueueSummary = {
    ...existingSummary,
    workflow: {
      total: workflowSummary.total,
      open: workflowSummary.open,
      overdue: workflowSummary.overdue,
      byStatus: workflowSummary.byStatus,
      periodType: reference.periodType,
      referenceKey: reference.referenceKey,
      syncedAt: nowIso()
    }
  };
  detailed.reviewWorkflowSummary = {
    ...workflowSummary,
    periodType: reference.periodType,
    referenceKey: reference.referenceKey
  };
  detailed.reviewWorkflowSync = {
    changed: !!sync.changed,
    created: Number(sync.created || 0),
    updated: Number(sync.updated || 0),
    reopened: Number(sync.reopened || 0),
    autoClosed: Number(sync.autoClosed || 0),
    total: Number(sync.total || workflowSummary.total || 0)
  };

  return {
    detailed,
    summary: detailed.reviewWorkflowSummary,
    sync: detailed.reviewWorkflowSync,
    reference
  };
}

function normalizeDateKey(value) {
  const dateKey = String(value || '').trim();
  return DATE_KEY_REGEX.test(dateKey) ? dateKey : '';
}

function getLocalISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLanUrls(port) {
  const nets = os.networkInterfaces();
  const urls = new Set();
  Object.values(nets).forEach(entries => {
    (entries || []).forEach(entry => {
      if (!entry || entry.internal || entry.family !== 'IPv4') return;
      urls.add(`http://${entry.address}:${port}`);
    });
  });
  return Array.from(urls).sort();
}

function diffChangedKeys(previousData, nextData) {
  const before = previousData || {};
  const after = nextData || {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [];
  for (const key of keys) {
    const prev = before[key];
    const next = after[key];
    if (String(prev ?? '') !== String(next ?? '')) changed.push(key);
  }
  return changed.sort();
}

function summarizeChanges(changedKeys, blockedKeys) {
  const changedCount = Array.isArray(changedKeys) ? changedKeys.length : 0;
  const blockedCount = Array.isArray(blockedKeys) ? blockedKeys.length : 0;
  const preview = (changedKeys || []).slice(0, 6).join(', ');
  let summary = `${changedCount} campo(s) alterado(s)`;
  if (preview) summary += `: ${preview}`;
  if (blockedCount > 0) summary += ` | ${blockedCount} bloqueado(s) por perfil`;
  return summary.slice(0, 460);
}

function notifyStreamClients(eventName, payload) {
  if (!streamClients.size) return;
  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const client of streamClients) {
    try {
      client.write(message);
    } catch (_) {}
  }
}

function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return { salt, hash };
}

function normalizeEmailAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : '';
}

function maskEmailAddress(email) {
  const normalized = normalizeEmailAddress(email);
  if (!normalized) return '';
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 1) return `*${normalized.slice(atIndex)}`;
  const name = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex);
  return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name.slice(-1)}${domain}`;
}

function readSmtpConfigStore() {
  const base = {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: '',
    updatedAt: ''
  };
  const loaded = readJsonFile(SMTP_CONFIG_FILE, base) || base;
  return {
    ...base,
    ...loaded,
    enabled: loaded.enabled === true,
    host: asSafeText(loaded.host),
    port: Number(loaded.port || 587),
    secure: loaded.secure === true || String(loaded.secure || '').toLowerCase() === 'true',
    user: asSafeText(loaded.user),
    pass: String(loaded.pass || ''),
    from: asSafeText(loaded.from),
    updatedAt: asSafeText(loaded.updatedAt)
  };
}

function writeSmtpConfigStore(nextConfig) {
  const current = readSmtpConfigStore();
  const merged = {
    ...current,
    ...(nextConfig || {}),
    enabled: nextConfig?.enabled === true,
    host: asSafeText(nextConfig?.host || ''),
    port: Math.max(1, Math.min(65535, Number(nextConfig?.port || 587))),
    secure: nextConfig?.secure === true || String(nextConfig?.secure || '').toLowerCase() === 'true',
    user: asSafeText(nextConfig?.user || ''),
    pass: String(nextConfig?.pass || ''),
    from: asSafeText(nextConfig?.from || ''),
    updatedAt: nowIso()
  };
  writeJsonFileAtomic(SMTP_CONFIG_FILE, merged);
  return merged;
}

function sanitizeSmtpConfigForClient(config) {
  const raw = config || readSmtpConfigStore();
  return {
    enabled: raw.enabled === true,
    host: asSafeText(raw.host),
    port: Number(raw.port || 587),
    secure: raw.secure === true,
    user: asSafeText(raw.user),
    from: asSafeText(raw.from),
    hasPassword: !!String(raw.pass || '').trim(),
    updatedAt: asSafeText(raw.updatedAt)
  };
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return VALID_ROLES.has(value) ? value : 'lider_tecnico';
}

function sanitizeMenuPermissions(value, role) {
  const normalizedRole = normalizeRole(role);
  const defaults = (ROLE_DEFAULT_MENU_PERMISSIONS[normalizedRole] || ROLE_DEFAULT_MENU_PERMISSIONS.lider_tecnico || ['painel']).slice();
  const allowed = new Set(PANEL_SECTIONS);
  const incoming = Array.isArray(value) ? value : [];
  const clean = [];
  for (const entry of incoming) {
    const key = String(entry || '').trim().toLowerCase();
    if (!allowed.has(key)) continue;
    if (!clean.includes(key)) clean.push(key);
  }
  return clean.length ? clean : defaults;
}

function createUserRecord({
  username,
  displayName,
  role,
  password,
  email,
  active = true,
  mustChangePassword = true,
  menuPermissions,
  tenantKey,
  unitKey,
  companyName,
  unitName
}) {
  const pwd = hashPassword(password);
  const normalizedRole = normalizeRole(role || 'lider_tecnico');
  const scope = normalizeUserScope({ tenantKey, unitKey, companyName, unitName });
  return {
    username: String(username || '').trim().toLowerCase(),
    displayName: String(displayName || username || '').trim(),
    email: normalizeEmailAddress(email),
    role: normalizedRole,
    tenantKey: scope.tenantKey,
    unitKey: scope.unitKey,
    companyName: scope.companyName,
    unitName: scope.unitName,
    menuPermissions: sanitizeMenuPermissions(menuPermissions, normalizedRole),
    active: !!active,
    mustChangePassword: !!mustChangePassword,
    passwordSalt: pwd.salt,
    passwordHash: pwd.hash,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: null
  };
}

function readUsersStore() {
  const parsed = readJsonFile(USERS_FILE, { schemaVersion: 1, users: [] });
  const users = Array.isArray(parsed.users) ? parsed.users : [];
  const org = readOrganizationConfig();
  return {
    schemaVersion: Number(parsed.schemaVersion || 1),
    users: users.map(user => {
      const normalizedRole = normalizeRole(user?.role || 'lider_tecnico');
      const scope = normalizeUserScope(user, org);
      return {
        ...user,
        role: normalizedRole,
        tenantKey: scope.tenantKey,
        unitKey: scope.unitKey,
        companyName: scope.companyName,
        unitName: scope.unitName,
        menuPermissions: sanitizeMenuPermissions(user?.menuPermissions, normalizedRole),
        mustChangePassword: user?.mustChangePassword === true
      };
    })
  };
}

function writeUsersStore(store) {
  writeJsonFileAtomic(USERS_FILE, store || { schemaVersion: 1, users: [] });
}

function findUserByUsername(store, username) {
  const key = String(username || '').trim().toLowerCase();
  if (!key) return null;
  return (store?.users || []).find(user => String(user.username || '').toLowerCase() === key) || null;
}

function findUserByIdentifier(store, identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  if (!key) return null;
  return (store?.users || []).find(user => {
    const username = String(user.username || '').toLowerCase();
    const email = normalizeEmailAddress(user.email);
    return username === key || (email && email === key);
  }) || null;
}

function sanitizeUser(user) {
  if (!user) return null;
  const role = normalizeRole(user.role || 'lider_tecnico');
  const scope = normalizeUserScope(user);
  return {
    username: user.username,
    displayName: user.displayName || user.username,
    email: normalizeEmailAddress(user.email),
    role,
    tenantKey: scope.tenantKey,
    unitKey: scope.unitKey,
    companyName: scope.companyName,
    unitName: scope.unitName,
    menuPermissions: sanitizeMenuPermissions(user.menuPermissions, role),
    active: !!user.active,
    mustChangePassword: user.mustChangePassword === true,
    lastLoginAt: user.lastLoginAt || null
  };
}

function verifyUserPassword(user, plainPassword) {
  if (!user?.passwordSalt || !user?.passwordHash) return false;
  try {
    const candidate = hashPassword(plainPassword, user.passwordSalt).hash;
    return isHexEqual(candidate, String(user.passwordHash || ''));
  } catch (_) {
    return false;
  }
}

function evaluatePasswordPolicy(password, context) {
  const value = String(password || '');
  const ctx = context || {};
  const reasons = [];
  if (value.length < PASSWORD_MIN_LENGTH) reasons.push(`minimo ${PASSWORD_MIN_LENGTH} caracteres`);
  if (!/[a-z]/.test(value)) reasons.push('ao menos 1 letra minuscula');
  if (!/[A-Z]/.test(value)) reasons.push('ao menos 1 letra maiuscula');
  if (!/\d/.test(value)) reasons.push('ao menos 1 numero');
  if (!/[^A-Za-z0-9]/.test(value)) reasons.push('ao menos 1 simbolo');

  const lowered = value.toLowerCase();
  const username = asSafeText(ctx.username || '').toLowerCase();
  const email = normalizeEmailAddress(ctx.email);
  const emailUser = email.split('@')[0] || '';
  if (username && username.length >= 3 && lowered.includes(username)) reasons.push('nao deve conter o usuario');
  if (emailUser && emailUser.length >= 3 && lowered.includes(emailUser)) reasons.push('nao deve conter o e-mail');
  return {
    ok: reasons.length === 0,
    reasons
  };
}

function passwordPolicyMessage(result) {
  if (!result || result.ok) return '';
  return `Senha fora da politica: ${result.reasons.join('; ')}.`;
}

function isHexEqual(aHex, bHex) {
  try {
    const a = Buffer.from(String(aHex || ''), 'hex');
    const b = Buffer.from(String(bHex || ''), 'hex');
    if (!a.length || !b.length || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function normalizeLoginAttemptKey(identifier) {
  return String(identifier || '').trim().toLowerCase();
}

function readLoginAttemptStore() {
  const loaded = readJsonFile(LOGIN_ATTEMPT_FILE, []);
  return Array.isArray(loaded) ? loaded : [];
}

function writeLoginAttemptStore(items) {
  writeJsonFileAtomic(LOGIN_ATTEMPT_FILE, Array.isArray(items) ? items : []);
}

function cleanupLoginAttemptStore() {
  const now = Date.now();
  const all = readLoginAttemptStore();
  const kept = all.filter(item => {
    const lockUntil = Number(item?.lockUntil || 0);
    const lastFailedAt = Number(item?.lastFailedAt || 0);
    if (lockUntil > now) return true;
    if (!lastFailedAt) return false;
    return (now - lastFailedAt) <= (LOGIN_ATTEMPT_WINDOW_MS * 2);
  });
  if (kept.length !== all.length) writeLoginAttemptStore(kept);
  return kept;
}

function getLoginAttemptState(identifier) {
  const key = normalizeLoginAttemptKey(identifier);
  if (!key) return { locked: false, failedCount: 0, lockRemainingMs: 0, key: '' };
  const store = cleanupLoginAttemptStore();
  const row = store.find(item => normalizeLoginAttemptKey(item?.key) === key);
  if (!row) return { locked: false, failedCount: 0, lockRemainingMs: 0, key };
  const now = Date.now();
  const lockUntil = Number(row.lockUntil || 0);
  const locked = lockUntil > now;
  return {
    key,
    locked,
    failedCount: Number(row.failedCount || 0),
    lockUntil,
    lockRemainingMs: locked ? (lockUntil - now) : 0
  };
}

function registerFailedLoginAttempt(identifier) {
  const key = normalizeLoginAttemptKey(identifier);
  if (!key) return getLoginAttemptState('');
  const now = Date.now();
  const store = cleanupLoginAttemptStore();
  let row = store.find(item => normalizeLoginAttemptKey(item?.key) === key);
  if (!row) {
    row = { key, failedCount: 0, firstFailedAt: now, lastFailedAt: now, lockUntil: 0 };
    store.push(row);
  }
  if (!Number(row.firstFailedAt) || (now - Number(row.firstFailedAt || 0)) > LOGIN_ATTEMPT_WINDOW_MS) {
    row.firstFailedAt = now;
    row.failedCount = 0;
  }
  row.failedCount = Number(row.failedCount || 0) + 1;
  row.lastFailedAt = now;
  if (row.failedCount >= LOGIN_MAX_ATTEMPTS) {
    row.lockUntil = now + LOGIN_LOCK_MS;
  }
  writeLoginAttemptStore(store);
  return getLoginAttemptState(key);
}

function clearLoginAttempt(identifier) {
  const key = normalizeLoginAttemptKey(identifier);
  if (!key) return;
  const store = cleanupLoginAttemptStore();
  const next = store.filter(item => normalizeLoginAttemptKey(item?.key) !== key);
  if (next.length !== store.length) writeLoginAttemptStore(next);
}

function readPasswordResetStore() {
  const loaded = readJsonFile(PASSWORD_RESET_FILE, []);
  return Array.isArray(loaded) ? loaded : [];
}

function writePasswordResetStore(items) {
  writeJsonFileAtomic(PASSWORD_RESET_FILE, Array.isArray(items) ? items : []);
}

function readPasswordResetOutbox() {
  const loaded = readJsonFile(PASSWORD_RESET_OUTBOX_FILE, []);
  return Array.isArray(loaded) ? loaded : [];
}

function writePasswordResetOutbox(items) {
  writeJsonFileAtomic(PASSWORD_RESET_OUTBOX_FILE, Array.isArray(items) ? items : []);
}

function cleanupExpiredPasswordResetRequests() {
  const now = Date.now();
  const items = readPasswordResetStore();
  const valid = items.filter(item => Number(item?.expiresAt || 0) > now);
  if (valid.length !== items.length) writePasswordResetStore(valid);
  return valid;
}

function buildResetCodeHash(code, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(code || ''), salt, 64).toString('hex');
  return { salt, hash };
}

function generatePasswordResetCode() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  return code;
}

function getSmtpConfig() {
  const envHost = asSafeText(process.env.PAINEL_SMTP_HOST || '');
  const envPort = Number(process.env.PAINEL_SMTP_PORT || 0);
  const envSecure = String(process.env.PAINEL_SMTP_SECURE || '').trim().toLowerCase() === 'true';
  const envUser = asSafeText(process.env.PAINEL_SMTP_USER || '');
  const envPass = String(process.env.PAINEL_SMTP_PASS || '');
  const envFrom = asSafeText(process.env.PAINEL_SMTP_FROM || '');

  if (envHost && envPort && envUser && envPass && envFrom) {
    return {
      host: envHost,
      port: envPort,
      secure: envSecure,
      user: envUser,
      pass: envPass,
      from: envFrom,
      source: 'env'
    };
  }

  const saved = readSmtpConfigStore();
  if (!saved.enabled) return null;
  if (!saved.host || !saved.port || !saved.user || !saved.pass || !saved.from) return null;
  return {
    host: saved.host,
    port: saved.port,
    secure: saved.secure,
    user: saved.user,
    pass: saved.pass,
    from: saved.from,
    source: 'file'
  };
}

function formatSmtpError(err, smtp) {
  const raw = String(err?.message || err || '').trim();
  const host = String(smtp?.host || '').toLowerCase();
  const isGmail = host.includes('gmail');

  if (isGmail && /(invalid login|535|eauth|authentication unsuccessful)/i.test(raw)) {
    return 'Falha de autenticacao no Gmail SMTP. Use senha de app do Google (2 etapas) e confirme usuario/remetente.';
  }
  if (isGmail && /(534|application-specific password required|5\\.7\\.9)/i.test(raw)) {
    return 'Gmail exige senha de app para SMTP. Ative 2 etapas e gere uma senha de app no Google Account.';
  }
  if (isGmail && /(timed out|etimedout|econnreset|econnrefused)/i.test(raw)) {
    return 'Falha de conexao com Gmail SMTP. Valide host smtp.gmail.com, porta 587 (TLS) ou 465 (SSL) e firewall/rede.';
  }
  return raw || 'Falha no envio SMTP.';
}

async function sendPasswordResetMessage(user, code) {
  const email = normalizeEmailAddress(user?.email);
  if (!email) {
    throw new Error('Usuario sem e-mail cadastrado para recuperacao.');
  }

  const smtp = getSmtpConfig();
  const subject = 'Tagus-Tec Campinas | Recuperacao de senha do painel';
  const textBody = [
    `Ola, ${user.displayName || user.username}.`,
    '',
    `Seu codigo de recuperacao do painel: ${code}`,
    'Validade: 15 minutos.',
    '',
    'Se voce nao solicitou, ignore esta mensagem.'
  ].join('\n');

  if (smtp && nodemailerLib) {
    const transporter = nodemailerLib.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass }
    });

    try {
      await transporter.sendMail({
        from: smtp.from,
        to: email,
        subject,
        text: textBody
      });
    } catch (err) {
      throw new Error(formatSmtpError(err, smtp));
    }
    return { channel: 'smtp', maskedEmail: maskEmailAddress(email) };
  }

  const outbox = readPasswordResetOutbox();
  outbox.unshift({
    id: crypto.randomBytes(8).toString('hex'),
    createdAt: new Date().toISOString(),
    username: user.username,
    email,
    subject,
    text: textBody,
    code
  });
  writePasswordResetOutbox(outbox.slice(0, 200));
  return { channel: 'outbox', maskedEmail: maskEmailAddress(email) };
}

function revokeUserSessions(username) {
  const key = String(username || '').trim().toLowerCase();
  if (!key) return;
  for (const [token, session] of sessions.entries()) {
    if (String(session?.username || '').toLowerCase() === key) {
      sessions.delete(token);
    }
  }
}

function shouldTouchSession(req) {
  const method = String(req?.method || '').toUpperCase();
  if (method && method !== 'GET' && method !== 'HEAD') return true;
  const rawHeader = req?.headers?.[SESSION_ACTIVITY_HEADER];
  if (rawHeader == null) return false;
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (value == null) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  const parsed = Number(trimmed);
  const activityAt = Number.isFinite(parsed) ? parsed : Date.parse(trimmed);
  if (!Number.isFinite(activityAt)) return false;
  const now = Date.now();
  if (activityAt > now + 60 * 1000) return false;
  return (now - activityAt) <= SESSION_ACTIVITY_MAX_AGE_MS;
}

function resolveBootstrapPassword(options) {
  const opts = options || {};
  const explicit = String(opts.explicit || '').trim();
  if (explicit) return explicit;
  if (ALLOW_INSECURE_BOOTSTRAP_DEFAULTS) {
    const fallback = String(opts.insecureFallback || '').trim();
    if (fallback) {
      writeServerLog('warn', 'insecure-bootstrap-password-enabled', {
        user: String(opts.username || '').trim() || 'unknown',
        envFlag: 'PAINEL_ALLOW_INSECURE_BOOTSTRAP_DEFAULTS'
      });
    }
    return fallback;
  }
  writeServerLog('warn', 'bootstrap-password-missing', {
    user: String(opts.username || '').trim() || 'unknown',
    requiredEnv: String(opts.requiredEnv || '').trim() || ''
  });
  return '';
}

function ensureUsersStore() {
  const store = readUsersStore();
  const org = readOrganizationConfig();
  let changed = false;

  for (const user of store.users || []) {
    const normalizedRole = normalizeRole(user?.role || 'lider_tecnico');
    if (user.role !== normalizedRole) {
      user.role = normalizedRole;
      changed = true;
    }
    const normalizedPermissions = sanitizeMenuPermissions(user?.menuPermissions, normalizedRole);
    const currentPermissions = Array.isArray(user?.menuPermissions) ? user.menuPermissions : [];
    if (JSON.stringify(currentPermissions) !== JSON.stringify(normalizedPermissions)) {
      user.menuPermissions = normalizedPermissions;
      changed = true;
    }
    const scope = normalizeUserScope(user, org);
    if (user.tenantKey !== scope.tenantKey || user.unitKey !== scope.unitKey || user.companyName !== scope.companyName || user.unitName !== scope.unitName) {
      user.tenantKey = scope.tenantKey;
      user.unitKey = scope.unitKey;
      user.companyName = scope.companyName;
      user.unitName = scope.unitName;
      changed = true;
    }
  }

  if (!findUserByUsername(store, DEFAULT_ADMIN_USER)) {
    const adminPassword = resolveBootstrapPassword({
      explicit: DEFAULT_ADMIN_PASSWORD,
      insecureFallback: INSECURE_FALLBACK_ADMIN_PASSWORD,
      username: DEFAULT_ADMIN_USER,
      requiredEnv: 'PAINEL_BOOTSTRAP_ADMIN_PASSWORD'
    });
    if (adminPassword) {
      store.users.push(createUserRecord({
        username: DEFAULT_ADMIN_USER,
        displayName: 'Administrador Campinas',
        role: 'admin',
        password: adminPassword,
        tenantKey: org.tenantKey,
        unitKey: org.unitKey,
        companyName: org.companyName,
        unitName: org.unitName
      }));
      changed = true;
    }
  }

  if (!findUserByUsername(store, DEFAULT_TECH_LEAD_USER)) {
    const techPassword = resolveBootstrapPassword({
      explicit: DEFAULT_TECH_LEAD_PASSWORD,
      insecureFallback: INSECURE_FALLBACK_TECH_PASSWORD,
      username: DEFAULT_TECH_LEAD_USER,
      requiredEnv: 'PAINEL_BOOTSTRAP_TECH_PASSWORD'
    });
    if (techPassword) {
      store.users.push(createUserRecord({
        username: DEFAULT_TECH_LEAD_USER,
        displayName: 'Lider Tecnico',
        role: 'lider_tecnico',
        password: techPassword,
        tenantKey: org.tenantKey,
        unitKey: org.unitKey,
        companyName: org.companyName,
        unitName: org.unitName
      }));
      changed = true;
    }
  }

  if (changed || !fs.existsSync(USERS_FILE)) writeUsersStore(store);
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (!session || Number(session.expiresAt || 0) <= now) sessions.delete(token);
  }
}

function createSessionForUser(user) {
  pruneExpiredSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const role = normalizeRole(user.role || 'lider_tecnico');
  const scope = normalizeUserScope(user);
  sessions.set(token, {
    username: user.username,
    displayName: user.displayName || user.username,
    email: normalizeEmailAddress(user.email),
    role,
    tenantKey: scope.tenantKey,
    unitKey: scope.unitKey,
    companyName: scope.companyName,
    unitName: scope.unitName,
    menuPermissions: sanitizeMenuPermissions(user.menuPermissions, role),
    expiresAt
  });
  return { token, expiresAt };
}

function getTokenFromRequest(req, allowQueryToken = false) {
  const headerToken = req.headers?.[SESSION_HEADER];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();

  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const value = auth.slice(7).trim();
    if (value) return value;
  }

  if (allowQueryToken) {
    const queryToken = req.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();
  }
  return '';
}

function getSessionFromRequest(req, options) {
  const opts = options || {};
  pruneExpiredSessions();
  const token = getTokenFromRequest(req, !!opts.allowQueryToken);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Number(session.expiresAt || 0) <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function touchSession(token) {
  if (!token || !sessions.has(token)) return;
  const current = sessions.get(token);
  sessions.set(token, { ...current, expiresAt: Date.now() + SESSION_TTL_MS });
}

function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req, { allowQueryToken: true });
  if (!session) return res.status(401).json({ ok: false, error: 'Sessao invalida ou expirada.' });
  if (shouldTouchSession(req)) touchSession(session.token);
  const refreshed = sessions.get(session.token) || session;
  req.authUser = {
    username: refreshed.username,
    displayName: refreshed.displayName,
    email: refreshed.email || '',
    role: refreshed.role || 'lider_tecnico',
    tenantKey: refreshed.tenantKey || '',
    unitKey: refreshed.unitKey || '',
    companyName: refreshed.companyName || '',
    unitName: refreshed.unitName || '',
    token: session.token
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.authUser || req.authUser.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Acesso permitido apenas para admin.' });
  }
  next();
}

function resolveRequestLocale(req) {
  const queryLang = String(req.query?.lang || '').trim();
  const headerLang = String(req.headers?.['x-panel-lang'] || req.headers?.['accept-language'] || '').trim();
  const orgLocale = readOrganizationConfig().localeDefault || 'pt-BR';
  return detectLocale(queryLang || headerLang || orgLocale);
}

const RESTRICTED_PATTERNS = {
  lider_tecnico: [
    /^op_/i,
    /^adm_/i,
    /^adm-/i,
    /^diag_/i,
    /^res_/i,
    /^exe_/i,
    /^neg_/i,
    /^melh_/i,
    /^footerDate_administrativo$/i,
    /^footerOwner_administrativo$/i
  ],
  lider_administrativo: [
    /^op_/i,
    /^tec_/i,
    /^tec-/i,
    /^diag_/i,
    /^res_/i,
    /^exe_/i,
    /^neg_/i,
    /^melh_/i
  ]
};

function applyRoleDataPolicy(role, incomingData, existingData) {
  const source = (incomingData && typeof incomingData === 'object') ? incomingData : {};
  const current = (existingData && typeof existingData === 'object') ? existingData : {};
  const result = { ...source };
  const blockedKeys = [];
  const patterns = RESTRICTED_PATTERNS[role] || [];
  if (!patterns.length) return { data: result, blockedKeys };

  const allKeys = new Set([...Object.keys(source), ...Object.keys(current)]);
  for (const key of allKeys) {
    if (!patterns.some(regex => regex.test(key))) continue;
    const sourceValue = source[key];
    const currentValue = current[key];
    if (String(sourceValue ?? '') !== String(currentValue ?? '')) blockedKeys.push(key);
    if (Object.prototype.hasOwnProperty.call(current, key)) result[key] = currentValue;
    else delete result[key];
  }
  return { data: result, blockedKeys: blockedKeys.sort() };
}

function parseSqlCredentialFile(filePath) {
  const info = {};
  if (!fs.existsSync(filePath)) return info;
  const raw = fs.readFileSync(filePath, 'utf-8');
  raw.split(/\r?\n/).forEach(line => {
    const parts = line.split(':');
    if (parts.length < 2) return;
    const key = parts.shift().trim().toLowerCase();
    const value = parts.join(':').trim();
    if (!value) return;
    if (key === 'servidor') info.server = value;
    if (key === 'banco') info.database = value;
    if (key === 'usuario') info.user = value;
    if (key === 'senha') info.password = value;
  });
  return info;
}

function parseSqlServer(serverRaw) {
  const normalized = String(serverRaw || '.\\SQLEXPRESS').trim();
  const clean = normalized.replace(/^tcp:/i, '');
  if (clean.includes('\\')) {
    const [serverPart, instanceName] = clean.split('\\');
    const server = (!serverPart || serverPart === '.' || serverPart.toLowerCase() === '(local)') ? 'localhost' : serverPart;
    return { server, instanceName: instanceName || undefined };
  }
  const server = (clean === '.' || clean.toLowerCase() === '(local)') ? 'localhost' : clean;
  return { server, instanceName: undefined };
}

function buildSqlConfig() {
  if (!ALLOW_LEGACY_SQL_CREDENTIAL_FILE && fs.existsSync(SQL_CREDENTIAL_FILE) && !legacySqlCredentialWarningIssued) {
    legacySqlCredentialWarningIssued = true;
    writeServerLog('warn', 'legacy-sql-credential-file-ignored', {
      file: SQL_CREDENTIAL_FILE,
      requiredEnv: ['SQL_SERVER', 'SQL_DATABASE', 'SQL_USER', 'SQL_PASSWORD'],
      enableLegacyWith: 'PAINEL_ALLOW_LEGACY_SQL_CREDENTIAL_FILE=1'
    });
  }
  const fileCred = ALLOW_LEGACY_SQL_CREDENTIAL_FILE
    ? parseSqlCredentialFile(SQL_CREDENTIAL_FILE)
    : {};
  const serverRaw = process.env.SQL_SERVER || fileCred.server || '.\\SQLEXPRESS';
  const database = process.env.SQL_DATABASE || fileCred.database || 'DMPACESSO';
  const user = process.env.SQL_USER || fileCred.user || '';
  const password = process.env.SQL_PASSWORD || fileCred.password || '';
  const parsedServer = parseSqlServer(serverRaw);
  const port = Number(process.env.SQL_PORT || 0);

  if (!user || !password) {
    throw new Error(
      'Credenciais SQL nao encontradas. Defina SQL_USER/SQL_PASSWORD via ambiente (.env/.env.local). '
      + 'Fallback legado em arquivo exige PAINEL_ALLOW_LEGACY_SQL_CREDENTIAL_FILE=1.'
    );
  }

  const config = {
    user,
    password,
    database,
    server: parsedServer.server,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  if (parsedServer.instanceName) config.options.instanceName = parsedServer.instanceName;
  if (port > 0 && !parsedServer.instanceName) config.port = port;
  return config;
}

async function getSqlPool() {
  if (!sqlLib) throw new Error('Pacote mssql nao disponivel.');
  if (!sqlPoolPromise) {
    const cfg = buildSqlConfig();
    sqlPoolPromise = new sqlLib.ConnectionPool(cfg).connect();
  }
  return sqlPoolPromise;
}

async function initializeSqlSchema(pool) {
  const defaultTenant = String(DEFAULT_ORG_CONFIG.tenantKey || 'tagus_tec').replace(/'/g, "''");
  const defaultUnit = String(DEFAULT_ORG_CONFIG.unitKey || 'campinas').replace(/'/g, "''");
  const createSql = `
DECLARE @defaultTenant nvarchar(80) = N'${defaultTenant}';
DECLARE @defaultUnit nvarchar(80) = N'${defaultUnit}';

IF OBJECT_ID('dbo.panel_records', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.panel_records (
    tenant_key nvarchar(80) NOT NULL,
    unit_key nvarchar(80) NOT NULL,
    record_date date NOT NULL,
    saved_at datetime2 NOT NULL,
    schema_version int NOT NULL CONSTRAINT DF_panel_records_schema DEFAULT (2),
    validation_status nvarchar(20) NOT NULL CONSTRAINT DF_panel_records_status DEFAULT ('ready'),
    data_json nvarchar(max) NOT NULL,
    updated_by nvarchar(120) NULL,
    CONSTRAINT PK_panel_records_scope PRIMARY KEY (tenant_key, unit_key, record_date)
  );
END
ELSE
BEGIN
  DECLARE @needsPanelRecordsMigration bit = 0;
  IF COL_LENGTH('dbo.panel_records', 'tenant_key') IS NULL OR COL_LENGTH('dbo.panel_records', 'unit_key') IS NULL
    SET @needsPanelRecordsMigration = 1;

  IF @needsPanelRecordsMigration = 0
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM sys.key_constraints kc
      JOIN sys.indexes i ON i.object_id = kc.parent_object_id AND i.index_id = kc.unique_index_id
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE kc.parent_object_id = OBJECT_ID('dbo.panel_records')
      GROUP BY kc.name
      HAVING COUNT(*) = 3
        AND SUM(CASE WHEN c.name = 'tenant_key' THEN 1 ELSE 0 END) = 1
        AND SUM(CASE WHEN c.name = 'unit_key' THEN 1 ELSE 0 END) = 1
        AND SUM(CASE WHEN c.name = 'record_date' THEN 1 ELSE 0 END) = 1
    )
      SET @needsPanelRecordsMigration = 1;
  END

  IF @needsPanelRecordsMigration = 1
  BEGIN
    IF OBJECT_ID('dbo.panel_records_scope_mig', 'U') IS NOT NULL DROP TABLE dbo.panel_records_scope_mig;
    CREATE TABLE dbo.panel_records_scope_mig (
      tenant_key nvarchar(80) NOT NULL,
      unit_key nvarchar(80) NOT NULL,
      record_date date NOT NULL,
      saved_at datetime2 NOT NULL,
      schema_version int NOT NULL CONSTRAINT DF_panel_records_scope_mig_schema DEFAULT (2),
      validation_status nvarchar(20) NOT NULL CONSTRAINT DF_panel_records_scope_mig_status DEFAULT ('ready'),
      data_json nvarchar(max) NOT NULL,
      updated_by nvarchar(120) NULL,
      CONSTRAINT PK_panel_records_scope_mig PRIMARY KEY (tenant_key, unit_key, record_date)
    );

    IF COL_LENGTH('dbo.panel_records', 'tenant_key') IS NULL OR COL_LENGTH('dbo.panel_records', 'unit_key') IS NULL
    BEGIN
      INSERT INTO dbo.panel_records_scope_mig(tenant_key, unit_key, record_date, saved_at, schema_version, validation_status, data_json, updated_by)
      SELECT
        @defaultTenant,
        @defaultUnit,
        record_date,
        saved_at,
        schema_version,
        validation_status,
        data_json,
        updated_by
      FROM dbo.panel_records;
    END
    ELSE
    BEGIN
      DECLARE @sqlPanelRecordsMig nvarchar(max) = N'
        INSERT INTO dbo.panel_records_scope_mig(tenant_key, unit_key, record_date, saved_at, schema_version, validation_status, data_json, updated_by)
        SELECT
          CASE WHEN NULLIF(LTRIM(RTRIM(tenant_key)), '''') IS NULL THEN @defaultTenant ELSE LTRIM(RTRIM(tenant_key)) END,
          CASE WHEN NULLIF(LTRIM(RTRIM(unit_key)), '''') IS NULL THEN @defaultUnit ELSE LTRIM(RTRIM(unit_key)) END,
          record_date,
          saved_at,
          schema_version,
          validation_status,
          data_json,
          updated_by
        FROM dbo.panel_records;
      ';
      EXEC sp_executesql
        @sqlPanelRecordsMig,
        N'@defaultTenant nvarchar(80), @defaultUnit nvarchar(80)',
        @defaultTenant = @defaultTenant,
        @defaultUnit = @defaultUnit;
    END

    DROP TABLE dbo.panel_records;
    EXEC sp_rename 'dbo.panel_records_scope_mig', 'panel_records';
  END
END;

EXEC(N'
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(''dbo.panel_records'')
      AND name = ''IX_panel_records_scope_date''
  )
  BEGIN
    CREATE INDEX IX_panel_records_scope_date ON dbo.panel_records(tenant_key, unit_key, record_date DESC);
  END;
');

IF OBJECT_ID('dbo.panel_audit', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.panel_audit (
    audit_id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    tenant_key nvarchar(80) NOT NULL,
    unit_key nvarchar(80) NOT NULL,
    record_date date NOT NULL,
    action nvarchar(30) NOT NULL,
    changed_at datetime2 NOT NULL CONSTRAINT DF_panel_audit_changed DEFAULT (SYSUTCDATETIME()),
    changed_by nvarchar(120) NULL,
    summary nvarchar(500) NULL,
    changed_keys_json nvarchar(max) NULL
  );
END
ELSE
BEGIN
  DECLARE @needsPanelAuditMigration bit = 0;
  IF COL_LENGTH('dbo.panel_audit', 'tenant_key') IS NULL OR COL_LENGTH('dbo.panel_audit', 'unit_key') IS NULL
    SET @needsPanelAuditMigration = 1;

  IF @needsPanelAuditMigration = 1
  BEGIN
    IF OBJECT_ID('dbo.panel_audit_scope_mig', 'U') IS NOT NULL DROP TABLE dbo.panel_audit_scope_mig;
    CREATE TABLE dbo.panel_audit_scope_mig (
      audit_id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
      tenant_key nvarchar(80) NOT NULL,
      unit_key nvarchar(80) NOT NULL,
      record_date date NOT NULL,
      action nvarchar(30) NOT NULL,
      changed_at datetime2 NOT NULL,
      changed_by nvarchar(120) NULL,
      summary nvarchar(500) NULL,
      changed_keys_json nvarchar(max) NULL
    );
    INSERT INTO dbo.panel_audit_scope_mig(tenant_key, unit_key, record_date, action, changed_at, changed_by, summary, changed_keys_json)
    SELECT
      @defaultTenant,
      @defaultUnit,
      record_date,
      action,
      changed_at,
      changed_by,
      summary,
      changed_keys_json
    FROM dbo.panel_audit;

    DROP TABLE dbo.panel_audit;
    EXEC sp_rename 'dbo.panel_audit_scope_mig', 'panel_audit';
  END
END;

EXEC(N'
  IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(''dbo.panel_audit'')
      AND name = ''IX_panel_audit_record_date''
  )
  BEGIN
    DROP INDEX IX_panel_audit_record_date ON dbo.panel_audit;
  END;
');

EXEC(N'
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(''dbo.panel_audit'')
      AND name = ''IX_panel_audit_scope_date''
  )
  BEGIN
    CREATE INDEX IX_panel_audit_scope_date ON dbo.panel_audit(tenant_key, unit_key, record_date, changed_at DESC, audit_id DESC);
  END;
');
`;
  await pool.request().query(createSql);
}

function toDateForSql(dateKey) {
  return new Date(`${dateKey}T00:00:00`);
}

function normalizeRecordFromSqlRow(row) {
  let data = {};
  try {
    data = JSON.parse(row.data_json || '{}');
  } catch (_) {
    data = {};
  }
  return {
    savedAt: row.saved_at ? new Date(row.saved_at).toISOString() : null,
    schemaVersion: Number(row.schema_version || DATA_SCHEMA_VERSION),
    validationStatus: row.validation_status || 'ready',
    data
  };
}

async function sqlInsertAudit(pool, dateKey, meta, scopeLike) {
  const scope = normalizeStorageScope(scopeLike);
  const actor = String(meta?.actor || 'system').slice(0, 120);
  const action = String(meta?.action || 'save').slice(0, 30);
  const summary = String(meta?.summary || '').slice(0, 500);
  const changedKeysJson = JSON.stringify(Array.isArray(meta?.changedKeys) ? meta.changedKeys : []);

  const req = pool.request();
  req.input('tenantKey', sqlLib.NVarChar(80), scope.tenantKey);
  req.input('unitKey', sqlLib.NVarChar(80), scope.unitKey);
  req.input('recordDate', sqlLib.Date, toDateForSql(dateKey));
  req.input('action', sqlLib.NVarChar(30), action);
  req.input('changedAt', sqlLib.DateTime2, new Date());
  req.input('changedBy', sqlLib.NVarChar(120), actor);
  req.input('summary', sqlLib.NVarChar(500), summary);
  req.input('changedKeysJson', sqlLib.NVarChar(sqlLib.MAX), changedKeysJson);
  await req.query(`
    INSERT INTO dbo.panel_audit(tenant_key, unit_key, record_date, action, changed_at, changed_by, summary, changed_keys_json)
    VALUES (@tenantKey, @unitKey, @recordDate, @action, @changedAt, @changedBy, @summary, @changedKeysJson);
  `);
}

function buildJsonStorage() {
  function readStore() {
    const store = readJsonFile(DATA_FILE, {});
    return (store && typeof store === 'object') ? store : {};
  }

  function writeStore(store) {
    writeJsonFileAtomic(DATA_FILE, store || {});
    writeJsonFileAtomic(BACKUP_FILE, store || {});
  }

  function readAudit() {
    const audit = readJsonFile(AUDIT_FILE, []);
    return Array.isArray(audit) ? audit : [];
  }

  function appendAudit(entry) {
    const audit = readAudit();
    audit.unshift(entry);
    if (audit.length > JSON_AUDIT_MAX_ITEMS) audit.length = JSON_AUDIT_MAX_ITEMS;
    writeJsonFileAtomic(AUDIT_FILE, audit);
  }

  function resolveStoreRecord(store, dateKey, scopeLike) {
    const scope = normalizeStorageScope(scopeLike);
    const scopedKey = composeScopedRecordKey(scope, dateKey);
    if (store[scopedKey]) return { key: scopedKey, record: store[scopedKey] };

    const defaultScope = normalizeStorageScope(readOrganizationConfig());
    if (isSameScope(scope, defaultScope) && store[dateKey]) {
      return { key: dateKey, record: store[dateKey] };
    }
    return null;
  }

  function listRecordsByScope(store, scopeLike) {
    const allowAll = isAllScope(scopeLike);
    const targetScope = allowAll ? STORAGE_ALL_SCOPE : normalizeStorageScope(scopeLike);
    const dedupe = new Map();

    Object.entries(store || {}).forEach(([storeKey, record]) => {
      const parsed = parseScopedRecordKey(storeKey);
      if (!parsed) return;
      if (!allowAll && !isSameScope(parsed, targetScope)) return;

      const normalizedKey = composeScopedRecordKey(parsed, parsed.date);
      const normalizedRecord = (record && typeof record === 'object') ? record : {};
      if (dedupe.has(normalizedKey) && parsed.legacy) return;
      dedupe.set(normalizedKey, {
        tenantKey: parsed.tenantKey,
        unitKey: parsed.unitKey,
        companyName: parsed.companyName,
        unitName: parsed.unitName,
        date: parsed.date,
        record: normalizedRecord
      });
    });

    return Array.from(dedupe.values())
      .sort((a, b) => {
        const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        const tenantCmp = String(a.tenantKey || '').localeCompare(String(b.tenantKey || ''));
        if (tenantCmp !== 0) return tenantCmp;
        return String(a.unitKey || '').localeCompare(String(b.unitKey || ''));
      });
  }

  return {
    mode: 'json',
    async init() {},
    async recordCount(scopeLike) {
      return listRecordsByScope(readStore(), scopeLike).length;
    },
    async listRecords(scopeLike) {
      const items = listRecordsByScope(readStore(), scopeLike);
      return items.map(item => ({
        tenantKey: item.tenantKey,
        unitKey: item.unitKey,
        companyName: item.companyName,
        unitName: item.unitName,
        date: item.date,
        savedAt: item.record?.savedAt || null,
        schemaVersion: item.record?.schemaVersion || item.record?.data?.__schemaVersion || 1,
        validationStatus: item.record?.validationStatus || 'ready'
      }));
    },
    async getRecord(dateKey, scopeLike) {
      const store = readStore();
      const resolved = resolveStoreRecord(store, dateKey, scopeLike);
      return resolved?.record || null;
    },
    async saveRecord(dateKey, entry, auditMeta, scopeLike) {
      const scope = normalizeStorageScope(scopeLike);
      const store = readStore();
      const scopedKey = composeScopedRecordKey(scope, dateKey);
      store[scopedKey] = entry;

      const defaultScope = normalizeStorageScope(readOrganizationConfig());
      if (isSameScope(scope, defaultScope) && store[dateKey]) delete store[dateKey];

      writeStore(store);
      appendAudit({
        id: `${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        date: dateKey,
        tenantKey: scope.tenantKey,
        unitKey: scope.unitKey,
        companyName: scope.companyName,
        unitName: scope.unitName,
        action: String(auditMeta?.action || 'save'),
        changedAt: new Date().toISOString(),
        changedBy: String(auditMeta?.actor || 'system'),
        summary: String(auditMeta?.summary || ''),
        changedKeys: Array.isArray(auditMeta?.changedKeys) ? auditMeta.changedKeys : []
      });
    },
    async deleteRecord(dateKey, auditMeta, scopeLike) {
      const scope = normalizeStorageScope(scopeLike);
      const store = readStore();
      const scopedKey = composeScopedRecordKey(scope, dateKey);
      delete store[scopedKey];
      const defaultScope = normalizeStorageScope(readOrganizationConfig());
      if (isSameScope(scope, defaultScope)) delete store[dateKey];
      writeStore(store);
      appendAudit({
        id: `${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        date: dateKey,
        tenantKey: scope.tenantKey,
        unitKey: scope.unitKey,
        companyName: scope.companyName,
        unitName: scope.unitName,
        action: 'delete',
        changedAt: new Date().toISOString(),
        changedBy: String(auditMeta?.actor || 'system'),
        summary: String(auditMeta?.summary || 'Registro excluido'),
        changedKeys: []
      });
    },
    async getAudit(dateKey, limit, scopeLike) {
      const scope = normalizeStorageScope(scopeLike);
      const defaultScope = normalizeStorageScope(readOrganizationConfig());
      const max = Math.max(1, Math.min(Number(limit || 20), 200));
      return readAudit()
        .filter(item => {
          if (item?.date !== dateKey) return false;
          const auditScope = (item?.tenantKey || item?.unitKey)
            ? normalizeStorageScope(item)
            : defaultScope;
          return isSameScope(scope, auditScope);
        })
        .slice(0, max)
        .map(item => ({
          id: item.id,
          date: item.date,
          tenantKey: item.tenantKey || scope.tenantKey,
          unitKey: item.unitKey || scope.unitKey,
          action: item.action,
          changedAt: item.changedAt,
          changedBy: item.changedBy,
          summary: item.summary,
          changedKeys: Array.isArray(item.changedKeys) ? item.changedKeys : []
        }));
    }
  };
}

function buildSqlStorage() {
  async function upsertRecord(pool, dateKey, entry, auditMeta, scopeLike) {
    const scope = normalizeStorageScope(scopeLike);
    const req = pool.request();
    req.input('tenantKey', sqlLib.NVarChar(80), scope.tenantKey);
    req.input('unitKey', sqlLib.NVarChar(80), scope.unitKey);
    req.input('recordDate', sqlLib.Date, toDateForSql(dateKey));
    req.input('savedAt', sqlLib.DateTime2, new Date(entry.savedAt || new Date().toISOString()));
    req.input('schemaVersion', sqlLib.Int, Number(entry.schemaVersion || DATA_SCHEMA_VERSION));
    req.input('validationStatus', sqlLib.NVarChar(20), String(entry.validationStatus || 'ready'));
    req.input('dataJson', sqlLib.NVarChar(sqlLib.MAX), JSON.stringify(entry.data || {}));
    req.input('updatedBy', sqlLib.NVarChar(120), String(auditMeta?.actor || 'system').slice(0, 120));
    await req.query(`
      UPDATE dbo.panel_records
      SET saved_at = @savedAt,
          schema_version = @schemaVersion,
          validation_status = @validationStatus,
          data_json = @dataJson,
          updated_by = @updatedBy
      WHERE tenant_key = @tenantKey
        AND unit_key = @unitKey
        AND record_date = @recordDate;

      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO dbo.panel_records(tenant_key, unit_key, record_date, saved_at, schema_version, validation_status, data_json, updated_by)
        VALUES (@tenantKey, @unitKey, @recordDate, @savedAt, @schemaVersion, @validationStatus, @dataJson, @updatedBy);
      END;
    `);
    await sqlInsertAudit(pool, dateKey, auditMeta, scope);
  }

  async function mirrorJsonBackup(pool) {
    const req = pool.request();
    const result = await req.query(`
      SELECT tenant_key, unit_key,
             CONVERT(varchar(10), record_date, 23) AS date,
             saved_at, schema_version, validation_status, data_json
      FROM dbo.panel_records
      ORDER BY tenant_key ASC, unit_key ASC, record_date ASC;
    `);
    const store = {};
    for (const row of (result.recordset || [])) {
      const scope = normalizeStorageScope({
        tenantKey: row.tenant_key,
        unitKey: row.unit_key
      });
      const scopedKey = composeScopedRecordKey(scope, row.date);
      store[scopedKey] = normalizeRecordFromSqlRow(row);
    }
    writeJsonFileAtomic(DATA_FILE, store);
    writeJsonFileAtomic(BACKUP_FILE, store);
  }

  async function importLegacyJsonIfNeeded(pool) {
    const countResult = await pool.request().query(`SELECT COUNT(1) AS total FROM dbo.panel_records;`);
    const currentCount = Number(countResult.recordset?.[0]?.total || 0);
    if (currentCount > 0) return;

    const legacyStore = readJsonFile(DATA_FILE, {});
    const entries = Object.keys(legacyStore || {})
      .map(key => ({ key, parsed: parseScopedRecordKey(key) }))
      .filter(item => !!item.parsed)
      .sort((a, b) => String(a.parsed.date || '').localeCompare(String(b.parsed.date || '')));

    for (const item of entries) {
      const dateKey = item.parsed.date;
      const rec = legacyStore[item.key] || {};
      const entry = {
        savedAt: rec.savedAt || new Date().toISOString(),
        schemaVersion: Number(rec.schemaVersion || rec.data?.__schemaVersion || DATA_SCHEMA_VERSION),
        validationStatus: rec.validationStatus === 'draft' ? 'draft' : 'ready',
        data: rec.data || {}
      };
      await upsertRecord(pool, dateKey, entry, {
        actor: 'migration',
        action: 'import',
        summary: 'Migrado automaticamente do records.json para SQL',
        changedKeys: Object.keys(entry.data || {})
      }, item.parsed);
    }
    await mirrorJsonBackup(pool);
  }

  return {
    mode: 'sql',
    async init() {
      const pool = await getSqlPool();
      await initializeSqlSchema(pool);
      await importLegacyJsonIfNeeded(pool);
      await mirrorJsonBackup(pool);
    },
    async recordCount(scopeLike) {
      const pool = await getSqlPool();
      const scope = normalizeStorageScope(scopeLike);
      if (isAllScope(scopeLike)) {
        const result = await pool.request().query(`SELECT COUNT(1) AS total FROM dbo.panel_records;`);
        return Number(result.recordset?.[0]?.total || 0);
      }
      const req = pool.request();
      req.input('tenantKey', sqlLib.NVarChar(80), scope.tenantKey);
      req.input('unitKey', sqlLib.NVarChar(80), scope.unitKey);
      const result = await req.query(`
        SELECT COUNT(1) AS total
        FROM dbo.panel_records
        WHERE tenant_key = @tenantKey
          AND unit_key = @unitKey;
      `);
      return Number(result.recordset?.[0]?.total || 0);
    },
    async listRecords(scopeLike) {
      const pool = await getSqlPool();
      const scope = normalizeStorageScope(scopeLike);
      const req = pool.request();
      let result;
      if (isAllScope(scopeLike)) {
        result = await req.query(`
          SELECT tenant_key, unit_key,
                 CONVERT(varchar(10), record_date, 23) AS date,
                 saved_at, schema_version, validation_status
          FROM dbo.panel_records
          ORDER BY record_date DESC, tenant_key ASC, unit_key ASC;
        `);
      } else {
        req.input('tenantKey', sqlLib.NVarChar(80), scope.tenantKey);
        req.input('unitKey', sqlLib.NVarChar(80), scope.unitKey);
        result = await req.query(`
          SELECT tenant_key, unit_key,
                 CONVERT(varchar(10), record_date, 23) AS date,
                 saved_at, schema_version, validation_status
          FROM dbo.panel_records
          WHERE tenant_key = @tenantKey
            AND unit_key = @unitKey
          ORDER BY record_date DESC;
        `);
      }
      return (result.recordset || []).map(row => ({
        tenantKey: String(row.tenant_key || scope.tenantKey || ''),
        unitKey: String(row.unit_key || scope.unitKey || ''),
        date: row.date,
        savedAt: row.saved_at ? new Date(row.saved_at).toISOString() : null,
        schemaVersion: Number(row.schema_version || DATA_SCHEMA_VERSION),
        validationStatus: row.validation_status || 'ready'
      }));
    },
    async getRecord(dateKey, scopeLike) {
      const pool = await getSqlPool();
      const scope = normalizeStorageScope(scopeLike);
      const req = pool.request();
      req.input('tenantKey', sqlLib.NVarChar(80), scope.tenantKey);
      req.input('unitKey', sqlLib.NVarChar(80), scope.unitKey);
      req.input('recordDate', sqlLib.Date, toDateForSql(dateKey));
      const result = await req.query(`
        SELECT CONVERT(varchar(10), record_date, 23) AS date,
               saved_at, schema_version, validation_status, data_json
        FROM dbo.panel_records
        WHERE tenant_key = @tenantKey
          AND unit_key = @unitKey
          AND record_date = @recordDate;
      `);
      const row = result.recordset?.[0];
      if (!row) return null;
      return normalizeRecordFromSqlRow(row);
    },
    async saveRecord(dateKey, entry, auditMeta, scopeLike) {
      const pool = await getSqlPool();
      await upsertRecord(pool, dateKey, entry, auditMeta, scopeLike);
      await mirrorJsonBackup(pool);
    },
    async deleteRecord(dateKey, auditMeta, scopeLike) {
      const pool = await getSqlPool();
      const scope = normalizeStorageScope(scopeLike);
      const req = pool.request();
      req.input('tenantKey', sqlLib.NVarChar(80), scope.tenantKey);
      req.input('unitKey', sqlLib.NVarChar(80), scope.unitKey);
      req.input('recordDate', sqlLib.Date, toDateForSql(dateKey));
      await req.query(`
        DELETE FROM dbo.panel_records
        WHERE tenant_key = @tenantKey
          AND unit_key = @unitKey
          AND record_date = @recordDate;
      `);
      await sqlInsertAudit(pool, dateKey, {
        actor: auditMeta?.actor || 'system',
        action: 'delete',
        summary: auditMeta?.summary || 'Registro excluido',
        changedKeys: []
      }, scope);
      await mirrorJsonBackup(pool);
    },
    async getAudit(dateKey, limit, scopeLike) {
      const pool = await getSqlPool();
      const scope = normalizeStorageScope(scopeLike);
      const max = Math.max(1, Math.min(Number(limit || 20), 200));
      const req = pool.request();
      req.input('tenantKey', sqlLib.NVarChar(80), scope.tenantKey);
      req.input('unitKey', sqlLib.NVarChar(80), scope.unitKey);
      req.input('recordDate', sqlLib.Date, toDateForSql(dateKey));
      req.input('limit', sqlLib.Int, max);
      const result = await req.query(`
        SELECT TOP (@limit)
          audit_id,
          tenant_key,
          unit_key,
          CONVERT(varchar(10), record_date, 23) AS date,
          action,
          changed_at,
          changed_by,
          summary,
          changed_keys_json
        FROM dbo.panel_audit
        WHERE tenant_key = @tenantKey
          AND unit_key = @unitKey
          AND record_date = @recordDate
        ORDER BY changed_at DESC, audit_id DESC;
      `);
      return (result.recordset || []).map(row => {
        let changedKeys = [];
        try { changedKeys = JSON.parse(row.changed_keys_json || '[]'); } catch (_) { changedKeys = []; }
        return {
          id: row.audit_id,
          date: row.date,
          tenantKey: String(row.tenant_key || scope.tenantKey || ''),
          unitKey: String(row.unit_key || scope.unitKey || ''),
          action: row.action,
          changedAt: row.changed_at ? new Date(row.changed_at).toISOString() : null,
          changedBy: row.changed_by || 'system',
          summary: row.summary || '',
          changedKeys: Array.isArray(changedKeys) ? changedKeys : []
        };
      });
    }
  };
}

async function initializeStorage() {
  const requested = STORAGE_REQUESTED_MODE;
  const trySql = requested === 'sql' || requested === 'auto';

  if (trySql) {
    try {
      const sqlStorage = buildSqlStorage();
      await sqlStorage.init();
      storage = sqlStorage;
      bootStatus.activeStorageMode = 'sql';
      bootStatus.sqlEnabled = true;
      bootStatus.sqlError = null;
      return;
    } catch (err) {
      bootStatus.sqlEnabled = false;
      bootStatus.sqlError = err.message || String(err);
      if (requested === 'sql') throw err;
    }
  }

  const jsonStorage = buildJsonStorage();
  await jsonStorage.init();
  storage = jsonStorage;
  bootStatus.activeStorageMode = 'json';
}

function toCompactDateStamp(date) {
  const d = date instanceof Date ? date : new Date();
  const yyyy = String(d.getFullYear()).padStart(4, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function listBackupSnapshotFiles() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(name => /^records-snapshot-\d{8}_\d{6}\.json$/i.test(name))
    .map(name => {
      const fullPath = path.join(BACKUP_DIR, name);
      let mtime = 0;
      try { mtime = fs.statSync(fullPath).mtimeMs; } catch (_) {}
      return { name, fullPath, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function pruneBackupSnapshots() {
  const files = listBackupSnapshotFiles();
  if (!files.length) return;
  const now = Date.now();
  const maxAgeMs = Math.max(1, BACKUP_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  let kept = 0;
  for (const file of files) {
    const isTooOld = file.mtime > 0 ? ((now - file.mtime) > maxAgeMs) : false;
    const isOverflow = kept >= Math.max(5, BACKUP_MAX_SNAPSHOTS);
    if (isTooOld || isOverflow) {
      try { fs.unlinkSync(file.fullPath); } catch (_) {}
    } else {
      kept += 1;
    }
  }
}

async function buildRecordSnapshotPayload(reason) {
  const records = await storage.listRecords(STORAGE_ALL_SCOPE);
  const sorted = records.slice().sort((a, b) => {
    const dateCmp = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCmp !== 0) return dateCmp;
    const tenantCmp = String(a.tenantKey || '').localeCompare(String(b.tenantKey || ''));
    if (tenantCmp !== 0) return tenantCmp;
    return String(a.unitKey || '').localeCompare(String(b.unitKey || ''));
  });
  const map = {};
  for (const item of sorted) {
    const dateKey = normalizeDateKey(item.date);
    if (!dateKey) continue;
    const scope = normalizeStorageScope({
      tenantKey: item.tenantKey,
      unitKey: item.unitKey,
      companyName: item.companyName,
      unitName: item.unitName
    });
    const full = await storage.getRecord(dateKey, scope);
    if (!full) continue;
    const snapshotKey = composeScopedRecordKey(scope, dateKey);
    map[snapshotKey] = {
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      companyName: scope.companyName,
      unitName: scope.unitName,
      date: dateKey,
      savedAt: full.savedAt || null,
      schemaVersion: full.schemaVersion || DATA_SCHEMA_VERSION,
      validationStatus: full.validationStatus || 'ready',
      data: full.data || {}
    };
  }
  const latestSavedAt = sorted[0]?.savedAt || '';
  const oldestSavedAt = sorted[sorted.length - 1]?.savedAt || '';
  const fingerprint = `${sorted.length}|${latestSavedAt}|${oldestSavedAt}`;
  return {
    createdAt: nowIso(),
    reason: reason || 'interval',
    storageMode: bootStatus.activeStorageMode,
    recordCount: sorted.length,
    fingerprint,
    records: map
  };
}

async function createBackupSnapshot(reason, force) {
  if (!storage) return { created: false, reason: 'no-storage' };
  const payload = await buildRecordSnapshotPayload(reason || 'interval');
  if (!force && payload.fingerprint === lastBackupFingerprint) {
    return { created: false, reason: 'no-change', recordCount: payload.recordCount };
  }
  const stamp = toCompactDateStamp(new Date());
  const fileName = `records-snapshot-${stamp}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  writeJsonFileAtomic(filePath, payload);
  lastBackupFingerprint = payload.fingerprint;
  pruneBackupSnapshots();
  writeServerLog('info', 'snapshot-backup-created', {
    fileName,
    reason: payload.reason,
    recordCount: payload.recordCount
  });
  return {
    created: true,
    fileName,
    recordCount: payload.recordCount
  };
}

function clearForgotCooldownGarbage() {
  const now = Date.now();
  for (const [key, ts] of forgotRequestCooldownMap.entries()) {
    if (!key || (now - Number(ts || 0)) > (FORGOT_COOLDOWN_MS * 3)) {
      forgotRequestCooldownMap.delete(key);
    }
  }
}

function startMaintenanceWorkers() {
  while (maintenanceTimers.length) {
    try { clearInterval(maintenanceTimers.pop()); } catch (_) {}
  }
  maintenanceTimers.push(setInterval(() => {
    try { pruneExpiredSessions(); } catch (_) {}
  }, 60 * 1000));
  maintenanceTimers.push(setInterval(() => {
    try { cleanupExpiredPasswordResetRequests(); } catch (_) {}
    try { cleanupLoginAttemptStore(); } catch (_) {}
    try { clearForgotCooldownGarbage(); } catch (_) {}
  }, 2 * 60 * 1000));
  maintenanceTimers.push(setInterval(() => {
    createBackupSnapshot('interval', false).catch(err => {
      writeServerLog('error', 'snapshot-backup-failed', { error: err?.message || String(err) });
    });
  }, Math.max(60 * 1000, BACKUP_SNAPSHOT_INTERVAL_MS)));
  maintenanceTimers.push(setInterval(() => {
    runExecutiveMonthlyAutoJob('interval', { force: false }).catch(err => {
      writeServerLog('error', 'executive-monthly-job-interval-failed', { error: err?.message || String(err) });
    });
  }, EXEC_MONTHLY_JOB_INTERVAL_MS));
  maintenanceTimers.push(setInterval(() => {
    runExecutiveQuarterlyAutoJob('interval', { force: false }).catch(err => {
      writeServerLog('error', 'executive-quarterly-job-interval-failed', { error: err?.message || String(err) });
    });
  }, EXEC_QUARTERLY_JOB_INTERVAL_MS));
}

function stopMaintenanceWorkers() {
  while (maintenanceTimers.length) {
    try { clearInterval(maintenanceTimers.pop()); } catch (_) {}
  }
}

async function buildRuntimePayload() {
  const org = readOrganizationConfig();
  const runtimeScope = normalizeStorageScope(org);
  const recordCount = storage ? await storage.recordCount(runtimeScope) : 0;
  const importStatus = getImportStatus();
  const executiveJobStatus = getExecutiveMonthlyJobStatusSnapshot(runtimeScope);
  const executiveQuarterlyJobStatus = getExecutiveQuarterlyJobStatusSnapshot(runtimeScope);
  const historicalStatus = getHistoricalAnalyticsStatus(org.localeDefault || DEFAULT_ORG_CONFIG.localeDefault);
  const pricingConfig = readPricingConfig();
  const pricingCatalog = ensurePricingCatalogLoaded();
  const backupFiles = listBackupSnapshotFiles();
  const unifiedReportStatus = getUnifiedReportStatus();
  return {
    ok: true,
    mode: bootStatus.activeStorageMode === 'sql' ? 'node-sql' : 'node-json',
    storageMode: bootStatus.activeStorageMode,
    requestedStorageMode: bootStatus.requestedStorageMode,
    version: APP_VERSION,
    environment: APP_ENV,
    sqlEnabled: bootStatus.sqlEnabled,
    sqlError: bootStatus.sqlError,
    officialRoot: bootStatus.officialRoot,
    officialRootRequestedEnforce: bootStatus.officialRootRequestedEnforce,
    rootBypassAllowed: bootStatus.rootBypassAllowed,
    officialRootEnforced: bootStatus.officialRootEnforced,
    officialRootMatch: bootStatus.officialRootMatch,
    allowLegacySqlCredentialFile: bootStatus.allowLegacySqlCredentialFile,
    allowInsecureBootstrapDefaults: bootStatus.allowInsecureBootstrapDefaults,
    authEnabled: true,
    host: HOST,
    port: PORT,
    pid: process.pid,
    startedAt: STARTED_AT,
    rootDir: ROOT,
    dataDir: DATA_DIR,
    dataFile: DATA_FILE,
    usersFile: USERS_FILE,
    backupFile: BACKUP_FILE,
    logDir: LOG_DIR,
    serverLogFile: SERVER_LOG_FILE,
    accessLogFile: ACCESS_LOG_FILE,
    localUrl: `http://localhost:${PORT}`,
    lanUrls: getLanUrls(PORT),
    recordCount,
    backupSnapshots: backupFiles.length,
    backupLastSnapshotAt: backupFiles[0]?.mtime ? new Date(backupFiles[0].mtime).toISOString() : '',
    importWatchDir: importStatus.watchDir,
    importWatchActive: importStatus.watchActive,
    importPollIntervalMs: importStatus.pollIntervalMs,
    importLastStatus: importStatus.state.lastStatus || 'idle',
    importLastProcessedAt: importStatus.state.lastProcessedAt || '',
    importLastMessage: importStatus.state.lastMessage || '',
    importLastRecordDate: importStatus.state.lastRecordDate || '',
    historicalAnalytics: {
      available: !!historicalStatus.available,
      workbookName: historicalStatus?.source?.workbookName || '',
      workbookSignature: historicalStatus?.source?.workbookSignature || '',
      importedRows: Number(historicalStatus?.source?.importedRows || 0),
      normalizedRows: Number(historicalStatus?.source?.normalizedRows || 0),
      generatedAt: historicalStatus?.source?.generatedAt || ''
    },
    unifiedReportFile: unifiedReportStatus.csvFile,
    unifiedReportUpdatedAt: unifiedReportStatus.updatedAt,
    unifiedReportRows: unifiedReportStatus.totalRows,
    executiveMonthlyJob: {
      enabled: EXEC_MONTHLY_JOB_ENABLED,
      intervalMs: EXEC_MONTHLY_JOB_INTERVAL_MS,
      mode: EXEC_MONTHLY_JOB_MODE,
      windowDay: EXEC_MONTHLY_JOB_WINDOW_DAY,
      windowHour: EXEC_MONTHLY_JOB_WINDOW_HOUR,
      windowMinute: EXEC_MONTHLY_JOB_WINDOW_MINUTE,
      running: executiveMonthlyJobRunning || executiveJobStatus.running === true,
      lastRunAt: executiveJobStatus.lastRunAt || '',
      lastSuccessAt: executiveJobStatus.lastSuccessAt || '',
      lastErrorAt: executiveJobStatus.lastErrorAt || '',
      lastOutcome: executiveJobStatus.lastOutcome || 'idle',
      lastMessage: executiveJobStatus.lastMessage || '',
      counters: executiveJobStatus.counters || {},
      scopedHistory: Array.isArray(executiveJobStatus.scopedHistory)
        ? executiveJobStatus.scopedHistory.slice(0, 6)
        : []
    },
    executiveQuarterlyJob: {
      enabled: EXEC_QUARTERLY_JOB_ENABLED,
      intervalMs: EXEC_QUARTERLY_JOB_INTERVAL_MS,
      mode: EXEC_QUARTERLY_JOB_MODE,
      windowDay: EXEC_QUARTERLY_JOB_WINDOW_DAY,
      windowHour: EXEC_QUARTERLY_JOB_WINDOW_HOUR,
      windowMinute: EXEC_QUARTERLY_JOB_WINDOW_MINUTE,
      running: executiveQuarterlyJobRunning || executiveQuarterlyJobStatus.running === true,
      lastRunAt: executiveQuarterlyJobStatus.lastRunAt || '',
      lastSuccessAt: executiveQuarterlyJobStatus.lastSuccessAt || '',
      lastErrorAt: executiveQuarterlyJobStatus.lastErrorAt || '',
      lastOutcome: executiveQuarterlyJobStatus.lastOutcome || 'idle',
      lastMessage: executiveQuarterlyJobStatus.lastMessage || '',
      counters: executiveQuarterlyJobStatus.counters || {},
      scopedHistory: Array.isArray(executiveQuarterlyJobStatus.scopedHistory)
        ? executiveQuarterlyJobStatus.scopedHistory.slice(0, 6)
        : []
    },
    lookerPricingUrl: pricingConfig.lookerUrl || DEFAULT_LOOKER_URL,
    portalClienteUrl: pricingConfig.portalClienteUrl || DEFAULT_PORTAL_CLIENTE_URL,
    powerBiUrl: pricingConfig.powerBiUrl || DEFAULT_POWER_BI_URL,
    pricingCatalogItems: Array.isArray(pricingCatalog.items) ? pricingCatalog.items.length : 0,
    pricingCatalogUpdatedAt: pricingCatalog.updatedAt || '',
    organization: org,
    tenantKey: org.tenantKey,
    unitKey: org.unitKey
  };
}

function buildSystemStatusPayload() {
  const historicalStatus = getHistoricalAnalyticsStatus(readOrganizationConfig()?.localeDefault || DEFAULT_ORG_CONFIG.localeDefault);
  return {
    ok: true,
    timestamp: nowIso(),
    uptimeSec: Math.round(process.uptime()),
    environment: APP_ENV,
    version: APP_VERSION,
    runtime: {
      pid: process.pid,
      host: HOST,
      port: PORT,
      startedAt: STARTED_AT,
      storageMode: bootStatus.activeStorageMode
    },
    base: {
      rootDir: ROOT,
      officialRoot: OFFICIAL_ROOT,
      officialRootRequestedEnforce: REQUESTED_ENFORCE_OFFICIAL_ROOT,
      rootBypassAllowed: ROOT_BYPASS_ALLOWED,
      officialRootEnforced: ENFORCE_OFFICIAL_ROOT,
      officialRootMatch: ROOT_NORMALIZED === OFFICIAL_ROOT_NORMALIZED
    },
    security: {
      allowLegacySqlCredentialFile: ALLOW_LEGACY_SQL_CREDENTIAL_FILE,
      allowInsecureBootstrapDefaults: ALLOW_INSECURE_BOOTSTRAP_DEFAULTS
    },
    analytics: {
      historical: {
        available: !!historicalStatus.available,
        workbookName: historicalStatus?.source?.workbookName || '',
        workbookSignature: historicalStatus?.source?.workbookSignature || '',
        importedRows: Number(historicalStatus?.source?.importedRows || 0),
        normalizedRows: Number(historicalStatus?.source?.normalizedRows || 0),
        generatedAt: historicalStatus?.source?.generatedAt || ''
      }
    }
  };
}

async function writeRuntimeFile() {
  const runtime = await buildRuntimePayload();
  writeJsonFileAtomic(RUNTIME_FILE, runtime);
}

async function persistRecordWithPolicy(options) {
  const opts = options || {};
  const dateKey = normalizeDateKey(opts.dateKey);
  if (!dateKey) throw new Error('Data invalida para persistencia.');
  const scope = normalizeStorageScope(opts.scope);

  const role = String(opts.role || 'admin');
  const actor = String(opts.actor || 'system');
  const action = String(opts.action || 'save');
  const incomingData = (opts.incomingData && typeof opts.incomingData === 'object') ? opts.incomingData : {};
  const schemaVersion = Number(opts.schemaVersion || incomingData.__schemaVersion || DATA_SCHEMA_VERSION) || DATA_SCHEMA_VERSION;
  const validationStatus = opts.validationStatus === 'draft' ? 'draft' : 'ready';

  const currentRecord = await storage.getRecord(dateKey, scope);
  const existingData = currentRecord?.data || {};
  const mergedInput = { ...existingData, ...incomingData };
  const policy = applyRoleDataPolicy(role, mergedInput, existingData);
  const nextData = policy.data || {};
  const quality = evaluateRecordQuality(dateKey, nextData);
  const changedKeys = diffChangedKeys(existingData, nextData);
  let pricingReviewSync = null;

  const entry = {
    savedAt: new Date().toISOString(),
    schemaVersion,
    validationStatus,
    data: nextData
  };

  const summary = summarizeChanges(changedKeys, policy.blockedKeys);
  await storage.saveRecord(dateKey, entry, {
    actor,
    action,
    summary,
    changedKeys
  }, scope);
  try {
    pricingReviewSync = syncPricingReviewQueueForRecord({
      scope,
      dateKey,
      data: nextData,
      actor: {
        username: actor,
        displayName: actor
      }
    });
  } catch (queueErr) {
    writeServerLog('warn', 'Falha ao sincronizar fila de revisao de precos apos persistencia.', {
      date: dateKey,
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      actor,
      error: queueErr?.message || String(queueErr)
    });
  }
  await writeRuntimeFile();
  await safeRefreshUnifiedReport('record-save');

  if (opts.notify !== false) {
    notifyStreamClients('record-updated', {
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      date: dateKey,
      savedAt: entry.savedAt,
      schemaVersion: entry.schemaVersion,
      validationStatus: entry.validationStatus,
      by: actor,
      source: action,
      changedKeysCount: changedKeys.length,
      qualityLevel: quality.level,
      qualityScore: quality.score,
      qualityIssueCount: quality.issueCount
    });
    notifyStreamClients('quality-updated', {
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      date: dateKey,
      by: actor,
      level: quality.level,
      score: quality.score,
      issueCount: quality.issueCount,
      updatedAt: quality.updatedAt
    });
    if (pricingReviewSync && typeof pricingReviewSync === 'object') {
      notifyStreamClients('pricing-review-updated', {
        tenantKey: scope.tenantKey,
        unitKey: scope.unitKey,
        date: dateKey,
        by: actor,
        created: Number(pricingReviewSync.created || 0),
        updated: Number(pricingReviewSync.updated || 0),
        autoResolved: Number(pricingReviewSync.autoResolved || 0),
        total: Number(pricingReviewSync.total || 0),
        totalOpen: Number(pricingReviewSync.totalOpen || 0)
      });
    }
  }

  return {
    scope,
    date: dateKey,
    entry,
    quality,
    changedKeys,
    blockedKeys: policy.blockedKeys || [],
    pricingReviewSync
  };
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function resolveCountMetric(manualValue, importedValue, hasImportSummary) {
  const manual = Math.max(0, toNumber(manualValue));
  const imported = Math.max(0, toNumber(importedValue));
  if (hasImportSummary) return Math.max(manual, imported);
  return manual > 0 ? manual : imported;
}

function resolvePercentMetric(manualRawValue, importedRawValue) {
  const manualRaw = toText(manualRawValue);
  if (manualRaw !== '') return Math.max(0, Math.min(100, toNumber(manualRaw)));
  const importedRaw = toText(importedRawValue);
  if (importedRaw !== '') return Math.max(0, Math.min(100, toNumber(importedRaw)));
  return null;
}

function resolveOsCodigoCount(rawValue, pricingReconLike) {
  const recon = (pricingReconLike && typeof pricingReconLike === 'object') ? pricingReconLike : {};
  const fromPricing = toNumber(recon.requiredPriceMissingOs || recon.missingOs);
  if (fromPricing > 0) return fromPricing;
  return toNumber(rawValue);
}

function toText(value) {
  return String(value == null ? '' : value).trim();
}

function isYes(value) {
  const v = toText(value).toLowerCase();
  return v === 'sim' || v === 'yes' || v === 'true' || v === '1';
}

function calcExecution(data) {
  const ids = ['op_exec1', 'op_exec2', 'op_exec3', 'op_exec4', 'op_exec5'];
  const answered = ids.filter(id => toText(data[id]) !== '').length;
  if (!answered) return null;
  const ok = ids.filter(id => isYes(data[id])).length;
  return Math.round((ok / ids.length) * 100);
}

function countTicketsPending(data) {
  let total = 0;
  for (let i = 1; i <= 3; i++) {
    const num = toText(data[`tec-ticket${i}_num`]) || toText(data[`tec-ticket${i}_codigo`]);
    const status = toText(data[`tec-ticket${i}_status`]).toLowerCase();
    if (!num) continue;
    if (!['resolvido', 'finalizado', 'encerrado'].includes(status)) total += 1;
  }
  return total;
}

function countLateOrders(data, refDateKey) {
  const ref = new Date(`${refDateKey}T00:00:00`);
  let total = 0;
  ['tec-peca', 'adm-peca'].forEach(prefix => {
    for (let i = 1; i <= 3; i++) {
      const pedido = toText(data[`${prefix}${i}_pedido`]);
      const prazo = toText(data[`${prefix}${i}_prazo`]);
      const status = toText(data[`${prefix}${i}_status`]).toLowerCase();
      if (!pedido || !prazo) continue;
      const d = new Date(`${prazo}T00:00:00`);
      if (Number.isNaN(d.getTime())) continue;
      if (d < ref && !['resolvido', 'finalizado', 'recebido'].includes(status)) total += 1;
    }
  });
  return total;
}

function countAdminPending(data) {
  const ids = [
    'adm_qtd_pecas',
    'adm_qtd_mov',
    'adm_qtd_notas',
    'adm_qtd_sc',
    'adm_qtd_emails',
    'adm_qtd_ctf',
    'adm_qtd_cliente',
    'adm_qtd_terceiros'
  ];
  return ids.reduce((acc, id) => acc + toNumber(data[id]), 0);
}

function listCriticalClients(data) {
  const qty = Math.max(0, Math.min(5, toNumber(data.op_qtd_clientes_criticos)));
  const clients = [];
  for (let i = 1; i <= 5; i++) {
    const name = toText(data[`op-cli${i}_cliente`]);
    const priority = toText(data[`op-cli${i}_prioridade`]) || 'Alta';
    const action = toText(data[`op-cli${i}_acao`]);
    const due = toText(data[`op-cli${i}_prazo`]);
    if (i <= qty || name || action || due) {
      clients.push({
        index: i,
        name: name || `Cliente critico ${i}`,
        priority,
        action,
        due
      });
    }
  }
  if (!clients.length && toText(data.op_cliente_critico)) {
    clients.push({
      index: 1,
      name: toText(data.op_cliente_critico),
      priority: 'Alta',
      action: '',
      due: ''
    });
  }
  return clients.slice(0, 5);
}

function normalizeMetricLabel(value) {
  return toText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function statusWeightFromValue(value) {
  const normalized = normalizeMetricLabel(value);
  if (normalized === 'critica' || normalized === 'critical') return 4;
  if (normalized === 'pressionada' || normalized === 'pressure') return 3;
  if (normalized === 'atencao' || normalized === 'attention') return 2;
  return 1;
}

function impactWeightFromValue(value) {
  const normalized = normalizeMetricLabel(value);
  if (normalized === 'critico' || normalized === 'critical') return 4;
  if (normalized === 'alto' || normalized === 'high') return 3;
  if (normalized === 'medio' || normalized === 'medium') return 2;
  return 1;
}

function scoreBandFromValue(score, localeRaw) {
  const locale = detectLocale(localeRaw);
  const n = toNumber(score);
  if (n >= 75) return locale === 'en-US' ? 'Critical' : 'Critico';
  if (n >= 55) return locale === 'en-US' ? 'High' : 'Alto';
  if (n >= 35) return locale === 'en-US' ? 'Medium' : 'Medio';
  return locale === 'en-US' ? 'Low' : 'Baixo';
}

function toYesNo(value, localeRaw) {
  const locale = detectLocale(localeRaw);
  return isYes(value)
    ? (locale === 'en-US' ? 'Yes' : 'Sim')
    : (locale === 'en-US' ? 'No' : 'Nao');
}

function countCriticalTickets(data) {
  let total = 0;
  for (let i = 1; i <= 3; i += 1) {
    const numberRef = toText(data[`tec-ticket${i}_num`]) || toText(data[`tec-ticket${i}_codigo`]);
    if (!numberRef) continue;
    const status = normalizeMetricLabel(data[`tec-ticket${i}_status`]);
    if (['resolvido', 'finalizado', 'encerrado'].includes(status)) continue;
    const impact = normalizeMetricLabel(data[`tec-ticket${i}_impacto`]);
    if (impact === 'critico' || impact === 'critical' || impact === 'alto' || impact === 'high') {
      total += 1;
    }
  }
  return total;
}

function countPendenciasCliente(data) {
  return toNumber(data.tec_aguardando_cliente) + toNumber(data.adm_qtd_cliente);
}

function countBloqueios(data) {
  const ids = [
    'tec_aguardando_peca',
    'tec_aguardando_cliente',
    'tec_reincidentes',
    'tec_parados',
    'adm_qtd_pecas',
    'adm_qtd_mov',
    'adm_qtd_notas',
    'adm_qtd_sc',
    'adm_qtd_ctf',
    'adm_qtd_cliente',
    'adm_qtd_terceiros'
  ];
  return ids.reduce((acc, id) => acc + toNumber(data[id]), 0);
}

function computeAreaPressionada(data, localeRaw) {
  const locale = detectLocale(localeRaw);
  const op = statusWeightFromValue(data.op_status);
  const tec = statusWeightFromValue(data.tec_status);
  const adm = statusWeightFromValue(data.adm_status);
  const max = Math.max(op, tec, adm);
  if (max === tec) return locale === 'en-US' ? 'Technical' : 'Tecnica';
  if (max === adm) return locale === 'en-US' ? 'Administrative' : 'Administrativa';
  return locale === 'en-US' ? 'Operation' : 'Operacao';
}

function computePrincipalBloqueio(data, localeRaw) {
  const locale = detectLocale(localeRaw);
  if (toNumber(data.tec_aguardando_peca) > 0) return locale === 'en-US' ? 'Waiting for part' : 'Aguardando peca';
  if (toNumber(data.tec_aguardando_cliente) > 0) return locale === 'en-US' ? 'Waiting for customer' : 'Aguardando cliente';
  if (toNumber(data.tec_reincidentes) > 0) return locale === 'en-US' ? 'Recurrent cases' : 'Casos reincidentes';
  if (toNumber(data.adm_qtd_pecas) > 0) return locale === 'en-US' ? 'Pending parts' : 'Pecas pendentes';
  if (toNumber(data.adm_qtd_notas) > 0) return locale === 'en-US' ? 'Pending invoices' : 'Notas pendentes';
  if (toNumber(data.adm_qtd_ctf) > 0) return locale === 'en-US' ? 'Critical CTF' : 'CTFs criticos';
  if (toNumber(data.adm_qtd_terceiros) > 0) return locale === 'en-US' ? 'Third-party dependency' : 'Dependencia de terceiros';
  return locale === 'en-US' ? 'No relevant blocker' : 'Sem bloqueio relevante';
}

function computeImpactoPredominante(data, insights, localeRaw) {
  const locale = detectLocale(localeRaw);
  const sla = toNumber(insights?.kpis?.sla);
  if (toNumber(data.tec_reincidentes) > 0) return locale === 'en-US' ? 'Recurrence and rework' : 'Reincidencia e retrabalho';
  if (isYes(data.op_risco_atraso)) return locale === 'en-US' ? 'Operational delay' : 'Atraso operacional';
  if (isYes(data.op_risco_cliente) || isYes(data.tec_risco_cliente) || isYes(data.adm_risco_cliente)) {
    return locale === 'en-US' ? 'Client pressure' : 'Desgaste com cliente';
  }
  if (Number.isFinite(sla) && sla > 0 && sla < 90) return locale === 'en-US' ? 'SLA breach risk' : 'Risco de quebra de SLA';
  return locale === 'en-US' ? 'No relevant impact' : 'Sem impacto relevante';
}

function buildDashboardDailyMetrics(dateKey, data, insights, brain, localeRaw) {
  const locale = detectLocale(localeRaw);
  const k = (insights && insights.kpis) ? insights.kpis : {};
  const criticalClients = Array.isArray(insights?.criticalClients) ? insights.criticalClients : [];
  const topCriticalClient = toText(criticalClients[0]?.name || data.op_cliente_critico || '');
  const ticketsPendentes = toNumber(k.ticketsPendentes);
  const ticketsCriticos = countCriticalTickets(data);
  const tecnicosCampo = toNumber(data.tec_campo);
  const tecnicosParados = toNumber(data.tec_parados);
  const pedidosAtraso = toNumber(k.pedidosAtraso);
  const pendenciasAdm = toNumber(k.pendenciasAdm);
  const pendenciasCliente = countPendenciasCliente(data);
  const bloqueios = countBloqueios(data);
  const pecas = toNumber(data.tec_aguardando_peca) + toNumber(data.adm_qtd_pecas);
  const docsNotas = toNumber(data.adm_qtd_notas);
  const docsSc = toNumber(data.adm_qtd_sc);
  const reincTotal = toNumber(k.reincidencias) + toNumber(data.tec_reincidentes);
  const scoreValue = toNumber(brain?.scoreOperational?.value || insights?.score);
  const executive = brain?.executiveDecision || {};

  let consolidationScore = 0;
  consolidationScore += statusWeightFromValue(data.op_status);
  consolidationScore += statusWeightFromValue(data.tec_status);
  consolidationScore += statusWeightFromValue(data.adm_status);
  consolidationScore += impactWeightFromValue(data.tec_impacto);
  consolidationScore += impactWeightFromValue(data.adm_impacto);
  consolidationScore += isYes(data.op_risco_cliente) ? 2 : 0;
  consolidationScore += isYes(data.op_risco_escalonamento) ? 2 : 0;
  consolidationScore += isYes(data.op_risco_atraso) ? 2 : 0;
  consolidationScore += isYes(data.tec_risco_cliente) ? 2 : 0;
  consolidationScore += isYes(data.tec_escalonamento) ? 2 : 0;
  consolidationScore += isYes(data.tec_apoio_gestor) ? 1 : 0;
  consolidationScore += isYes(data.adm_risco_cliente) ? 2 : 0;
  consolidationScore += isYes(data.adm_apoio_gestor) ? 1 : 0;
  consolidationScore += isYes(data.adm_dep_terceiros) ? 1 : 0;
  consolidationScore += bloqueios;
  consolidationScore += toNumber(data.tec_parados);
  consolidationScore += toNumber(data.adm_qtd_pend) >= 3 ? 2 : (toNumber(data.adm_qtd_pend) >= 1 ? 1 : 0);
  consolidationScore += toNumber(data.adm_qtd_ctf) >= 2 ? 2 : (toNumber(data.adm_qtd_ctf) >= 1 ? 1 : 0);
  consolidationScore += toNumber(data.tec_reincidentes) >= 2 ? 2 : (toNumber(data.tec_reincidentes) >= 1 ? 1 : 0);

  return {
    date: dateKey,
    kCriticos: toNumber(k.criticos),
    kReinc: reincTotal,
    kSla: toNumber(k.sla),
    kExec: toNumber(k.execucao),
    kBloqueios: bloqueios,
    kTicketsPendentes: ticketsPendentes,
    kTecnicosCampo: tecnicosCampo,
    kTecnicosParados: tecnicosParados,
    kPedidosAtraso: pedidosAtraso,
    kPendenciasCliente: pendenciasCliente,
    kPendenciasAdm: pendenciasAdm,
    kRisco: scoreBandFromValue(scoreValue, locale),
    painelAreaPressionada: computeAreaPressionada(data, locale),
    painelOrigemRisco: computeAreaPressionada(data, locale),
    painelBloqueio: computePrincipalBloqueio(data, locale),
    painelImpacto: computeImpactoPredominante(data, insights, locale),
    painelAcao: toText(executive.recommendedAction || ''),
    painelClienteSensivel: topCriticalClient || '--',
    painelEscalonamento: toYesNo(data.op_risco_escalonamento || data.tec_escalonamento, locale),
    painelDependenciaGestor: toYesNo(data.tec_apoio_gestor || data.adm_apoio_gestor, locale),
    scoreConsolidado: scoreValue,
    painelTicketsResumo: ticketsPendentes,
    painelPedidosResumo: pedidosAtraso,
    painelTecnicosResumoCampo: tecnicosCampo,
    painelTecnicosResumoParados: tecnicosParados,
    painelPecasResumo: pecas,
    painelClienteResumo: pendenciasCliente,
    painelAdmResumo: pendenciasAdm,
    painelTicketsCriticos: ticketsCriticos,
    painelCtfCriticos: toNumber(data.adm_qtd_ctf),
    painelEmailsCriticos: toNumber(data.adm_qtd_emails),
    painelMovResumo: toNumber(data.adm_qtd_mov),
    painelDocResumoNotas: docsNotas,
    painelDocResumoSc: docsSc,
    painelClienteCriticoDetalhe: topCriticalClient || '--',
    heroTicketsPendentes: ticketsPendentes,
    heroTicketsCriticos: ticketsCriticos,
    heroTecnicosCampo: tecnicosCampo,
    heroTecnicosParados: tecnicosParados,
    heroPedidosAtraso: pedidosAtraso,
    heroPendenciasAdm: pendenciasAdm,
    snapTicketsTotal: ticketsPendentes,
    snapTicketsCriticos: ticketsCriticos,
    snapCtf: toNumber(data.adm_qtd_ctf),
    snapEmails: toNumber(data.adm_qtd_emails),
    snapEscalonamento: toYesNo(data.op_risco_escalonamento || data.tec_escalonamento, locale),
    snapTecnicosCampo: tecnicosCampo,
    snapTecnicosParados: tecnicosParados,
    snapPeca: pecas,
    snapCliente: pendenciasCliente,
    snapReinc: reincTotal,
    snapPendAdm: pendenciasAdm,
    snapMov: toNumber(data.adm_qtd_mov),
    snapDocsNotas: docsNotas,
    snapDocsSc: docsSc,
    snapAtraso: pedidosAtraso,
    miniTicketsPendentes: ticketsPendentes,
    miniTecnicosCampo: tecnicosCampo,
    miniPedidosAtraso: pedidosAtraso,
    consolidationScore
  };
}

function computeRiskLevel(score) {
  if (score >= 75) return 'Critico';
  if (score >= 55) return 'Pressao';
  if (score >= 35) return 'Atencao';
  return 'Estavel';
}

function normalizeAnalyticsLabel(value, fallback, maxLen = 90) {
  const normalized = compactText(value, maxLen);
  return normalized || fallback;
}

function resolveIssueTypeLabel(issueLike) {
  const issue = (issueLike && typeof issueLike === 'object') ? issueLike : {};
  const direct = normalizeValueText(issue.type || '');
  if (direct) return direct;
  const message = normalizeValueText(issue.message || issue.description || '');
  if (message.includes('fatur')) return 'faturamento';
  if (message.includes('codigo') || message.includes('cod')) return 'codigo';
  if (message.includes('laudo')) return 'laudo';
  if (message.includes('contrato') || message.includes('garantia')) return 'contrato';
  return 'geral';
}

function detectReworkFromOsItem(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const issueTypes = Array.isArray(item.issues) ? item.issues.map(resolveIssueTypeLabel) : [];
  const text = normalizeValueText([
    item.tipoServico,
    item.codigoRaw,
    item.observacao,
    item.laudo,
    item.nextStep
  ].join(' '));
  if (!text && !issueTypes.length) return false;
  if (issueTypes.includes('laudo') && text.includes('retorno')) return true;
  return [
    'reincid',
    'retrabalho',
    'retorno',
    'revisita',
    'reabertura',
    'nova visita'
  ].some(token => text.includes(token));
}

function detectWarrantyFromOsItem(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const coverage = detectCoverageType(item.cobertura || item.codigoRaw || item.observacao || '');
  if (coverage === 'garantia') return true;
  const text = normalizeValueText([item.cobertura, item.observacao, item.laudo].join(' '));
  return text.includes('garantia');
}

function detectCriticalFromOsItem(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const issues = Array.isArray(item.issues) ? item.issues : [];
  const text = normalizeValueText([
    item.observacao,
    item.laudo,
    item.nextStep,
    item.codigoRaw
  ].join(' '));
  if (issues.length >= 2) return true;
  if (issues.some(issue => resolveIssueTypeLabel(issue) === 'faturamento')) return true;
  return ['critico', 'urgente', 'prioridade 1', 'p1', 'severidade alta'].some(token => text.includes(token));
}

function computeImpactScoreFromOsItem(itemLike, flags) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const state = (flags && typeof flags === 'object') ? flags : {};
  const issues = Array.isArray(item.issues) ? item.issues : [];
  const weightByType = {
    faturamento: 5,
    contrato: 4,
    laudo: 3,
    codigo: 3,
    geral: 2
  };
  let score = 0;
  issues.forEach(issue => {
    const issueType = resolveIssueTypeLabel(issue);
    score += weightByType[issueType] || weightByType.geral;
  });
  if (!issues.length) score += 1;
  if (state.warranty) score += 1;
  if (state.rework) score += 2;
  if (state.critical) score += 3;
  return Math.max(1, Math.min(25, score));
}

function sortByCountThenName(entries) {
  return entries.sort((a, b) => {
    const countA = toNumber(a?.count);
    const countB = toNumber(b?.count);
    if (countB !== countA) return countB - countA;
    return String(a?.name || a?.key || '').localeCompare(String(b?.name || b?.key || ''));
  });
}

function pct(value, total) {
  const nTotal = Math.max(0, toNumber(total));
  if (!nTotal) return 0;
  return Math.round((Math.max(0, toNumber(value)) * 10000) / nTotal) / 100;
}

function buildTechnicalAutoReport(analyticsLike, localeRaw) {
  const analytics = (analyticsLike && typeof analyticsLike === 'object') ? analyticsLike : {};
  const locale = detectLocale(localeRaw);
  const isEn = locale === 'en-US';
  const totalOs = toNumber(analytics?.base?.totalOs);
  const warrantyRate = toNumber(analytics?.warrantyAnalysis?.warrantyRatePct);
  const reworkRate = toNumber(analytics?.reworkAnalysis?.reworkRatePct);
  const criticalCount = toNumber(analytics?.criticalityAnalysis?.criticalCount);
  const impactScore = toNumber(analytics?.criticalityAnalysis?.impact?.totalScore);
  const topFailure = analytics?.equipmentAnalysis?.failureRanking?.[0] || null;
  const topWarranty = analytics?.warrantyAnalysis?.equipmentWarrantyIncidence?.[0] || null;
  const topReworkTech = analytics?.reworkAnalysis?.technicianRework?.[0] || null;

  const summary = isEn
    ? `Analyzed ${totalOs} work order(s). Warranty ${warrantyRate}%, rework ${reworkRate}%, critical incidents ${criticalCount}, accumulated impact ${impactScore}.`
    : `Analisadas ${totalOs} O.S.. Garantia ${warrantyRate}%, retrabalho ${reworkRate}%, chamados criticos ${criticalCount}, impacto acumulado ${impactScore}.`;

  const findings = [];
  if (topFailure) {
    findings.push(isEn
      ? `Top failure equipment: ${topFailure.equipment} (${topFailure.failures}/${topFailure.volume} with issues).`
      : `Equipamento com maior falha: ${topFailure.equipment} (${topFailure.failures}/${topFailure.volume} com pendencia).`);
  }
  if (topWarranty) {
    findings.push(isEn
      ? `Warranty concentration: ${topWarranty.equipment} (${topWarranty.warrantyCount} WO, ${topWarranty.warrantyRatePct}%).`
      : `Concentracao de garantia: ${topWarranty.equipment} (${topWarranty.warrantyCount} O.S., ${topWarranty.warrantyRatePct}%).`);
  }
  if (topReworkTech) {
    findings.push(isEn
      ? `Technician with highest rework: ${topReworkTech.technician} (${topReworkTech.reworkCount}/${topReworkTech.volume}).`
      : `Tecnico com maior retrabalho: ${topReworkTech.technician} (${topReworkTech.reworkCount}/${topReworkTech.volume}).`);
  }
  if (!findings.length) {
    findings.push(isEn ? 'No critical technical concentration detected in the analyzed period.' : 'Sem concentracao tecnica critica no periodo analisado.');
  }

  const recommendations = [];
  if (warrantyRate >= 30) {
    recommendations.push(isEn
      ? 'Open root-cause review for equipment with high warranty incidence.'
      : 'Abrir rotina de causa raiz para equipamentos com alta incidencia de garantia.');
  }
  if (reworkRate >= 15) {
    recommendations.push(isEn
      ? 'Apply rework prevention checklist with mandatory closure evidence.'
      : 'Aplicar checklist de prevencao de retrabalho com evidencia obrigatoria de encerramento.');
  }
  if (criticalCount > 0 || impactScore >= 60) {
    recommendations.push(isEn
      ? 'Run focused action plan by location and equipment with executive owner and deadline.'
      : 'Executar plano focado por local e equipamento com dono executivo e prazo fechado.');
  }
  if (!recommendations.length) {
    recommendations.push(isEn
      ? 'Keep preventive monitoring and update technical standards weekly.'
      : 'Manter monitoramento preventivo e atualizar padrao tecnico semanalmente.');
  }

  return {
    locale,
    generatedAt: nowIso(),
    executiveSummary: summary,
    findings: findings.slice(0, 6),
    recommendations: recommendations.slice(0, 6)
  };
}

function buildTechnicalInsightsDetailed(itemsLike, options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const locale = detectLocale(opts.locale);
  const isEn = locale === 'en-US';
  const fallbackEquipment = isEn ? 'Equipment not identified' : 'Equipamento nao identificado';
  const fallbackLocation = isEn ? 'Location not identified' : 'Local nao identificado';
  const fallbackTechnician = isEn ? 'Technician not identified' : 'Tecnico nao identificado';
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const period = {
    type: opts.periodType || 'daily',
    label: toText(opts.periodLabel || opts.referenceDate || ''),
    referenceDate: toText(opts.referenceDate || '')
  };
  const taxonomy = buildAnalyticsTaxonomy(items, {
    locale,
    periodType: period.type,
    periodLabel: period.label,
    referenceDate: period.referenceDate
  });

  const empty = {
    locale,
    period,
    base: {
      totalOs: 0,
      analyzedItems: 0,
      totalIssues: 0,
      missingEquipmentCount: 0,
      missingTechnicianCount: 0
    },
    equipmentAnalysis: {
      byEquipment: [],
      failureRanking: [],
      recurrenceRanking: [],
      topFailureByEquipment: null
    },
    warrantyAnalysis: {
      warrantyCount: 0,
      warrantyRatePct: 0,
      equipmentWarrantyIncidence: [],
      topWarrantyEquipment: null
    },
    reworkAnalysis: {
      reworkCount: 0,
      reworkRatePct: 0,
      technicianRework: [],
      recurrentPatterns: []
    },
    criticalityAnalysis: {
      criticalCount: 0,
      byEquipment: [],
      byLocation: [],
      impact: {
        totalScore: 0,
        averageScore: 0,
        topEquipmentImpact: null,
        topLocationImpact: null
      }
    },
    issueRanking: [],
    technicalReport: buildTechnicalAutoReport({ base: { totalOs: 0 } }, locale),
    taxonomySummary: taxonomy.taxonomySummary,
    taxonomyByEquipment: taxonomy.taxonomyByEquipment,
    taxonomyByTechnician: taxonomy.taxonomyByTechnician,
    taxonomyByLocation: taxonomy.taxonomyByLocation,
    technicalNarrativeV2: taxonomy.technicalNarrativeV2,
    classificationQuality: taxonomy.classificationQuality,
    reviewQueue: Array.isArray(taxonomy.reviewQueue) ? taxonomy.reviewQueue : [],
    reviewPriority: toText(taxonomy.reviewPriority || 'none'),
    reviewReason: toText(taxonomy.reviewReason || ''),
    recommendedReviewer: toText(taxonomy.recommendedReviewer || 'monitoramento_automatico'),
    reviewChecklist: Array.isArray(taxonomy.reviewChecklist) ? taxonomy.reviewChecklist : [],
    reviewQueueSummary: (taxonomy.reviewQueueSummary && typeof taxonomy.reviewQueueSummary === 'object')
      ? taxonomy.reviewQueueSummary
      : {
          total: 0,
          byPriority: { critical: 0, high: 0, medium: 0, low: 0 },
          requiresHumanReview: false,
          generatedBy: 'taxonomy_v2'
        }
  };
  if (!items.length) return empty;

  const equipmentMap = new Map();
  const locationMap = new Map();
  const technicianMap = new Map();
  const issueTypeMap = new Map();
  const patternMap = new Map();
  let missingEquipmentCount = 0;
  let missingTechnicianCount = 0;
  let totalIssues = 0;
  let warrantyCount = 0;
  let reworkCount = 0;
  let criticalCount = 0;
  let impactTotal = 0;

  function ensureEquipment(name) {
    if (!equipmentMap.has(name)) {
      equipmentMap.set(name, {
        equipment: name,
        volume: 0,
        failures: 0,
        warrantyCount: 0,
        reworkCount: 0,
        criticalCount: 0,
        impactScore: 0,
        locations: new Map(),
        issueTypes: new Map()
      });
    }
    return equipmentMap.get(name);
  }

  function ensureLocation(name) {
    if (!locationMap.has(name)) {
      locationMap.set(name, { location: name, volume: 0, criticalCount: 0, impactScore: 0 });
    }
    return locationMap.get(name);
  }

  function ensureTechnician(name) {
    if (!technicianMap.has(name)) {
      technicianMap.set(name, { technician: name, volume: 0, reworkCount: 0, warrantyCount: 0, criticalCount: 0 });
    }
    return technicianMap.get(name);
  }

  for (const itemRaw of items) {
    const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
    const issues = Array.isArray(item.issues) ? item.issues : [];
    const equipmentRaw = toText(item.produto || '');
    const equipment = normalizeAnalyticsLabel(equipmentRaw, fallbackEquipment, 120);
    const location = normalizeAnalyticsLabel(item.cliente || '', fallbackLocation, 120);
    const technicianRaw = toText(item.tecnico || item.responsavelTecnico || item.responsavel || item.technician || '');
    const technician = normalizeAnalyticsLabel(technicianRaw, fallbackTechnician, 80);
    if (!equipmentRaw) missingEquipmentCount += 1;
    if (!technicianRaw) missingTechnicianCount += 1;

    const flags = {
      warranty: detectWarrantyFromOsItem(item),
      rework: detectReworkFromOsItem(item),
      critical: detectCriticalFromOsItem(item)
    };
    const failure = issues.length > 0;
    const impact = computeImpactScoreFromOsItem(item, flags);
    const eqRow = ensureEquipment(equipment);
    const locRow = ensureLocation(location);
    const techRow = ensureTechnician(technician);

    eqRow.volume += 1;
    locRow.volume += 1;
    techRow.volume += 1;
    eqRow.impactScore += impact;
    locRow.impactScore += impact;
    impactTotal += impact;

    if (flags.warranty) {
      warrantyCount += 1;
      eqRow.warrantyCount += 1;
      techRow.warrantyCount += 1;
    }
    if (flags.rework) {
      reworkCount += 1;
      eqRow.reworkCount += 1;
      techRow.reworkCount += 1;
    }
    if (flags.critical) {
      criticalCount += 1;
      eqRow.criticalCount += 1;
      locRow.criticalCount += 1;
      techRow.criticalCount += 1;
    }
    if (failure) eqRow.failures += 1;
    eqRow.locations.set(location, (eqRow.locations.get(location) || 0) + 1);

    issues.forEach(issue => {
      const issueType = resolveIssueTypeLabel(issue);
      issueTypeMap.set(issueType, (issueTypeMap.get(issueType) || 0) + 1);
      eqRow.issueTypes.set(issueType, (eqRow.issueTypes.get(issueType) || 0) + 1);
    });

    if (flags.rework) {
      const topIssueType = sortByCountThenName(
        Array.from(eqRow.issueTypes.entries()).map(([key, count]) => ({ key, count }))
      )[0]?.key || 'geral';
      const patternKey = `${equipment}__${topIssueType}`;
      patternMap.set(patternKey, (patternMap.get(patternKey) || 0) + 1);
    }
    totalIssues += issues.length;
  }

  const totalOs = items.length;
  const equipmentRows = Array.from(equipmentMap.values()).map(row => ({
    equipment: row.equipment,
    volume: row.volume,
    failures: row.failures,
    failureRatePct: pct(row.failures, row.volume),
    warrantyCount: row.warrantyCount,
    warrantyRatePct: pct(row.warrantyCount, row.volume),
    reworkCount: row.reworkCount,
    reworkRatePct: pct(row.reworkCount, row.volume),
    criticalCount: row.criticalCount,
    criticalRatePct: pct(row.criticalCount, row.volume),
    impactScore: Math.round(row.impactScore),
    topIssueType: sortByCountThenName(
      Array.from(row.issueTypes.entries()).map(([key, count]) => ({ key, count }))
    )[0]?.key || '',
    topLocations: sortByCountThenName(
      Array.from(row.locations.entries()).map(([name, count]) => ({ name, count }))
    ).slice(0, 3)
  }));
  const failureRanking = equipmentRows.slice().sort((a, b) => b.failures - a.failures || b.volume - a.volume).slice(0, 10);
  const recurrenceRanking = equipmentRows.slice().sort((a, b) => b.reworkCount - a.reworkCount || b.volume - a.volume).slice(0, 10);
  const warrantyRanking = equipmentRows
    .filter(row => row.warrantyCount > 0)
    .sort((a, b) => b.warrantyCount - a.warrantyCount || b.warrantyRatePct - a.warrantyRatePct)
    .slice(0, 10)
    .map(row => ({
      equipment: row.equipment,
      volume: row.volume,
      warrantyCount: row.warrantyCount,
      warrantyRatePct: row.warrantyRatePct
    }));
  const technicianRework = Array.from(technicianMap.values())
    .sort((a, b) => b.reworkCount - a.reworkCount || b.volume - a.volume)
    .slice(0, 10)
    .map(row => ({
      technician: row.technician,
      volume: row.volume,
      reworkCount: row.reworkCount,
      reworkRatePct: pct(row.reworkCount, row.volume),
      warrantyCount: row.warrantyCount,
      criticalCount: row.criticalCount
    }));
  const locationRows = Array.from(locationMap.values())
    .sort((a, b) => b.impactScore - a.impactScore || b.criticalCount - a.criticalCount)
    .map(row => ({
      location: row.location,
      volume: row.volume,
      criticalCount: row.criticalCount,
      criticalRatePct: pct(row.criticalCount, row.volume),
      impactScore: Math.round(row.impactScore)
    }));
  const issueRanking = Array.from(issueTypeMap.entries())
    .map(([issueType, count]) => ({ issueType, count, ratePct: pct(count, Math.max(1, totalIssues)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const recurrentPatterns = Array.from(patternMap.entries())
    .map(([pattern, count]) => {
      const parts = String(pattern).split('__');
      return {
        equipment: parts[0] || fallbackEquipment,
        issueType: parts[1] || 'geral',
        count
      };
    })
    .filter(item => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const result = {
    locale,
    period,
    base: {
      totalOs,
      analyzedItems: totalOs,
      totalIssues,
      missingEquipmentCount,
      missingTechnicianCount
    },
    equipmentAnalysis: {
      byEquipment: equipmentRows.slice(0, 30),
      failureRanking,
      recurrenceRanking,
      topFailureByEquipment: failureRanking[0] || null
    },
    warrantyAnalysis: {
      warrantyCount,
      warrantyRatePct: pct(warrantyCount, totalOs),
      equipmentWarrantyIncidence: warrantyRanking,
      topWarrantyEquipment: warrantyRanking[0] || null
    },
    reworkAnalysis: {
      reworkCount,
      reworkRatePct: pct(reworkCount, totalOs),
      technicianRework,
      recurrentPatterns
    },
    criticalityAnalysis: {
      criticalCount,
      byEquipment: equipmentRows
        .filter(row => row.criticalCount > 0)
        .sort((a, b) => b.criticalCount - a.criticalCount || b.impactScore - a.impactScore)
        .slice(0, 10)
        .map(row => ({
          equipment: row.equipment,
          volume: row.volume,
          criticalCount: row.criticalCount,
          impactScore: row.impactScore
        })),
      byLocation: locationRows.slice(0, 10),
      impact: {
        totalScore: Math.round(impactTotal),
        averageScore: totalOs ? Math.round((impactTotal / totalOs) * 100) / 100 : 0,
        topEquipmentImpact: equipmentRows.slice().sort((a, b) => b.impactScore - a.impactScore)[0] || null,
        topLocationImpact: locationRows[0] || null
      }
    },
    issueRanking,
    taxonomySummary: taxonomy.taxonomySummary,
    taxonomyByEquipment: taxonomy.taxonomyByEquipment,
    taxonomyByTechnician: taxonomy.taxonomyByTechnician,
    taxonomyByLocation: taxonomy.taxonomyByLocation,
    technicalNarrativeV2: taxonomy.technicalNarrativeV2,
    classificationQuality: taxonomy.classificationQuality,
    reviewQueue: Array.isArray(taxonomy.reviewQueue) ? taxonomy.reviewQueue : [],
    reviewPriority: toText(taxonomy.reviewPriority || 'none'),
    reviewReason: toText(taxonomy.reviewReason || ''),
    recommendedReviewer: toText(taxonomy.recommendedReviewer || 'monitoramento_automatico'),
    reviewChecklist: Array.isArray(taxonomy.reviewChecklist) ? taxonomy.reviewChecklist : [],
    reviewQueueSummary: (taxonomy.reviewQueueSummary && typeof taxonomy.reviewQueueSummary === 'object')
      ? taxonomy.reviewQueueSummary
      : {
          total: 0,
          byPriority: { critical: 0, high: 0, medium: 0, low: 0 },
          requiresHumanReview: false,
          generatedBy: 'taxonomy_v2'
        }
  };
  result.technicalReport = buildTechnicalAutoReport(result, locale);
  return result;
}

function buildInsightsFromData(dateKey, data, localeRaw) {
  const locale = detectLocale(localeRaw);
  const isEn = locale === 'en-US';
  const t = isEn
    ? {
        criticalCases: (value) => `Critical active cases: ${value}`,
        pendingTickets: (value) => `Pending tickets: ${value}`,
        lateOrders: (value) => `Overdue orders: ${value}`,
        slaBelow: (value) => `SLA below target (92%): ${value}%`,
        executionBelow: (value) => `Execution routine below 90%: ${value}%`,
        escalationRisk: 'Escalation risk declared',
        osAuditRecords: (value) => `Work order audit: ${value} record(s) with issues`,
        financialRisk: (value) => `Financial risk: ${value} WO(s) with billing risk`,
        controlled: 'Operation under control at this time',
        actionCritical: 'Run a critical-client war-room with checkpoints every 2 hours',
        actionTickets: 'Close highest-impact external tickets before next shift',
        actionLateOrders: 'Lock recovery plan for overdue orders with owner and due date',
        actionAdministrative: 'Administrative focused cycle for parts/invoices/PO and third-party dependencies',
        actionChecklist: 'Reinforce operational checklist ritual and blocker triggers',
        actionBilling: 'Prioritize WO without billing and validate PO/code with finance and commercial teams.',
        actionCode: 'Complete pending service codes using the 2026 service table before daily close.',
        actionPricingSync: 'Sync service code catalog with pricing source and fix unmapped billable codes.',
        actionReport: 'Review unclear technical reports with standard: defect, cause, action and evidence.',
        actionContract: 'Handle contract/warranty mismatches to avoid losses and rework.',
        pricingCoverageLow: (value, missing) => `Price-code mapping low (${value}% coverage, ${missing} billable WO without mapped price)`,
        actionMaintain: 'Keep current rhythm and register daily lessons learned'
      }
    : {
        criticalCases: (value) => `Casos criticos ativos: ${value}`,
        pendingTickets: (value) => `Tickets pendentes: ${value}`,
        lateOrders: (value) => `Pedidos em atraso: ${value}`,
        slaBelow: (value) => `SLA abaixo da meta (92%): ${value}%`,
        executionBelow: (value) => `Execucao da rotina abaixo de 90%: ${value}%`,
        escalationRisk: 'Risco de escalonamento declarado',
        osAuditRecords: (value) => `Auditoria O.S.: ${value} registro(s) com pendencias`,
        financialRisk: (value) => `Risco financeiro: ${value} O.S. com risco de nao faturar`,
        controlled: 'Operacao sob controle no momento',
        actionCritical: 'Executar war-room de clientes criticos com checkpoints de 2h',
        actionTickets: 'Zerar tickets externos de maior impacto antes do proximo turno',
        actionLateOrders: 'Travar plano de recuperacao para pedidos vencidos com dono e prazo',
        actionAdministrative: 'Rodada administrativa focada em pecas/notas/sc e dependencias de terceiros',
        actionChecklist: 'Reforcar ritual de checklist operacional e gatilhos de bloqueio',
        actionBilling: 'Priorizar O.S. sem faturamento e validar OC/codigo com financeiro e comercial.',
        actionCode: 'Completar codigos pendentes conforme tabela de servicos 2026 antes do fechamento diario.',
        actionPricingSync: 'Sincronizar catalogo de codigos com a fonte de precos e corrigir codigos faturaveis sem mapeamento.',
        actionReport: 'Revisar laudos de baixa clareza com padrao: defeito, causa, acao e evidencia.',
        actionContract: 'Tratar divergencias de contrato/garantia para evitar glosa e retrabalho.',
        pricingCoverageLow: (value, missing) => `Mapeamento codigo x preco baixo (${value}% de cobertura, ${missing} O.S. faturaveis sem preco mapeado)`,
        actionMaintain: 'Manter ritmo atual e registrar aprendizado do dia'
      };
  const org = readOrganizationConfig();
  const hasImportSummary = toNumber(data.import_summary_rows) > 0;
  const criticos = resolveCountMetric(data.op_criticos, data.import_summary_criticos, hasImportSummary);
  const reinc = resolveCountMetric(data.op_reinc, data.import_summary_reincidencias, hasImportSummary);
  const sla = resolvePercentMetric(data.op_sla, data.import_summary_sla);
  const slaForScore = sla == null ? 92 : sla;
  const importedExec = resolvePercentMetric('', data.import_summary_execucao);
  const exec = calcExecution(data) ?? importedExec;
  const execForScore = exec == null ? 80 : exec;
  const tickets = resolveCountMetric(countTicketsPending(data), data.import_summary_tickets_pendentes, hasImportSummary);
  const atrasos = resolveCountMetric(countLateOrders(data, dateKey), data.import_summary_pedidos_atraso, hasImportSummary);
  const pendAdm = resolveCountMetric(countAdminPending(data), data.import_summary_pendencias_adm, hasImportSummary);
  const atendimentoMix = {
    instalacao: toNumber(data.import_summary_tipo_instalacao),
    corretiva: toNumber(data.import_summary_tipo_corretiva),
    preventiva: toNumber(data.import_summary_tipo_preventiva)
  };
  const coberturaMix = {
    garantia: toNumber(data.import_summary_cobertura_garantia),
    contrato: toNumber(data.import_summary_cobertura_contrato),
    avulso: toNumber(data.import_summary_cobertura_avulso)
  };
  const operacaoMix = {
    interna: toNumber(data.import_summary_operacao_interna),
    externa: toNumber(data.import_summary_operacao_externa)
  };
  const allOsAuditItems = parseOsAuditFromData(data);
  const detailedAnalytics = buildTechnicalInsightsDetailed(allOsAuditItems, {
    locale,
    periodType: 'daily',
    periodLabel: dateKey,
    referenceDate: dateKey
  });
  const osAudit = {
    total: toNumber(data.import_os_total),
    recordsWithAlert: toNumber(data.import_os_alert_records),
    alertTotal: toNumber(data.import_os_alert_total),
    faturamento: toNumber(data.import_os_alert_faturamento),
    codigo: toNumber(data.import_os_alert_codigo),
    laudo: toNumber(data.import_os_alert_laudo),
    contrato: toNumber(data.import_os_alert_contrato),
    riscoEstimado: toNumber(data.import_os_risco_estimado),
    items: allOsAuditItems.slice(0, 20)
  };
  const pricing = readPricingConfig();
  const pricingCatalog = ensurePricingCatalogLoaded();
  const pricingReconStored = parsePricingReconciliationFromData(data);
  const hasPricingReconStored = String(data.import_pricing_reconciliation_json || '').trim().length > 0;
  const pricingReconciliation = (hasPricingReconStored && isPricingReconciliationFresh(pricingReconStored))
    ? pricingReconStored
    : buildPricingReconciliationFromAuditItems(allOsAuditItems, pricingCatalog, pricing);
  osAudit.codigo = resolveOsCodigoCount(data.import_os_alert_codigo, pricingReconciliation);
  const produtoTop = toText(data.import_summary_produto_top);
  const esc = isYes(data.op_risco_escalonamento) ? 10 : 0;
  const riscoCliente = isYes(data.op_risco_cliente) ? 8 : 0;
  const riscoAtraso = isYes(data.op_risco_atraso) ? 6 : 0;

  const rawScore =
    (criticos * 7) +
    (reinc * 4) +
    (tickets * 5) +
    (atrasos * 5) +
    (pendAdm * 1.5) +
    ((100 - slaForScore) * 0.9) +
    ((100 - execForScore) * 0.6) +
    esc + riscoCliente + riscoAtraso;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const level = computeRiskLevel(score);

  const alerts = [];
  if (criticos > 0) alerts.push(t.criticalCases(criticos));
  if (tickets > 0) alerts.push(t.pendingTickets(tickets));
  if (atrasos > 0) alerts.push(t.lateOrders(atrasos));
  if (sla != null && sla < 92) alerts.push(t.slaBelow(sla));
  if (exec != null && exec < 90) alerts.push(t.executionBelow(exec));
  if (isYes(data.op_risco_escalonamento)) alerts.push(t.escalationRisk);
  if (osAudit.recordsWithAlert > 0) alerts.push(t.osAuditRecords(osAudit.recordsWithAlert));
  if (osAudit.faturamento > 0) alerts.push(t.financialRisk(osAudit.faturamento));
  if (toNumber(pricingReconciliation.requiredPriceMissingOs) > 0) {
    alerts.push(t.pricingCoverageLow(
      toNumber(pricingReconciliation.requiredPriceCoveragePct),
      toNumber(pricingReconciliation.requiredPriceMissingOs)
    ));
  }
  if (!alerts.length) alerts.push(t.controlled);

  const actions24h = [];
  if (criticos > 0) actions24h.push(t.actionCritical);
  if (tickets > 0) actions24h.push(t.actionTickets);
  if (atrasos > 0) actions24h.push(t.actionLateOrders);
  if (pendAdm > 0) actions24h.push(t.actionAdministrative);
  if ((sla != null && sla < 92) || (exec != null && exec < 90)) actions24h.push(t.actionChecklist);
  if (osAudit.faturamento > 0) actions24h.push(t.actionBilling);
  if (osAudit.codigo > 0) actions24h.push(t.actionCode);
  if (toNumber(pricingReconciliation.requiredPriceMissingOs) > 0) actions24h.push(t.actionPricingSync);
  if (osAudit.laudo > 0) actions24h.push(t.actionReport);
  if (osAudit.contrato > 0) actions24h.push(t.actionContract);
  if (!actions24h.length) actions24h.push(t.actionMaintain);

  return {
    locale,
    date: dateKey,
    organization: org,
    kpis: {
      criticos,
      reincidencias: reinc,
      sla,
      execucao: exec,
      ticketsPendentes: tickets,
      pedidosAtraso: atrasos,
      pendenciasAdm: pendAdm
    },
    score,
    level,
    topAlert: alerts[0],
    alerts: alerts.slice(0, 6),
    actions24h: actions24h.slice(0, 6),
    criticalClients: listCriticalClients(data),
    atendimentoMix,
    coberturaMix,
    operacaoMix,
    produtoTop,
    osAudit,
    detailedAnalytics,
    pricing: {
      lookerUrl: pricing.lookerUrl || DEFAULT_LOOKER_URL,
      portalClienteUrl: pricing.portalClienteUrl || DEFAULT_PORTAL_CLIENTE_URL,
      powerBiUrl: pricing.powerBiUrl || DEFAULT_POWER_BI_URL,
      campinas: pricing.campinas || {},
      reconciliation: pricingReconciliation
    }
  };
}

async function buildMonthlyOsAggregate(referenceDate, scopeLike, localeRaw, filtersLike) {
  const scope = normalizeStorageScope(scopeLike);
  const locale = detectLocale(localeRaw);
  const dateKey = normalizeDateKey(referenceDate) || getLocalISODate(new Date());
  const monthKey = dateKey.slice(0, 7);
  const normalizedFilters = normalizeInsightsFilters(filtersLike || {});
  const hasFilters = hasActiveInsightsFilters(normalizedFilters);

  const empty = {
    locale,
    referenceDate: dateKey,
    month: monthKey,
    sampleDays: 0,
    dates: [],
    atendimentoMix: { instalacao: 0, corretiva: 0, preventiva: 0 },
    coberturaMix: { garantia: 0, contrato: 0, avulso: 0 },
    operacaoMix: { interna: 0, externa: 0 },
    produtoTop: '',
    osAudit: {
      total: 0,
      recordsWithAlert: 0,
      alertTotal: 0,
      faturamento: 0,
      codigo: 0,
      laudo: 0,
      contrato: 0,
      riscoEstimado: 0,
      items: []
    },
    detailedAnalytics: buildTechnicalInsightsDetailed([], {
      locale,
      periodType: 'monthly',
      periodLabel: monthKey,
      referenceDate: dateKey
    }),
    pricing: {
      reconciliation: {
        version: PRICING_RECONCILIATION_VERSION,
        generatedAt: nowIso(),
        totalOs: 0,
        osWithoutCode: 0,
        uniqueCodes: 0,
        matchedUniqueCodes: 0,
        missingUniqueCodes: 0,
        coveragePct: 100,
        matchedOs: 0,
        missingOs: 0,
        requiredPriceOs: 0,
        requiredPriceMatchedOs: 0,
        requiredPriceMissingOs: 0,
        requiredPriceCoveragePct: 100,
        estimatedMatchedValue: 0,
        estimatedMissingValue: 0,
        catalogItems: 0,
        catalogUpdatedAt: '',
        topMissingCodes: [],
        topMatchedCodes: [],
        topMissingRequiredCodes: []
      }
    }
  };

  if (!storage || typeof storage.listRecords !== 'function' || typeof storage.getRecord !== 'function') return empty;

  const listed = await storage.listRecords(scope);
  const monthDates = (Array.isArray(listed) ? listed : [])
    .map(item => normalizeDateKey(item?.date))
    .filter(Boolean)
    .filter(item => item.slice(0, 7) === monthKey && item <= dateKey)
    .sort((a, b) => a.localeCompare(b));
  if (!monthDates.length) return empty;

  const productCounter = new Map();
  const fallbackProductCounter = new Map();
  const allItems = [];

  let sampleDays = 0;
  let totalOs = 0;
  let recordsWithAlert = 0;
  let alertTotal = 0;
  let faturamento = 0;
  let codigo = 0;
  let laudo = 0;
  let contrato = 0;
  let riscoEstimado = 0;

  let atendimentoInstalacao = 0;
  let atendimentoCorretiva = 0;
  let atendimentoPreventiva = 0;

  let coberturaGarantia = 0;
  let coberturaContrato = 0;
  let coberturaAvulso = 0;

  let operacaoInterna = 0;
  let operacaoExterna = 0;

  const datesUsed = [];

  for (const day of monthDates) {
    const rec = await storage.getRecord(day, scope);
    const data = rec?.data || {};
    const hasImportData = toNumber(data.import_summary_rows) > 0
      || toNumber(data.import_os_total) > 0
      || String(data.import_os_audit_json || '').trim() !== '';
    if (!hasImportData) continue;

    const dayItems = parseOsAuditFromData(data);
    const dayItemsForAggregation = hasFilters
      ? applyOsAuditFilters(dayItems, normalizedFilters)
      : dayItems;
    if (hasFilters && !dayItemsForAggregation.length) continue;

    sampleDays += 1;
    datesUsed.push(day);

    if (hasFilters) {
      const filteredSummary = summarizeOsAuditByItems(dayItemsForAggregation);
      totalOs += filteredSummary.total;
      recordsWithAlert += filteredSummary.recordsWithAlert;
      alertTotal += filteredSummary.alertTotal;
      faturamento += filteredSummary.faturamento;
      codigo += filteredSummary.codigo;
      laudo += filteredSummary.laudo;
      contrato += filteredSummary.contrato;
      riscoEstimado += filteredSummary.riscoEstimado;

      for (const item of dayItemsForAggregation) {
        const productName = compactText(item?.produto || '', 120);
        if (productName) {
          productCounter.set(productName, (productCounter.get(productName) || 0) + 1);
          fallbackProductCounter.set(productName, (fallbackProductCounter.get(productName) || 0) + 1);
        }
        const serviceType = detectServiceType(item?.tipoServico || item?.codigoRaw || item?.codigoOperacional || item?.observacao || '');
        if (serviceType === 'instalacao') atendimentoInstalacao += 1;
        else if (serviceType === 'corretiva') atendimentoCorretiva += 1;
        else if (serviceType === 'preventiva') atendimentoPreventiva += 1;

        const coverageType = detectCoverageType(item?.cobertura || item?.codigoRaw || item?.observacao || '');
        if (coverageType === 'garantia') coberturaGarantia += 1;
        else if (coverageType === 'contrato') coberturaContrato += 1;
        else if (coverageType === 'avulso') coberturaAvulso += 1;

        const channel = detectOperationChannel(item?.canal || item?.observacao || '');
        if (channel === 'interna') operacaoInterna += 1;
        else if (channel === 'externa') operacaoExterna += 1;
      }
      allItems.push(...dayItemsForAggregation.slice(0, 220));
      continue;
    }

    totalOs += toNumber(data.import_os_total);
    recordsWithAlert += toNumber(data.import_os_alert_records);
    alertTotal += toNumber(data.import_os_alert_total);
    faturamento += toNumber(data.import_os_alert_faturamento);
    codigo += toNumber(data.import_os_alert_codigo);
    laudo += toNumber(data.import_os_alert_laudo);
    contrato += toNumber(data.import_os_alert_contrato);
    riscoEstimado += toNumber(data.import_os_risco_estimado);

    atendimentoInstalacao += toNumber(data.import_summary_tipo_instalacao);
    atendimentoCorretiva += toNumber(data.import_summary_tipo_corretiva);
    atendimentoPreventiva += toNumber(data.import_summary_tipo_preventiva);

    coberturaGarantia += toNumber(data.import_summary_cobertura_garantia);
    coberturaContrato += toNumber(data.import_summary_cobertura_contrato);
    coberturaAvulso += toNumber(data.import_summary_cobertura_avulso);

    operacaoInterna += toNumber(data.import_summary_operacao_interna);
    operacaoExterna += toNumber(data.import_summary_operacao_externa);

    const produtoTopDay = compactText(data.import_summary_produto_top || '', 120);
    if (produtoTopDay) fallbackProductCounter.set(produtoTopDay, (fallbackProductCounter.get(produtoTopDay) || 0) + 1);

    if (dayItems.length) {
      for (const item of dayItems) {
        const productName = compactText(item?.produto || '', 120);
        if (productName) productCounter.set(productName, (productCounter.get(productName) || 0) + 1);
      }
      allItems.push(...dayItems.slice(0, 220));
    }
  }

  if (!sampleDays) return empty;

  if (!hasFilters && atendimentoInstalacao + atendimentoCorretiva + atendimentoPreventiva === 0 && allItems.length) {
    for (const item of allItems) {
      const serviceType = detectServiceType(item?.tipoServico || item?.codigoRaw || item?.codigoOperacional || item?.observacao || '');
      if (serviceType === 'instalacao') atendimentoInstalacao += 1;
      else if (serviceType === 'corretiva') atendimentoCorretiva += 1;
      else if (serviceType === 'preventiva') atendimentoPreventiva += 1;
    }
  }

  if (!hasFilters && coberturaGarantia + coberturaContrato + coberturaAvulso === 0 && allItems.length) {
    for (const item of allItems) {
      const coverageType = detectCoverageType(item?.cobertura || item?.codigoRaw || item?.observacao || '');
      if (coverageType === 'garantia') coberturaGarantia += 1;
      else if (coverageType === 'contrato') coberturaContrato += 1;
      else if (coverageType === 'avulso') coberturaAvulso += 1;
    }
  }

  if (!hasFilters && operacaoInterna + operacaoExterna === 0 && allItems.length) {
    for (const item of allItems) {
      const channel = detectOperationChannel(item?.canal || item?.observacao || '');
      if (channel === 'interna') operacaoInterna += 1;
      else if (channel === 'externa') operacaoExterna += 1;
    }
  }

  const pricingCatalog = ensurePricingCatalogLoaded();
  const pricingConfig = readPricingConfig();
  const pricingReconciliation = buildPricingReconciliationFromAuditItems(allItems, pricingCatalog, pricingConfig);
  pricingReconciliation.totalOs = totalOs > 0 ? totalOs : pricingReconciliation.totalOs;
  pricingReconciliation.generatedAt = nowIso();

  const flaggedItems = allItems.filter(item => Array.isArray(item?.issues) && item.issues.length).slice(0, 60);
  const produtoTop = getTopCounterKey(productCounter) || getTopCounterKey(fallbackProductCounter);
  const detailedAnalytics = buildTechnicalInsightsDetailed(allItems, {
    locale,
    periodType: 'monthly',
    periodLabel: monthKey,
    referenceDate: dateKey
  });

  return {
    locale,
    referenceDate: dateKey,
    month: monthKey,
    sampleDays,
    dates: datesUsed,
    atendimentoMix: {
      instalacao: atendimentoInstalacao,
      corretiva: atendimentoCorretiva,
      preventiva: atendimentoPreventiva
    },
    coberturaMix: {
      garantia: coberturaGarantia,
      contrato: coberturaContrato,
      avulso: coberturaAvulso
    },
    operacaoMix: {
      interna: operacaoInterna,
      externa: operacaoExterna
    },
    produtoTop,
    osAudit: {
      total: totalOs,
      recordsWithAlert,
      alertTotal,
      faturamento,
      codigo: resolveOsCodigoCount(codigo, pricingReconciliation),
      laudo,
      contrato,
      riscoEstimado: Math.round(riscoEstimado * 100) / 100,
      items: flaggedItems
    },
    detailedAnalytics,
    pricing: {
      reconciliation: pricingReconciliation
    }
  };
}

function normalizeMonthlyDistribution(listLike, totalBaseLike, localeRaw, limitLike) {
  const locale = detectLocale(localeRaw);
  const totalBase = Math.max(0, toNumber(totalBaseLike));
  const limit = Math.max(1, Math.min(Number(limitLike || 6), 20));
  const list = Array.isArray(listLike) ? listLike : [];
  return list
    .map(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      const key = normalizeKey(item.key || item.name || item.label || 'nao_identificado');
      const count = Math.max(0, toNumber(item.count));
      const fromPayloadPct = toNumber(item.ratePct);
      const ratePct = fromPayloadPct > 0 ? fromPayloadPct : pct(count, totalBase);
      return {
        key,
        label: translateTaxonomyKey(key, locale),
        count,
        ratePct: Math.round(ratePct * 100) / 100
      };
    })
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count || b.ratePct - a.ratePct || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function translateTaxonomyKey(rawKey, localeRaw) {
  const locale = detectLocale(localeRaw);
  const key = normalizeKey(rawKey || '');
  const mapPt = {
    corretiva: 'Corretiva',
    preventiva: 'Preventiva',
    instalacao: 'Instalacao',
    configuracao: 'Configuracao',
    treinamento: 'Treinamento',
    vistoria: 'Vistoria',
    suporte_ajuste: 'Suporte/Ajuste',
    retorno_tecnico: 'Retorno tecnico',
    nao_identificado: 'Nao identificado',
    em_garantia: 'Em garantia',
    fora_garantia: 'Fora da garantia',
    garantia_peca: 'Garantia de peca',
    garantia_servico_instalacao: 'Garantia de servico/instalacao',
    garantia_fabrica: 'Garantia de fabrica',
    sem_garantia: 'Sem garantia',
    equipamento: 'Equipamento',
    instalacao_causa: 'Instalacao',
    infraestrutura_cliente: 'Infraestrutura do cliente',
    software_configuracao: 'Software/Configuracao',
    integracao: 'Integracao',
    operacao_uso: 'Operacao/Uso',
    peca_acessorio: 'Peca/Acessorio',
    indefinido: 'Indefinido',
    resolvido: 'Resolvido',
    paliativo: 'Paliativo',
    requer_peca: 'Requer peca',
    requer_fabrica: 'Requer fabrica',
    requer_cliente: 'Requer cliente',
    requer_nova_visita: 'Requer nova visita'
  };
  const mapEn = {
    corretiva: 'Corrective',
    preventiva: 'Preventive',
    instalacao: 'Installation',
    configuracao: 'Configuration',
    treinamento: 'Training',
    vistoria: 'Inspection',
    suporte_ajuste: 'Support/Adjustment',
    retorno_tecnico: 'Technical return',
    nao_identificado: 'Not identified',
    em_garantia: 'In warranty',
    fora_garantia: 'Out of warranty',
    garantia_peca: 'Parts warranty',
    garantia_servico_instalacao: 'Service/installation warranty',
    garantia_fabrica: 'Factory warranty',
    sem_garantia: 'No warranty',
    equipamento: 'Equipment',
    instalacao_causa: 'Installation',
    infraestrutura_cliente: 'Client infrastructure',
    software_configuracao: 'Software/configuration',
    integracao: 'Integration',
    operacao_uso: 'Operation/usage',
    peca_acessorio: 'Parts/accessory',
    indefinido: 'Undefined',
    resolvido: 'Resolved',
    paliativo: 'Palliative',
    requer_peca: 'Requires part',
    requer_fabrica: 'Requires factory',
    requer_cliente: 'Requires client',
    requer_nova_visita: 'Requires new visit'
  };
  const map = locale === 'en-US' ? mapEn : mapPt;
  if (map[key]) return map[key];
  if (!key) return locale === 'en-US' ? 'Not identified' : 'Nao identificado';
  return key.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function getTopDistributionItem(listLike) {
  const list = Array.isArray(listLike) ? listLike : [];
  return list[0] || null;
}

function getTopSubtype(itemLike, key, localeRaw) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const list = Array.isArray(item[key]) ? item[key] : [];
  return normalizeMonthlyDistribution(list, toNumber(item.totalOs), localeRaw, 1)[0] || null;
}

function resolveReviewQueueHighestPriority(byPriorityLike) {
  const byPriority = (byPriorityLike && typeof byPriorityLike === 'object') ? byPriorityLike : {};
  const order = ['critical', 'high', 'medium', 'low'];
  for (const level of order) {
    if (toNumber(byPriority[level]) > 0) return level;
  }
  return 'none';
}

function sortReviewQueueForExecutive(itemsLike) {
  const list = Array.isArray(itemsLike) ? itemsLike.slice() : [];
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
  const statusRank = { novo: 0, em_revisao: 1, ajustado: 2, validado: 3, encerrado: 4, descartado: 5 };
  return list.sort((aRaw, bRaw) => {
    const a = (aRaw && typeof aRaw === 'object') ? aRaw : {};
    const b = (bRaw && typeof bRaw === 'object') ? bRaw : {};
    const aPriority = normalizeReviewWorkflowPriority(a.priority || 'medium');
    const bPriority = normalizeReviewWorkflowPriority(b.priority || 'medium');
    const aStatus = normalizeReviewWorkflowStatus(a.status || 'novo');
    const bStatus = normalizeReviewWorkflowStatus(b.status || 'novo');
    const aDue = Date.parse(toText(a.dueAt || '')) || Number.POSITIVE_INFINITY;
    const bDue = Date.parse(toText(b.dueAt || '')) || Number.POSITIVE_INFINITY;
    const aLast = Date.parse(toText(a.lastActionAt || '')) || 0;
    const bLast = Date.parse(toText(b.lastActionAt || '')) || 0;
    return (priorityRank[aPriority] ?? 99) - (priorityRank[bPriority] ?? 99)
      || (statusRank[aStatus] ?? 99) - (statusRank[bStatus] ?? 99)
      || aDue - bDue
      || bLast - aLast;
  });
}

function buildMonthlyExecutiveNarrative(payloadLike, localeRaw) {
  const locale = detectLocale(localeRaw);
  const isEn = locale === 'en-US';
  const payload = (payloadLike && typeof payloadLike === 'object') ? payloadLike : {};
  const monthLabel = toText(payload?.period?.label || '');
  const totalOs = Math.max(0, toNumber(payload?.overview?.totalOs));
  const sampleDays = Math.max(0, toNumber(payload?.overview?.sampleDays));
  const qualityLevel = toText(payload?.quality?.classificationQuality || 'low');
  const confidence = Math.max(0, toNumber(payload?.quality?.avgConfidencePct));
  const mainService = getTopDistributionItem(payload?.mix?.serviceType);
  const mainWarranty = getTopDistributionItem(payload?.mix?.warrantyStatus);
  const topEquipment = getTopDistributionItem(payload?.rankings?.topEquipment);
  const topCause = getTopDistributionItem(payload?.rankings?.topProbableCause);
  const topOutcome = getTopDistributionItem(payload?.rankings?.topOutcome);
  const reviewOpen = Math.max(0, toNumber(payload?.reviewQueue?.open));
  const reviewOverdue = Math.max(0, toNumber(payload?.reviewQueue?.overdue));
  const reworkRate = Math.max(0, toNumber(payload?.overview?.reworkRatePct));
  const criticalRate = Math.max(0, toNumber(payload?.overview?.criticalRatePct));
  const percentNaoIdentificado = Math.max(0, toNumber(payload?.quality?.percentNaoIdentificado));
  const percentIndefinido = Math.max(0, toNumber(payload?.quality?.percentIndefinido));

  const executiveSummary = isEn
    ? `${monthLabel}: ${totalOs} WO consolidated in ${sampleDays} sampled day(s). Dominant service type: ${mainService?.label || 'N/A'} (${toNumber(mainService?.ratePct)}%). Classification quality is ${qualityLevel} with ${confidence}% average confidence.`
    : `${monthLabel}: ${totalOs} O.S. consolidadas em ${sampleDays} dia(s) amostrados. Atendimento dominante: ${mainService?.label || 'N/A'} (${toNumber(mainService?.ratePct)}%). Qualidade de classificacao ${qualityLevel} com ${confidence}% de confianca media.`;

  const keyFindings = [];
  if (topEquipment) {
    keyFindings.push(isEn
      ? `Highest concentration in ${topEquipment.equipment} (${topEquipment.totalOs} WO / ${topEquipment.sharePct}%).`
      : `Maior concentracao em ${topEquipment.equipment} (${topEquipment.totalOs} O.S. / ${topEquipment.sharePct}%).`);
  }
  if (mainWarranty) {
    keyFindings.push(isEn
      ? `Predominant warranty status: ${mainWarranty.label} (${mainWarranty.ratePct}%).`
      : `Status de garantia predominante: ${mainWarranty.label} (${mainWarranty.ratePct}%).`);
  }
  if (topCause && topOutcome) {
    keyFindings.push(isEn
      ? `Main cause/outcome pair: ${topCause.label} -> ${topOutcome.label}.`
      : `Par causa/desfecho dominante: ${topCause.label} -> ${topOutcome.label}.`);
  }

  const monthRisks = [];
  if (reworkRate >= 8) monthRisks.push(isEn
    ? `Rework above attention threshold (${reworkRate}%).`
    : `Retrabalho acima da faixa de atencao (${reworkRate}%).`);
  if (criticalRate >= 35) monthRisks.push(isEn
    ? `Critical events concentration is high (${criticalRate}%).`
    : `Concentracao de eventos criticos elevada (${criticalRate}%).`);
  if (reviewOpen > 0) monthRisks.push(isEn
    ? `${reviewOpen} review queue item(s) remain open${reviewOverdue > 0 ? `, with ${reviewOverdue} overdue` : ''}.`
    : `${reviewOpen} item(ns) de revisao seguem abertos${reviewOverdue > 0 ? `, com ${reviewOverdue} atrasado(s)` : ''}.`);
  if (percentNaoIdentificado >= 18 || percentIndefinido >= 18) monthRisks.push(isEn
    ? 'Data quality risk due to not-identified/undefined taxonomy rates.'
    : 'Risco de qualidade por taxa elevada de nao identificado/indefinido na taxonomia.');
  if (!monthRisks.length) {
    monthRisks.push(isEn ? 'No structural risk spike identified for this month.' : 'Sem pico de risco estrutural identificado no mes.');
  }

  const recommendedActions = [];
  if (topEquipment && topCause) recommendedActions.push(isEn
    ? `Assign owner, corrective ETA, and track this risk in the next operational cycle for ${topEquipment.equipment} (focus: ${topCause.label}).`
    : `Definir responsavel, prazo de tratativa e acompanhar este risco no proximo ciclo operacional para ${topEquipment.equipment} (foco: ${topCause.label}).`);
  if (reviewOpen > 0) recommendedActions.push(isEn
    ? 'Run weekly governance cycle to close open review queue items with owner and due date.'
    : 'Executar ciclo semanal de governanca para fechar fila de revisao com dono e prazo.');
  if (percentNaoIdentificado >= 15 || percentIndefinido >= 15) recommendedActions.push(isEn
    ? 'Prioritize technical report standardization to improve classification confidence.'
    : 'Priorizar padronizacao de laudo tecnico para elevar confianca da classificacao.');
  if (!recommendedActions.length) {
    recommendedActions.push(isEn
      ? 'Maintain current cadence and monitor monthly concentration indicators.'
      : 'Manter cadencia atual e monitorar indicadores de concentracao mensal.');
  }

  const humanReviewPoints = [];
  const openReviewItems = Array.isArray(payload?.reviewQueue?.openItems) ? payload.reviewQueue.openItems : [];
  openReviewItems.slice(0, 6).forEach(itemRaw => {
    const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
    humanReviewPoints.push(isEn
      ? `${toText(item.code || 'review_item')} | ${toText(item.priority || 'medium')} | ${toText(item.reviewReason || '')}`
      : `${toText(item.code || 'review_item')} | ${toText(item.priority || 'medium')} | ${toText(item.reviewReason || '')}`);
  });
  if (!humanReviewPoints.length) {
    humanReviewPoints.push(isEn ? 'No pending human review point in this month.' : 'Sem ponto pendente de revisao humana no mes.');
  }

  const dataQualityLimitations = [];
  if (sampleDays < 3) dataQualityLimitations.push(isEn
    ? `Monthly sample is low (${sampleDays} day(s) with import base).`
    : `Amostra mensal ainda baixa (${sampleDays} dia(s) com base importada).`);
  if (confidence < 70) dataQualityLimitations.push(isEn
    ? `Average confidence below 70% (${confidence}%).`
    : `Confianca media abaixo de 70% (${confidence}%).`);
  if (percentNaoIdentificado > 0) dataQualityLimitations.push(isEn
    ? `${percentNaoIdentificado}% not identified classifications.`
    : `${percentNaoIdentificado}% de classificacoes nao identificadas.`);
  if (percentIndefinido > 0) dataQualityLimitations.push(isEn
    ? `${percentIndefinido}% undefined cause/outcome classifications.`
    : `${percentIndefinido}% de causa/desfecho indefinido.`);
  if (!dataQualityLimitations.length) {
    dataQualityLimitations.push(isEn ? 'No critical data quality limitation detected.' : 'Sem limitacao critica de qualidade detectada.');
  }

  return {
    locale,
    generatedAt: nowIso(),
    executiveSummary,
    keyFindings: keyFindings.slice(0, 8),
    monthRisks: monthRisks.slice(0, 8),
    recommendedActions: recommendedActions.slice(0, 8),
    humanReviewPoints: humanReviewPoints.slice(0, 8),
    dataQualityLimitations: dataQualityLimitations.slice(0, 8)
  };
}

function buildMonthlyExecutiveExport(monthlyLike, localeRaw) {
  const monthly = (monthlyLike && typeof monthlyLike === 'object') ? monthlyLike : {};
  const locale = detectLocale(localeRaw || monthly.locale);
  const detailed = (monthly.detailedAnalytics && typeof monthly.detailedAnalytics === 'object')
    ? monthly.detailedAnalytics
    : {};
  const taxonomySummary = (detailed.taxonomySummary && typeof detailed.taxonomySummary === 'object')
    ? detailed.taxonomySummary
    : {};
  const classification = (detailed.classificationQuality && typeof detailed.classificationQuality === 'object')
    ? detailed.classificationQuality
    : {};
  const rework = (detailed.reworkAnalysis && typeof detailed.reworkAnalysis === 'object')
    ? detailed.reworkAnalysis
    : {};
  const criticality = (detailed.criticalityAnalysis && typeof detailed.criticalityAnalysis === 'object')
    ? detailed.criticalityAnalysis
    : {};
  const reviewQueueSummary = (detailed.reviewQueueSummary && typeof detailed.reviewQueueSummary === 'object')
    ? detailed.reviewQueueSummary
    : {};
  const reviewWorkflowSummary = (reviewQueueSummary.workflow && typeof reviewQueueSummary.workflow === 'object')
    ? reviewQueueSummary.workflow
    : {};
  const reviewQueue = sortReviewQueueForExecutive(Array.isArray(detailed.reviewQueue) ? detailed.reviewQueue : []);

  const totalOs = Math.max(
    0,
    toNumber(monthly?.osAudit?.total),
    toNumber(taxonomySummary.totalOs),
    toNumber(detailed?.base?.totalOs)
  );
  const sampleDays = Math.max(0, toNumber(monthly.sampleDays));
  const monthKey = toText(monthly.month || '');
  const referenceDate = normalizeDateKey(monthly.referenceDate) || getLocalISODate(new Date());
  const monthLabel = (() => {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || referenceDate.slice(0, 7);
    try {
      const d = new Date(`${monthKey}-01T12:00:00`);
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
    } catch (_) {
      return monthKey;
    }
  })();

  const serviceType = normalizeMonthlyDistribution(taxonomySummary.serviceType, totalOs, locale, 8);
  const warrantyStatus = normalizeMonthlyDistribution(taxonomySummary.warrantyStatus, totalOs, locale, 5);
  const warrantyType = normalizeMonthlyDistribution(taxonomySummary.warrantyType, totalOs, locale, 5);
  const topProbableCause = normalizeMonthlyDistribution(taxonomySummary.probableCause, totalOs, locale, 6);
  const topOutcome = normalizeMonthlyDistribution(taxonomySummary.outcomeType, totalOs, locale, 6);

  const topEquipment = (Array.isArray(detailed.taxonomyByEquipment) ? detailed.taxonomyByEquipment : [])
    .map(rowRaw => {
      const row = (rowRaw && typeof rowRaw === 'object') ? rowRaw : {};
      const count = Math.max(0, toNumber(row.totalOs));
      return {
        equipment: toText(row.equipment || ''),
        totalOs: count,
        sharePct: Math.round(pct(count, totalOs) * 100) / 100,
        confidenceAvgPct: Math.round(toNumber(row.confidenceAvgPct) * 100) / 100,
        topCause: getTopSubtype(row, 'probableCause', locale),
        topOutcome: getTopSubtype(row, 'outcomeType', locale)
      };
    })
    .filter(row => row.totalOs > 0)
    .sort((a, b) => b.totalOs - a.totalOs || b.sharePct - a.sharePct || a.equipment.localeCompare(b.equipment))
    .slice(0, 8);

  const technicianConcentration = (Array.isArray(detailed.taxonomyByTechnician) ? detailed.taxonomyByTechnician : [])
    .map(rowRaw => {
      const row = (rowRaw && typeof rowRaw === 'object') ? rowRaw : {};
      const count = Math.max(0, toNumber(row.totalOs));
      return {
        technician: toText(row.technician || ''),
        totalOs: count,
        sharePct: Math.round(pct(count, totalOs) * 100) / 100,
        confidenceAvgPct: Math.round(toNumber(row.confidenceAvgPct) * 100) / 100,
        topServiceType: getTopSubtype(row, 'serviceType', locale),
        topOutcome: getTopSubtype(row, 'outcomeType', locale)
      };
    })
    .filter(row => row.totalOs > 0)
    .sort((a, b) => b.totalOs - a.totalOs || b.sharePct - a.sharePct || a.technician.localeCompare(b.technician))
    .slice(0, 8);

  const locationConcentration = (Array.isArray(detailed.taxonomyByLocation) ? detailed.taxonomyByLocation : [])
    .map(rowRaw => {
      const row = (rowRaw && typeof rowRaw === 'object') ? rowRaw : {};
      const count = Math.max(0, toNumber(row.totalOs));
      return {
        location: toText(row.location || ''),
        totalOs: count,
        sharePct: Math.round(pct(count, totalOs) * 100) / 100,
        confidenceAvgPct: Math.round(toNumber(row.confidenceAvgPct) * 100) / 100,
        topCause: getTopSubtype(row, 'probableCause', locale)
      };
    })
    .filter(row => row.totalOs > 0)
    .sort((a, b) => b.totalOs - a.totalOs || b.sharePct - a.sharePct || a.location.localeCompare(b.location))
    .slice(0, 8);

  const byStatusFromSummary = (reviewWorkflowSummary.byStatus && typeof reviewWorkflowSummary.byStatus === 'object')
    ? reviewWorkflowSummary.byStatus
    : {};
  const byPriorityFromSummary = (reviewQueueSummary.byPriority && typeof reviewQueueSummary.byPriority === 'object')
    ? reviewQueueSummary.byPriority
    : {};
  const queueByStatus = {
    novo: toNumber(byStatusFromSummary.novo),
    em_revisao: toNumber(byStatusFromSummary.em_revisao),
    ajustado: toNumber(byStatusFromSummary.ajustado),
    validado: toNumber(byStatusFromSummary.validado),
    encerrado: toNumber(byStatusFromSummary.encerrado),
    descartado: toNumber(byStatusFromSummary.descartado)
  };
  const queueByPriority = {
    critical: toNumber(byPriorityFromSummary.critical),
    high: toNumber(byPriorityFromSummary.high),
    medium: toNumber(byPriorityFromSummary.medium),
    low: toNumber(byPriorityFromSummary.low)
  };
  if (!queueByPriority.critical && !queueByPriority.high && !queueByPriority.medium && !queueByPriority.low && reviewQueue.length) {
    reviewQueue.forEach(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      const level = normalizeReviewWorkflowPriority(item.priority || 'medium');
      queueByPriority[level] = toNumber(queueByPriority[level]) + 1;
    });
  }

  const queueOpen = Math.max(0, toNumber(reviewWorkflowSummary.open || 0));
  const queueOverdue = Math.max(0, toNumber(reviewWorkflowSummary.overdue || 0));
  const queueTotal = Math.max(0, toNumber(reviewWorkflowSummary.total || reviewQueueSummary.total || reviewQueue.length));
  const highestPriority = resolveReviewQueueHighestPriority(queueByPriority);
  const queueOpenItems = reviewQueue
    .filter(item => {
      const status = normalizeReviewWorkflowStatus(item?.status || 'novo');
      return status !== 'encerrado' && status !== 'descartado';
    })
    .slice(0, 10)
    .map(itemRaw => {
      const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
      return {
        workflowId: toText(item.workflowId || ''),
        code: toText(item.code || ''),
        priority: normalizeReviewWorkflowPriority(item.priority || 'medium'),
        status: normalizeReviewWorkflowStatus(item.status || 'novo'),
        reviewReason: toText(item.reviewReason || ''),
        impact: toText(item.impact || ''),
        recommendedReviewer: toText(item.recommendedReviewer || ''),
        dueAt: normalizeReviewWorkflowDateTime(item.dueAt || '') || '',
        lastAction: toText(item.lastAction || ''),
        lastActionAt: normalizeReviewWorkflowDateTime(item.lastActionAt || '') || '',
        historyPreview: Array.isArray(item.historyPreview) ? item.historyPreview.slice(0, 2) : []
      };
    });
  const nextDueAt = queueOpenItems
    .map(item => normalizeReviewWorkflowDateTime(item.dueAt || ''))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)))[0] || '';

  const avgConfidencePct = Math.round(toNumber(classification.avgConfidencePct || taxonomySummary.confidenceAvgPct) * 100) / 100;
  const percentNaoIdentificado = Math.round(toNumber(classification.percentNaoIdentificado || taxonomySummary.percentNaoIdentificado) * 100) / 100;
  const percentIndefinido = Math.round(toNumber(classification.percentIndefinido || taxonomySummary.percentIndefinido) * 100) / 100;
  const coveragePct = (() => {
    const fromClass = toNumber(classification.coveragePct);
    if (fromClass > 0) return Math.round(fromClass * 100) / 100;
    const estimated = 100 - ((percentNaoIdentificado + percentIndefinido) / 2);
    return Math.max(0, Math.min(100, Math.round(estimated * 100) / 100));
  })();
  const classificationQuality = toText(
    classification.classificationQuality || taxonomySummary.classificationQuality || 'low'
  );

  const executivePayload = {
    version: 'v1',
    locale,
    generatedAt: nowIso(),
    period: {
      month: monthKey,
      label: monthLabel,
      referenceDate,
      sampleDays,
      dates: Array.isArray(monthly.dates) ? monthly.dates.slice(0, 40) : []
    },
    overview: {
      totalOs,
      sampleDays,
      reworkCount: Math.max(0, toNumber(rework.reworkCount)),
      reworkRatePct: Math.round(toNumber(rework.reworkRatePct) * 100) / 100,
      criticalCount: Math.max(0, toNumber(criticality.criticalCount)),
      criticalRatePct: Math.round(pct(toNumber(criticality.criticalCount), totalOs) * 100) / 100,
      recordsWithAlert: Math.max(0, toNumber(monthly?.osAudit?.recordsWithAlert)),
      financialRiskEstimated: Math.round(toNumber(monthly?.osAudit?.riscoEstimado) * 100) / 100,
      produtoTop: toText(monthly.produtoTop || '')
    },
    mix: {
      serviceType,
      warrantyStatus,
      warrantyType
    },
    rankings: {
      topEquipment,
      topProbableCause,
      topOutcome,
      technicianConcentration,
      locationConcentration
    },
    quality: {
      classificationQuality,
      avgConfidencePct,
      coveragePct,
      percentNaoIdentificado,
      percentIndefinido,
      axisQuality: (classification.axisQuality && typeof classification.axisQuality === 'object')
        ? classification.axisQuality
        : {}
    },
    reviewQueue: {
      total: queueTotal,
      open: queueOpen,
      overdue: queueOverdue,
      highestPriority,
      nextDueAt,
      byStatus: queueByStatus,
      byPriority: queueByPriority,
      requiresHumanReview: reviewQueueSummary.requiresHumanReview === true || queueOpen > 0,
      openItems: queueOpenItems
    }
  };

  executivePayload.narrative = buildMonthlyExecutiveNarrative(executivePayload, locale);
  executivePayload.exportReady = {
    schema: 'monthly_executive_export_v1',
    generatedAt: executivePayload.generatedAt,
    locale,
    period: executivePayload.period,
    sections: [
      { id: 'overview', title: locale === 'en-US' ? 'Executive overview' : 'Resumo executivo' },
      { id: 'mix', title: locale === 'en-US' ? 'Service and warranty mix' : 'Mix de atendimento e garantia' },
      { id: 'rankings', title: locale === 'en-US' ? 'Concentration rankings' : 'Rankings de concentracao' },
      { id: 'risks', title: locale === 'en-US' ? 'Risk and governance' : 'Risco e governanca' },
      { id: 'narrative', title: locale === 'en-US' ? 'Executive narrative' : 'Narrativa executiva' }
    ],
    tables: {
      serviceType: executivePayload.mix.serviceType,
      warrantyStatus: executivePayload.mix.warrantyStatus,
      warrantyType: executivePayload.mix.warrantyType,
      topEquipment: executivePayload.rankings.topEquipment,
      topProbableCause: executivePayload.rankings.topProbableCause,
      topOutcome: executivePayload.rankings.topOutcome,
      technicianConcentration: executivePayload.rankings.technicianConcentration,
      locationConcentration: executivePayload.rankings.locationConcentration,
      reviewQueue: executivePayload.reviewQueue.openItems
    },
    suggestedFiles: {
      pdf: `relatorio_executivo_${monthKey || referenceDate.slice(0, 7)}.pdf`,
      excel: `relatorio_executivo_${monthKey || referenceDate.slice(0, 7)}.xlsx`
    }
  };

  return executivePayload;
}

function averageMetric(values) {
  const list = Array.isArray(values) ? values.map(item => toNumber(item)) : [];
  if (!list.length) return 0;
  return list.reduce((acc, value) => acc + value, 0) / list.length;
}

function buildMonthTrendSummary(monthRows, localeRaw) {
  const locale = detectLocale(localeRaw);
  const rows = Array.isArray(monthRows) ? monthRows : [];
  if (rows.length < 2) {
    return {
      trend: locale === 'en-US' ? 'Stable' : 'Estavel',
      summary: locale === 'en-US'
        ? 'Month still has low statistical base for deeper reading.'
        : 'Mes ainda sem massa critica para leitura mais profunda.'
    };
  }
  const current = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const currentPressure = toNumber(current.criticos) + toNumber(current.tickets) + toNumber(current.parados) + toNumber(current.atrasos);
  const previousPressure = toNumber(previous.criticos) + toNumber(previous.tickets) + toNumber(previous.parados) + toNumber(previous.atrasos);

  let trend = locale === 'en-US' ? 'Stable' : 'Estavel';
  if (currentPressure > previousPressure) trend = locale === 'en-US' ? 'Pressure increased' : 'Pressao subiu';
  if (currentPressure < previousPressure) trend = locale === 'en-US' ? 'Improvement' : 'Melhora';
  const summary = locale === 'en-US'
    ? `Admin avg: ${averageMetric(rows.map(item => item.pendAdm)).toFixed(1)} | Current vs previous day: ${currentPressure > previousPressure ? 'higher pressure' : currentPressure < previousPressure ? 'lower pressure' : 'stable'}.`
    : `Media adm.: ${averageMetric(rows.map(item => item.pendAdm)).toFixed(1)} | Atual vs. dia anterior: ${currentPressure > previousPressure ? 'pressao maior' : currentPressure < previousPressure ? 'pressao menor' : 'estavel'}.`;
  return { trend, summary };
}

function buildDeltaPayload(currentValue, baseValue, decimals) {
  const nCurrent = toNumber(currentValue);
  const nBase = toNumber(baseValue);
  const factor = Number.isFinite(decimals) && decimals > 0 ? Math.pow(10, decimals) : 1;
  return Math.round((nCurrent - nBase) * factor) / factor;
}

async function buildDashboardSnapshot(referenceDate, data, insights, brain, scopeLike, localeRaw) {
  const scope = normalizeStorageScope(scopeLike);
  const locale = detectLocale(localeRaw);
  const dateKey = normalizeDateKey(referenceDate) || getLocalISODate(new Date());
  const currentData = (data && typeof data === 'object') ? data : {};
  const currentInsights = insights || buildInsightsFromData(dateKey, currentData, locale);
  const currentBrain = brain || null;
  const daily = buildDashboardDailyMetrics(dateKey, currentData, currentInsights, currentBrain, locale);
  const monthKey = dateKey.slice(0, 7);
  const emptyComparativo = {
    day: { hasBase: false, refDate: '', deltas: {}, summary: '' },
    month: { hasBase: false, baseDays: 0, deltas: {}, summary: '' }
  };

  if (!storage || typeof storage.listRecords !== 'function' || typeof storage.getRecord !== 'function') {
    return {
      locale,
      date: dateKey,
      month: {
        monthKey,
        sampleDays: 0,
        avgCriticos: 0,
        avgSla: 0,
        avgExecucao: 0,
        avgTickets: 0,
        avgParados: 0,
        avgPedidosAtraso: 0,
        trend: locale === 'en-US' ? 'Stable' : 'Estavel',
        summary: locale === 'en-US'
          ? 'Month still has low statistical base for deeper reading.'
          : 'Mes ainda sem massa critica para leitura mais profunda.'
      },
      comparativo: emptyComparativo,
      daily
    };
  }

  const listed = await storage.listRecords(scope);
  const monthDates = (Array.isArray(listed) ? listed : [])
    .map(item => normalizeDateKey(item?.date))
    .filter(Boolean)
    .filter(item => item.slice(0, 7) === monthKey && item <= dateKey)
    .sort((a, b) => a.localeCompare(b));

  const monthRows = [];
  for (const day of monthDates) {
    let rowData = {};
    if (day === dateKey) {
      rowData = currentData;
    } else {
      const rec = await storage.getRecord(day, scope);
      rowData = rec?.data || {};
    }
    const rowInsights = (day === dateKey) ? currentInsights : buildInsightsFromData(day, rowData, locale);
    const rowDaily = buildDashboardDailyMetrics(day, rowData, rowInsights, null, locale);
    monthRows.push({
      date: day,
      criticos: rowDaily.kCriticos,
      sla: rowDaily.kSla,
      execucao: rowDaily.kExec,
      tickets: rowDaily.kTicketsPendentes,
      parados: rowDaily.kTecnicosParados,
      atrasos: rowDaily.kPedidosAtraso,
      pendAdm: rowDaily.kPendenciasAdm
    });
  }

  const trendPayload = buildMonthTrendSummary(monthRows, locale);
  const monthly = {
    monthKey,
    sampleDays: monthRows.length,
    avgCriticos: averageMetric(monthRows.map(item => item.criticos)),
    avgSla: averageMetric(monthRows.map(item => item.sla)),
    avgExecucao: averageMetric(monthRows.map(item => item.execucao)),
    avgTickets: averageMetric(monthRows.map(item => item.tickets)),
    avgParados: averageMetric(monthRows.map(item => item.parados)),
    avgPedidosAtraso: averageMetric(monthRows.map(item => item.atrasos)),
    trend: trendPayload.trend,
    summary: trendPayload.summary
  };

  const previousRows = monthRows.filter(item => item.date < dateKey);
  const prevRow = previousRows.length ? previousRows[previousRows.length - 1] : null;
  const dayComparativo = prevRow
    ? {
        hasBase: true,
        refDate: prevRow.date,
        summary: locale === 'en-US'
          ? `Automatic comparison between ${dateKey} and ${prevRow.date}.`
          : `Comparativo automatico entre ${dateKey} e ${prevRow.date}.`,
        deltas: {
          criticos: buildDeltaPayload(daily.kCriticos, prevRow.criticos, 0),
          tickets: buildDeltaPayload(daily.kTicketsPendentes, prevRow.tickets, 0),
          atrasos: buildDeltaPayload(daily.kPedidosAtraso, prevRow.atrasos, 0),
          sla: buildDeltaPayload(daily.kSla, prevRow.sla, 1),
          execucao: buildDeltaPayload(daily.kExec, prevRow.execucao, 1)
        }
      }
    : {
        hasBase: false,
        refDate: '',
        summary: locale === 'en-US'
          ? 'Save at least one previous day to enable daily comparison.'
          : 'Salve ao menos um dia anterior para liberar o comparativo diario.',
        deltas: {}
      };

  const monthBaseRows = monthRows.filter(item => item.date !== dateKey);
  const monthComparativo = monthBaseRows.length
    ? {
        hasBase: true,
        baseDays: monthBaseRows.length,
        summary: locale === 'en-US'
          ? `Comparison of selected day against monthly average (${monthBaseRows.length} saved day(s)).`
          : `Comparativo do dia selecionado contra media do mes (${monthBaseRows.length} dia(s) salvo(s)).`,
        deltas: {
          criticos: buildDeltaPayload(daily.kCriticos, averageMetric(monthBaseRows.map(item => item.criticos)), 1),
          tickets: buildDeltaPayload(daily.kTicketsPendentes, averageMetric(monthBaseRows.map(item => item.tickets)), 1),
          atrasos: buildDeltaPayload(daily.kPedidosAtraso, averageMetric(monthBaseRows.map(item => item.atrasos)), 1),
          sla: buildDeltaPayload(daily.kSla, averageMetric(monthBaseRows.map(item => item.sla)), 1),
          execucao: buildDeltaPayload(daily.kExec, averageMetric(monthBaseRows.map(item => item.execucao)), 1)
        }
      }
    : {
        hasBase: false,
        baseDays: 0,
        summary: locale === 'en-US'
          ? 'Save more month days to unlock monthly comparison.'
          : 'Salve mais dias do mes para liberar o comparativo mensal.',
        deltas: {}
      };

  return {
    locale,
    date: dateKey,
    month: monthly,
    comparativo: {
      day: dayComparativo,
      month: monthComparativo
    },
    daily
  };
}

function toMetricNumber(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const def = Number(fallback);
  return Number.isFinite(def) ? def : 0;
}

function clampMetric(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeTrend(samples, key) {
  const rows = Array.isArray(samples) ? samples : [];
  if (rows.length <= 1) return 0;
  const first = toMetricNumber(rows[0]?.[key], 0);
  const last = toMetricNumber(rows[rows.length - 1]?.[key], 0);
  const span = Math.max(1, rows.length - 1);
  return (last - first) / span;
}

function trendDirection(value, inverseGood) {
  const n = toMetricNumber(value, 0);
  if (Math.abs(n) < 0.001) return 'stable';
  if (inverseGood) return n < 0 ? 'improving' : 'worsening';
  return n > 0 ? 'worsening' : 'improving';
}

function pressureLevelFromIndex(index) {
  const value = toMetricNumber(index, 0);
  if (value >= 75) return 'critical';
  if (value >= 55) return 'pressure';
  if (value >= 35) return 'attention';
  return 'stable';
}

async function buildOperationalAnticipation(dateKey, scopeLike, localeRaw) {
  const scope = normalizeStorageScope(scopeLike);
  const locale = detectLocale(localeRaw);
  const isEn = locale === 'en-US';

  const empty = {
    locale,
    date: dateKey,
    lookbackDays: 0,
    sampleDays: 0,
    pressureIndex: 0,
    pressureLevel: 'stable',
    trends: {
      sla: { slopePerDay: 0, direction: 'stable' },
      execution: { slopePerDay: 0, direction: 'stable' },
      criticalCases: { slopePerDay: 0, direction: 'stable' },
      recurrences: { slopePerDay: 0, direction: 'stable' },
      pendingTickets: { slopePerDay: 0, direction: 'stable' },
      lateOrders: { slopePerDay: 0, direction: 'stable' }
    },
    forecast7d: {
      sla: null,
      execution: null,
      criticalCases: null,
      recurrences: null,
      pendingTickets: null,
      lateOrders: null
    },
    predictions: [],
    executiveHint: isEn ? 'No sufficient historical base for forecast yet.' : 'Ainda sem base historica suficiente para previsao.'
  };

  if (!storage || typeof storage.listRecords !== 'function' || typeof storage.getRecord !== 'function') return empty;

  const records = await storage.listRecords(scope);
  const referenceDate = normalizeDateKey(dateKey) || getLocalISODate(new Date());
  const dates = (Array.isArray(records) ? records : [])
    .map(item => normalizeDateKey(item?.date))
    .filter(Boolean)
    .filter(item => item <= referenceDate)
    .sort((a, b) => a.localeCompare(b))
    .slice(-21);

  if (!dates.length) return empty;

  const samples = [];
  for (const day of dates) {
    const rec = await storage.getRecord(day, scope);
    const data = rec?.data || {};
    const insights = buildInsightsFromData(day, data, locale);
    samples.push({
      date: day,
      sla: toMetricNumber(insights?.kpis?.sla, 92),
      execution: toMetricNumber(insights?.kpis?.execucao, 80),
      criticalCases: toMetricNumber(insights?.kpis?.criticos, 0),
      recurrences: toMetricNumber(insights?.kpis?.reincidencias, 0),
      pendingTickets: toMetricNumber(insights?.kpis?.ticketsPendentes, 0),
      lateOrders: toMetricNumber(insights?.kpis?.pedidosAtraso, 0)
    });
  }

  const latest = samples[samples.length - 1];
  const slopeSla = computeTrend(samples, 'sla');
  const slopeExecution = computeTrend(samples, 'execution');
  const slopeCritical = computeTrend(samples, 'criticalCases');
  const slopeRecurrence = computeTrend(samples, 'recurrences');
  const slopeTickets = computeTrend(samples, 'pendingTickets');
  const slopeLateOrders = computeTrend(samples, 'lateOrders');

  const forecast7d = {
    sla: Math.round(clampMetric(latest.sla + (slopeSla * 7), 0, 100)),
    execution: Math.round(clampMetric(latest.execution + (slopeExecution * 7), 0, 100)),
    criticalCases: Math.max(0, Math.round(latest.criticalCases + (slopeCritical * 7))),
    recurrences: Math.max(0, Math.round(latest.recurrences + (slopeRecurrence * 7))),
    pendingTickets: Math.max(0, Math.round(latest.pendingTickets + (slopeTickets * 7))),
    lateOrders: Math.max(0, Math.round(latest.lateOrders + (slopeLateOrders * 7)))
  };

  const pressureRaw =
    (latest.criticalCases * 8) +
    (latest.recurrences * 6) +
    (latest.pendingTickets * 4) +
    (latest.lateOrders * 5) +
    Math.max(0, (92 - latest.sla)) * 0.8 +
    Math.max(0, (90 - latest.execution)) * 0.7 +
    Math.max(0, slopeCritical * 18) +
    Math.max(0, slopeTickets * 12) +
    Math.max(0, -slopeSla * 10) +
    Math.max(0, -slopeExecution * 8);
  const pressureIndex = Math.round(clampMetric(pressureRaw, 0, 100));
  const pressureLevel = pressureLevelFromIndex(pressureIndex);

  const predictions = [];
  if (forecast7d.sla < 90) {
    predictions.push({
      code: 'FORECAST_SLA_DROP',
      severity: pressureLevel === 'critical' ? 'critical' : 'high',
      title: isEn ? 'SLA drop forecast' : 'Previsao de queda de SLA',
      description: isEn
        ? `SLA may reach ${forecast7d.sla}% in the next 7 days.`
        : `SLA pode atingir ${forecast7d.sla}% nos proximos 7 dias.`,
      suggestedAction: isEn
        ? 'Prioritize tickets with direct client impact and enforce shift checklist.'
        : 'Priorizar tickets com impacto direto no cliente e reforcar checklist do turno.'
    });
  }
  if (forecast7d.criticalCases >= Math.max(3, latest.criticalCases + 1)) {
    predictions.push({
      code: 'FORECAST_CRITICAL_CASES',
      severity: 'high',
      title: isEn ? 'Critical case escalation forecast' : 'Previsao de escalonamento de casos criticos',
      description: isEn
        ? `Critical cases may reach ${forecast7d.criticalCases} in 7 days.`
        : `Casos criticos podem atingir ${forecast7d.criticalCases} em 7 dias.`,
      suggestedAction: isEn
        ? 'Define owner per critical client with deadline and twice-a-day review.'
        : 'Definir responsavel por cliente critico com prazo e revisao duas vezes ao dia.'
    });
  }
  if (forecast7d.recurrences >= Math.max(2, latest.recurrences + 1)) {
    predictions.push({
      code: 'FORECAST_RECURRENCE_RISE',
      severity: 'medium',
      title: isEn ? 'Recurrence rise forecast' : 'Previsao de alta de reincidencia',
      description: isEn
        ? `Recurrence trend indicates up to ${forecast7d.recurrences} recurrence points in 7 days.`
        : `Tendencia indica ate ${forecast7d.recurrences} pontos de reincidencia em 7 dias.`,
      suggestedAction: isEn
        ? 'Create corrective task force for root-cause elimination.'
        : 'Criar forca-tarefa corretiva para eliminar causa raiz.'
    });
  }
  if (!predictions.length) {
    predictions.push({
      code: 'FORECAST_STABLE',
      severity: 'low',
      title: isEn ? 'Stable forecast' : 'Previsao estavel',
      description: isEn
        ? 'Current trend suggests operational stability for the next cycle.'
        : 'Tendencia atual indica estabilidade operacional para o proximo ciclo.',
      suggestedAction: isEn
        ? 'Keep preventive cadence and monitor daily deviations.'
        : 'Manter cadencia preventiva e monitorar desvios diarios.'
    });
  }

  const executiveHint = isEn
    ? `Pressure index ${pressureIndex}/100 (${pressureLevel}). Immediate focus: ${predictions[0].title}.`
    : `Indice de pressao ${pressureIndex}/100 (${pressureLevel}). Foco imediato: ${predictions[0].title}.`;

  return {
    locale,
    date: referenceDate,
    lookbackDays: 21,
    sampleDays: samples.length,
    latestSample: latest,
    pressureIndex,
    pressureLevel,
    trends: {
      sla: { slopePerDay: Math.round(slopeSla * 1000) / 1000, direction: trendDirection(slopeSla, true) },
      execution: { slopePerDay: Math.round(slopeExecution * 1000) / 1000, direction: trendDirection(slopeExecution, true) },
      criticalCases: { slopePerDay: Math.round(slopeCritical * 1000) / 1000, direction: trendDirection(slopeCritical, false) },
      recurrences: { slopePerDay: Math.round(slopeRecurrence * 1000) / 1000, direction: trendDirection(slopeRecurrence, false) },
      pendingTickets: { slopePerDay: Math.round(slopeTickets * 1000) / 1000, direction: trendDirection(slopeTickets, false) },
      lateOrders: { slopePerDay: Math.round(slopeLateOrders * 1000) / 1000, direction: trendDirection(slopeLateOrders, false) }
    },
    forecast7d,
    predictions: predictions.slice(0, 8),
    executiveHint
  };
}

function buildImmediateDecision(brain, anticipation, localeRaw) {
  const locale = detectLocale(localeRaw);
  const isEn = locale === 'en-US';
  const topAlert = Array.isArray(brain?.alerts) && brain.alerts.length ? brain.alerts[0] : null;
  const topPrediction = Array.isArray(anticipation?.predictions) && anticipation.predictions.length ? anticipation.predictions[0] : null;
  const pressureLevel = String(anticipation?.pressureLevel || '').toLowerCase();
  const scoreLevel = String(brain?.scoreOperational?.level || '').toLowerCase();

  let actionNow = '';
  if (pressureLevel === 'critical' || scoreLevel === 'critical') {
    actionNow = isEn
      ? 'Start war-room now with owner, SLA checkpoint and client communication.'
      : 'Abrir war-room agora com dono, checkpoint de SLA e comunicacao ao cliente.';
  } else if (pressureLevel === 'pressure' || scoreLevel === 'pressure') {
    actionNow = isEn
      ? 'Activate recovery plan with owner per blocker and review every 2 hours.'
      : 'Ativar plano de recuperacao com dono por bloqueio e revisao a cada 2 horas.';
  } else {
    actionNow = isEn
      ? 'Maintain preventive rhythm and track deviations in the next cycle.'
      : 'Manter ritmo preventivo e acompanhar desvios no proximo ciclo.';
  }

  return {
    locale,
    generatedAt: nowIso(),
    topPriority: topAlert?.title || topPrediction?.title || (isEn ? 'Operational stability' : 'Estabilidade operacional'),
    recommendedAction: topAlert?.suggestedAction || topPrediction?.suggestedAction || actionNow,
    nextStep24h: actionNow,
    executiveMessage: isEn
      ? `Do now: ${actionNow}`
      : `Faca agora: ${actionNow}`
  };
}

function normalizeHeaderKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const utcYear = value.getUTCFullYear();
    const utcMonth = value.getUTCMonth() + 1;
    const utcDay = value.getUTCDate();
    if (utcYear >= 1900 && utcMonth >= 1 && utcMonth <= 12 && utcDay >= 1 && utcDay <= 31) {
      return `${String(utcYear).padStart(4, '0')}-${String(utcMonth).padStart(2, '0')}-${String(utcDay).padStart(2, '0')}`;
    }
    return getLocalISODate(value);
  }
  if (typeof value === 'number' && xlsxLib?.SSF?.parse_date_code) {
    try {
      const parts = xlsxLib.SSF.parse_date_code(value);
      if (parts?.y && parts?.m && parts?.d) {
        return `${String(parts.y).padStart(4, '0')}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
      }
    } catch (_) {}
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = normalizeDateKey(raw);
  if (iso) return iso;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return getLocalISODate(parsed);
  return '';
}

function parseNumberFlexible(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function valueFromCandidates(rowMap, candidates) {
  for (const key of candidates) {
    const value = rowMap[key];
    if (value != null && String(value).trim() !== '') return value;
  }
  return '';
}

function applyExecutionPercentToChecklist(targetData, percentValue) {
  const pct = Math.max(0, Math.min(100, Number(percentValue || 0)));
  const positives = Math.round(pct / 20);
  for (let i = 1; i <= 5; i++) {
    targetData[`op_exec${i}`] = i <= positives ? 'Sim' : '';
  }
}

function normalizeValueText(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseBooleanFlexible(value) {
  const normalized = normalizeValueText(value);
  return ['sim', 's', 'yes', 'true', '1', 'ok', 'x'].includes(normalized);
}

function isClosedStatus(value) {
  const normalized = normalizeValueText(value);
  if (!normalized) return false;
  return ['resolvido', 'finalizado', 'encerrado', 'fechado', 'concluido', 'cancelado', 'entregue'].some(marker => normalized.includes(marker));
}

function isCriticalPriority(value) {
  const normalized = normalizeValueText(value);
  if (!normalized) return false;
  if (normalized.includes('nao crit') || normalized.includes('sem critic')) return false;
  if (['p1', 'urgente', 'critic', 'critico', 'alta', 'alto', 'severo', 'grave'].some(marker => normalized.includes(marker))) {
    return true;
  }
  return normalized === '1';
}

function detectServiceType(text) {
  const normalized = normalizeValueText(text);
  if (!normalized) return '';
  if (normalized.includes('instal')) return 'instalacao';
  if (normalized.includes('preventiv')) return 'preventiva';
  if (normalized.includes('corretiv') || normalized.includes('manutenc') || normalized.includes('chamado') || normalized.includes('defeito')) {
    return 'corretiva';
  }
  return '';
}

function detectCoverageType(text) {
  const normalized = normalizeValueText(text);
  if (!normalized) return '';
  if (normalized.includes('garantia')) return 'garantia';
  if (normalized.includes('contrato ativo') || normalized.includes('contrato: ativo') || normalized.includes('contrato')) return 'contrato';
  if (normalized.includes('faturamento') || normalized.includes('avulso') || normalized.includes('sem contrato')) return 'avulso';
  return '';
}

function compactText(value, maxLen = 80) {
  const raw = toText(value).replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw;
}

function getTopCounterKey(counterMap) {
  if (!(counterMap instanceof Map) || !counterMap.size) return '';
  const sorted = Array.from(counterMap.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return String(a[0]).localeCompare(String(b[0]));
  });
  return sorted[0]?.[0] || '';
}

function countByValue(counterMap, key) {
  return counterMap.get(key) || 0;
}

function detectOperationChannel(text) {
  const normalized = normalizeValueText(text);
  if (!normalized) return '';
  if (normalized.includes('remoto') || normalized.includes('interno') || normalized.includes('laboratorio') || normalized.includes('bancada')) {
    return 'interna';
  }
  if (normalized.includes('extern') || normalized.includes('visita') || normalized.includes('deslocamento') || normalized.includes('campo') || normalized.includes('cliente no local')) {
    return 'externa';
  }
  return '';
}

function hasActionableLaudo(laudoText) {
  const normalized = normalizeValueText(laudoText);
  if (!normalized) return false;
  const actionMarkers = ['ajust', 'substitu', 'configur', 'reinici', 'test', 'valid', 'orient', 'corrig', 'parametriz', 'troca', 'instal', 'atualiz'];
  return actionMarkers.some(token => normalized.includes(token));
}

function evaluateOrdemCompraValue(rawValue) {
  const normalized = normalizeValueText(rawValue);
  if (!normalized) return false;
  if (normalized.includes('nao')) return false;
  if (normalized.includes('sim')) return true;
  if (/\d/.test(normalized)) return true;
  return false;
}

function normalizeServiceCodeValue(value) {
  const normalized = normalizeString(value).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === '-') return '';
  return normalized;
}

function extractServiceCodeFromText(value) {
  const normalized = normalizeServiceCodeValue(value);
  if (!normalized) return '';
  const directMatch = normalized.match(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*/);
  if (directMatch && directMatch[0]) return directMatch[0];

  const splitByDash = normalized.split(/\s+-\s+/)[0]?.trim();
  if (splitByDash && splitByDash.length >= 2) return splitByDash;

  const firstToken = normalized.split(/\s+/)[0]?.trim();
  return firstToken && firstToken.length >= 2 ? firstToken : normalized;
}

function getPricingCatalogPriceEstimate(itemLike) {
  const item = itemLike || {};
  const monthly = Number(item.monthly);
  if (Number.isFinite(monthly) && monthly > 0) return monthly;
  const yearly = Number(item.yearly);
  if (Number.isFinite(yearly) && yearly > 0) return yearly / 12;
  return 0;
}

function buildPricingCatalogIndex(itemsLike) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const byAlias = new Map();
  const canonicalCodes = new Set();

  const scoreItem = (itemLike) => {
    const item = itemLike || {};
    let score = 0;
    if (Number.isFinite(Number(item.monthly)) && Number(item.monthly) > 0) score += 2;
    if (Number.isFinite(Number(item.yearly)) && Number(item.yearly) > 0) score += 1;
    const descLen = normalizeString(item.description || '').length;
    score += Math.min(4, Math.floor(descLen / 20));
    return score;
  };

  const register = (aliasRaw, item) => {
    const alias = normalizeServiceCodeValue(aliasRaw);
    if (!alias) return;
    if (!byAlias.has(alias)) {
      byAlias.set(alias, item);
      return;
    }
    const current = byAlias.get(alias);
    if (scoreItem(item) > scoreItem(current)) byAlias.set(alias, item);
  };

  for (const rawItem of items) {
    const codeRaw = normalizeServiceCodeValue(rawItem?.code);
    if (!codeRaw || codeRaw === 'CODIGO') continue;

    const item = {
      code: codeRaw,
      description: normalizeString(rawItem?.description || ''),
      type: normalizeString(rawItem?.type || ''),
      billedBy: normalizeString(rawItem?.billedBy || ''),
      monthly: Number.isFinite(Number(rawItem?.monthly)) ? Number(rawItem?.monthly) : null,
      yearly: Number.isFinite(Number(rawItem?.yearly)) ? Number(rawItem?.yearly) : null
    };

    canonicalCodes.add(codeRaw);
    register(codeRaw, item);
    register(codeRaw.replace(/\s+/g, ''), item);
    register(codeRaw.replace(/[-_\s]+/g, ''), item);

    const tokenCode = extractServiceCodeFromText(codeRaw);
    if (tokenCode && (tokenCode.includes('-') || !codeRaw.includes(' '))) {
      register(tokenCode, item);
    }
  }

  return {
    byAlias,
    canonicalCodes,
    totalItems: canonicalCodes.size
  };
}

function resolvePricingCatalogEntry(catalogIndexLike, codeRaw) {
  const catalogIndex = catalogIndexLike || { byAlias: new Map() };
  const byAlias = catalogIndex.byAlias instanceof Map ? catalogIndex.byAlias : new Map();
  const base = normalizeServiceCodeValue(codeRaw);
  if (!base) return null;

  const candidates = [
    base,
    base.replace(/\s+/g, ''),
    base.replace(/[-_\s]+/g, ''),
    extractServiceCodeFromText(base)
  ].map(value => normalizeServiceCodeValue(value)).filter(Boolean);

  for (const key of candidates) {
    if (byAlias.has(key)) return byAlias.get(key);
  }
  return null;
}

function isNonBillableServiceCode(codeRaw) {
  const code = extractServiceCodeFromText(codeRaw);
  if (!code) return false;
  return ['CANCL', 'CONCL', 'FAT-OS', 'V-IMP'].includes(code);
}

const SERVICE_OPERATIONAL_CODES = new Set([
  'FASCO',
  'ORC-AP',
  'ORCAP',
  'MAIPE',
  'MAISP',
  'INREP',
  'INSW',
  'GS-I',
  'GF-I',
  'GI-I',
  'CANCL',
  'CONCL',
  'FAT-OS',
  'V-IMP',
  'VIST',
  'MP'
]);

const CODE_PIECE_STOPWORDS = new Set([
  'SIM',
  'NAO',
  'DATA',
  'OBS',
  'OC',
  'OS',
  'CLIENTE',
  'GARANTIA',
  'CONTRATO',
  'ATIVO',
  'INATIVO',
  'FATURAMENTO',
  'KHZ',
  'MHZ',
  'WIFI',
  'BIO',
  'FACIAL',
  'POE',
  'QR'
]);

function isOperationalServiceCode(codeRaw) {
  const code = extractServiceCodeFromText(codeRaw);
  if (!code) return false;
  return SERVICE_OPERATIONAL_CODES.has(code);
}

function looksLikePieceCode(codeRaw) {
  const code = normalizeServiceCodeValue(codeRaw);
  const compact = code.replace(/[-_/.]/g, '');
  if (!code || code.length < 4) return false;
  if (code.length > 22) return false;
  if (/(PMOVE|PLANMOB|HTTP|WWW|COM\.BR)/.test(code)) return false;
  if (CODE_PIECE_STOPWORDS.has(code)) return false;
  if (isOperationalServiceCode(code)) return false;
  if (/^(20\d{2}|19\d{2})$/.test(code)) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(code)) return false;
  if (/^\d{1,2}[/-]\d{1,2}$/.test(code)) return false;
  if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(code)) return false;
  if (/^V\d{4,8}$/.test(code)) return false;
  if (/^Z[A-Z0-9]{4,}$/.test(code)) return false;
  if (/^\d{2,5}USR$/.test(code)) return false;
  if (/^\d{2,5}SR$/.test(code)) return false;
  if (/^\d+KHZ$/.test(code)) return false;
  if (/^\d+MHZ$/.test(code)) return false;
  if (/^\d{2,5}TEMP(?:L)?$/.test(code)) return false;
  if (/^(110V|220V|TCPIP|TCP-IP|MIFARE|INDALA)$/.test(code)) return false;
  if (/^\d+,\d{2}$/.test(code)) return false;
  if (/^\d+\.\d{2}$/.test(code)) return false;
  if (/^\d{2}H\d{2}$/.test(code)) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(code)) return false;
  if (/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(code)) return false;
  if (/^G0[A-Z0-9]{6,}$/.test(compact)) return false;
  if (/^S[A-Z0-9]{7,}$/.test(compact)) return false;
  if (/(PRINTP|PRINTPOINT|BIOPOINT|SMARTPRINT|RELOGIO|CATRACA|CONTROLADOR|FACEACCESS|DREP|REPC|MDACESSO)/.test(compact)) return false;
  if ((code.match(/\//g) || []).length > 1) return false;
  if ((code.match(/\./g) || []).length > 2) return false;

  const letters = (code.match(/[A-Z]/g) || []).length;
  const digits = (code.match(/[0-9]/g) || []).length;
  if (letters < 1 || digits < 1) return false;

  // Padrao principal da tabela de pecas (ex.: B0516383, C2626501, D02727176, B4043445B).
  if (/^[A-Z]{1,4}\d{3,10}[A-Z0-9]*$/.test(code)) return true;
  // Padrao alternativo com separadores (ex.: 426-HLAM/S).
  if (/^[A-Z0-9]+(?:[-_/][A-Z0-9.]+)+$/.test(code)) return true;
  return false;
}

function extractPieceCodesFromText(valueRaw) {
  const text = normalizeServiceCodeValue(valueRaw).replace(/[,;()|]+/g, ' ');
  if (!text) return [];

  const found = [];
  const pushCandidate = (candidateRaw) => {
    const candidate = normalizeServiceCodeValue(candidateRaw);
    if (!candidate) return;
    if (!looksLikePieceCode(candidate)) return;
    if (!found.includes(candidate)) found.push(candidate);
  };

  const patternMixed = /\b[A-Z0-9]{2,}(?:[-_/.][A-Z0-9]{1,})+\b/g;
  const mixedMatches = text.match(patternMixed) || [];
  mixedMatches.forEach(pushCandidate);

  const patternAlphaNum = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{4,}\b/g;
  const alphaNumMatches = text.match(patternAlphaNum) || [];
  alphaNumMatches.forEach(pushCandidate);

  const numericTokens = text.match(/(?<![A-Z0-9])\d{4,8}(?![-A-Z0-9])/g) || [];
  numericTokens.forEach(pushCandidate);

  return found.slice(0, 10);
}

function extractPieceCodesFromHintedSegments(valueRaw) {
  const textRaw = String(valueRaw || '');
  if (!textRaw.trim()) return [];
  const hintRegex = /(pe[çc]a|pecas|trocad|substitu|material|codigo\s+da?\s+pe[çc]a|cod\.?\s*pe[çc]a)/i;
  const rawSegments = textRaw
    .split(/\r?\n|[;|]+/)
    .map(item => String(item || '').trim())
    .filter(Boolean);
  const hintedSegments = rawSegments.filter(segment => hintRegex.test(segment));
  if (!hintedSegments.length) return [];

  const found = [];
  for (const segment of hintedSegments) {
    const tokens = extractPieceCodesFromText(segment);
    for (const token of tokens) {
      if (!found.includes(token)) found.push(token);
    }
  }
  return found.slice(0, 10);
}

function extractPieceCodesFromRow(fieldsLike, optionsLike) {
  const fields = (fieldsLike && typeof fieldsLike === 'object') ? fieldsLike : {};
  const options = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
  const prioritizedSources = [fields.observacao, fields.laudo];
  const hinted = [];
  for (const sourceValue of prioritizedSources) {
    const hintTokens = extractPieceCodesFromHintedSegments(sourceValue);
    for (const token of hintTokens) {
      if (!hinted.includes(token)) hinted.push(token);
    }
  }
  if (hinted.length) return hinted.slice(0, 10);

  const orderedSources = [
    fields.observacao,
    fields.laudo,
    fields.codigoServico
  ];
  if (options.includeProductFallback) orderedSources.push(fields.produto);

  const found = [];
  for (const sourceValue of orderedSources) {
    const tokens = extractPieceCodesFromText(sourceValue);
    for (const token of tokens) {
      if (!found.includes(token)) found.push(token);
    }
  }
  return found.slice(0, 10);
}

function detectPieceUsageHint(textRaw) {
  const text = normalizeValueText(textRaw);
  if (!text) return false;
  return [
    'troca',
    'substitu',
    'peca',
    'placa',
    'sensor',
    'fonte',
    'modulo',
    'leitor',
    'conector',
    'reparo'
  ].some(marker => text.includes(marker));
}

function choosePrimaryPieceCodeFromRow(fieldsLike, optionsLike) {
  const codes = extractPieceCodesFromRow(fieldsLike, optionsLike);
  return codes[0] || '';
}

function shouldRequirePriceValidation(paramsLike) {
  const params = (paramsLike && typeof paramsLike === 'object')
    ? paramsLike
    : {
        partCode: paramsLike,
        coverageType: arguments[1],
        observation: arguments[2] || '',
        laudo: arguments[3] || ''
      };

  const partCode = normalizeServiceCodeValue(params.partCode || '');
  if (partCode && !looksLikePieceCode(partCode)) return false;

  const coverageType = normalizeValueText(params.coverageType || '');
  const combinedText = `${toText(params.observation)} ${toText(params.laudo)}`.trim();
  const hasPieceHint = detectPieceUsageHint(combinedText);

  if (coverageType === 'garantia' || coverageType === 'contrato') return false;
  if (coverageType === 'avulso') {
    if (partCode) return true;
    return hasPieceHint;
  }
  if (partCode) return true;
  return hasPieceHint;
}

function isPricingReconciliationFresh(reportLike) {
  const report = (reportLike && typeof reportLike === 'object') ? reportLike : {};
  return Number(report.version || 0) >= PRICING_RECONCILIATION_VERSION;
}

function parsePricingReconciliationFromData(dataLike) {
  const data = (dataLike && typeof dataLike === 'object') ? dataLike : {};
  const rawJson = String(data.import_pricing_reconciliation_json || '').trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
  }

  const parseArray = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  };

  const fallback = {
    version: PRICING_RECONCILIATION_VERSION,
    generatedAt: String(data.import_pricing_reconciliation_updated_at || ''),
    totalOs: toNumber(data.import_os_total),
    osWithoutCode: toNumber(data.import_pricing_os_without_code),
    uniqueCodes: toNumber(data.import_pricing_unique_codes),
    matchedUniqueCodes: toNumber(data.import_pricing_matched_unique_codes),
    missingUniqueCodes: toNumber(data.import_pricing_missing_unique_codes),
    coveragePct: toNumber(data.import_pricing_coverage_pct),
    matchedOs: toNumber(data.import_pricing_os_matched || data.import_pricing_matched_os),
    missingOs: toNumber(data.import_pricing_os_missing || data.import_pricing_missing_os),
    requiredPriceOs: toNumber(data.import_pricing_required_price_os),
    requiredPriceMatchedOs: toNumber(data.import_pricing_required_price_matched_os),
    requiredPriceMissingOs: toNumber(data.import_pricing_required_price_missing_os),
    requiredPriceCoveragePct: toNumber(data.import_pricing_required_price_coverage_pct),
    estimatedMatchedValue: toNumber(data.import_pricing_estimated_matched_value),
    estimatedMissingValue: toNumber(data.import_pricing_estimated_missing_value),
    catalogItems: toNumber(data.import_pricing_catalog_items),
    catalogUpdatedAt: String(data.import_pricing_catalog_updated_at || ''),
    topMissingCodes: parseArray(data.import_pricing_missing_codes_json),
    topMatchedCodes: parseArray(data.import_pricing_matched_codes_json),
    topMissingRequiredCodes: parseArray(data.import_pricing_missing_required_codes_json)
  };

  return fallback;
}

function buildPricingReconciliationFromAuditItems(itemsLike, pricingCatalogLike, pricingConfigLike) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const pricingCatalog = pricingCatalogLike || readPricingCatalog();
  const pricingConfig = pricingConfigLike || readPricingConfig();
  const catalogIndex = buildPricingCatalogIndex(pricingCatalog?.items || []);
  const baselineTicketValue = Number(pricingConfig?.campinas?.deslocamento || 0) + Number(pricingConfig?.campinas?.primeiraHora || 0);

  const codeCounter = new Map();
  const matchedCounter = new Map();
  const missingCounter = new Map();
  const missingRequiredCounter = new Map();

  let osWithoutCode = 0;
  let matchedOs = 0;
  let missingOs = 0;
  let requiredPriceOs = 0;
  let requiredPriceMatchedOs = 0;
  let requiredPriceMissingOs = 0;
  let estimatedMatchedValue = 0;
  let estimatedMissingValue = 0;

  for (const item of items) {
    const pieceCodesFromList = Array.isArray(item?.codigosPeca)
      ? item.codigosPeca.map(code => normalizeServiceCodeValue(code)).filter(code => code && looksLikePieceCode(code))
      : [];
    const pieceCodeFromItemRaw = normalizeServiceCodeValue(item?.codigoPeca || item?.codigoPecaRaw || '');
    const pieceCodeFromItem = looksLikePieceCode(pieceCodeFromItemRaw) ? pieceCodeFromItemRaw : '';
    const fallbackPieceCode = choosePrimaryPieceCodeFromRow({
      codigoServico: item?.codigoRaw || item?.codigoOperacional || item?.codigo || '',
      qrcodeProduto: item?.qrcodeProduto || '',
      produto: item?.produto || '',
      observacao: item?.observacao || '',
      laudo: item?.laudo || ''
    }, { includeProductFallback: false });
    const code = pieceCodeFromItem || pieceCodesFromList[0] || fallbackPieceCode;
    const coverageType = detectCoverageType(item?.cobertura || '');
    const requirePrice = typeof item?.pecaRequerPreco === 'boolean'
      ? item.pecaRequerPreco
      : shouldRequirePriceValidation({
          partCode: code,
          coverageType,
          observation: item?.observacao || '',
          laudo: item?.laudo || ''
        });
    if (requirePrice) requiredPriceOs += 1;

    if (!code) {
      osWithoutCode += 1;
      if (requirePrice) requiredPriceMissingOs += 1;
      continue;
    }

    codeCounter.set(code, (codeCounter.get(code) || 0) + 1);
    const matched = resolvePricingCatalogEntry(catalogIndex, code);
    const hasCatalog = !!matched;

    if (hasCatalog) {
      matchedOs += 1;
      matchedCounter.set(code, (matchedCounter.get(code) || 0) + 1);
      estimatedMatchedValue += getPricingCatalogPriceEstimate(matched);
      if (requirePrice) requiredPriceMatchedOs += 1;
    } else {
      missingOs += 1;
      missingCounter.set(code, (missingCounter.get(code) || 0) + 1);
      if (requirePrice) {
        requiredPriceMissingOs += 1;
        missingRequiredCounter.set(code, (missingRequiredCounter.get(code) || 0) + 1);
      }
      if (requirePrice && baselineTicketValue > 0) {
        estimatedMissingValue += baselineTicketValue;
      }
    }
  }

  const uniqueCodes = codeCounter.size;
  const matchedUniqueCodes = matchedCounter.size;
  const missingUniqueCodes = Math.max(0, uniqueCodes - matchedUniqueCodes);
  const coveragePct = uniqueCodes > 0 ? Math.round((matchedUniqueCodes * 10000) / uniqueCodes) / 100 : 100;
  const requiredPriceCoveragePct = requiredPriceOs > 0
    ? Math.round((requiredPriceMatchedOs * 10000) / requiredPriceOs) / 100
    : 100;

  const topByCounter = (counterMap, limit = 15) =>
    Array.from(counterMap.entries())
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, limit)
      .map(([code, count]) => ({ code, count }));

  return {
    version: PRICING_RECONCILIATION_VERSION,
    generatedAt: nowIso(),
    totalOs: items.length,
    osWithoutCode,
    uniqueCodes,
    matchedUniqueCodes,
    missingUniqueCodes,
    coveragePct,
    matchedOs,
    missingOs,
    requiredPriceOs,
    requiredPriceMatchedOs,
    requiredPriceMissingOs,
    requiredPriceCoveragePct,
    estimatedMatchedValue: Math.round(estimatedMatchedValue * 100) / 100,
    estimatedMissingValue: Math.round(estimatedMissingValue * 100) / 100,
    catalogItems: catalogIndex.totalItems,
    catalogUpdatedAt: String(pricingCatalog?.updatedAt || ''),
    topMissingCodes: topByCounter(missingCounter),
    topMatchedCodes: topByCounter(matchedCounter),
    topMissingRequiredCodes: topByCounter(missingRequiredCounter)
  };
}

function resolveOsNextStep(issues) {
  const all = Array.isArray(issues) ? issues : [];
  if (all.some(item => item.type === 'faturamento')) return 'Validar faturamento com financeiro, preencher codigo e ordem de compra antes do fechamento.';
  if (all.some(item => item.type === 'codigo')) return 'Completar codigo de peca na observacao/laudo tecnico e validar contra tabela de precos.';
  if (all.some(item => item.type === 'laudo')) return 'Reescrever laudo com defeito, causa, acao executada e resultado final.';
  if (all.some(item => item.type === 'contrato')) return 'Confirmar cobertura contratual/garantia com comercial antes de concluir.';
  return 'Revisar a O.S. e concluir pendencias administrativas.';
}

function normalizeOsAuditItemPieceFields(itemLike) {
  const item = (itemLike && typeof itemLike === 'object') ? { ...itemLike } : {};
  const storedPrimary = normalizeServiceCodeValue(item.codigoPeca || item.codigoPecaRaw || '');
  const storedCodes = Array.isArray(item.codigosPeca)
    ? item.codigosPeca.map(code => normalizeServiceCodeValue(code)).filter(code => code && looksLikePieceCode(code))
    : [];
  const extractedCodes = extractPieceCodesFromRow(
    {
      codigoServico: item.codigoRaw || item.codigoOperacional || item.codigo || '',
      qrcodeProduto: item.qrcodeProduto || '',
      produto: item.produto || '',
      observacao: item.observacao || '',
      laudo: item.laudo || ''
    },
    { includeProductFallback: false }
  ).filter(code => code && looksLikePieceCode(code));

  const mergedCodes = [];
  if (storedPrimary && looksLikePieceCode(storedPrimary)) mergedCodes.push(storedPrimary);
  for (const code of storedCodes) {
    if (!mergedCodes.includes(code)) mergedCodes.push(code);
  }
  for (const code of extractedCodes) {
    if (!mergedCodes.includes(code)) mergedCodes.push(code);
  }

  const primaryPartCode = mergedCodes[0] || '';
  const requirePrice = shouldRequirePriceValidation({
    partCode: primaryPartCode,
    coverageType: item.cobertura || '',
    observation: item.observacao || '',
    laudo: item.laudo || ''
  });

  return {
    ...item,
    codigoPeca: primaryPartCode,
    codigosPeca: mergedCodes.slice(0, 5),
    pecaRequerPreco: requirePrice
  };
}

function normalizeOsAuditItems(itemsLike) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  return items.map(normalizeOsAuditItemPieceFields);
}

function parseOsAuditFromData(data) {
  try {
    const raw = String(data.import_os_audit_json || '').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeOsAuditItems(parsed);
  } catch (_) {
    return [];
  }
}

function parseFilterTokenList(valueLike) {
  if (Array.isArray(valueLike)) {
    return valueLike
      .flatMap(item => parseFilterTokenList(item))
      .filter(Boolean)
      .slice(0, 80);
  }
  const text = String(valueLike == null ? '' : valueLike).trim();
  if (!text) return [];
  return text
    .split(',')
    .map(item => normalizeKey(item))
    .filter(Boolean)
    .slice(0, 80);
}

function readFilterQueryValues(queryLike, keys) {
  const query = (queryLike && typeof queryLike === 'object') ? queryLike : {};
  const values = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
    values.push(...parseFilterTokenList(query[key]));
  }
  return Array.from(new Set(values)).slice(0, 80);
}

function normalizeWarrantyFilterValue(valueLike) {
  const key = normalizeKey(valueLike);
  if (!key) return '';
  if (key.includes('em_garantia') || key === 'garantia') return 'em_garantia';
  if (key.includes('fora') || key.includes('sem_garantia')) return 'fora_garantia';
  if (key.includes('garantia_peca')) return 'garantia_peca';
  if (key.includes('garantia_servico')) return 'garantia_servico_instalacao';
  if (key.includes('garantia_fabrica')) return 'garantia_fabrica';
  if (key === 'contrato') return 'contrato';
  if (key === 'avulso') return 'avulso';
  return key;
}

function normalizeRetornoFilterValue(valueLike) {
  const key = normalizeKey(valueLike);
  if (!key) return '';
  if (key.includes('retorno')) return 'retorno';
  if (key.includes('novo')) return 'novo';
  return key;
}

function normalizeCriticityFilterValue(valueLike) {
  const key = normalizeKey(valueLike);
  if (!key) return '';
  if (['critico', 'critical', 'alta', 'alto', 'high'].includes(key)) return 'critico';
  if (['normal', 'ok', 'baixo', 'baixa', 'low'].includes(key)) return 'normal';
  return key;
}

function normalizePeriodFilterValue(valueLike) {
  const key = normalizeKey(valueLike);
  if (key === 'mensal' || key === 'month' || key === 'monthly') return 'monthly';
  if (key === 'trimestre' || key === 'quarter' || key === 'quarterly') return 'quarterly';
  if (key === 'ano' || key === 'anual' || key === 'ytd' || key === 'year' || key === 'yeartodate' || key === 'year_to_date') return 'ytd';
  if (key === 'historico' || key === 'history' || key === 'historical') return 'historical';
  return 'daily';
}

function normalizeInsightsFilters(queryLike) {
  const query = (queryLike && typeof queryLike === 'object') ? queryLike : {};
  const periodRaw = String(query.period || query.periodType || query.periodo || '').trim();
  return {
    period: periodRaw ? normalizePeriodFilterValue(periodRaw) : 'monthly',
    clients: readFilterQueryValues(query, ['client', 'clients', 'cliente']),
    cnpj: readFilterQueryValues(query, ['cnpj', 'cnpjs', 'document']),
    technicians: readFilterQueryValues(query, ['technician', 'technicians', 'tecnico']),
    serviceTypes: readFilterQueryValues(query, ['serviceType', 'serviceTypes', 'tipoAtendimento'])
      .map(normalizeKey)
      .filter(Boolean),
    warranty: readFilterQueryValues(query, ['warranty', 'garantia'])
      .map(normalizeWarrantyFilterValue)
      .filter(Boolean),
    retorno: readFilterQueryValues(query, ['retorno', 'novoRetorno'])
      .map(normalizeRetornoFilterValue)
      .filter(Boolean),
    equipment: readFilterQueryValues(query, ['equipment', 'equipamento', 'produto']),
    criticity: readFilterQueryValues(query, ['criticity', 'criticidade', 'priority'])
      .map(normalizeCriticityFilterValue)
      .filter(Boolean)
  };
}

function hasActiveInsightsFilters(filtersLike) {
  const filters = (filtersLike && typeof filtersLike === 'object') ? filtersLike : {};
  return (
    (Array.isArray(filters.clients) && filters.clients.length > 0)
    || (Array.isArray(filters.cnpj) && filters.cnpj.length > 0)
    || (Array.isArray(filters.technicians) && filters.technicians.length > 0)
    || (Array.isArray(filters.serviceTypes) && filters.serviceTypes.length > 0)
    || (Array.isArray(filters.warranty) && filters.warranty.length > 0)
    || (Array.isArray(filters.retorno) && filters.retorno.length > 0)
    || (Array.isArray(filters.equipment) && filters.equipment.length > 0)
    || (Array.isArray(filters.criticity) && filters.criticity.length > 0)
  );
}

function osItemMatchesFilters(itemLike, filtersLike) {
  const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
  const filters = (filtersLike && typeof filtersLike === 'object') ? filtersLike : {};
  if (!hasActiveInsightsFilters(filters)) return true;
  const matchList = (list, valuesLike) => {
    const values = (Array.isArray(valuesLike) ? valuesLike : [valuesLike])
      .map((value) => normalizeKey(value))
      .filter(Boolean);
    if (!Array.isArray(list) || !list.length) return true;
    if (!values.length) return false;
    return list.some((wanted) => values.includes(normalizeKey(wanted)));
  };
  const serviceType = detectServiceType(item?.tipoServico || item?.codigoRaw || item?.codigoOperacional || item?.observacao || '');
  const coverageType = detectCoverageType(item?.cobertura || item?.codigoRaw || item?.observacao || '');
  const retornoType = detectReworkFromOsItem(item) ? 'retorno' : 'novo';
  const criticityType = detectCriticalFromOsItem(item) ? 'critico' : 'normal';
  const warrantySignals = [
    coverageType,
    coverageType === 'garantia' ? 'em_garantia' : 'fora_garantia',
    normalizeWarrantyFilterValue(item?.cobertura || '')
  ].filter(Boolean);
  return (
    matchList(filters.clients, [item.cliente, item.unidade, item.aliasCliente, item.cnpj, item.cnpjCliente, item.documento])
    && matchList(filters.cnpj, [item.cnpj, item.cnpjCliente, item.documento])
    && matchList(filters.technicians, [item.tecnico, item.responsavelTecnico, item.responsavel])
    && matchList(filters.serviceTypes, serviceType)
    && matchList(filters.warranty, warrantySignals)
    && matchList(filters.retorno, retornoType)
    && matchList(filters.equipment, [item.produto, item.qrcodeProduto, item.codigoPeca])
    && matchList(filters.criticity, criticityType)
  );
}

function applyOsAuditFilters(itemsLike, filtersLike) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  const filters = (filtersLike && typeof filtersLike === 'object') ? filtersLike : {};
  if (!hasActiveInsightsFilters(filters)) return items.slice();
  return items.filter((item) => osItemMatchesFilters(item, filters));
}

function summarizeOsAuditByItems(itemsLike) {
  const items = Array.isArray(itemsLike) ? itemsLike : [];
  let recordsWithAlert = 0;
  let alertTotal = 0;
  let faturamento = 0;
  let codigo = 0;
  let laudo = 0;
  let contrato = 0;
  let riscoEstimado = 0;
  for (const item of items) {
    const issues = Array.isArray(item?.issues) ? item.issues : [];
    if (!issues.length) continue;
    recordsWithAlert += 1;
    alertTotal += issues.length;
    if (issues.some((issue) => normalizeKey(issue?.type) === 'faturamento')) faturamento += 1;
    if (issues.some((issue) => normalizeKey(issue?.type) === 'codigo')) codigo += 1;
    if (issues.some((issue) => normalizeKey(issue?.type) === 'laudo')) laudo += 1;
    if (issues.some((issue) => normalizeKey(issue?.type) === 'contrato')) contrato += 1;
    riscoEstimado += Number(item?.riscoEstimado || 0);
  }
  return {
    total: items.length,
    recordsWithAlert,
    alertTotal,
    faturamento,
    codigo,
    laudo,
    contrato,
    riscoEstimado: Math.round(riscoEstimado * 100) / 100
  };
}

function buildInsightsFilterOptions(referenceDateLike, osItemsLike, historicalRowsLike, localeRaw) {
  const locale = detectLocale(localeRaw);
  const dateKey = normalizeDateKey(referenceDateLike) || getLocalISODate(new Date());
  const historicalRows = Array.isArray(historicalRowsLike) ? historicalRowsLike : [];
  const rowsUntilDate = historicalRows.filter((row) => row?.dateRef && row.dateRef <= dateKey);
  const osItems = Array.isArray(osItemsLike) ? osItemsLike : [];

  const mkMap = () => new Map();
  const optionMaps = {
    clients: mkMap(),
    cnpj: mkMap(),
    technicians: mkMap(),
    serviceTypes: mkMap(),
    warranty: mkMap(),
    retorno: mkMap(),
    equipment: mkMap(),
    criticity: mkMap()
  };

  const addOpt = (map, keyLike, labelLike) => {
    const key = normalizeKey(keyLike);
    const label = compactText(labelLike || keyLike || '', 120);
    if (!key || !label) return;
    const current = map.get(key) || { key, label, count: 0 };
    current.count += 1;
    if (!current.label && label) current.label = label;
    map.set(key, current);
  };

  const pushUnique = (listLike, valueLike, limitLike) => {
    const list = Array.isArray(listLike) ? listLike : [];
    const limit = Math.max(1, Number(limitLike || 6));
    const value = compactText(valueLike || '', 120);
    if (!value) return list;
    if (list.includes(value)) return list;
    if (list.length >= limit) return list;
    list.push(value);
    return list;
  };

  const extractCnpjDigits = (valueLike) => {
    const text = String(valueLike || '');
    if (!text) return '';
    const directDigits = text.replace(/\D/g, '');
    if (directDigits.length === 14) return directDigits;
    const match = text.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14})/);
    if (!match || !match[0]) return '';
    const digits = String(match[0]).replace(/\D/g, '');
    return digits.length === 14 ? digits : '';
  };

  const formatCnpj = (valueLike) => {
    const digits = extractCnpjDigits(valueLike);
    if (!digits) return '';
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  };

  const stripEmbeddedCnpj = (valueLike) => {
    const text = String(valueLike || '').trim();
    if (!text) return '';
    return text
      .replace(/\s*[-–—]?\s*CNPJ\s*:?\s*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/ig, '')
      .replace(/\(\s*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\s*\)/g, '')
      .replace(/\(\s*\d{14}\s*\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const addClientOption = (nameLike, cnpjLike, aliasLike) => {
    const keySeed = nameLike || aliasLike || cnpjLike;
    const key = normalizeKey(keySeed);
    if (!key) return;
    const name = compactText(stripEmbeddedCnpj(nameLike || ''), 120);
    const alias = compactText(stripEmbeddedCnpj(aliasLike || ''), 120);
    const cnpjFormatted = formatCnpj(cnpjLike || nameLike || aliasLike);
    const current = optionMaps.clients.get(key) || {
      key,
      label: '',
      count: 0,
      search: '',
      aliases: [],
      tokens: [],
      clientName: '',
      cnpjs: []
    };
    current.count += 1;
    if (name && !current.clientName) current.clientName = name;
    if (!current.clientName && alias) current.clientName = alias;
    if (!current.clientName && cnpjFormatted) current.clientName = cnpjFormatted;
    pushUnique(current.aliases, alias, 8);
    pushUnique(current.cnpjs, cnpjFormatted, 4);
    const cnpjLabel = current.cnpjs.join(' | ');
    const displayName = current.clientName || key;
    current.label = cnpjLabel ? `${displayName} - CNPJ: ${cnpjLabel}` : displayName;
    current.tokens = current.cnpjs.slice(0, 4)
      .flatMap((cnpjValue) => {
        const digits = extractCnpjDigits(cnpjValue);
        return digits ? [cnpjValue, digits] : [cnpjValue];
      });
    current.search = [displayName, ...current.aliases, ...current.tokens].filter(Boolean).join(' ');
    optionMaps.clients.set(key, current);
  };

  rowsUntilDate.forEach((row) => {
    addClientOption(
      row.clientName || row.clientKey,
      row.cnpjNormalized || row.cnpjRaw,
      row.clientKey
    );
    addOpt(optionMaps.cnpj, row.cnpjNormalized || row.cnpjRaw, row.cnpjNormalized || row.cnpjRaw);
    addOpt(optionMaps.technicians, row.technicianKey || row.technicianName, row.technicianName || row.technicianKey);
    addOpt(optionMaps.serviceTypes, row.serviceType, translateTaxonomyKey(row.serviceType, locale));
    addOpt(optionMaps.warranty, row.warrantyStatus, translateTaxonomyKey(row.warrantyStatus, locale));
    addOpt(optionMaps.warranty, row.warrantyType, translateTaxonomyKey(row.warrantyType, locale));
    addOpt(optionMaps.retorno, row.isReturn ? 'retorno' : 'novo', row.isReturn ? (locale === 'en-US' ? 'Return' : 'Retorno') : (locale === 'en-US' ? 'New' : 'Novo'));
    addOpt(optionMaps.equipment, row.equipamento || row.modelo || row.sigla, row.equipamento || row.modelo || row.sigla);
    addOpt(optionMaps.criticity, row.isCriticalSignal ? 'critico' : 'normal', row.isCriticalSignal ? (locale === 'en-US' ? 'Critical' : 'Critico') : (locale === 'en-US' ? 'Normal' : 'Normal'));
  });

  osItems.forEach((item) => {
    addClientOption(
      item.cliente || item.unidade,
      item.cnpj || item.cnpjCliente || item.documento,
      item.unidade
    );
    addOpt(optionMaps.cnpj, item.cnpj || item.cnpjCliente || item.documento, item.cnpj || item.cnpjCliente || item.documento);
    addOpt(optionMaps.technicians, item.tecnico || item.responsavelTecnico || item.responsavel, item.tecnico || item.responsavelTecnico || item.responsavel);
    const serviceType = detectServiceType(item?.tipoServico || item?.codigoRaw || item?.codigoOperacional || item?.observacao || '');
    addOpt(optionMaps.serviceTypes, serviceType, translateTaxonomyKey(serviceType, locale));
    const coverageType = detectCoverageType(item?.cobertura || item?.codigoRaw || item?.observacao || '');
    if (coverageType === 'garantia') {
      addOpt(optionMaps.warranty, 'em_garantia', translateTaxonomyKey('em_garantia', locale));
    }
    addOpt(optionMaps.warranty, coverageType, translateTaxonomyKey(coverageType === 'garantia' ? 'garantia_peca' : coverageType, locale));
    const retornoType = detectReworkFromOsItem(item) ? 'retorno' : 'novo';
    addOpt(optionMaps.retorno, retornoType, retornoType === 'retorno' ? (locale === 'en-US' ? 'Return' : 'Retorno') : (locale === 'en-US' ? 'New' : 'Novo'));
    addOpt(optionMaps.equipment, item.produto || item.qrcodeProduto || item.codigoPeca, item.produto || item.qrcodeProduto || item.codigoPeca);
    const criticityType = detectCriticalFromOsItem(item) ? 'critico' : 'normal';
    addOpt(optionMaps.criticity, criticityType, criticityType === 'critico' ? (locale === 'en-US' ? 'Critical' : 'Critico') : (locale === 'en-US' ? 'Normal' : 'Normal'));
  });

  const toSortedList = (map, limit, sanitizeLike) => Array.from(map.values())
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)))
    .slice(0, Math.max(1, Number(limit || 120)))
    .map((itemLike) => {
      const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
      if (typeof sanitizeLike === 'function') return sanitizeLike(item);
      return {
        key: String(item.key || '').trim(),
        label: String(item.label || item.key || '').trim(),
        count: Math.max(0, Number(item.count || 0))
      };
    })
    .filter((item) => item.key && item.label);

  return {
    period: [
      { key: 'daily', label: locale === 'en-US' ? 'Daily' : 'Diario' },
      { key: 'monthly', label: locale === 'en-US' ? 'Monthly' : 'Mensal' },
      { key: 'quarterly', label: locale === 'en-US' ? 'Quarterly' : 'Trimestral' },
      { key: 'historical', label: locale === 'en-US' ? 'Full history' : 'Historico completo' }
    ],
    clients: toSortedList(optionMaps.clients, 120, (item) => ({
      key: String(item.key || '').trim(),
      label: String(item.label || item.key || '').trim(),
      count: Math.max(0, Number(item.count || 0)),
      search: String(item.search || item.label || item.key || '').trim(),
      aliases: Array.isArray(item.aliases) ? item.aliases.slice(0, 8) : [],
      tokens: Array.isArray(item.tokens) ? item.tokens.slice(0, 4) : []
    })),
    cnpj: toSortedList(optionMaps.cnpj, 120),
    technicians: toSortedList(optionMaps.technicians, 120),
    serviceTypes: toSortedList(optionMaps.serviceTypes, 32),
    warranty: toSortedList(optionMaps.warranty, 24),
    retorno: toSortedList(optionMaps.retorno, 8),
    equipment: toSortedList(optionMaps.equipment, 120),
    criticity: toSortedList(optionMaps.criticity, 8)
  };
}

function evaluateRecordQuality(dateKey, data) {
  const payload = (data && typeof data === 'object') ? data : {};
  const issues = [];
  const nextSteps = [];
  const opCriticos = Math.max(
    toNumber(payload.op_qtd_clientes_criticos),
    toNumber(payload.op_criticos),
    toNumber(payload.import_summary_criticos)
  );
  const clients = listCriticalClients(payload);
  const expectedClientRows = Math.max(opCriticos, clients.length);
  for (let i = 1; i <= expectedClientRows; i++) {
    const clientName = toText(payload[`op-cli${i}_cliente`]);
    const action = toText(payload[`op-cli${i}_acao`]);
    const due = toText(payload[`op-cli${i}_prazo`]);
    const status = toText(payload[`op-cli${i}_status`]);
    if ((clientName || i <= opCriticos) && !action) {
      issues.push({
        code: `critical_client_action_${i}`,
        severity: 'high',
        message: `Cliente critico ${i} sem acao registrada.`
      });
      nextSteps.push(`Registrar acao imediata para o cliente critico ${i}.`);
    }
    if ((clientName || i <= opCriticos) && !due) {
      issues.push({
        code: `critical_client_due_${i}`,
        severity: 'medium',
        message: `Cliente critico ${i} sem prazo definido.`
      });
      nextSteps.push(`Definir prazo para o cliente critico ${i}.`);
    }
    if (clientName && !status) {
      issues.push({
        code: `critical_client_status_${i}`,
        severity: 'medium',
        message: `Cliente critico ${i} sem status de acompanhamento.`
      });
    }
  }

  if (opCriticos > 0 && !toText(payload.op_contencao)) {
    issues.push({
      code: 'containment_missing',
      severity: 'high',
      message: 'Ha clientes/casos criticos sem acao de contencao imediata.'
    });
    nextSteps.push('Preencher acao de contencao imediata para evitar escalonamento.');
  }

  const pricingReconStored = parsePricingReconciliationFromData(payload);
  const pricingRecon = (String(payload.import_pricing_reconciliation_json || '').trim() && isPricingReconciliationFresh(pricingReconStored))
    ? pricingReconStored
    : buildPricingReconciliationFromAuditItems(parseOsAuditFromData(payload), ensurePricingCatalogLoaded(), readPricingConfig());

  const osFaturamento = toNumber(payload.import_os_alert_faturamento);
  const osCodigo = resolveOsCodigoCount(payload.import_os_alert_codigo, pricingRecon);
  const osLaudo = toNumber(payload.import_os_alert_laudo);
  const osContrato = toNumber(payload.import_os_alert_contrato);
  if (osFaturamento > 0) {
    issues.push({
      code: 'os_faturamento_risco',
      severity: 'high',
      message: `${osFaturamento} O.S. com risco de nao faturamento.`
    });
    nextSteps.push('Priorizar O.S. sem faturamento para nao perder receita.');
  }
  if (osCodigo > 0) {
    issues.push({
      code: 'os_codigo_pendente',
      severity: 'medium',
      message: `${osCodigo} O.S. sem codigo de peca valido na observacao/laudo tecnico.`
    });
    nextSteps.push('Completar codigos de peca nas observacoes tecnicas e validar com tabela de precos.');
  }
  if (osLaudo > 0) {
    issues.push({
      code: 'os_laudo_pendente',
      severity: 'medium',
      message: `${osLaudo} O.S. com laudo sem clareza tecnica.`
    });
    nextSteps.push('Revisar laudos com padrao: defeito, causa, acao e resultado.');
  }
  if (osContrato > 0) {
    issues.push({
      code: 'os_contrato_divergente',
      severity: 'medium',
      message: `${osContrato} O.S. com duvida de cobertura contratual/garantia.`
    });
    nextSteps.push('Validar cobertura contratual antes do fechamento das O.S.');
  }

  const slaRaw = toText(payload.op_sla || payload.import_summary_sla);
  const sla = slaRaw ? Math.max(0, Math.min(100, toNumber(slaRaw))) : null;
  if (sla != null && sla < 92) {
    issues.push({
      code: 'sla_below_target',
      severity: 'medium',
      message: `SLA abaixo da meta (92%): ${sla}%.`
    });
    nextSteps.push('Executar plano de recuperacao para elevar SLA para 92%+.');
  }

  const highCount = issues.filter(item => item.severity === 'high').length;
  const mediumCount = issues.filter(item => item.severity === 'medium').length;
  const level = highCount > 0 ? 'critico' : (mediumCount > 0 ? 'atencao' : 'ok');
  const score = Math.max(0, 100 - (highCount * 22) - (mediumCount * 10));
  if (!nextSteps.length) nextSteps.push('Fluxo operacional sem pendencias relevantes no momento.');

  return {
    date: dateKey,
    updatedAt: nowIso(),
    level,
    score,
    issueCount: issues.length,
    issues: issues.slice(0, 30),
    nextSteps: Array.from(new Set(nextSteps)).slice(0, 10)
  };
}

function mapImportRowsToPanelData(rows, dateKey, fileName) {
  const rowList = Array.isArray(rows) ? rows : [];
  const imported = {
    op_data: dateKey,
    ag_data_base: dateKey,
    import_source_filename: fileName,
    import_last_processed_at: new Date().toISOString(),
    import_summary_rows: String(rowList.length)
  };

  let explicitCriticos = null;
  let explicitReinc = null;
  let explicitTickets = null;
  let explicitAtrasos = null;
  let explicitPendAdm = null;
  const slaValues = [];
  const execValues = [];
  const criticalClientCounter = new Map();
  const serviceTypeCounter = new Map();
  const coverageCounter = new Map();
  const productCounter = new Map();
  const operationChannelCounter = new Map();
  const osAuditItems = [];
  let osTotal = 0;
  let osAlertFaturamento = 0;
  let osAlertCodigo = 0;
  let osAlertLaudo = 0;
  let osAlertContrato = 0;
  let osAlertTotal = 0;
  let osAlertRecords = 0;
  let estimatedBillingRisk = 0;
  const pricing = readPricingConfig();
  const pricingCatalog = ensurePricingCatalogLoaded();
  const pricingCatalogIndex = buildPricingCatalogIndex(pricingCatalog.items || []);
  const baselineTicketValue = Number(pricing?.campinas?.deslocamento || 0) + Number(pricing?.campinas?.primeiraHora || 0);
  const pricingCodeCounter = new Map();
  const pricingMatchedCounter = new Map();
  const pricingMissingCounter = new Map();
  const pricingMissingRequiredCounter = new Map();
  let pricingMatchedOs = 0;
  let pricingMissingOs = 0;
  let pricingOsWithoutCode = 0;
  let pricingRequiredPriceOs = 0;
  let pricingRequiredPriceMatchedOs = 0;
  let pricingRequiredPriceMissingOs = 0;
  let pricingEstimatedMatchedValue = 0;
  let pricingEstimatedMissingValue = 0;
  let derivedCriticos = 0;
  let derivedReinc = 0;
  let derivedTickets = 0;
  let derivedAtrasos = 0;
  let fallbackAction = '';
  let fallbackStatus = '';
  let fallbackPrazo = '';
  let fallbackPrioridade = '';

  const refDate = new Date(`${dateKey}T00:00:00`);

  for (const rowMap of rowList) {
    if (!rowMap || typeof rowMap !== 'object') continue;

    const criticos = parseNumberFlexible(valueFromCandidates(rowMap, ['casos_criticos', 'criticos', 'clientes_criticos', 'qtd_clientes_criticos']));
    const reinc = parseNumberFlexible(valueFromCandidates(rowMap, ['reincidencias', 'reincidencia']));
    const sla = parseNumberFlexible(valueFromCandidates(rowMap, ['sla', 'sla_dia', 'sla_percentual', 'sla_pct', 'sla_', 'sla_os']));
    const exec = parseNumberFlexible(valueFromCandidates(rowMap, ['execucao', 'percentual_execucao', 'execucao_percentual', 'checklist_execucao']));
    const tickets = parseNumberFlexible(valueFromCandidates(rowMap, ['tickets_pendentes', 'tickets_abertos', 'tickets']));
    const atrasos = parseNumberFlexible(valueFromCandidates(rowMap, ['pedidos_em_atraso', 'pedidos_atraso', 'atrasos']));
    const pendAdm = parseNumberFlexible(valueFromCandidates(rowMap, ['pendencias_administrativas', 'pendencias_adm', 'pendencias_admin']));
    const prioridade = toText(valueFromCandidates(rowMap, ['prioridade', 'criticidade', 'severidade', 'nivel_prioridade']));
    const status = toText(valueFromCandidates(rowMap, ['status_operacao', 'status_geral', 'status', 'status_os', 'situacao']));
    const cliente = toText(valueFromCandidates(rowMap, ['cliente_mais_critico', 'cliente_critico', 'cliente_prioritario', 'cliente', 'cliente_nome', 'nome_cliente', 'unidade', 'filial']));
    const acao = toText(valueFromCandidates(rowMap, ['acao_feita', 'acao', 'plano_acao', 'ultima_acao', 'acao_realizada']));
    const tecnicoNome = compactText(valueFromCandidates(rowMap, [
      'tecnico',
      'tecnico_nome',
      'nome_tecnico',
      'tecnico_responsavel',
      'responsavel_tecnico',
      'tecnico_executor',
      'executor',
      'atendente',
      'analista'
    ]), 90);
    const responsavelAtual = compactText(valueFromCandidates(rowMap, [
      'responsavel_atual',
      'responsavel',
      'lider_responsavel',
      'supervisor'
    ]), 90);
    const unidadeAtendimento = compactText(valueFromCandidates(rowMap, [
      'unidade',
      'filial',
      'local',
      'site'
    ]), 90);
    const prazo = parseDateValue(valueFromCandidates(rowMap, ['prazo', 'data_prazo', 'prazo_final', 'vencimento', 'data_limite']));
    const osId = toText(valueFromCandidates(rowMap, ['numero_os', 'os', 'ordem_servico', 'id_os', 'chamado', 'ticket', 'protocolo']));
    const reincFlag = valueFromCandidates(rowMap, ['reincidente', 'reincidencia_flag', 'eh_reincidente']);
    const tipoAtendimento = toText(valueFromCandidates(rowMap, ['tipo_atendimento', 'tipo_servico', 'tipo_chamado', 'tipo']));
    const classificacaoAtendimento = toText(valueFromCandidates(rowMap, ['classificacao_de_atendimento', 'classificacao_atendimento', 'classificacao_servico']));
    const contratoStatus = toText(valueFromCandidates(rowMap, ['contrato_ativo_inativo', 'contrato_status', 'status_contrato', 'contrato']));
    const classificacaoCobertura = toText(valueFromCandidates(rowMap, ['classificacao', 'classificacao_cobertura', 'tipo_cobertura']));
    const siglaAtendimento = toText(valueFromCandidates(rowMap, ['sigla_atendimento', 'sigla']));
    const produto = compactText(valueFromCandidates(rowMap, ['descricao_do_produto', 'descricao_produto', 'produto', 'equipamento', 'sistema_produto']), 90);
    const observacaoTexto = toText(valueFromCandidates(rowMap, ['observacao', 'obs']));
    const laudoTexto = toText(valueFromCandidates(rowMap, ['ultimo_laudo', 'laudo']));
    const qrcodeProduto = toText(valueFromCandidates(rowMap, ['qrcode_produto', 'qrcode', 'codigo_qr']));
    const codigoServico = toText(valueFromCandidates(rowMap, ['codigo_servico', 'cod_servico', 'codigo_produto', 'codigo_item', 'codigo']));
    const ordemCompra = toText(valueFromCandidates(rowMap, ['ordem_compra', 'oc', 'ordem_de_compra']));
    const dataGarantia = parseDateValue(valueFromCandidates(rowMap, ['data_garantia', 'garantia_data', 'validade_garantia']));
    const coberturaTexto = [classificacaoCobertura, tipoAtendimento, contratoStatus, siglaAtendimento].join(' ');

    if (criticos != null) explicitCriticos = Math.max(explicitCriticos ?? 0, criticos);
    if (reinc != null) explicitReinc = Math.max(explicitReinc ?? 0, reinc);
    if (tickets != null) explicitTickets = Math.max(explicitTickets ?? 0, tickets);
    if (atrasos != null) explicitAtrasos = Math.max(explicitAtrasos ?? 0, atrasos);
    if (pendAdm != null) explicitPendAdm = Math.max(explicitPendAdm ?? 0, pendAdm);
    if (sla != null) slaValues.push(sla);
    if (exec != null) execValues.push(exec);
    if (parseBooleanFlexible(reincFlag)) derivedReinc += 1;

    const serviceType = detectServiceType([tipoAtendimento, classificacaoAtendimento, siglaAtendimento, observacaoTexto].join(' '));
    if (serviceType) serviceTypeCounter.set(serviceType, (serviceTypeCounter.get(serviceType) || 0) + 1);

    const coverageType = detectCoverageType(coberturaTexto);
    if (coverageType) coverageCounter.set(coverageType, (coverageCounter.get(coverageType) || 0) + 1);

    if (produto) productCounter.set(produto, (productCounter.get(produto) || 0) + 1);

    const operationChannel = detectOperationChannel([
      valueFromCandidates(rowMap, ['origem', 'origem_atendimento', 'interno_externo', 'tipo_origem', 'canal_atendimento']),
      observacaoTexto,
      tipoAtendimento,
      siglaAtendimento
    ].join(' '));
    if (operationChannel) operationChannelCounter.set(operationChannel, (operationChannelCounter.get(operationChannel) || 0) + 1);

    const issues = [];
    const osCode = normalizeString(osId).toUpperCase();
    const operationalCodeRaw = codigoServico || siglaAtendimento || '';
    const operationalCode = extractServiceCodeFromText(operationalCodeRaw);
    const pieceCodes = extractPieceCodesFromRow(
      {
        codigoServico,
        qrcodeProduto,
        produto,
        observacao: observacaoTexto,
        laudo: laudoTexto
      },
      { includeProductFallback: false }
    );
    const primaryPieceCode = pieceCodes[0] || '';
    const qrCode = normalizeString(qrcodeProduto).toUpperCase();
    const hasAnyCode = !!(osCode || operationalCode || primaryPieceCode || qrCode || normalizeString(siglaAtendimento));
    const hasOperationCode = !!operationalCode;
    const coverageIsAvulso = coverageType === 'avulso' || normalizeValueText(coberturaTexto).includes('faturamento');
    const coverageIsContrato = coverageType === 'contrato';
    const coverageIsGarantia = coverageType === 'garantia';
    const hasOc = evaluateOrdemCompraValue(ordemCompra);
    const catalogCode = primaryPieceCode;
    const pricingCatalogEntry = catalogCode ? resolvePricingCatalogEntry(pricingCatalogIndex, catalogCode) : null;
    const codeInCatalog = !!pricingCatalogEntry;
    const requirePriceValidation = shouldRequirePriceValidation({
      partCode: catalogCode,
      coverageType,
      observation: observacaoTexto,
      laudo: laudoTexto
    });
    const contratoStatusNorm = normalizeValueText(contratoStatus);
    const contratoAtivo = contratoStatusNorm.includes('ativo') && !contratoStatusNorm.includes('inativo');
    if (requirePriceValidation) pricingRequiredPriceOs += 1;

    if (catalogCode) {
      pricingCodeCounter.set(catalogCode, (pricingCodeCounter.get(catalogCode) || 0) + 1);
      if (codeInCatalog) {
        pricingMatchedOs += 1;
        pricingMatchedCounter.set(catalogCode, (pricingMatchedCounter.get(catalogCode) || 0) + 1);
        pricingEstimatedMatchedValue += getPricingCatalogPriceEstimate(pricingCatalogEntry);
        if (requirePriceValidation) pricingRequiredPriceMatchedOs += 1;
      } else {
        pricingMissingOs += 1;
        pricingMissingCounter.set(catalogCode, (pricingMissingCounter.get(catalogCode) || 0) + 1);
        if (requirePriceValidation) {
          pricingRequiredPriceMissingOs += 1;
          pricingMissingRequiredCounter.set(catalogCode, (pricingMissingRequiredCounter.get(catalogCode) || 0) + 1);
        }
      }
    } else {
      pricingOsWithoutCode += 1;
      if (requirePriceValidation) pricingRequiredPriceMissingOs += 1;
    }

    if (!hasAnyCode) issues.push({ type: 'codigo', message: 'O.S. sem codigo identificador (OS/sigla/codigo produto).' });
    if (requirePriceValidation && !catalogCode) {
      issues.push({ type: 'codigo', message: 'Codigo de peca nao identificado no laudo/observacao para validacao de preco.' });
    }
    if (catalogCode && !codeInCatalog && requirePriceValidation) {
      issues.push({ type: 'codigo', message: `Codigo de peca ${catalogCode} sem correspondencia na tabela de precos.` });
    }
    if (!hasOperationCode && !catalogCode && !produto) issues.push({ type: 'codigo', message: 'Sem codigo operacional/peca para rastreabilidade.' });

    if (coverageIsAvulso && !hasOc) {
      issues.push({ type: 'faturamento', message: 'Risco de nao faturar: atendimento avulso sem OC/codigo de cobranca.' });
      const minAmount = baselineTicketValue;
      if (minAmount > 0) estimatedBillingRisk += minAmount;
    }
    if (coverageIsAvulso && requirePriceValidation && !codeInCatalog && baselineTicketValue > 0) {
      pricingEstimatedMissingValue += baselineTicketValue;
    }
    if (coverageIsContrato && !contratoAtivo) {
      issues.push({ type: 'contrato', message: 'Atendimento classificado como contrato, porem contrato sem status ativo.' });
    }
    if (coverageIsGarantia && dataGarantia && dataGarantia < dateKey) {
      issues.push({ type: 'contrato', message: `Garantia vencida em ${dataGarantia} para atendimento marcado como garantia.` });
    }

    if (!laudoTexto) {
      issues.push({ type: 'laudo', message: 'Laudo ausente.' });
    } else if (laudoTexto.length < 80) {
      issues.push({ type: 'laudo', message: 'Laudo curto e com baixo contexto tecnico.' });
    } else if (!hasActionableLaudo(laudoTexto)) {
      issues.push({ type: 'laudo', message: 'Laudo sem acao executada claramente descrita.' });
    }

    if (osCode || cliente || produto || laudoTexto) {
      osTotal += 1;
      if (issues.length) {
        osAlertRecords += 1;
        osAlertTotal += issues.length;
        if (issues.some(item => item.type === 'faturamento')) osAlertFaturamento += 1;
        if (issues.some(item => item.type === 'codigo')) osAlertCodigo += 1;
        if (issues.some(item => item.type === 'laudo')) osAlertLaudo += 1;
        if (issues.some(item => item.type === 'contrato')) osAlertContrato += 1;
      }

      osAuditItems.push({
        os: osCode || osId || '',
        cliente: cliente || '',
        unidade: unidadeAtendimento || '',
        tecnico: tecnicoNome || responsavelAtual || '',
        responsavelTecnico: tecnicoNome || '',
        responsavel: responsavelAtual || tecnicoNome || '',
        cobertura: coverageType || '',
        tipoServico: serviceType || '',
        canal: operationChannel || '',
        codigo: operationalCode || normalizeString(siglaAtendimento).toUpperCase() || '',
        codigoRaw: compactText(operationalCodeRaw, 110),
        codigoOperacional: operationalCode || '',
        codigoPeca: catalogCode || '',
        codigosPeca: pieceCodes.slice(0, 5),
        pecaRequerPreco: !!requirePriceValidation,
        codigoCatalogado: codeInCatalog,
        valorMensalCatalogo: pricingCatalogEntry?.monthly ?? null,
        valorAnualCatalogo: pricingCatalogEntry?.yearly ?? null,
        produto: produto || '',
        observacao: compactText(observacaoTexto, 180),
        laudo: compactText(laudoTexto, 180),
        qrcodeProduto: compactText(qrcodeProduto, 80),
        ordemCompra: ordemCompra || '',
        issues,
        nextStep: resolveOsNextStep(issues)
      });
    }

    const hasOsContext = !!(osId || cliente || status || prioridade || prazo);
    const isCritical = isCriticalPriority(prioridade);
    if (isCritical) {
      derivedCriticos += 1;
      if (cliente) criticalClientCounter.set(cliente, (criticalClientCounter.get(cliente) || 0) + 1);
    }

    if (hasOsContext && !isClosedStatus(status)) derivedTickets += 1;
    if (prazo) {
      const due = new Date(`${prazo}T00:00:00`);
      if (!Number.isNaN(due.getTime()) && !Number.isNaN(refDate.getTime()) && due < refDate && !isClosedStatus(status)) {
        derivedAtrasos += 1;
      }
    }

    if (!fallbackAction && acao) fallbackAction = acao;
    if (!fallbackStatus && status) fallbackStatus = status;
    if (!fallbackPrazo && prazo) fallbackPrazo = prazo;
    if (!fallbackPrioridade && prioridade) fallbackPrioridade = prioridade;
  }

  const criticosFinal = explicitCriticos != null ? explicitCriticos : derivedCriticos;
  const reincFinal = explicitReinc != null ? explicitReinc : derivedReinc;
  const ticketsFinal = explicitTickets != null ? explicitTickets : derivedTickets;
  const atrasosFinal = explicitAtrasos != null ? explicitAtrasos : derivedAtrasos;
  const pendAdmFinal = explicitPendAdm != null ? explicitPendAdm : null;

  if (criticosFinal != null) {
    imported.op_criticos = String(Math.max(0, Math.round(criticosFinal)));
    imported.import_summary_criticos = String(Math.max(0, Math.round(criticosFinal)));
  }
  if (reincFinal != null) {
    imported.op_reinc = String(Math.max(0, Math.round(reincFinal)));
    imported.import_summary_reincidencias = String(Math.max(0, Math.round(reincFinal)));
  }
  if (slaValues.length) {
    const avgSla = Math.round(slaValues.reduce((acc, n) => acc + n, 0) / slaValues.length);
    imported.op_sla = String(Math.max(0, Math.min(100, avgSla)));
    imported.import_summary_sla = imported.op_sla;
  }
  if (execValues.length) {
    const avgExec = Math.round(execValues.reduce((acc, n) => acc + n, 0) / execValues.length);
    const execValue = String(Math.max(0, Math.min(100, avgExec)));
    imported.import_summary_execucao = execValue;
    applyExecutionPercentToChecklist(imported, execValue);
  }
  if (ticketsFinal != null) imported.import_summary_tickets_pendentes = String(Math.max(0, Math.round(ticketsFinal)));
  if (atrasosFinal != null) imported.import_summary_pedidos_atraso = String(Math.max(0, Math.round(atrasosFinal)));
  if (pendAdmFinal != null) imported.import_summary_pendencias_adm = String(Math.max(0, Math.round(pendAdmFinal)));

  imported.import_summary_tipo_instalacao = String(countByValue(serviceTypeCounter, 'instalacao'));
  imported.import_summary_tipo_corretiva = String(countByValue(serviceTypeCounter, 'corretiva'));
  imported.import_summary_tipo_preventiva = String(countByValue(serviceTypeCounter, 'preventiva'));
  imported.import_summary_cobertura_garantia = String(countByValue(coverageCounter, 'garantia'));
  imported.import_summary_cobertura_contrato = String(countByValue(coverageCounter, 'contrato'));
  imported.import_summary_cobertura_avulso = String(countByValue(coverageCounter, 'avulso'));
  imported.import_summary_operacao_interna = String(countByValue(operationChannelCounter, 'interna'));
  imported.import_summary_operacao_externa = String(countByValue(operationChannelCounter, 'externa'));
  imported.import_os_total = String(osTotal);
  imported.import_os_alert_records = String(osAlertRecords);
  imported.import_os_alert_total = String(osAlertTotal);
  imported.import_os_alert_faturamento = String(osAlertFaturamento);
  imported.import_os_alert_codigo = String(osAlertCodigo);
  imported.import_os_alert_laudo = String(osAlertLaudo);
  imported.import_os_alert_contrato = String(osAlertContrato);
  imported.import_os_risco_estimado = String(Math.round(estimatedBillingRisk * 100) / 100);
  imported.import_os_audit_json = JSON.stringify(osAuditItems.slice(0, 200));
  imported.import_os_audit_updated_at = new Date().toISOString();

  const pricingUniqueCodes = pricingCodeCounter.size;
  const pricingMatchedUniqueCodes = pricingMatchedCounter.size;
  const pricingMissingUniqueCodes = Math.max(0, pricingUniqueCodes - pricingMatchedUniqueCodes);
  const pricingCoveragePct = pricingUniqueCodes > 0 ? Math.round((pricingMatchedUniqueCodes * 10000) / pricingUniqueCodes) / 100 : 100;
  const pricingRequiredPriceCoveragePct = pricingRequiredPriceOs > 0
    ? Math.round((pricingRequiredPriceMatchedOs * 10000) / pricingRequiredPriceOs) / 100
    : 100;
  const topByCounter = (counterMap, limit = 20) =>
    Array.from(counterMap.entries())
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, limit)
      .map(([code, count]) => ({ code, count }));

  const pricingReconciliation = {
    version: PRICING_RECONCILIATION_VERSION,
    generatedAt: nowIso(),
    totalOs: osTotal,
    osWithoutCode: pricingOsWithoutCode,
    uniqueCodes: pricingUniqueCodes,
    matchedUniqueCodes: pricingMatchedUniqueCodes,
    missingUniqueCodes: pricingMissingUniqueCodes,
    coveragePct: pricingCoveragePct,
    matchedOs: pricingMatchedOs,
    missingOs: pricingMissingOs,
    requiredPriceOs: pricingRequiredPriceOs,
    requiredPriceMatchedOs: pricingRequiredPriceMatchedOs,
    requiredPriceMissingOs: pricingRequiredPriceMissingOs,
    requiredPriceCoveragePct: pricingRequiredPriceCoveragePct,
    estimatedMatchedValue: Math.round(pricingEstimatedMatchedValue * 100) / 100,
    estimatedMissingValue: Math.round(pricingEstimatedMissingValue * 100) / 100,
    catalogItems: pricingCatalogIndex.totalItems,
    catalogUpdatedAt: String(pricingCatalog?.updatedAt || ''),
    topMissingCodes: topByCounter(pricingMissingCounter),
    topMatchedCodes: topByCounter(pricingMatchedCounter),
    topMissingRequiredCodes: topByCounter(pricingMissingRequiredCounter)
  };

  imported.import_pricing_catalog_items = String(pricingReconciliation.catalogItems);
  imported.import_pricing_catalog_updated_at = pricingReconciliation.catalogUpdatedAt;
  imported.import_pricing_unique_codes = String(pricingReconciliation.uniqueCodes);
  imported.import_pricing_matched_unique_codes = String(pricingReconciliation.matchedUniqueCodes);
  imported.import_pricing_missing_unique_codes = String(pricingReconciliation.missingUniqueCodes);
  imported.import_pricing_coverage_pct = String(pricingReconciliation.coveragePct);
  imported.import_pricing_os_matched = String(pricingReconciliation.matchedOs);
  imported.import_pricing_os_missing = String(pricingReconciliation.missingOs);
  imported.import_pricing_os_without_code = String(pricingReconciliation.osWithoutCode);
  imported.import_pricing_required_price_os = String(pricingReconciliation.requiredPriceOs);
  imported.import_pricing_required_price_matched_os = String(pricingReconciliation.requiredPriceMatchedOs);
  imported.import_pricing_required_price_missing_os = String(pricingReconciliation.requiredPriceMissingOs);
  imported.import_pricing_required_price_coverage_pct = String(pricingReconciliation.requiredPriceCoveragePct);
  imported.import_pricing_estimated_matched_value = String(pricingReconciliation.estimatedMatchedValue);
  imported.import_pricing_estimated_missing_value = String(pricingReconciliation.estimatedMissingValue);
  imported.import_pricing_missing_codes_json = JSON.stringify(pricingReconciliation.topMissingCodes);
  imported.import_pricing_matched_codes_json = JSON.stringify(pricingReconciliation.topMatchedCodes);
  imported.import_pricing_missing_required_codes_json = JSON.stringify(pricingReconciliation.topMissingRequiredCodes);
  imported.import_pricing_reconciliation_json = JSON.stringify(pricingReconciliation);
  imported.import_pricing_reconciliation_updated_at = pricingReconciliation.generatedAt;

  const topServiceType = getTopCounterKey(serviceTypeCounter);
  if (topServiceType === 'instalacao') imported.op_tipo = 'Instalações';
  if (topServiceType === 'corretiva') imported.op_tipo = 'Chamados corretivos';
  if (topServiceType === 'preventiva') imported.op_tipo = 'Preventivas';

  const topProduct = getTopCounterKey(productCounter);
  if (topProduct) imported.import_summary_produto_top = topProduct;

  if (criticalClientCounter.size) {
    const ordered = Array.from(criticalClientCounter.entries()).sort((a, b) => b[1] - a[1]);
    const topClient = ordered[0]?.[0] || '';
    imported.op_qtd_clientes_criticos = String(Math.max(0, ordered.length));
    if (topClient) {
      imported.op_cliente_critico = topClient;
      imported['op-cli1_cliente'] = topClient;
    }
  } else if (derivedCriticos > 0) {
    imported.op_qtd_clientes_criticos = String(Math.max(1, derivedCriticos));
  }

  if (fallbackPrioridade) {
    imported.op_prioridade1 = fallbackPrioridade;
    imported['op-cli1_prioridade'] = fallbackPrioridade;
  }
  if (fallbackAction) {
    imported['op-cli1_acao'] = fallbackAction;
    imported.op_contencao = fallbackAction;
  }
  if (fallbackPrazo) imported['op-cli1_prazo'] = fallbackPrazo;
  if (fallbackStatus) imported.op_status = fallbackStatus;

  return imported;
}

function readImportState() {
  return readJsonFile(IMPORT_STATE_FILE, {
    lastFile: '',
    lastFingerprint: '',
    lastProcessedAt: '',
    lastStatus: 'idle',
    lastMessage: '',
    lastRecordDate: '',
    lastChangedKeysCount: 0,
    lastProcessedFilesCount: 0,
    processedKeys: [],
    dateCoverage: {}
  });
}

function writeImportState(nextState) {
  const base = readImportState();
  const merged = {
    ...base,
    ...(nextState || {})
  };
  merged.processedKeys = normalizeProcessedImportKeys(merged.processedKeys).slice(0, 300);
  merged.dateCoverage = trimImportDateCoverage(merged.dateCoverage);
  writeJsonFileAtomic(IMPORT_STATE_FILE, merged);
  return merged;
}

function normalizeProcessedImportKeys(rawKeys) {
  if (!Array.isArray(rawKeys)) return [];
  const unique = [];
  rawKeys.forEach(item => {
    const key = String(item || '').trim();
    if (!key || unique.includes(key)) return;
    unique.push(key);
  });
  return unique;
}

function buildImportProcessedKey(fileInfo) {
  if (!fileInfo || !fileInfo.path) return '';
  return `${fileInfo.path}|${Number(fileInfo.size || 0)}|${Math.round(Number(fileInfo.mtimeMs || 0))}`;
}

function normalizeImportDateCoverage(rawCoverage) {
  if (!rawCoverage || typeof rawCoverage !== 'object') return {};
  const normalized = {};
  Object.entries(rawCoverage).forEach(([rawDate, itemRaw]) => {
    const dateKey = normalizeDateKey(rawDate);
    if (!dateKey) return;
    const item = (itemRaw && typeof itemRaw === 'object') ? itemRaw : {};
    const expectedRows = Math.max(0, Math.round(toNumber(item.expectedRows ?? item.rows)));
    const expectedOsTotal = Math.max(0, Math.round(toNumber(item.expectedOsTotal ?? item.osTotal)));
    const sourceFilesCount = Math.max(0, Math.round(toNumber(item.sourceFilesCount ?? item.filesCount)));
    normalized[dateKey] = {
      expectedRows,
      expectedOsTotal,
      sourceFilesCount,
      lastSeenAt: toText(item.lastSeenAt || ''),
      lastSource: toText(item.lastSource || '')
    };
  });
  return normalized;
}

function trimImportDateCoverage(rawCoverage, maxEntries = 730) {
  const normalized = normalizeImportDateCoverage(rawCoverage);
  const entries = Object.entries(normalized)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, Math.max(30, Math.round(toNumber(maxEntries) || 730)));
  const trimmed = {};
  entries.forEach(([dateKey, payload]) => {
    trimmed[dateKey] = payload;
  });
  return trimmed;
}

function extractImportIntegrityFromData(dataLike) {
  const data = (dataLike && typeof dataLike === 'object') ? dataLike : {};
  return {
    summaryRows: Math.max(0, toNumber(data.import_summary_rows)),
    osTotal: Math.max(0, toNumber(data.import_os_total))
  };
}

async function findInconsistentImportDatesFromCoverage(dateCoverage, scopeLike) {
  const coverage = normalizeImportDateCoverage(dateCoverage);
  const dates = Object.keys(coverage).sort((a, b) => b.localeCompare(a));
  if (!dates.length) return [];
  if (!storage || typeof storage.getRecord !== 'function') return [];
  const scope = normalizeStorageScope(scopeLike);

  const inconsistent = [];
  for (const dateKey of dates) {
    const expected = coverage[dateKey] || {};
    const expectedRows = Math.max(0, toNumber(expected.expectedRows));
    const expectedOsTotal = Math.max(0, toNumber(expected.expectedOsTotal));
    if (expectedRows <= 0 && expectedOsTotal <= 0) continue;
    const record = await storage.getRecord(dateKey, scope);
    const integrity = extractImportIntegrityFromData(record?.data || {});
    const rowsIssue = expectedRows > 0 && (integrity.summaryRows <= 0 || integrity.summaryRows < expectedRows);
    const osIssue = expectedOsTotal > 0 && (integrity.osTotal <= 0 || integrity.osTotal < expectedOsTotal);
    if (!record || rowsIssue || osIssue) inconsistent.push(dateKey);
  }
  return inconsistent.sort((a, b) => a.localeCompare(b));
}

function listImportFiles() {
  if (!fs.existsSync(IMPORT_DIR)) return [];
  const files = [];
  const folders = [IMPORT_DIR];

  while (folders.length) {
    const currentFolder = folders.pop();
    if (!currentFolder) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(currentFolder, { withFileTypes: true });
    } catch (_) {
      entries = [];
    }

    for (const entry of entries) {
      const fullPath = path.join(currentFolder, entry.name);
      if (entry.isDirectory()) {
        folders.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMPORT_SUPPORTED_EXT.has(ext)) continue;
      let stat = null;
      try {
        stat = fs.statSync(fullPath);
      } catch (_) {
        stat = null;
      }
      if (!stat) continue;
      files.push({
        name: entry.name,
        path: fullPath,
        ext,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      });
    }
  }

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function normalizeImportRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map(raw => {
    const map = {};
    Object.keys(raw || {}).forEach(key => {
      map[normalizeHeaderKey(key)] = raw[key];
    });
    const candidateDate = parseDateValue(valueFromCandidates(map, ['data', 'data_operacao', 'data_da_operacao', 'data_atendimento', 'data_os', 'dia', 'date']));
    return { map, dateKey: candidateDate };
  });
}

function chooseImportSelections(rows, fallbackDate) {
  const normalizedRows = normalizeImportRows(rows);
  if (!normalizedRows.length) return [];

  const fallback = normalizeDateKey(fallbackDate) || getLocalISODate(new Date());
  const buckets = new Map();

  normalizedRows.forEach(item => {
    const dateKey = item.dateKey || fallback;
    if (!buckets.has(dateKey)) buckets.set(dateKey, []);
    buckets.get(dateKey).push(item.map);
  });

  return Array.from(buckets.entries())
    .map(([dateKey, dateRows]) => ({ dateKey, rows: dateRows }))
    .filter(item => item.dateKey && Array.isArray(item.rows) && item.rows.length)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function readWorkbookRows(filePath) {
  if (!xlsxLib) throw new Error('Biblioteca xlsx indisponivel.');
  const workbook = xlsxLib.readFile(filePath, { cellDates: true });
  const firstSheet = workbook.SheetNames?.[0];
  if (!firstSheet) return [];
  const sheet = workbook.Sheets[firstSheet];
  return xlsxLib.utils.sheet_to_json(sheet, { defval: '' });
}

function extractPdfField(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return toText(match[1]);
  }
  return '';
}

function normalizePdfText(text) {
  return String(text || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function readPdfRows(filePath, fileInfo) {
  if (!pdfParseLib) throw new Error('Biblioteca pdf-parse indisponivel.');

  const parser = new pdfParseLib({ data: fs.readFileSync(filePath) });
  let rawText = '';
  try {
    const parsed = await parser.getText();
    rawText = toText(parsed?.text || '');
  } finally {
    try { await parser.destroy(); } catch (_) {}
  }
  const text = normalizePdfText(rawText);
  if (!text) return [];

  const row = {
    data_operacao: getLocalISODate(new Date(fileInfo?.mtimeMs || Date.now())),
    numero_os: extractPdfField(text, [/\bOS:\s*([A-Za-z0-9\-]+)/i]),
    cliente: extractPdfField(text, [/Cliente:\s*([^\n]+)/i]),
    tecnico: extractPdfField(text, [/Tecnico:\s*([^\n]+)/i]),
    tipo_atendimento: extractPdfField(text, [/Tipo de atendimento:\s*([^\n]+)/i]),
    contrato_ativo_inativo: extractPdfField(text, [/Contrato Ativo\s*\/\s*Inativo:\s*([^\n]+)/i]),
    classificacao_atendimento: extractPdfField(text, [/Classificacao de atendimento:\s*([^\n]+)/i]),
    classificacao: extractPdfField(text, [/\bClassificacao:\s*([^\n]+)/i]),
    sigla_atendimento: extractPdfField(text, [/Sigla Atendimento:\s*([^\n]+)/i]),
    descricao_produto: extractPdfField(text, [/Descricao do produto:\s*([^\n]+)/i]),
    qrcode_produto: extractPdfField(text, [/QRCode produto:\s*([^\n]+)/i]),
    ordem_compra: extractPdfField(text, [/ORDEM DE COMPRA:\s*([^\n]+)/i]),
    defeito: extractPdfField(text, [/Defeito:\s*([^\n]+)/i]),
    causa: extractPdfField(text, [/Causa:\s*([^\n]+)/i]),
    solucao: extractPdfField(text, [/Solucao:\s*([^\n]+)/i]),
    data_garantia: extractPdfField(text, [/Data de garantia:\s*([^\n]+)/i]),
    observacao: extractPdfField(text, [/Observacao:\s*([\s\S]{0,420})/i])
  };

  if (!row.observacao) {
    row.observacao = extractPdfField(text, [/Ultimo_Laudo:\s*([\s\S]{0,420})/i]);
  }
  if (!row.tipo_atendimento) {
    if (/manutencao preventiva/i.test(text)) row.tipo_atendimento = 'MANUTENCAO PREVENTIVA';
    if (/manutencao corretiva/i.test(text)) row.tipo_atendimento = 'MANUTENCAO CORRETIVA';
  }

  const summaryText = [row.tipo_atendimento, row.classificacao_atendimento, row.classificacao, row.observacao].join(' ');
  row.prioridade = isCriticalPriority(summaryText) ? 'Critico' : '';
  row.status_os = isClosedStatus(summaryText) ? 'Resolvido' : 'Em andamento';

  if (!row.numero_os && !row.cliente && !row.descricao_produto && !row.tipo_atendimento && !row.classificacao) return [];
  return [row];
}

async function readImportRowsFromFile(fileInfo) {
  if (fileInfo.ext === '.pdf') return await readPdfRows(fileInfo.path, fileInfo);
  return readWorkbookRows(fileInfo.path);
}

async function processImportFile(fileInfo, reason, totalFiles) {
  const state = readImportState();
  const processedKey = buildImportProcessedKey(fileInfo);
  const processedKeys = normalizeProcessedImportKeys(state.processedKeys);
  if (processedKey && processedKeys.includes(processedKey)) return null;
  const fingerprint = `${fileInfo.size}:${Math.round(fileInfo.mtimeMs)}`;
  if (state.lastFile === fileInfo.path && state.lastFingerprint === fingerprint) return null;
  const nextProcessedKeys = processedKey
    ? [processedKey, ...processedKeys.filter(item => item !== processedKey)].slice(0, 300)
    : processedKeys.slice(0, 300);

  const rows = await readImportRowsFromFile(fileInfo);
  if (!rows.length) {
    writeImportState({
      lastFile: fileInfo.path,
      lastFingerprint: fingerprint,
      lastProcessedAt: new Date().toISOString(),
      lastStatus: 'warning',
      lastMessage: 'Arquivo importado sem linhas de dados.',
      lastRecordDate: '',
      lastProcessedFilesCount: Number(totalFiles || 0),
      processedKeys: nextProcessedKeys
    });
    return null;
  }

  const selections = chooseImportSelections(rows, getLocalISODate(new Date(fileInfo.mtimeMs || Date.now())));
  if (!selections.length) {
    writeImportState({
      lastFile: fileInfo.path,
      lastFingerprint: fingerprint,
      lastProcessedAt: new Date().toISOString(),
      lastStatus: 'warning',
      lastMessage: 'Nao foi possivel selecionar linha valida do arquivo.',
      lastRecordDate: '',
      lastProcessedFilesCount: Number(totalFiles || 0),
      processedKeys: nextProcessedKeys
    });
    return null;
  }

  const orgScope = normalizeStorageScope(readOrganizationConfig());
  let result = null;
  let lastDate = '';
  let totalRows = 0;
  for (const selected of selections) {
    const dateKey = selected.dateKey || getLocalISODate(new Date());
    const importedData = mapImportRowsToPanelData(selected.rows || [], dateKey, fileInfo.name);
    result = await persistRecordWithPolicy({
      dateKey,
      incomingData: importedData,
      schemaVersion: DATA_SCHEMA_VERSION,
      validationStatus: 'ready',
      role: 'admin',
      actor: 'import_campinas_bot',
      action: 'file_import',
      scope: orgScope,
      notify: true
    });
    totalRows += Array.isArray(selected.rows) ? selected.rows.length : 0;
    lastDate = dateKey;
  }
  if (!result) return null;

  writeImportState({
    lastFile: fileInfo.path,
    lastFingerprint: fingerprint,
    lastProcessedAt: new Date().toISOString(),
    lastStatus: 'success',
    lastMessage: `Importacao automatica concluida (${reason || 'scan'}): ${totalRows} linha(s), ${selections.length} data(s).`,
    lastRecordDate: lastDate,
    lastChangedKeysCount: result.changedKeys.length,
    lastProcessedFilesCount: Number(totalFiles || 0),
    processedKeys: nextProcessedKeys
  });

  selections.forEach(selected => {
    notifyStreamClients('file-import', {
      tenantKey: orgScope.tenantKey,
      unitKey: orgScope.unitKey,
      date: selected.dateKey,
      fileName: fileInfo.name,
      changedKeysCount: result.changedKeys.length
    });
  });

  return result;
}

function parseImportForceFlag(value, defaultValue = false) {
  if (value == null) return !!defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = normalizeKey(value);
  if (!normalized) return !!defaultValue;
  if (['1', 'true', 'sim', 'yes', 'force', 'forcar'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'no'].includes(normalized)) return false;
  return !!defaultValue;
}

async function runImportScan(reason, options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const forceReprocess = opts.forceReprocess === true;
  if (importScanRunning) return null;
  importScanRunning = true;
  try {
    const files = listImportFiles();
    if (!files.length) {
      writeImportState({
        lastFile: '',
        lastFingerprint: '',
        lastStatus: 'idle',
        lastMessage: 'Pasta monitorada sem arquivos para importar.',
        lastProcessedAt: new Date().toISOString(),
        lastRecordDate: '',
        lastChangedKeysCount: 0,
        lastProcessedFilesCount: 0
      });
      return null;
    }
    const state = readImportState();
    const processedKeys = normalizeProcessedImportKeys(state.processedKeys);
    const currentKeys = files
      .map(item => buildImportProcessedKey(item))
      .filter(Boolean);
    const hasNewFile = currentKeys.some(key => !processedKeys.includes(key));
    const orgScope = normalizeStorageScope(readOrganizationConfig());
    const dateCoverage = normalizeImportDateCoverage(state.dateCoverage);
    const hasCoverage = Object.keys(dateCoverage).length > 0;
    const bootstrapCoverageProbe = !forceReprocess && !hasNewFile && !hasCoverage && processedKeys.length > 0;
    let selectiveDates = [];
    let selectiveReason = '';

    if (!forceReprocess && !hasNewFile && hasCoverage) {
      selectiveDates = await findInconsistentImportDatesFromCoverage(dateCoverage, orgScope);
      if (selectiveDates.length) selectiveReason = 'integrity-coverage';
    }

    if (!hasNewFile && !forceReprocess && !selectiveDates.length && !bootstrapCoverageProbe) {
      writeImportState({
        lastStatus: 'idle',
        lastMessage: 'Pasta monitorada sem novos arquivos para importar e sem inconsistencias de base detectadas.',
        lastProcessedAt: new Date().toISOString(),
        lastChangedKeysCount: 0,
        lastProcessedFilesCount: files.length
      });
      return null;
    }

    const ordered = files.slice().sort((a, b) => a.mtimeMs - b.mtimeMs);
    const rowsByDate = new Map();
    let filesWithRows = 0;
    let ignoredFiles = 0;

    for (const fileInfo of ordered) {
      const rows = await readImportRowsFromFile(fileInfo);
      if (!Array.isArray(rows) || !rows.length) {
        ignoredFiles += 1;
        continue;
      }
      const selections = chooseImportSelections(rows, getLocalISODate(new Date(fileInfo.mtimeMs || Date.now())));
      if (!selections.length) {
        ignoredFiles += 1;
        continue;
      }
      selections.forEach(selected => {
        const dateKey = selected.dateKey || getLocalISODate(new Date());
        if (!rowsByDate.has(dateKey)) {
          rowsByDate.set(dateKey, { rows: [], files: [] });
        }
        const bucket = rowsByDate.get(dateKey);
        bucket.rows.push(...selected.rows);
        bucket.files.push(fileInfo.name);
      });
      filesWithRows += 1;
    }

    if (!rowsByDate.size) {
      writeImportState({
        lastFile: files[0]?.path || '',
        lastFingerprint: files[0] ? `${files[0].size}:${Math.round(files[0].mtimeMs)}` : '',
        lastProcessedAt: new Date().toISOString(),
        lastStatus: 'warning',
        lastMessage: 'Arquivos encontrados, mas sem linhas validas para importacao.',
        lastRecordDate: '',
        lastChangedKeysCount: 0,
        lastProcessedFilesCount: Number(files.length || 0),
        processedKeys: currentKeys.slice(0, 300),
        dateCoverage
      });
      return null;
    }

    if (!forceReprocess && !hasNewFile && !selectiveDates.length) {
      const probeDates = Array.from(rowsByDate.keys()).sort((a, b) => a.localeCompare(b));
      for (const dateKey of probeDates) {
        const bucket = rowsByDate.get(dateKey);
        if (!bucket || !Array.isArray(bucket.rows) || !bucket.rows.length) continue;
        const expectedRows = Math.max(0, Number(bucket.rows.length || 0));
        const record = await storage.getRecord(dateKey, orgScope);
        const integrity = extractImportIntegrityFromData(record?.data || {});
        let expectedOsTotal = Math.max(0, toNumber(dateCoverage[dateKey]?.expectedOsTotal));
        if (expectedOsTotal <= 0 && integrity.osTotal <= 0) {
          const probeData = mapImportRowsToPanelData(
            bucket.rows,
            dateKey,
            `integrity_probe_${bucket.files.length}_arquivos`
          );
          expectedOsTotal = Math.max(0, toNumber(probeData.import_os_total));
        }
        dateCoverage[dateKey] = {
          expectedRows,
          expectedOsTotal,
          sourceFilesCount: Math.max(1, Number(bucket.files.length || 1)),
          lastSeenAt: new Date().toISOString(),
          lastSource: 'integrity-probe'
        };
        const rowsIssue = expectedRows > 0 && (integrity.summaryRows <= 0 || integrity.summaryRows < expectedRows);
        const osIssue = expectedOsTotal > 0 && (integrity.osTotal <= 0 || integrity.osTotal < expectedOsTotal);
        if (!record || rowsIssue || osIssue) selectiveDates.push(dateKey);
      }
      if (selectiveDates.length) {
        selectiveReason = bootstrapCoverageProbe ? 'integrity-bootstrap' : 'integrity-runtime';
      }
    }

    let dates = Array.from(rowsByDate.keys()).sort((a, b) => a.localeCompare(b));
    if (!forceReprocess && !hasNewFile && selectiveDates.length) {
      const selectiveSet = new Set(selectiveDates);
      dates = dates.filter(dateKey => selectiveSet.has(dateKey));
    }

    if (!dates.length) {
      writeImportState({
        lastFile: files[0]?.path || '',
        lastFingerprint: files[0] ? `${files[0].size}:${Math.round(files[0].mtimeMs)}` : '',
        lastProcessedAt: new Date().toISOString(),
        lastStatus: 'idle',
        lastMessage: 'Varredura de integridade concluida sem inconsistencias para reprocessar.',
        lastRecordDate: '',
        lastChangedKeysCount: 0,
        lastProcessedFilesCount: Number(files.length || 0),
        processedKeys: currentKeys.slice(0, 300),
        dateCoverage
      });
      return null;
    }

    let totalRows = 0;
    let lastResult = null;
    let lastDate = '';
    let lastBatchSize = 0;

    for (const dateKey of dates) {
      const bucket = rowsByDate.get(dateKey);
      if (!bucket || !Array.isArray(bucket.rows) || !bucket.rows.length) continue;
      totalRows += bucket.rows.length;
      lastBatchSize = bucket.rows.length;

      const importedData = mapImportRowsToPanelData(
        bucket.rows,
        dateKey,
        `batch_${bucket.files.length}_arquivos`
      );
      const result = await persistRecordWithPolicy({
        dateKey,
        incomingData: importedData,
        schemaVersion: DATA_SCHEMA_VERSION,
        validationStatus: 'ready',
        role: 'admin',
        actor: 'import_campinas_bot',
        action: 'file_import_batch',
        scope: orgScope,
        notify: true
      });
      lastResult = result;
      lastDate = dateKey;
      dateCoverage[dateKey] = {
        expectedRows: Math.max(0, Number(bucket.rows.length || 0)),
        expectedOsTotal: Math.max(0, toNumber(importedData.import_os_total)),
        sourceFilesCount: Math.max(1, Number(bucket.files.length || 1)),
        lastSeenAt: new Date().toISOString(),
        lastSource: forceReprocess
          ? 'force-reprocess'
          : (hasNewFile ? 'new-files' : (selectiveReason || 'integrity-reprocess'))
      };

      notifyStreamClients('file-import', {
        tenantKey: orgScope.tenantKey,
        unitKey: orgScope.unitKey,
        date: dateKey,
        fileName: `batch:${bucket.files.length}`,
        changedKeysCount: result.changedKeys.length
      });
    }

    const selectiveLabel = (!forceReprocess && !hasNewFile && selectiveDates.length)
      ? ` Reprocessamento seletivo (${selectiveReason}): ${dates.length} data(s).`
      : '';
    writeImportState({
      lastFile: files[0]?.path || '',
      lastFingerprint: files[0] ? `${files[0].size}:${Math.round(files[0].mtimeMs)}` : '',
      lastProcessedAt: new Date().toISOString(),
      lastStatus: 'success',
      lastMessage: `Importacao consolidada (${reason || 'scan'}${forceReprocess ? ', reprocessamento forcado' : ''}): ${filesWithRows} arquivo(s) com dados, ${totalRows} linha(s), ${dates.length} data(s). Ignorados: ${ignoredFiles}.${selectiveLabel}`,
      lastRecordDate: lastDate,
      lastChangedKeysCount: Number(lastResult?.changedKeys?.length || 0),
      lastProcessedFilesCount: Number(files.length || 0),
      processedKeys: currentKeys.slice(0, 300),
      dateCoverage
    });

    if (lastResult) {
      return {
        ...lastResult,
        date: lastDate,
        batchRows: totalRows,
        batchFiles: filesWithRows,
        batchLastSize: lastBatchSize,
        forced: forceReprocess,
        selective: !forceReprocess && !hasNewFile && selectiveDates.length > 0,
        selectiveReason: selectiveReason || '',
        selectiveDatesCount: dates.length
      };
    }
    return null;
  } catch (err) {
    writeImportState({
      lastStatus: 'error',
      lastMessage: err.message || 'Falha na importacao automatica.',
      lastProcessedAt: new Date().toISOString(),
      lastProcessedFilesCount: 0
    });
    return null;
  } finally {
    importScanRunning = false;
  }
}

function scheduleImportScan(reason) {
  if (importScanTimer) clearTimeout(importScanTimer);
  importScanTimer = setTimeout(() => {
    runImportScan(reason).catch(() => {});
  }, 800);
}

function startImportWatcher() {
  if (importWatchHandle) return;
  if (!fs.existsSync(IMPORT_DIR)) fs.mkdirSync(IMPORT_DIR, { recursive: true });

  try {
    importWatchHandle = fs.watch(IMPORT_DIR, { persistent: true }, () => {
      scheduleImportScan('watch');
    });
    importWatchHandle.on('error', () => {
      writeImportState({
        lastStatus: 'error',
        lastMessage: 'Watcher da pasta de importacao encontrou erro.',
        lastProcessedAt: new Date().toISOString()
      });
    });
  } catch (_) {
    writeImportState({
      lastStatus: 'error',
      lastMessage: 'Nao foi possivel iniciar watcher de importacao.',
      lastProcessedAt: new Date().toISOString()
    });
  }
}

function startImportPolling() {
  if (importPollHandle) return;
  importPollHandle = setInterval(() => {
    runImportScan('poll').catch(() => {});
  }, IMPORT_POLL_INTERVAL_MS);
}

function getImportStatus() {
  const state = readImportState();
  return {
    watchDir: IMPORT_DIR,
    watchActive: !!importWatchHandle,
    pollIntervalMs: IMPORT_POLL_INTERVAL_MS,
    state
  };
}

function stopImportServices() {
  if (importScanTimer) {
    clearTimeout(importScanTimer);
    importScanTimer = 0;
  }
  if (importPollHandle) {
    clearInterval(importPollHandle);
    importPollHandle = 0;
  }
  if (importWatchHandle) {
    try { importWatchHandle.close(); } catch (_) {}
    importWatchHandle = null;
  }
}

async function backfillPricingReconciliationForScope(scopeLike, options) {
  const scope = normalizeStorageScope(scopeLike || readOrganizationConfig());
  const opts = (options && typeof options === 'object') ? options : {};
  const limit = Math.max(1, Math.min(Number(opts.limit || 120), 365));
  const notify = !!opts.notify;

  const pricingConfig = readPricingConfig();
  const pricingCatalog = ensurePricingCatalogLoaded();
  const targetCatalogUpdatedAt = String(pricingCatalog?.updatedAt || '');

  const list = await storage.listRecords(scope);
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const meta of list.slice(0, limit)) {
    const dateKey = normalizeDateKey(meta?.date);
    if (!dateKey) {
      skipped += 1;
      continue;
    }

    const record = await storage.getRecord(dateKey, scope);
    const data = (record && typeof record.data === 'object') ? record.data : {};
    const osAuditRaw = String(data.import_os_audit_json || '').trim();
    if (!osAuditRaw) {
      skipped += 1;
      continue;
    }

    const hasStoredRecon = String(data.import_pricing_reconciliation_json || '').trim().length > 0;
    const storedRecon = parsePricingReconciliationFromData(data);
    const catalogUpdatedAt = String(data.import_pricing_catalog_updated_at || '');
    const needsRefresh = !hasStoredRecon
      || !isPricingReconciliationFresh(storedRecon)
      || (targetCatalogUpdatedAt && catalogUpdatedAt !== targetCatalogUpdatedAt);
    if (!needsRefresh) {
      skipped += 1;
      continue;
    }

    const osItems = parseOsAuditFromData(data);
    if (!osItems.length) {
      skipped += 1;
      continue;
    }

    const recon = buildPricingReconciliationFromAuditItems(osItems, pricingCatalog, pricingConfig);
    const incomingData = {
      ...data,
      import_pricing_catalog_items: String(recon.catalogItems),
      import_pricing_catalog_updated_at: recon.catalogUpdatedAt,
      import_pricing_unique_codes: String(recon.uniqueCodes),
      import_pricing_matched_unique_codes: String(recon.matchedUniqueCodes),
      import_pricing_missing_unique_codes: String(recon.missingUniqueCodes),
      import_pricing_coverage_pct: String(recon.coveragePct),
      import_pricing_os_matched: String(recon.matchedOs),
      import_pricing_os_missing: String(recon.missingOs),
      import_pricing_os_without_code: String(recon.osWithoutCode),
      import_pricing_required_price_os: String(recon.requiredPriceOs),
      import_pricing_required_price_matched_os: String(recon.requiredPriceMatchedOs),
      import_pricing_required_price_missing_os: String(recon.requiredPriceMissingOs),
      import_pricing_required_price_coverage_pct: String(recon.requiredPriceCoveragePct),
      import_pricing_estimated_matched_value: String(recon.estimatedMatchedValue),
      import_pricing_estimated_missing_value: String(recon.estimatedMissingValue),
      import_pricing_missing_codes_json: JSON.stringify(recon.topMissingCodes || []),
      import_pricing_matched_codes_json: JSON.stringify(recon.topMatchedCodes || []),
      import_pricing_missing_required_codes_json: JSON.stringify(recon.topMissingRequiredCodes || []),
      import_pricing_reconciliation_json: JSON.stringify(recon),
      import_pricing_reconciliation_updated_at: recon.generatedAt
    };

    const persisted = await persistRecordWithPolicy({
      dateKey,
      incomingData,
      schemaVersion: Number(record?.schemaVersion || DATA_SCHEMA_VERSION),
      validationStatus: String(record?.validationStatus || 'ready') === 'draft' ? 'draft' : 'ready',
      role: 'admin',
      actor: 'pricing_reconcile_bot',
      action: 'pricing_reconciliation_backfill',
      scope,
      notify
    });

    scanned += 1;
    if (Array.isArray(persisted?.changedKeys) && persisted.changedKeys.length > 0) {
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  return { scanned, updated, skipped, catalogUpdatedAt: targetCatalogUpdatedAt };
}

function formatTechTicketStatusLabel(statusRaw, localeRaw) {
  const locale = detectLocale(localeRaw);
  const status = normalizeTechTicketStatus(statusRaw);
  const mapPt = {
    aberto: 'Aberto',
    em_andamento: 'Em andamento',
    aguardando_cliente: 'Aguardando cliente',
    concluido: 'Concluido',
    cancelado: 'Cancelado'
  };
  const mapEn = {
    aberto: 'Open',
    em_andamento: 'In progress',
    aguardando_cliente: 'Waiting client',
    concluido: 'Closed',
    cancelado: 'Canceled'
  };
  return (locale === 'en-US' ? mapEn : mapPt)[status] || status;
}

function formatTechTicketPriorityLabel(priorityRaw, localeRaw) {
  const locale = detectLocale(localeRaw);
  const priority = normalizeTechTicketPriority(priorityRaw);
  const mapPt = {
    baixa: 'Baixa',
    media: 'Media',
    alta: 'Alta',
    critica: 'Critica'
  };
  const mapEn = {
    baixa: 'Low',
    media: 'Medium',
    alta: 'High',
    critica: 'Critical'
  };
  return (locale === 'en-US' ? mapEn : mapPt)[priority] || priority;
}

async function buildTechCampinasSummary(dateKey, scopeLike, localeRaw, actorLike) {
  const scope = normalizeStorageScope(scopeLike);
  const actor = normalizeTechTicketActor(actorLike);
  const locale = detectLocale(localeRaw);
  const targetDate = normalizeDateKey(dateKey) || getLocalISODate(new Date());

  const record = await storage.getRecord(targetDate, scope);
  const data = record?.data || {};
  const quality = evaluateRecordQuality(targetDate, data);
  const insights = buildInsightsFromData(targetDate, data, locale);
  const brain = buildOperationalBrain({
    dateKey: targetDate,
    data,
    quality,
    insights,
    locale
  });
  const anticipation = await buildOperationalAnticipation(targetDate, scope, locale);
  const decisionNow = buildImmediateDecision(brain, anticipation, locale);

  const allTickets = listTechTicketsFromStore(scope, { limit: 600 });
  const openStatuses = new Set(['aberto', 'em_andamento', 'aguardando_cliente']);
  const openTickets = allTickets.filter(item => openStatuses.has(normalizeTechTicketStatus(item.status)));
  const mine = allTickets.filter(item => String(item.createdBy || '').toLowerCase() === actor.username.toLowerCase());
  const mineOpen = mine.filter(item => openStatuses.has(normalizeTechTicketStatus(item.status)));
  const highPriorityOpen = openTickets.filter(item => ['alta', 'critica'].includes(normalizeTechTicketPriority(item.priority)));

  const osAudit = insights?.osAudit || {};
  const pricingRecon = insights?.pricing?.reconciliation || {};
  const billingRisk = toMetricNumber(osAudit.faturamento, 0);
  const billingStatus = billingRisk > 0
    ? (locale === 'en-US' ? 'Billing risk detected' : 'Risco de faturamento detectado')
    : (locale === 'en-US' ? 'Billing flow stable' : 'Fluxo de faturamento estavel');

  return {
    ok: true,
    locale,
    scope,
    date: targetDate,
    technician: {
      username: actor.username,
      displayName: actor.displayName
    },
    operation: {
      score: toMetricNumber(brain?.scoreOperational?.value, 0),
      level: String(brain?.scoreOperational?.level || 'stable'),
      pressureIndex: toMetricNumber(anticipation?.pressureIndex, 0),
      pressureLevel: String(anticipation?.pressureLevel || 'stable'),
      sla: toMetricNumber(insights?.kpis?.sla, 0),
      execution: toMetricNumber(insights?.kpis?.execucao, 0),
      criticalCases: toMetricNumber(insights?.kpis?.criticos, 0),
      pendingTickets: toMetricNumber(insights?.kpis?.ticketsPendentes, 0),
      lateOrders: toMetricNumber(insights?.kpis?.pedidosAtraso, 0)
    },
    finance: {
      billingRiskCount: billingRisk,
      codeRiskCount: toMetricNumber(osAudit.codigo, 0),
      contractRiskCount: toMetricNumber(osAudit.contrato, 0),
      reportRiskCount: toMetricNumber(osAudit.laudo, 0),
      pricingCoveragePct: toMetricNumber(pricingRecon.coveragePct, 0),
      pricingRequiredCoveragePct: toMetricNumber(pricingRecon.requiredPriceCoveragePct, 0),
      pricingRequiredMissingOs: toMetricNumber(pricingRecon.requiredPriceMissingOs, 0),
      status: billingStatus
    },
    tickets: {
      total: allTickets.length,
      open: openTickets.length,
      mine: mine.length,
      mineOpen: mineOpen.length,
      highPriorityOpen: highPriorityOpen.length
    },
    decisionNow,
    anticipation,
    quickMessages: locale === 'en-US'
      ? [
          `Open tickets in Campinas: ${openTickets.length}.`,
          `High priority open tickets: ${highPriorityOpen.length}.`,
          decisionNow.executiveMessage
        ]
      : [
          `Tickets abertos em Campinas: ${openTickets.length}.`,
          `Tickets de alta prioridade abertos: ${highPriorityOpen.length}.`,
          decisionNow.executiveMessage
        ]
  };
}

function decorateTechTicketForClient(ticket, localeRaw) {
  const source = (ticket && typeof ticket === 'object') ? ticket : {};
  return {
    ...source,
    statusLabel: formatTechTicketStatusLabel(source.status, localeRaw),
    priorityLabel: formatTechTicketPriorityLabel(source.priority, localeRaw)
  };
}

app.get('/api/health', async (req, res) => {
  try {
    res.json(await buildRuntimePayload());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar health.' });
  }
});

app.get('/api/system/status', (req, res) => {
  try {
    res.json(buildSystemStatusPayload());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar status do sistema.' });
  }
});

app.get('/api/runtime', async (req, res) => {
  try {
    res.json(await buildRuntimePayload());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar runtime.' });
  }
});

app.get('/api/import/status', requireAuth, (req, res) => {
  try {
    res.json({
      ok: true,
      ...getImportStatus()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar status da importacao.' });
  }
});

app.post('/api/import/scan', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const query = (req.query && typeof req.query === 'object') ? req.query : {};
    const forceFlagRaw = Object.prototype.hasOwnProperty.call(body, 'forceReprocess')
      ? body.forceReprocess
      : (
        Object.prototype.hasOwnProperty.call(body, 'force')
          ? body.force
          : (
            Object.prototype.hasOwnProperty.call(query, 'forceReprocess')
              ? query.forceReprocess
              : query.force
          )
      );
    const forceReprocess = parseImportForceFlag(
      forceFlagRaw,
      false
    );
    const result = await runImportScan('manual', { forceReprocess });
    const status = getImportStatus();
    res.json({
      ok: true,
      imported: !!result,
      date: result?.date || '',
      changedKeysCount: result?.changedKeys?.length || 0,
      batchRows: Number(result?.batchRows || 0),
      batchFiles: Number(result?.batchFiles || 0),
      forced: !!forceReprocess,
      status
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao executar importacao manual.' });
  }
});

app.post('/api/import/reprocess-all', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await runImportScan('manual-reprocess-all', { forceReprocess: true });
    const status = getImportStatus();
    res.json({
      ok: true,
      imported: !!result,
      date: result?.date || '',
      changedKeysCount: result?.changedKeys?.length || 0,
      batchRows: Number(result?.batchRows || 0),
      batchFiles: Number(result?.batchFiles || 0),
      forced: true,
      status
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao reprocessar todos os arquivos de importacao.' });
  }
});

app.get('/api/analytics/historical/status', requireAuth, (req, res) => {
  try {
    const locale = resolveRequestLocale(req);
    const status = getHistoricalAnalyticsStatus(locale);
    res.json({
      ok: true,
      locale,
      status
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar status do historico analitico.' });
  }
});

app.get('/api/analytics/historical/integrity', requireAuth, (req, res) => {
  try {
    const store = getHistoricalAnalyticsStore();
    const rows = Array.isArray(store.rows) ? store.rows : [];
    const integrity = (store.integrity && typeof store.integrity === 'object') ? store.integrity : {};
    const snapshot = (integrity.snapshot && typeof integrity.snapshot === 'object')
      ? integrity.snapshot
      : buildHistoricalIntegritySnapshot(rows);
    const auditStore = readHistoricalIntegrityAuditStore();
    const entries = Array.isArray(auditStore.entries) ? auditStore.entries : [];
    res.json({
      ok: true,
      strictMode: HISTORICAL_INTEGRITY_STRICT,
      allowLoss: HISTORICAL_INTEGRITY_ALLOW_LOSS,
      latest: {
        checkedAt: String(integrity.checkedAt || ''),
        blockedOnLoss: !!integrity.blockedOnLoss,
        lossCount: Math.max(0, Number(integrity.lossCount || 0)),
        losses: Array.isArray(integrity.losses) ? integrity.losses : []
      },
      snapshot,
      audit: {
        updatedAt: String(auditStore.updatedAt || ''),
        totalEntries: entries.length,
        entries: entries.slice(0, 20)
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar integridade do historico analitico.' });
  }
});

app.get('/api/analytics/historical/view/:date', requireAuth, (req, res) => {
  const dateKey = normalizeDateKey(req.params?.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });
  try {
    const locale = resolveRequestLocale(req);
    const requestedFilters = normalizeInsightsFilters(req.query || {});
    const historicalIntelligence = buildHistoricalIntelligencePayload(dateKey, locale, requestedFilters);
    const panelModularBlueprint = historicalIntelligence?.panelModularBlueprint || buildPanelModularBlueprint(locale);
    res.json({
      ok: true,
      locale,
      date: dateKey,
      historicalIntelligence,
      panelModularBlueprint
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao montar visao do historico analitico.' });
  }
});

app.get('/api/analytics/historical/comparatives/:date', requireAuth, (req, res) => {
  const dateKey = normalizeDateKey(req.params?.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });
  try {
    const locale = resolveRequestLocale(req);
    const store = getHistoricalAnalyticsStore();
    const comparatives = buildHistoricalComparativesView(store, dateKey, locale, {
      currentFrom: req.query?.currentFrom,
      currentTo: req.query?.currentTo,
      referenceFrom: req.query?.referenceFrom,
      referenceTo: req.query?.referenceTo
    });
    res.json({
      ok: true,
      locale,
      date: dateKey,
      comparatives
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao montar comparativos historicos.' });
  }
});

app.post('/api/analytics/historical/import', requireAuth, requireAdmin, async (req, res) => {
  try {
    const locale = resolveRequestLocale(req);
    const payload = (req.body && typeof req.body === 'object') ? req.body : {};
    const explicitPath = String(payload.filePath || payload.workbookPath || '').trim();
    const workbookPath = resolveDefaultHistoricalWorkbookPath({ filePath: explicitPath });
    const referenceDate = normalizeDateKey(payload.referenceDate) || getLocalISODate(new Date());
    const thresholds = (payload.thresholds && typeof payload.thresholds === 'object') ? payload.thresholds : undefined;
    const result = runHistoricalAnalyticsImport({
      filePath: workbookPath,
      referenceDate,
      thresholds,
      locale
    });
    if (!result?.ok) {
      return res.status(400).json({
        ok: false,
        imported: false,
        error: result?.error || 'Falha ao importar historico analitico.',
        code: result?.code || '',
        details: (result?.details && typeof result.details === 'object') ? result.details : {},
        workbookPath,
        status: getHistoricalAnalyticsStatus(locale)
      });
    }
    await writeRuntimeFile();
    res.json({
      ok: true,
      imported: true,
      workbookPath,
      referenceDate,
      importMeta: result.importMeta || {},
      status: getHistoricalAnalyticsStatus(locale),
      historicalIntelligence: buildHistoricalIntelligencePayload(referenceDate, locale)
    });
  } catch (err) {
    res.status(500).json({ ok: false, imported: false, error: err.message || 'Falha ao importar historico analitico.' });
  }
});

app.get('/api/reports/unified/status', requireAuth, (req, res) => {
  try {
    const status = getUnifiedReportStatus();
    res.json({
      ok: true,
      status
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar relatorio unificado.' });
  }
});

app.post('/api/reports/unified/rebuild', requireAuth, requireAdmin, async (req, res) => {
  try {
    const payload = await safeRefreshUnifiedReport('manual-rebuild');
    const status = getUnifiedReportStatus();
    res.json({
      ok: true,
      status,
      generatedAt: payload?.generatedAt || '',
      rows: Number(payload?.totalRows || 0),
      columns: Array.isArray(payload?.columns) ? payload.columns.length : 0
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao reconstruir relatorio unificado.' });
  }
});

app.get('/api/reports/unified/csv', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(UNIFIED_REPORT_CSV_FILE)) {
      return res.status(404).json({ ok: false, error: 'Arquivo CSV do relatorio unificado ainda nao foi gerado.' });
    }
    res.download(UNIFIED_REPORT_CSV_FILE, path.basename(UNIFIED_REPORT_CSV_FILE));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao baixar CSV do relatorio unificado.' });
  }
});

app.get('/api/reports/unified/json', requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(UNIFIED_REPORT_JSON_FILE)) {
      return res.status(404).json({ ok: false, error: 'Arquivo JSON do relatorio unificado ainda nao foi gerado.' });
    }
    res.download(UNIFIED_REPORT_JSON_FILE, path.basename(UNIFIED_REPORT_JSON_FILE));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao baixar JSON do relatorio unificado.' });
  }
});

app.get('/api/reports/executive-monthly/status/:date', requireAuth, (req, res) => {
  const dateKey = normalizeDateKey(req.params?.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const status = getExecutiveMonthlyExportStatus(dateKey, scope);
    const jobStatus = getExecutiveMonthlyJobStatusSnapshot(scope);
    res.json({
      ok: true,
      status,
      job: {
        running: executiveMonthlyJobRunning || jobStatus.running === true,
        lastRunAt: jobStatus.lastRunAt || '',
        lastSuccessAt: jobStatus.lastSuccessAt || '',
        lastErrorAt: jobStatus.lastErrorAt || '',
        lastOutcome: jobStatus.lastOutcome || 'idle',
        lastMessage: jobStatus.lastMessage || '',
        counters: jobStatus.counters || {}
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar status de exportacao mensal executiva.' });
  }
});

app.post('/api/reports/executive-monthly/rebuild/:date', requireAuth, requireAdmin, async (req, res) => {
  const dateKey = normalizeDateKey(req.params?.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const result = await generateExecutiveMonthlyExports(dateKey, scope, locale, req.authUser, { force: true });
    const status = getExecutiveMonthlyExportStatus(dateKey, scope);
    res.json({
      ok: true,
      cached: !!result.cached,
      date: result.dateKey,
      month: result.monthKey,
      signature: result.signature,
      status,
      summary: {
        sampleDays: Math.max(0, toNumber(result.executiveMonthly?.period?.sampleDays)),
        totalOs: Math.max(0, toNumber(result.executiveMonthly?.overview?.totalOs)),
        reviewOpen: Math.max(0, toNumber(result.executiveMonthly?.reviewQueue?.open)),
        classificationQuality: toText(result.executiveMonthly?.quality?.classificationQuality || '')
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao reconstruir exportacao mensal executiva.' });
  }
});

app.get('/api/reports/executive-monthly/pdf/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params?.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const forceRaw = normalizeKey(req.query?.force || '');
    const force = forceRaw === '1' || forceRaw === 'true' || forceRaw === 'sim' || forceRaw === 'yes';
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const result = await generateExecutiveMonthlyExports(dateKey, scope, locale, req.authUser, { force });
    if (!fs.existsSync(result.paths.pdfFile)) {
      return res.status(404).json({ ok: false, error: 'Arquivo PDF executivo mensal ainda nao foi gerado.' });
    }
    res.download(result.paths.pdfFile, path.basename(result.paths.pdfFile));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao baixar PDF executivo mensal.' });
  }
});

app.get('/api/reports/executive-monthly/excel/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params?.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const forceRaw = normalizeKey(req.query?.force || '');
    const force = forceRaw === '1' || forceRaw === 'true' || forceRaw === 'sim' || forceRaw === 'yes';
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const result = await generateExecutiveMonthlyExports(dateKey, scope, locale, req.authUser, { force });
    if (!fs.existsSync(result.paths.excelFile)) {
      return res.status(404).json({ ok: false, error: 'Arquivo Excel executivo mensal ainda nao foi gerado.' });
    }
    res.download(result.paths.excelFile, path.basename(result.paths.excelFile));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao baixar Excel executivo mensal.' });
  }
});

app.get('/api/reports/executive-monthly/json/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params?.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const result = await generateExecutiveMonthlyExports(dateKey, scope, locale, req.authUser, { force: false });
    if (!fs.existsSync(result.paths.jsonFile)) {
      return res.status(404).json({ ok: false, error: 'Arquivo JSON executivo mensal ainda nao foi gerado.' });
    }
    res.download(result.paths.jsonFile, path.basename(result.paths.jsonFile));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao baixar JSON executivo mensal.' });
  }
});

app.get('/api/reports/executive-monthly/job/status', requireAuth, (req, res) => {
  try {
    const scope = normalizeStorageScope(req.authUser);
    const dateRef = normalizeDateKey(req.query?.date || '') || getLocalISODate(new Date());
    const monthStatus = getExecutiveMonthlyExportStatus(dateRef, scope);
    const jobStatus = getExecutiveMonthlyJobStatusSnapshot(scope);
    res.json({
      ok: true,
      config: getExecutiveMonthlyJobConfig(),
      running: executiveMonthlyJobRunning || jobStatus.running === true,
      monthStatus,
      status: jobStatus
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar status do job mensal executivo.' });
  }
});

app.post('/api/reports/executive-monthly/job/run', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const forceRaw = normalizeKey(body.force || req.query?.force || '');
    const force = forceRaw === '1' || forceRaw === 'true' || forceRaw === 'sim' || forceRaw === 'yes';
    const scope = normalizeStorageScope(req.authUser);
    const locale = resolveRequestLocale(req);
    const result = await runExecutiveMonthlyAutoJob('manual', {
      force,
      scope,
      locale,
      actor: req.authUser
    });
    if (!result.ok && result.reason === 'running') {
      return res.status(409).json({
        ok: false,
        error: 'Job mensal ja esta em execucao.',
        status: result.status || getExecutiveMonthlyJobStatusSnapshot(scope)
      });
    }
    res.json({
      ok: !!result.ok,
      force,
      result: result.result || null,
      status: result.status || getExecutiveMonthlyJobStatusSnapshot(scope),
      error: result.error || '',
      skipped: !!result.skipped,
      reason: result.reason || ''
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao executar job mensal executivo.' });
  }
});

app.get('/api/reports/executive-quarterly/status/:quarter', requireAuth, (req, res) => {
  const quarterKey = normalizeQuarterKey(req.params?.quarter);
  if (!quarterKey) return res.status(400).json({ ok: false, error: 'Trimestre invalido.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const status = getExecutiveQuarterlyExportStatus(quarterKey, scope);
    const jobStatus = getExecutiveQuarterlyJobStatusSnapshot(scope);
    res.json({
      ok: true,
      status,
      job: {
        running: executiveQuarterlyJobRunning || jobStatus.running === true,
        lastRunAt: jobStatus.lastRunAt || '',
        lastSuccessAt: jobStatus.lastSuccessAt || '',
        lastErrorAt: jobStatus.lastErrorAt || '',
        lastOutcome: jobStatus.lastOutcome || 'idle',
        lastMessage: jobStatus.lastMessage || '',
        counters: jobStatus.counters || {}
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar status de exportacao trimestral executiva.' });
  }
});

app.post('/api/reports/executive-quarterly/rebuild/:quarter', requireAuth, requireAdmin, async (req, res) => {
  const quarterKey = normalizeQuarterKey(req.params?.quarter);
  if (!quarterKey) return res.status(400).json({ ok: false, error: 'Trimestre invalido.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const result = await generateExecutiveQuarterlyExports(quarterKey, scope, locale, req.authUser, { force: true });
    const status = getExecutiveQuarterlyExportStatus(quarterKey, scope);
    res.json({
      ok: true,
      cached: !!result.cached,
      quarter: result.quarterKey,
      signature: result.signature,
      status,
      summary: {
        sampleDays: Math.max(0, toNumber(result.executiveQuarterly?.period?.sampleDays)),
        totalOs: Math.max(0, toNumber(result.executiveQuarterly?.overview?.totalOs)),
        monthsWithData: Math.max(0, toNumber(result.executiveQuarterly?.overview?.monthsWithData)),
        reviewOpen: Math.max(0, toNumber(result.executiveQuarterly?.reviewQueue?.open)),
        classificationQuality: toText(result.executiveQuarterly?.quality?.classificationQuality || '')
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao reconstruir exportacao trimestral executiva.' });
  }
});

app.get('/api/reports/executive-quarterly/pdf/:quarter', requireAuth, async (req, res) => {
  const quarterKey = normalizeQuarterKey(req.params?.quarter);
  if (!quarterKey) return res.status(400).json({ ok: false, error: 'Trimestre invalido.' });

  try {
    const forceRaw = normalizeKey(req.query?.force || '');
    const force = forceRaw === '1' || forceRaw === 'true' || forceRaw === 'sim' || forceRaw === 'yes';
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const result = await generateExecutiveQuarterlyExports(quarterKey, scope, locale, req.authUser, { force });
    if (!fs.existsSync(result.paths.pdfFile)) {
      return res.status(404).json({ ok: false, error: 'Arquivo PDF executivo trimestral ainda nao foi gerado.' });
    }
    res.download(result.paths.pdfFile, path.basename(result.paths.pdfFile));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao baixar PDF executivo trimestral.' });
  }
});

app.get('/api/reports/executive-quarterly/excel/:quarter', requireAuth, async (req, res) => {
  const quarterKey = normalizeQuarterKey(req.params?.quarter);
  if (!quarterKey) return res.status(400).json({ ok: false, error: 'Trimestre invalido.' });

  try {
    const forceRaw = normalizeKey(req.query?.force || '');
    const force = forceRaw === '1' || forceRaw === 'true' || forceRaw === 'sim' || forceRaw === 'yes';
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const result = await generateExecutiveQuarterlyExports(quarterKey, scope, locale, req.authUser, { force });
    if (!fs.existsSync(result.paths.excelFile)) {
      return res.status(404).json({ ok: false, error: 'Arquivo Excel executivo trimestral ainda nao foi gerado.' });
    }
    res.download(result.paths.excelFile, path.basename(result.paths.excelFile));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao baixar Excel executivo trimestral.' });
  }
});

app.get('/api/reports/executive-quarterly/json/:quarter', requireAuth, async (req, res) => {
  const quarterKey = normalizeQuarterKey(req.params?.quarter);
  if (!quarterKey) return res.status(400).json({ ok: false, error: 'Trimestre invalido.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const result = await generateExecutiveQuarterlyExports(quarterKey, scope, locale, req.authUser, { force: false });
    if (!fs.existsSync(result.paths.jsonFile)) {
      return res.status(404).json({ ok: false, error: 'Arquivo JSON executivo trimestral ainda nao foi gerado.' });
    }
    res.download(result.paths.jsonFile, path.basename(result.paths.jsonFile));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao baixar JSON executivo trimestral.' });
  }
});

app.get('/api/reports/executive-quarterly/job/status', requireAuth, (req, res) => {
  try {
    const scope = normalizeStorageScope(req.authUser);
    const org = readOrganizationConfig();
    const nowParts = getDateTimePartsInTimezone(new Date(), org.timezone || DEFAULT_ORG_CONFIG.timezone);
    const quarterRef = normalizeQuarterKey(req.query?.quarter || '')
      || quarterKeyFromMonthKey(nowParts.monthKey)
      || quarterKeyFromMonthKey(getLocalISODate(new Date()).slice(0, 7));
    const quarterStatus = getExecutiveQuarterlyExportStatus(quarterRef, scope);
    const jobStatus = getExecutiveQuarterlyJobStatusSnapshot(scope);
    res.json({
      ok: true,
      config: getExecutiveQuarterlyJobConfig(),
      running: executiveQuarterlyJobRunning || jobStatus.running === true,
      quarterStatus,
      status: jobStatus
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar status do job trimestral executivo.' });
  }
});

app.post('/api/reports/executive-quarterly/job/run', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const forceRaw = normalizeKey(body.force || req.query?.force || '');
    const force = forceRaw === '1' || forceRaw === 'true' || forceRaw === 'sim' || forceRaw === 'yes';
    const scope = normalizeStorageScope(req.authUser);
    const locale = resolveRequestLocale(req);
    const result = await runExecutiveQuarterlyAutoJob('manual', {
      force,
      scope,
      locale,
      actor: req.authUser
    });
    if (!result.ok && result.reason === 'running') {
      return res.status(409).json({
        ok: false,
        error: 'Job trimestral ja esta em execucao.',
        status: result.status || getExecutiveQuarterlyJobStatusSnapshot(scope)
      });
    }
    res.json({
      ok: !!result.ok,
      force,
      result: result.result || null,
      status: result.status || getExecutiveQuarterlyJobStatusSnapshot(scope),
      error: result.error || '',
      skipped: !!result.skipped,
      reason: result.reason || ''
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao executar job trimestral executivo.' });
  }
});

app.get('/api/pricing/config', requireAuth, (req, res) => {
  try {
    const config = readPricingConfig();
    const catalog = ensurePricingCatalogLoaded();
    res.json({
      ok: true,
      config,
      catalogSummary: {
        items: Array.isArray(catalog.items) ? catalog.items.length : 0,
        updatedAt: catalog.updatedAt || '',
        sourceFile: catalog.sourceFile || ''
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar configuracao de precos.' });
  }
});

app.get('/api/pricing/search', requireAuth, (req, res) => {
  try {
    const q = String(req.query?.q || req.query?.term || '').trim();
    const code = String(req.query?.code || '').trim();
    const description = String(req.query?.description || '').trim();
    const limit = Math.max(1, Math.min(Number(req.query?.limit || 25), 200));
    const terms = [q, code, description]
      .map(value => normalizeValueText(value))
      .filter(Boolean);

    const catalog = ensurePricingCatalogLoaded();
    const items = Array.isArray(catalog.items) ? catalog.items : [];
    const codeTerm = normalizeValueText(code);

    let matches = items.filter(item => {
      if (!terms.length) return true;
      const codeText = normalizeValueText(item?.code);
      const descText = normalizeValueText(item?.description);
      const typeText = normalizeValueText(item?.type);
      return terms.every(term =>
        codeText.includes(term) ||
        descText.includes(term) ||
        typeText.includes(term)
      );
    });

    if (codeTerm) {
      matches = matches.sort((a, b) => {
        const aCode = normalizeValueText(a?.code);
        const bCode = normalizeValueText(b?.code);
        const aExact = aCode === codeTerm ? 1 : 0;
        const bExact = bCode === codeTerm ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return aCode.localeCompare(bCode);
      });
    }

    const config = readPricingConfig();
    res.json({
      ok: true,
      query: { q, code, description, terms },
      total: matches.length,
      limit,
      items: matches.slice(0, limit),
      catalogUpdatedAt: catalog.updatedAt || '',
      links: {
        lookerUrl: config.lookerUrl || DEFAULT_LOOKER_URL,
        portalClienteUrl: config.portalClienteUrl || DEFAULT_PORTAL_CLIENTE_URL,
        powerBiUrl: config.powerBiUrl || DEFAULT_POWER_BI_URL
      },
      campinas: config.campinas || {}
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao pesquisar tabela de precos.' });
  }
});

app.get('/api/pricing/reconciliation/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const record = await storage.getRecord(dateKey, scope);
    const data = record?.data || {};
    const items = parseOsAuditFromData(data);
    const pricingConfig = readPricingConfig();
    const pricingCatalog = ensurePricingCatalogLoaded();
    const stored = parsePricingReconciliationFromData(data);
    const hasStored = String(data.import_pricing_reconciliation_json || '').trim().length > 0;
    const report = (hasStored && isPricingReconciliationFresh(stored))
      ? stored
      : buildPricingReconciliationFromAuditItems(items, pricingCatalog, pricingConfig);
    let reviewQueueSync = null;
    try {
      if (record?.data && typeof record.data === 'object') {
        reviewQueueSync = syncPricingReviewQueueForRecord({
          scope,
          dateKey,
          data: record.data,
          actor: req.authUser
        });
      }
    } catch (queueErr) {
      writeServerLog('warn', 'Falha ao sincronizar fila de revisao durante reconciliacao de precos.', {
        date: dateKey,
        tenantKey: scope.tenantKey,
        unitKey: scope.unitKey,
        error: queueErr?.message || String(queueErr)
      });
    }
    const reviewQueue = buildPricingReviewQueueSummary(scope, dateKey);

    res.json({
      ok: true,
      date: dateKey,
      exists: !!record,
      report,
      reviewQueue,
      reviewQueueSync,
      catalogSummary: {
        items: Array.isArray(pricingCatalog.items) ? pricingCatalog.items.length : 0,
        updatedAt: pricingCatalog.updatedAt || '',
        sourceFile: pricingCatalog.sourceFile || ''
      },
      links: {
        lookerUrl: pricingConfig.lookerUrl || DEFAULT_LOOKER_URL,
        portalClienteUrl: pricingConfig.portalClienteUrl || DEFAULT_PORTAL_CLIENTE_URL,
        powerBiUrl: pricingConfig.powerBiUrl || DEFAULT_POWER_BI_URL
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao gerar reconciliacao de precos.' });
  }
});

app.get('/api/pricing/review-queue', requireAuth, async (req, res) => {
  try {
    const scope = normalizeStorageScope(req.authUser);
    const dateKey = normalizeDateKey(req.query?.date);
    const status = String(req.query?.status || '').trim();
    const openOnlyRaw = normalizeKey(req.query?.openOnly || '');
    const openOnly = openOnlyRaw === '1' || openOnlyRaw === 'true' || openOnlyRaw === 'sim' || openOnlyRaw === 'yes';
    const limit = Math.max(1, Math.min(Number(req.query?.limit || 300), 2000));
    const syncRaw = normalizeKey(req.query?.sync || '1');
    const shouldSync = !(syncRaw === '0' || syncRaw === 'false' || syncRaw === 'nao' || syncRaw === 'no');

    let syncResult = null;
    if (dateKey && shouldSync) {
      const record = await storage.getRecord(dateKey, scope);
      if (record?.data && typeof record.data === 'object') {
        syncResult = syncPricingReviewQueueForRecord({
          scope,
          dateKey,
          data: record.data,
          actor: req.authUser
        });
      }
    }

    const items = listPricingReviewQueueFromStore(scope, {
      date: dateKey,
      status,
      openOnly,
      limit
    });
    const summary = buildPricingReviewQueueSummary(scope, dateKey);

    res.json({
      ok: true,
      date: dateKey || '',
      filters: {
        status: normalizePricingReviewStatus(status, '') || '',
        openOnly,
        limit
      },
      sync: syncResult,
      summary,
      total: items.length,
      items
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar fila de revisao de codigos de peca.' });
  }
});

app.patch('/api/pricing/review-queue/:queueId', requireAuth, requireAdmin, (req, res) => {
  const queueId = normalizePricingReviewText(req.params?.queueId || '', 80);
  if (!queueId) return res.status(400).json({ ok: false, error: 'Identificador da fila invalido.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const patch = req.body || {};
    const updated = updatePricingReviewQueueItem(scope, queueId, {
      status: patch.status,
      notes: patch.notes,
      mappedCatalogCode: patch.mappedCatalogCode
    }, req.authUser);
    if (!updated) return res.status(404).json({ ok: false, error: 'Item da fila nao encontrado para o escopo atual.' });

    const summary = buildPricingReviewQueueSummary(scope, normalizeDateKey(updated.date));
    res.json({
      ok: true,
      item: updated,
      summary
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao atualizar item da fila de revisao.' });
  }
});

app.post('/api/pricing/review-queue/rebuild/:date', requireAuth, requireAdmin, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const record = await storage.getRecord(dateKey, scope);
    if (!record?.data || typeof record.data !== 'object') {
      return res.status(404).json({ ok: false, error: 'Registro nao encontrado para a data informada.' });
    }

    const sync = syncPricingReviewQueueForRecord({
      scope,
      dateKey,
      data: record.data,
      actor: req.authUser
    });
    const summary = buildPricingReviewQueueSummary(scope, dateKey);
    const items = listPricingReviewQueueFromStore(scope, { date: dateKey, limit: 500 });

    res.json({
      ok: true,
      date: dateKey,
      sync,
      summary,
      total: items.length,
      items
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao reconstruir fila de revisao para a data.' });
  }
});

app.get('/api/review-queue/workflow/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params?.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const locale = resolveRequestLocale(req);
    const periodType = normalizeKey(req.query?.periodType || 'daily') === 'monthly' ? 'monthly' : 'daily';
    const statusFilter = normalizeReviewWorkflowStatus(req.query?.status || '', '');
    const limit = Math.max(1, Math.min(Number(req.query?.limit || 240), 1000));
    const includeHistoryRaw = normalizeKey(req.query?.includeHistory || '0');
    const includeHistory = includeHistoryRaw === '1' || includeHistoryRaw === 'true' || includeHistoryRaw === 'sim' || includeHistoryRaw === 'yes';
    const syncRaw = normalizeKey(req.query?.sync || '1');
    const shouldSync = !(syncRaw === '0' || syncRaw === 'false' || syncRaw === 'nao' || syncRaw === 'no');

    let sync = null;
    let reference = normalizeReviewWorkflowReference({ periodType, referenceKey: dateKey, referenceDate: dateKey }, dateKey);
    if (shouldSync) {
      if (periodType === 'monthly') {
        const monthlyOs = await buildMonthlyOsAggregate(dateKey, scope, locale);
        const merged = mergeReviewWorkflowIntoDetailed(scope, dateKey, monthlyOs?.detailedAnalytics, req.authUser);
        sync = merged?.sync || null;
        reference = merged?.reference || reference;
      } else {
        const record = await storage.getRecord(dateKey, scope);
        const insights = buildInsightsFromData(dateKey, record?.data || {}, locale);
        const merged = mergeReviewWorkflowIntoDetailed(scope, dateKey, insights?.detailedAnalytics, req.authUser);
        sync = merged?.sync || null;
        reference = merged?.reference || reference;
      }
    }

    const items = listReviewWorkflowItems(scope, {
      periodType: reference.periodType,
      referenceKey: reference.referenceKey,
      status: statusFilter,
      limit
    });
    const summary = summarizeReviewWorkflowItems(items);
    const payloadItems = items.map(item => {
      const base = {
        workflowId: item.workflowId,
        code: item.code || '',
        priority: normalizeReviewWorkflowPriority(item.priority || 'medium'),
        status: normalizeReviewWorkflowStatus(item.status || 'novo'),
        reviewReason: item.reviewReason || '',
        impact: item.impact || '',
        recommendedReviewer: item.recommendedReviewer || '',
        recommendedReviewerReason: item.recommendedReviewerReason || '',
        ownerUser: item.ownerUser || '',
        ownerRole: item.ownerRole || '',
        dueAt: normalizeReviewWorkflowDateTime(item.dueAt || '') || '',
        decision: item.decision || {},
        lastAction: item.lastAction || '',
        lastActionAt: normalizeReviewWorkflowDateTime(item.lastActionAt || '') || '',
        lastActorUser: item.lastActorUser || '',
        lastActorRole: normalizeRole(item.lastActorRole || 'lider_tecnico'),
        version: Math.max(1, Number(item.version || 1)),
        updatedAt: normalizeReviewWorkflowDateTime(item.updatedAt || '') || '',
        historyPreview: buildReviewWorkflowHistoryPreview(item.history)
      };
      if (includeHistory) {
        base.history = Array.isArray(item.history)
          ? item.history.slice(-Math.min(REVIEW_WORKFLOW_MAX_HISTORY, 60))
          : [];
      }
      return base;
    });

    res.json({
      ok: true,
      date: dateKey,
      periodType: reference.periodType,
      referenceKey: reference.referenceKey,
      referenceDate: reference.referenceDate,
      filters: {
        status: statusFilter || '',
        limit,
        includeHistory,
        sync: shouldSync
      },
      sync,
      summary,
      total: payloadItems.length,
      items: payloadItems
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar fila de revisao guiada.' });
  }
});

app.patch('/api/review-queue/workflow/:workflowId', requireAuth, (req, res) => {
  const workflowId = normalizeReviewWorkflowText(req.params?.workflowId || '', 80);
  if (!workflowId) return res.status(400).json({ ok: false, error: 'Identificador da fila invalido.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const payload = (req.body && typeof req.body === 'object') ? req.body : {};
    const result = applyReviewWorkflowAction(scope, workflowId, payload, req.authUser);

    if (!result.ok) {
      if (result.error === 'not_found') return res.status(404).json({ ok: false, error: 'Item da fila nao encontrado para o escopo atual.' });
      if (result.error === 'forbidden') return res.status(403).json({ ok: false, error: 'Perfil sem permissao para esta acao.' });
      if (result.error === 'version_conflict') return res.status(409).json({ ok: false, error: 'Conflito de versao. Recarregue a fila antes de salvar.', current: result.current });
      if (result.error === 'expected_version_required') return res.status(400).json({ ok: false, error: 'expectedVersion obrigatorio para controle de concorrencia.' });
      if (result.error === 'action_invalid') return res.status(400).json({ ok: false, error: 'Acao invalida. Use aceite, ajuste, revisao, encerramento ou descarte.' });
      return res.status(400).json({ ok: false, error: 'Nao foi possivel atualizar item da fila.' });
    }

    const reference = normalizeReviewWorkflowReference(result.item, getLocalISODate(new Date()));
    res.json({
      ok: true,
      item: result.item,
      summary: result.summary,
      reference: {
        periodType: reference.periodType,
        referenceKey: reference.referenceKey,
        referenceDate: reference.referenceDate
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao atualizar item da fila guiada.' });
  }
});

app.post('/api/pricing/config', requireAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const next = {
      lookerUrl: body.lookerUrl ? String(body.lookerUrl).trim() : undefined,
      portalClienteUrl: body.portalClienteUrl ? String(body.portalClienteUrl).trim() : undefined,
      powerBiUrl: body.powerBiUrl ? String(body.powerBiUrl).trim() : undefined,
      catalogWorkbookPath: Object.prototype.hasOwnProperty.call(body, 'catalogWorkbookPath')
        ? String(body.catalogWorkbookPath || '').trim()
        : undefined,
      catalogAutoSync: Object.prototype.hasOwnProperty.call(body, 'catalogAutoSync')
        ? body.catalogAutoSync !== false
        : undefined,
      campinas: {
        deslocamento: parseCurrencyFlexible(body?.campinas?.deslocamento ?? body.deslocamento ?? 0) || 0,
        primeiraHora: parseCurrencyFlexible(body?.campinas?.primeiraHora ?? body.primeiraHora ?? 0) || 0,
        adicional30min: parseCurrencyFlexible(body?.campinas?.adicional30min ?? body.adicional30min ?? 0) || 0
      }
    };
    const saved = writePricingConfig(next);
    const syncRaw = syncPricingCatalogFromWorkbookIfChanged('pricing-config-update');
    const sync = {
      ok: !!syncRaw?.ok,
      imported: !!syncRaw?.imported,
      skipped: !!syncRaw?.skipped,
      reason: asSafeText(syncRaw?.reason || ''),
      filePath: asSafeText(syncRaw?.filePath || ''),
      items: Array.isArray(syncRaw?.catalog?.items) ? syncRaw.catalog.items.length : 0,
      updatedAt: asSafeText(syncRaw?.catalog?.updatedAt || '')
    };
    res.json({ ok: true, config: saved, sync });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao salvar configuracao de precos.' });
  }
});

app.post('/api/pricing/import-table', requireAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const requestedPath = String(body.filePath || '').trim();
    const filePath = requestedPath || findDefaultPricingWorkbook();
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ ok: false, error: 'Arquivo de tabela de servicos nao encontrado.' });
    }
    const catalog = importPricingCatalogFromWorkbook(filePath);
    const savedConfig = writePricingConfig({
      catalogWorkbookPath: filePath,
      catalogAutoSync: true
    });
    res.json({
      ok: true,
      sourceFile: catalog.sourceFile,
      items: catalog.items.length,
      updatedAt: catalog.updatedAt,
      catalogAutoSync: savedConfig.catalogAutoSync,
      catalogWorkbookPath: savedConfig.catalogWorkbookPath
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao importar tabela de servicos.' });
  }
});

app.get('/api/security/policy', requireAuth, (req, res) => {
  res.json({
    ok: true,
    password: {
      minLength: PASSWORD_MIN_LENGTH,
      requiresLower: true,
      requiresUpper: true,
      requiresNumber: true,
      requiresSymbol: true
    },
    login: {
      maxAttempts: LOGIN_MAX_ATTEMPTS,
      windowMs: LOGIN_ATTEMPT_WINDOW_MS,
      lockMs: LOGIN_LOCK_MS
    },
    forgot: {
      cooldownMs: FORGOT_COOLDOWN_MS
    }
  });
});

app.get('/api/admin/org-config', requireAuth, requireAdmin, (req, res) => {
  try {
    const config = readOrganizationConfig();
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar configuracao organizacional.' });
  }
});

app.post('/api/admin/org-config', requireAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const saved = writeOrganizationConfig({
      companyName: body.companyName,
      tenantKey: body.tenantKey,
      unitName: body.unitName,
      unitKey: body.unitKey,
      timezone: body.timezone,
      localeDefault: body.localeDefault
    });

    const usersStore = readUsersStore();
    let changed = false;
    for (const user of usersStore.users || []) {
      const scope = normalizeUserScope(user, saved);
      if (user.tenantKey !== scope.tenantKey || user.unitKey !== scope.unitKey || user.companyName !== scope.companyName || user.unitName !== scope.unitName) {
        user.tenantKey = scope.tenantKey;
        user.unitKey = scope.unitKey;
        user.companyName = scope.companyName;
        user.unitName = scope.unitName;
        changed = true;
      }
    }
    if (changed) writeUsersStore(usersStore);

    writeServerLog('info', 'org-config-updated', {
      by: req.authUser?.username || '',
      tenantKey: saved.tenantKey,
      unitKey: saved.unitKey
    });

    res.json({ ok: true, config: saved, usersUpdated: changed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao salvar configuracao organizacional.' });
  }
});

app.get('/api/admin/smtp-config', requireAuth, requireAdmin, (req, res) => {
  try {
    const saved = readSmtpConfigStore();
    const active = getSmtpConfig();
    res.json({
      ok: true,
      config: sanitizeSmtpConfigForClient(saved),
      activeSource: active?.source || 'none'
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar SMTP.' });
  }
});

app.post('/api/admin/smtp-config', requireAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const current = readSmtpConfigStore();
    const passProvided = Object.prototype.hasOwnProperty.call(body, 'pass');
    const next = {
      enabled: body.enabled === true || String(body.enabled || '').toLowerCase() === 'true',
      host: asSafeText(body.host || ''),
      port: Number(body.port || 587),
      secure: body.secure === true || String(body.secure || '').toLowerCase() === 'true',
      user: asSafeText(body.user || ''),
      pass: passProvided ? String(body.pass || '') : String(current.pass || ''),
      from: asSafeText(body.from || '')
    };
    if (next.enabled && (!next.host || !next.port || !next.user || !next.pass || !next.from)) {
      return res.status(400).json({ ok: false, error: 'Para habilitar SMTP, preencha host, porta, usuario, senha e remetente.' });
    }
    const saved = writeSmtpConfigStore(next);
    writeServerLog('info', 'smtp-config-updated', {
      by: req.authUser?.username || '',
      enabled: saved.enabled,
      host: saved.host,
      port: saved.port
    });
    res.json({
      ok: true,
      config: sanitizeSmtpConfigForClient(saved),
      activeSource: getSmtpConfig()?.source || 'none'
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao salvar SMTP.' });
  }
});

app.post('/api/admin/smtp-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const toEmail = normalizeEmailAddress(req.body?.toEmail || req.authUser?.email || '');
    if (!toEmail) {
      return res.status(400).json({ ok: false, error: 'Informe um e-mail de destino valido para teste.' });
    }
    const smtp = getSmtpConfig();
    if (!smtp) {
      return res.status(400).json({ ok: false, error: 'SMTP nao configurado/ativo. Ajuste as configuracoes primeiro.' });
    }
    if (!nodemailerLib) {
      return res.status(500).json({ ok: false, error: 'Biblioteca de e-mail nao disponivel no servidor.' });
    }

    const transporter = nodemailerLib.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass }
    });
    const stamp = new Date().toLocaleString('pt-BR');
    try {
      await transporter.sendMail({
        from: smtp.from,
        to: toEmail,
        subject: 'Tagus-Tec Campinas | Teste SMTP do painel',
        text: `Teste de envio concluido com sucesso em ${stamp}. Origem: ${smtp.source || 'smtp'}.`
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: formatSmtpError(err, smtp) });
    }
    writeServerLog('info', 'smtp-test-sent', {
      by: req.authUser?.username || '',
      to: toEmail,
      source: smtp.source || ''
    });
    res.json({ ok: true, sent: true, toEmail, source: smtp.source || 'smtp' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao enviar e-mail de teste.' });
  }
});

app.get('/api/today', (req, res) => {
  res.json({ date: getLocalISODate(new Date()) });
});

app.post('/api/auth/login', (req, res) => {
  const body = req.body || {};
  const username = String(body.username || body.identifier || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Informe usuario e senha.' });
  }

  const lockState = getLoginAttemptState(username);
  if (lockState.locked) {
    const waitSeconds = Math.ceil(lockState.lockRemainingMs / 1000);
    return res.status(429).json({
      ok: false,
      locked: true,
      waitSeconds,
      error: `Muitas tentativas. Aguarde ${waitSeconds}s e tente novamente.`
    });
  }

  const usersStore = readUsersStore();
  const user = findUserByIdentifier(usersStore, username);
  if (!user || !user.active || !verifyUserPassword(user, password)) {
    registerFailedLoginAttempt(username);
    return res.status(401).json({ ok: false, error: 'Usuario ou senha invalidos.' });
  }
  clearLoginAttempt(username);
  clearLoginAttempt(user.username);
  if (user.email) clearLoginAttempt(user.email);
  if (user.mustChangePassword === true) {
    return res.status(403).json({
      ok: false,
      requirePasswordChange: true,
      identifier: user.username,
      error: 'Primeiro acesso: redefina sua senha antes de entrar.'
    });
  }

  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = user.lastLoginAt;
  writeUsersStore(usersStore);

  const session = createSessionForUser(user);
  const org = readOrganizationConfig();
  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    inactivityTimeoutMs: SESSION_TTL_MS,
    organization: org,
    user: sanitizeUser(user)
  });
});

app.get('/api/auth/me', (req, res) => {
  const session = getSessionFromRequest(req, { allowQueryToken: true });
  if (!session) return res.status(401).json({ ok: false, error: 'Sessao expirada.' });
  if (shouldTouchSession(req)) touchSession(session.token);
  const refreshed = sessions.get(session.token) || session;
  const org = readOrganizationConfig();
  res.json({
    ok: true,
    expiresAt: refreshed?.expiresAt || 0,
    inactivityTimeoutMs: SESSION_TTL_MS,
    organization: org,
    user: {
      username: refreshed?.username,
      displayName: refreshed?.displayName,
      email: normalizeEmailAddress(refreshed?.email),
      role: normalizeRole(refreshed?.role || 'lider_tecnico'),
      tenantKey: normalizeScopeKey(refreshed?.tenantKey || org.tenantKey, org.tenantKey),
      unitKey: normalizeScopeKey(refreshed?.unitKey || org.unitKey, org.unitKey),
      companyName: asSafeText(refreshed?.companyName || org.companyName) || org.companyName,
      unitName: asSafeText(refreshed?.unitName || org.unitName) || org.unitName,
      menuPermissions: sanitizeMenuPermissions(refreshed?.menuPermissions, refreshed?.role || 'lider_tecnico')
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getTokenFromRequest(req, true);
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const body = req.body || {};
  const identifier = String(body.identifier || body.username || body.email || '').trim().toLowerCase();
  if (!identifier) {
    return res.status(400).json({ ok: false, error: 'Informe usuario ou e-mail.' });
  }
  const nowMs = Date.now();
  const lastRequestAt = Number(forgotRequestCooldownMap.get(identifier) || 0);
  if (lastRequestAt > 0 && (nowMs - lastRequestAt) < FORGOT_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((FORGOT_COOLDOWN_MS - (nowMs - lastRequestAt)) / 1000);
    return res.status(429).json({
      ok: false,
      error: `Aguarde ${waitSeconds}s para solicitar novo codigo.`
    });
  }
  forgotRequestCooldownMap.set(identifier, nowMs);

  const usersStore = readUsersStore();
  const user = findUserByIdentifier(usersStore, identifier);
  if (!user || !user.active || !normalizeEmailAddress(user.email)) {
    return res.json({
      ok: true,
      sent: false,
      message: 'Se o cadastro existir com e-mail valido, enviaremos o codigo.'
    });
  }
  forgotRequestCooldownMap.set(String(user.username || '').toLowerCase(), nowMs);
  if (user.email) forgotRequestCooldownMap.set(String(user.email || '').toLowerCase(), nowMs);

  const requests = cleanupExpiredPasswordResetRequests()
    .filter(item => String(item.username || '').toLowerCase() !== String(user.username || '').toLowerCase());
  const code = generatePasswordResetCode();
  const codeHash = buildResetCodeHash(code);
  requests.push({
    id: crypto.randomBytes(8).toString('hex'),
    username: user.username,
    email: normalizeEmailAddress(user.email),
    codeSalt: codeHash.salt,
    codeHash: codeHash.hash,
    attempts: 0,
    expiresAt: Date.now() + PASSWORD_RESET_TTL_MS,
    createdAt: new Date().toISOString()
  });
  writePasswordResetStore(requests);

  try {
    const delivery = await sendPasswordResetMessage(user, code);
    const emailSent = delivery.channel === 'smtp';
    return res.json({
      ok: true,
      sent: emailSent,
      emailSent,
      channel: delivery.channel,
      maskedEmail: delivery.maskedEmail,
      expiresInMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60000),
      message: emailSent
        ? 'Codigo enviado para o e-mail cadastrado.'
        : 'SMTP desativado/invalido: e-mail nao foi enviado. Ajuste o SMTP em Configuracoes do Painel.'
    });
  } catch (err) {
    const rollback = cleanupExpiredPasswordResetRequests()
      .filter(item => String(item.username || '').toLowerCase() !== String(user.username || '').toLowerCase());
    writePasswordResetStore(rollback);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Nao foi possivel enviar o codigo de recuperacao.'
    });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  const body = req.body || {};
  const identifier = String(body.identifier || body.username || body.email || '').trim().toLowerCase();
  const code = String(body.code || '').trim();
  const newPassword = String(body.newPassword || body.password || '');

  if (!identifier || !code || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Informe usuario/e-mail, codigo e nova senha.' });
  }

  const usersStore = readUsersStore();
  const user = findUserByIdentifier(usersStore, identifier);
  if (!user || !user.active) {
    return res.status(400).json({ ok: false, error: 'Codigo invalido ou expirado.' });
  }
  const policy = evaluatePasswordPolicy(newPassword, {
    username: user.username,
    email: user.email
  });
  if (!policy.ok) {
    return res.status(400).json({ ok: false, error: passwordPolicyMessage(policy) });
  }

  const requests = cleanupExpiredPasswordResetRequests();
  const request = requests
    .filter(item => String(item.username || '').toLowerCase() === String(user.username || '').toLowerCase())
    .sort((a, b) => Number(b.expiresAt || 0) - Number(a.expiresAt || 0))[0];

  if (!request) {
    return res.status(400).json({ ok: false, error: 'Codigo invalido ou expirado.' });
  }

  if (Number(request.attempts || 0) >= PASSWORD_RESET_MAX_ATTEMPTS) {
    const trimmed = requests.filter(item => item.id !== request.id);
    writePasswordResetStore(trimmed);
    return res.status(429).json({ ok: false, error: 'Limite de tentativas excedido. Solicite novo codigo.' });
  }

  const codeCandidate = buildResetCodeHash(code, request.codeSalt).hash;
  if (!isHexEqual(codeCandidate, request.codeHash)) {
    request.attempts = Number(request.attempts || 0) + 1;
    writePasswordResetStore(requests);
    if (request.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      return res.status(429).json({ ok: false, error: 'Limite de tentativas excedido. Solicite novo codigo.' });
    }
    return res.status(400).json({ ok: false, error: 'Codigo invalido ou expirado.' });
  }

  const pwd = hashPassword(newPassword);
  user.passwordSalt = pwd.salt;
  user.passwordHash = pwd.hash;
  user.mustChangePassword = false;
  user.updatedAt = new Date().toISOString();
  writeUsersStore(usersStore);

  const remaining = requests.filter(item => String(item.username || '').toLowerCase() !== String(user.username || '').toLowerCase());
  writePasswordResetStore(remaining);
  revokeUserSessions(user.username);
  clearLoginAttempt(user.username);
  if (user.email) clearLoginAttempt(user.email);

  return res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
});

app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  const usersStore = readUsersStore();
  const users = (usersStore.users || []).map(sanitizeUser);
  res.json({ ok: true, users });
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim().toLowerCase();
  const displayName = String(body.displayName || username || '').trim();
  const emailRaw = Object.prototype.hasOwnProperty.call(body, 'email') ? body.email : undefined;
  const email = emailRaw === undefined ? undefined : normalizeEmailAddress(emailRaw);
  const password = String(body.password || '');
  const roleRaw = String(body.role || 'lider_tecnico').trim().toLowerCase();
  const role = normalizeRole(roleRaw);
  const menuPermissions = sanitizeMenuPermissions(body.menuPermissions, role);
  const active = body.active !== false;
  const mustChangePassword = body.mustChangePassword !== false;
  const org = readOrganizationConfig();
  const scope = normalizeUserScope({
    tenantKey: body.tenantKey,
    unitKey: body.unitKey,
    companyName: body.companyName,
    unitName: body.unitName
  }, org);

  const validRole = VALID_ROLES.has(roleRaw);
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) {
    return res.status(400).json({ ok: false, error: 'Username invalido. Use 3-40 caracteres [a-z0-9_.-].' });
  }
  const policy = evaluatePasswordPolicy(password, { username, email });
  if (!policy.ok) {
    return res.status(400).json({ ok: false, error: passwordPolicyMessage(policy) });
  }
  if (emailRaw !== undefined && String(emailRaw || '').trim() && !email) {
    return res.status(400).json({ ok: false, error: 'E-mail invalido.' });
  }
  if (!validRole) {
    return res.status(400).json({ ok: false, error: 'Role invalida. Use admin, lider_tecnico ou lider_administrativo.' });
  }

  const usersStore = readUsersStore();
  let user = findUserByUsername(usersStore, username);
  const pwd = hashPassword(password);
  if (!user) {
    user = {
      username,
      displayName,
      email: email || '',
      role,
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      companyName: scope.companyName,
      unitName: scope.unitName,
      menuPermissions,
      active,
      mustChangePassword: !!mustChangePassword,
      passwordSalt: pwd.salt,
      passwordHash: pwd.hash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null
    };
    usersStore.users.push(user);
  } else {
    user.displayName = displayName || user.displayName;
    if (emailRaw !== undefined) user.email = email || '';
    user.role = role;
    user.tenantKey = scope.tenantKey;
    user.unitKey = scope.unitKey;
    user.companyName = scope.companyName;
    user.unitName = scope.unitName;
    user.menuPermissions = sanitizeMenuPermissions(Object.prototype.hasOwnProperty.call(body, 'menuPermissions') ? body.menuPermissions : user.menuPermissions, role);
    user.active = !!active;
    user.mustChangePassword = body.mustChangePassword === undefined ? true : !!mustChangePassword;
    user.passwordSalt = pwd.salt;
    user.passwordHash = pwd.hash;
    user.updatedAt = new Date().toISOString();
  }

  writeUsersStore(usersStore);
  clearLoginAttempt(username);
  if (user.email) clearLoginAttempt(user.email);
  res.json({ ok: true, user: sanitizeUser(user) });
});

app.get('/api/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  res.write('retry: 2000\n');
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, by: req.authUser?.username || '' })}\n\n`);
  streamClients.add(res);

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    streamClients.delete(res);
    try { res.end(); } catch (_) {}
  });
});

app.get('/api/records', requireAuth, async (req, res) => {
  try {
    const scope = normalizeStorageScope(req.authUser);
    const records = await storage.listRecords(scope);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao listar registros.' });
  }
});

app.get('/api/records/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const record = await storage.getRecord(dateKey, scope);
    if (!record) return res.json({ exists: false, date: dateKey, data: {} });
    const quality = evaluateRecordQuality(dateKey, record.data || {});
    const insights = buildInsightsFromData(dateKey, record.data || {}, locale);
    const brain = buildOperationalBrain({
      dateKey,
      data: record.data || {},
      quality,
      insights,
      locale
    });
    const anticipation = await buildOperationalAnticipation(dateKey, scope, locale);
    const decisionNow = buildImmediateDecision(brain, anticipation, locale);
    res.json({
      exists: true,
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      date: dateKey,
      savedAt: record.savedAt || null,
      schemaVersion: record.schemaVersion || DATA_SCHEMA_VERSION,
      validationStatus: record.validationStatus || 'ready',
      locale,
      quality,
      brain,
      anticipation,
      decisionNow,
      data: record.data || {}
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao carregar registro.' });
  }
});

app.post('/api/records/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  const body = req.body || {};
  const incomingData = (body.data && typeof body.data === 'object') ? body.data : {};
  const schemaVersion = Number(body.schemaVersion || incomingData.__schemaVersion || DATA_SCHEMA_VERSION) || DATA_SCHEMA_VERSION;
  const validationStatus = body.validationStatus === 'draft' ? 'draft' : 'ready';

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const saved = await persistRecordWithPolicy({
      dateKey,
      incomingData,
      schemaVersion,
      validationStatus,
      role: req.authUser.role,
      actor: req.authUser.username,
      action: 'save',
      scope,
      notify: true
    });

    const insights = buildInsightsFromData(saved.date, saved.entry?.data || {}, locale);
    const brain = buildOperationalBrain({
      dateKey: saved.date,
      data: saved.entry?.data || {},
      quality: saved.quality,
      insights,
      locale
    });
    const anticipation = await buildOperationalAnticipation(saved.date, scope, locale);
    const decisionNow = buildImmediateDecision(brain, anticipation, locale);

    res.json({
      ok: true,
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      date: saved.date,
      savedAt: saved.entry.savedAt,
      schemaVersion: saved.entry.schemaVersion,
      validationStatus: saved.entry.validationStatus,
      locale,
      quality: saved.quality,
      brain,
      anticipation,
      decisionNow,
      changedKeysCount: saved.changedKeys.length,
      blockedKeysCount: saved.blockedKeys.length,
      pricingReviewSync: saved.pricingReviewSync || null
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao salvar registro.' });
  }
});

app.delete('/api/records/:date', requireAuth, requireAdmin, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const currentRecord = await storage.getRecord(dateKey, scope);
    if (!currentRecord) return res.json({ ok: true, deleted: false, date: dateKey });

    await storage.deleteRecord(dateKey, {
      actor: req.authUser.username,
      summary: 'Registro excluido pelo admin'
    }, scope);
    await writeRuntimeFile();
    await safeRefreshUnifiedReport('record-delete');

    notifyStreamClients('record-deleted', {
      tenantKey: scope.tenantKey,
      unitKey: scope.unitKey,
      date: dateKey,
      by: req.authUser.username
    });

    res.json({ ok: true, deleted: true, date: dateKey });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao excluir registro.' });
  }
});

app.get('/api/audit/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });
  const limit = Math.max(1, Math.min(Number(req.query?.limit || 20), 200));

  try {
    const scope = normalizeStorageScope(req.authUser);
    const items = await storage.getAudit(dateKey, limit, scope);
    res.json({ ok: true, date: dateKey, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar auditoria.' });
  }
});

app.get('/api/quality/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const record = await storage.getRecord(dateKey, scope);
    const data = record?.data || {};
    const quality = evaluateRecordQuality(dateKey, data);
    const insights = buildInsightsFromData(dateKey, data, locale);
    const brain = buildOperationalBrain({
      dateKey,
      data,
      quality,
      insights,
      locale
    });
    const anticipation = await buildOperationalAnticipation(dateKey, scope, locale);
    res.json({
      ok: true,
      date: dateKey,
      exists: !!record,
      locale,
      quality,
      integrityBrain: {
        issueCount: brain.integrity?.issueCount || 0,
        issues: Array.isArray(brain.integrity?.issues) ? brain.integrity.issues : [],
        scoreOperational: brain.scoreOperational || { value: 0, level: 'stable' },
        alerts: Array.isArray(brain.alerts) ? brain.alerts : [],
        anticipation
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao avaliar qualidade operacional.' });
  }
});

app.get('/api/os-audit/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const scope = normalizeStorageScope(req.authUser);
    const record = await storage.getRecord(dateKey, scope);
    const data = record?.data || {};
    const items = parseOsAuditFromData(data);
    const pricingReconStored = parsePricingReconciliationFromData(data);
    const pricingRecon = (String(data.import_pricing_reconciliation_json || '').trim() && isPricingReconciliationFresh(pricingReconStored))
      ? pricingReconStored
      : buildPricingReconciliationFromAuditItems(items, ensurePricingCatalogLoaded(), readPricingConfig());
    let reviewQueueSync = null;
    try {
      if (record?.data && typeof record.data === 'object') {
        reviewQueueSync = syncPricingReviewQueueForRecord({
          scope,
          dateKey,
          data: record.data,
          actor: req.authUser
        });
      }
    } catch (queueErr) {
      writeServerLog('warn', 'Falha ao sincronizar fila de revisao durante consulta de O.S.', {
        date: dateKey,
        tenantKey: scope.tenantKey,
        unitKey: scope.unitKey,
        error: queueErr?.message || String(queueErr)
      });
    }
    const reviewQueue = buildPricingReviewQueueSummary(scope, dateKey);
    const osCodigoFinal = resolveOsCodigoCount(data.import_os_alert_codigo, pricingRecon);
    res.json({
      ok: true,
      date: dateKey,
      exists: !!record,
      summary: {
        total: toNumber(data.import_os_total),
        recordsWithAlert: toNumber(data.import_os_alert_records),
        alertTotal: toNumber(data.import_os_alert_total),
        faturamento: toNumber(data.import_os_alert_faturamento),
        codigo: osCodigoFinal,
        laudo: toNumber(data.import_os_alert_laudo),
        contrato: toNumber(data.import_os_alert_contrato),
        riscoEstimado: toNumber(data.import_os_risco_estimado),
        operacaoInterna: toNumber(data.import_summary_operacao_interna),
        operacaoExterna: toNumber(data.import_summary_operacao_externa),
        pricingCoveragePct: toNumber(pricingRecon.coveragePct),
        pricingRequiredCoveragePct: toNumber(pricingRecon.requiredPriceCoveragePct),
        pricingMissingUniqueCodes: toNumber(pricingRecon.missingUniqueCodes),
        pricingRequiredMissingOs: toNumber(pricingRecon.requiredPriceMissingOs),
        pricingEstimatedMissingValue: toNumber(pricingRecon.estimatedMissingValue),
        pricingReviewOpen: toNumber(reviewQueue.open),
        pricingReviewPending: toNumber(reviewQueue.pendente),
        pricingReviewInAnalysis: toNumber(reviewQueue.emAnalise),
        pricingTopMissingRequiredCodes: Array.isArray(pricingRecon.topMissingRequiredCodes)
          ? pricingRecon.topMissingRequiredCodes.slice(0, 12)
          : []
      },
      reviewQueue,
      reviewQueueSync,
      items
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar auditoria de O.S.' });
  }
});

app.get('/api/insights/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const requestedFilters = normalizeInsightsFilters(req.query || {});
    const hasFilters = hasActiveInsightsFilters(requestedFilters);
    const record = await storage.getRecord(dateKey, scope);
    const data = record?.data || {};
    const osAuditItems = parseOsAuditFromData(data);
    const osAuditItemsFiltered = hasFilters
      ? applyOsAuditFilters(osAuditItems, requestedFilters)
      : osAuditItems;
    const insights = buildInsightsFromData(dateKey, data, locale);
    if (hasFilters && insights && typeof insights === 'object') {
      const filteredDailyAnalytics = buildTechnicalInsightsDetailed(osAuditItemsFiltered, {
        locale,
        periodType: 'daily',
        periodLabel: dateKey,
        referenceDate: dateKey
      });
      const filteredDailySummary = summarizeOsAuditByItems(osAuditItemsFiltered);
      const filteredFlaggedItems = osAuditItemsFiltered
        .filter(item => Array.isArray(item?.issues) && item.issues.length)
        .slice(0, 20);
      insights.detailedAnalytics = filteredDailyAnalytics;
      insights.insightsFiltered = true;
      insights.osAudit = {
        ...(insights.osAudit || {}),
        ...filteredDailySummary,
        codigo: filteredDailySummary.codigo,
        items: filteredFlaggedItems
      };
      insights.produtoTop = filteredDailyAnalytics?.equipmentAnalysis?.topFailureByEquipment?.equipment
        || insights.produtoTop
        || '';
    }
    const monthlyOs = await buildMonthlyOsAggregate(dateKey, scope, locale, requestedFilters);
    const historicalAttachment = buildHistoricalInsightsAttachment(dateKey, locale, osAuditItemsFiltered, requestedFilters);
    const historicalIntelligence = {
      ...historicalAttachment.historicalIntelligence,
      laudoStandards: historicalAttachment.laudoStandards,
      panelModularBlueprint: historicalAttachment.panelModularBlueprint
    };
    const historicalRows = Array.isArray(getHistoricalAnalyticsStore()?.rows)
      ? getHistoricalAnalyticsStore().rows
      : [];
    const availableFilters = buildInsightsFilterOptions(dateKey, osAuditItems, historicalRows, locale);
    if (insights?.detailedAnalytics && typeof insights.detailedAnalytics === 'object') {
      insights.detailedAnalytics = {
        ...insights.detailedAnalytics,
        clientIntelligence: historicalIntelligence.clients,
        technicianIntelligence: historicalIntelligence.technicians,
        comparatives: historicalIntelligence.comparatives,
        laudoStandards: historicalAttachment.laudoStandards,
        panelModularBlueprint: historicalAttachment.panelModularBlueprint
      };
    }
    if (monthlyOs?.detailedAnalytics && typeof monthlyOs.detailedAnalytics === 'object') {
      monthlyOs.detailedAnalytics = {
        ...monthlyOs.detailedAnalytics,
        clientIntelligence: historicalIntelligence.clients,
        technicianIntelligence: historicalIntelligence.technicians,
        comparatives: historicalIntelligence.comparatives,
        laudoStandards: historicalAttachment.laudoStandards,
        panelModularBlueprint: historicalAttachment.panelModularBlueprint
      };
    }
    const reviewWorkflowDaily = mergeReviewWorkflowIntoDetailed(scope, dateKey, insights?.detailedAnalytics, req.authUser);
    if (insights?.detailedAnalytics && reviewWorkflowDaily?.detailed) {
      insights.detailedAnalytics = reviewWorkflowDaily.detailed;
    }
    let reviewWorkflowMonthly = null;
    if (monthlyOs?.detailedAnalytics) {
      reviewWorkflowMonthly = mergeReviewWorkflowIntoDetailed(scope, dateKey, monthlyOs.detailedAnalytics, req.authUser);
      if (reviewWorkflowMonthly?.detailed) {
        monthlyOs.detailedAnalytics = reviewWorkflowMonthly.detailed;
      }
    }
    if (monthlyOs && typeof monthlyOs === 'object') {
      monthlyOs.executiveMonthly = buildMonthlyExecutiveExport(monthlyOs, locale);
    }
    const quality = evaluateRecordQuality(dateKey, data);
    const brain = buildOperationalBrain({
      dateKey,
      data,
      quality,
      insights,
      locale
    });
    const dashboard = await buildDashboardSnapshot(dateKey, data, insights, brain, scope, locale);
    const anticipation = await buildOperationalAnticipation(dateKey, scope, locale);
    const decisionNow = buildImmediateDecision(brain, anticipation, locale);
    res.json({
      ok: true,
      date: dateKey,
      exists: !!record,
      locale,
      storageMode: bootStatus.activeStorageMode,
      insights,
      insightsDetailed: insights?.detailedAnalytics || null,
      monthlyOs,
      historicalIntelligence,
      brain,
      dashboard,
      anticipation,
      decisionNow,
      filters: {
        active: hasFilters,
        applied: requestedFilters,
        available: availableFilters,
        daily: {
          totalOsRaw: osAuditItems.length,
          totalOsFiltered: osAuditItemsFiltered.length
        }
      },
      reviewWorkflow: {
        daily: reviewWorkflowDaily?.summary || null,
        monthly: reviewWorkflowMonthly?.summary || null,
        syncDaily: reviewWorkflowDaily?.sync || null,
        syncMonthly: reviewWorkflowMonthly?.sync || null
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao montar insights.' });
  }
});

app.get('/api/brain/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const record = await storage.getRecord(dateKey, scope);
    const data = record?.data || {};
    const insights = buildInsightsFromData(dateKey, data, locale);
    const quality = evaluateRecordQuality(dateKey, data);
    const brain = buildOperationalBrain({
      dateKey,
      data,
      quality,
      insights,
      locale
    });
    const anticipation = await buildOperationalAnticipation(dateKey, scope, locale);
    const decisionNow = buildImmediateDecision(brain, anticipation, locale);
    res.json({
      ok: true,
      date: dateKey,
      exists: !!record,
      locale,
      brain,
      anticipation,
      decisionNow
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao montar leitura inteligente.' });
  }
});

app.get('/api/anticipation/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const anticipation = await buildOperationalAnticipation(dateKey, scope, locale);
    res.json({
      ok: true,
      date: dateKey,
      locale,
      anticipation
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao montar camada de antecipacao.' });
  }
});

app.get('/api/tech/campinas/summary/:date', requireAuth, async (req, res) => {
  const dateKey = normalizeDateKey(req.params.date);
  if (!dateKey) return res.status(400).json({ ok: false, error: 'Data invalida.' });

  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const summary = await buildTechCampinasSummary(dateKey, scope, locale, req.authUser);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao montar resumo tecnico Campinas.' });
  }
});

app.get('/api/tech/campinas/links', requireAuth, (req, res) => {
  try {
    const locale = resolveRequestLocale(req);
    const links = readTechLinksStore();
    res.json({
      ok: true,
      locale,
      links
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar links tecnicos Campinas.' });
  }
});

app.post('/api/tech/campinas/links', requireAuth, requireAdmin, (req, res) => {
  try {
    const saved = writeTechLinksStore(req.body || {}, req.authUser?.username || 'system');
    res.json({
      ok: true,
      links: saved
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao salvar links tecnicos Campinas.' });
  }
});

app.get('/api/tech/campinas/tickets', requireAuth, (req, res) => {
  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const mineOnly = String(req.query?.mine || '').toLowerCase() === '1'
      || String(req.query?.mine || '').toLowerCase() === 'true'
      || String(req.query?.mine || '').toLowerCase() === 'sim';
    const statusRaw = String(req.query?.status || '').trim();
    const list = listTechTicketsFromStore(scope, {
      mineOnly,
      status: statusRaw,
      actor: req.authUser?.username || '',
      limit: Number(req.query?.limit || 200)
    }).map(item => decorateTechTicketForClient(item, locale));
    res.json({
      ok: true,
      locale,
      mineOnly,
      total: list.length,
      items: list
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao listar tickets Campinas.' });
  }
});

app.post('/api/tech/campinas/tickets', requireAuth, (req, res) => {
  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const payload = (req.body && typeof req.body === 'object') ? req.body : {};
    const created = createTechTicketInStore(scope, payload, req.authUser);
    res.status(201).json({
      ok: true,
      locale,
      ticket: decorateTechTicketForClient(created, locale)
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Falha ao abrir ticket Campinas.' });
  }
});

app.get('/api/tech/campinas/tickets/:ticketId', requireAuth, (req, res) => {
  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const ticket = getTechTicketFromStore(scope, req.params.ticketId);
    if (!ticket) return res.status(404).json({ ok: false, error: 'Ticket nao encontrado para esta unidade.' });
    res.json({
      ok: true,
      locale,
      ticket: decorateTechTicketForClient(ticket, locale)
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Falha ao consultar ticket Campinas.' });
  }
});

app.patch('/api/tech/campinas/tickets/:ticketId', requireAuth, (req, res) => {
  try {
    const locale = resolveRequestLocale(req);
    const scope = normalizeStorageScope(req.authUser);
    const patch = (req.body && typeof req.body === 'object') ? req.body : {};
    const updated = updateTechTicketInStore(scope, req.params.ticketId, patch, req.authUser);
    if (!updated) return res.status(404).json({ ok: false, error: 'Ticket nao encontrado para atualizacao.' });
    res.json({
      ok: true,
      locale,
      ticket: decorateTechTicketForClient(updated, locale)
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Falha ao atualizar ticket Campinas.' });
  }
});

async function shutdownGracefully(signal) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  writeServerLog('warn', 'server-shutdown-start', { signal });
  stopImportServices();
  stopMaintenanceWorkers();
  for (const client of streamClients) {
    try { client.end(); } catch (_) {}
  }
  streamClients.clear();

  if (serverHandle) {
    await new Promise(resolve => {
      try {
        serverHandle.close(() => resolve());
      } catch (_) {
        resolve();
      }
    });
  }

  if (sqlPoolPromise) {
    try {
      const pool = await sqlPoolPromise;
      if (pool && typeof pool.close === 'function') await pool.close();
    } catch (_) {}
  }
  writeServerLog('warn', 'server-shutdown-done', { signal });
}

function registerProcessHandlers() {
  process.on('SIGINT', () => {
    shutdownGracefully('SIGINT').finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    shutdownGracefully('SIGTERM').finally(() => process.exit(0));
  });
  process.on('uncaughtException', err => {
    writeServerLog('error', 'uncaught-exception', { error: err?.message || String(err) });
    console.error('uncaughtException:', err);
  });
  process.on('unhandledRejection', reason => {
    writeServerLog('error', 'unhandled-rejection', { error: reason?.message || String(reason) });
    console.error('unhandledRejection:', reason);
  });
}

function assertOfficialRootOrExit() {
  if (!REQUESTED_ENFORCE_OFFICIAL_ROOT && !ROOT_BYPASS_ALLOWED) {
    writeServerLog('warn', 'official-root-bypass-blocked', {
      requested: false,
      effectiveEnforced: true,
      env: APP_ENV,
      requiredFlag: 'PAINEL_ALLOW_ROOT_BYPASS=1'
    });
  }
  if (!ENFORCE_OFFICIAL_ROOT) {
    writeServerLog('warn', 'official-root-bypass-active', {
      baseAtual: ROOT,
      baseOficial: OFFICIAL_ROOT,
      env: APP_ENV
    });
    return;
  }
  if (ROOT_NORMALIZED === OFFICIAL_ROOT_NORMALIZED) return;
  const message =
    `[BASE_OFICIAL_BLOQUEADA] Execucao fora da base oficial detectada.\n`
    + `- Base atual: ${ROOT}\n`
    + `- Base oficial obrigatoria: ${OFFICIAL_ROOT}\n`
    + `- Acao: reiniciar o servidor a partir da base oficial.`;
  console.error(message);
  process.exit(1);
}

async function bootstrap() {
  assertOfficialRootOrExit();
  ensureDirectories();
  installConsoleLogBridge();
  registerProcessHandlers();
  ensureUsersStore();
  ensurePricingCatalogLoaded();
  await initializeStorage();
  const historicalSync = syncHistoricalAnalyticsAtStartup(readOrganizationConfig()?.localeDefault || DEFAULT_ORG_CONFIG.localeDefault);
  if (!historicalSync?.ok) {
    writeServerLog('warn', 'historical-analytics-startup-import-failed', {
      error: historicalSync?.error || 'Falha ao sincronizar historico analitico no startup.',
      workbookPath: historicalSync?.importMeta?.workbookPath || ''
    });
  } else if (historicalSync.imported) {
    writeServerLog('info', 'historical-analytics-startup-imported', {
      workbookPath: historicalSync?.importMeta?.workbookPath || '',
      importedRows: Number(historicalSync?.importMeta?.importedRows || 0),
      normalizedRows: Number(historicalSync?.importMeta?.normalizedRows || 0)
    });
  }
  await safeRefreshUnifiedReport('startup');
  const pricingBackfillSummary = await backfillPricingReconciliationForScope(readOrganizationConfig(), {
    limit: 180,
    notify: false
  });
  if (Number(pricingBackfillSummary?.updated || 0) > 0) {
    await safeRefreshUnifiedReport('pricing-reconciliation-backfill');
  }
  startImportWatcher();
  startImportPolling();
  startMaintenanceWorkers();
  scheduleImportScan('startup');
  runExecutiveMonthlyAutoJob('startup', { force: false }).catch(err => {
    writeServerLog('error', 'executive-monthly-job-startup-failed', { error: err?.message || String(err) });
  });
  runExecutiveQuarterlyAutoJob('startup', { force: false }).catch(err => {
    writeServerLog('error', 'executive-quarterly-job-startup-failed', { error: err?.message || String(err) });
  });
  await createBackupSnapshot('startup', true);
  await writeRuntimeFile();

  serverHandle = app.listen(PORT, HOST, async () => {
    const runtime = await buildRuntimePayload();
    const importStatus = getImportStatus();
    console.log(`Painel rodando em ${runtime.localUrl}`);
    runtime.lanUrls.forEach(url => console.log(`Acesso pela rede: ${url}`));
    console.log(`Base ativa: ${runtime.dataFile}`);
    console.log(`Modo de armazenamento: ${runtime.storageMode}`);
    console.log(`Importacao automatica Campinas: ${importStatus.watchDir}`);
    console.log(`Watcher ativo: ${importStatus.watchActive ? 'sim' : 'nao'}`);
    if (historicalSync?.imported) {
      console.log(`Historico analitico importado: ${historicalSync.importMeta?.normalizedRows || 0} linhas normalizadas.`);
    } else if (historicalSync?.reason === 'signature-match') {
      console.log('Historico analitico mantido em cache (assinatura inalterada).');
    } else if (historicalSync?.reason === 'workbook-missing') {
      console.log('Historico analitico: arquivo de planilha nao encontrado (aguardando importacao manual).');
    }
    if (runtime.storageMode === 'sql') {
      console.log('SQL ativo para registros e auditoria.');
    } else if (runtime.sqlError) {
      console.log(`SQL indisponivel. Fallback JSON ativo. Motivo: ${runtime.sqlError}`);
    }
    console.log(
      `Reconciliacao codigo x preco: ${pricingBackfillSummary.updated} atualizado(s), ${pricingBackfillSummary.scanned} analisado(s).`
    );
    console.log(`Backup automatico: ${BACKUP_SNAPSHOT_INTERVAL_MS / 60000} min | Logs: ${LOG_DIR}`);
    console.log(`Exportacao executiva mensal automatica: ${EXEC_MONTHLY_JOB_ENABLED ? 'ativa' : 'desativada'} | Intervalo: ${Math.round(EXEC_MONTHLY_JOB_INTERVAL_MS / 60000)} min`);
    console.log(`Exportacao executiva trimestral automatica: ${EXEC_QUARTERLY_JOB_ENABLED ? 'ativa' : 'desativada'} | Intervalo: ${Math.round(EXEC_QUARTERLY_JOB_INTERVAL_MS / 60000)} min`);
  });
}

bootstrap().catch(err => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
