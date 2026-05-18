const MASTER_USER = 'admin_campinas';

const masterUserPayload = {
    username: MASTER_USER,
    displayName: 'Paulo Aguiar',
    role: 'admin',
    perfil: 'admin',
    menuPermissions: {
        painel: true,
        operacao: true,
        agenda: true,
        tecnico: true,
        tecnico_campinas: true,
        administrativo: true,
        executivo: true,
        negocio: true,
        melhorias: true,
        historico: true
    }
};

const authController = {
    login: (req, res) => {
        const body = req.body || {};
        const username = String(body.usuario || body.username || body.identifier || '').trim().toLowerCase();

        console.log('Attempt login:', username);

        if (username === MASTER_USER) {
            return res.json({
                ok: true,
                sucesso: true,
                token: 'codex_master_token_2026',
                expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                inactivityTimeoutMs: 60 * 60 * 1000,
                user: masterUserPayload,
                perfil: 'admin',
                nome: 'Paulo Aguiar'
            });
        }

        res.status(401).json({
            ok: false,
            sucesso: false,
            error: 'Falha de autenticacao',
            mensagem: 'Falha de autenticacao'
        });
    },

    me: (req, res) => {
        res.json({
            ok: true,
            user: masterUserPayload,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            inactivityTimeoutMs: 60 * 60 * 1000
        });
    },

    logout: (req, res) => {
        res.json({ ok: true, sucesso: true });
    }
};

module.exports = authController;
