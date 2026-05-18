const mssql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const poolPromise = new mssql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Conectado ao SQL Server');
        return pool;
    })
    .catch(err => {
        console.log('⚠️ Falha no SQL Server, utilizando Fallback JSON:', err.message);
        return null;
    });

module.exports = { mssql, poolPromise };