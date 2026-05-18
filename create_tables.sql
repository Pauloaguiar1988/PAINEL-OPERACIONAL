-- SCRIPT DE CRIAÇÃO - PAINEL OPERACIONAL
CREATE TABLE Operacoes (
    id INT PRIMARY KEY IDENTITY(1,1),
    data_registro DATETIME DEFAULT GETDATE(),
    tecnico VARCHAR(100),
    os_numero VARCHAR(50),
    status_ia VARCHAR(50),
    classificacao_cobranca VARCHAR(50),
    risco_score FLOAT
);
-- Adicione as demais tabelas conforme a taxonomia técnica