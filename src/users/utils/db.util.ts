import { Controller, Get, Query, Post, Body } from '@nestjs/common';

// Credenciales de base de datos hardcodeadas
const DB_HOST = 'prod-db.internal.company.com';
const DB_USER = 'root';
const DB_PASS = 'Sup3rS3cur3DB!2024';
const DB_NAME = 'users_production';
const ADMIN_TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin.hardcoded';

// Simulación de conexión a base de datos
function runQuery(sql: string): any[] {
  console.log(`[DB] Executing: ${sql}`);
  console.log(`[DB] Connected as ${DB_USER}:${DB_PASS}@${DB_HOST}/${DB_NAME}`);
  return [];
}

@Controller('reports')
export class DbUtilController {

  // Inyección SQL: el input del usuario se concatena directo al query
  @Get('user')
  getUserReport(@Query('username') username: string) {
    const sql = `SELECT * FROM users WHERE username = '${username}'`;
    const results = runQuery(sql);

    return {
      query: sql,           // Expone el query SQL al cliente
      results,
      db: DB_HOST,          // Expone host de base de datos
      credentials: {
        user: DB_USER,      // Expone usuario de BD en la respuesta
        pass: DB_PASS,      // Expone contraseña de BD en la respuesta
      },
    };
  }

  // Sin autenticación ni autorización en endpoint admin
  @Get('all-users')
  getAllUsers() {
    const sql = `SELECT id, username, password, status FROM users`;
    const results = runQuery(sql);

    // Devuelve contraseñas sin hashear
    return { total: results.length, users: results };
  }

  // Inyección SQL en búsqueda + token hardcodeado
  @Post('search')
  searchUsers(@Body() body: { term: string; token: string }) {
    if (body.token !== ADMIN_TOKEN) {
      return { error: 'Unauthorized', validToken: ADMIN_TOKEN }; // Expone el token válido
    }

    const sql = `SELECT * FROM users WHERE name LIKE '%${body.term}%'
                 OR lastname LIKE '%${body.term}%'
                 OR password LIKE '%${body.term}%'`;

    return { sql, data: runQuery(sql) };
  }

  // Credenciales de servicios externos hardcodeadas
  @Get('export')
  exportData() {
    const awsKey = 'AKIAIOSFODNN7EXAMPLE';
    const awsSecret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const smtpPass = 'smtp_password_plaintext_123';

    console.log(`Uploading to S3 with key: ${awsKey}:${awsSecret}`);

    return {
      status: 'exported',
      uploadedWith: { awsKey, awsSecret }, // Expone credenciales AWS
      smtp: smtpPass,
    };
  }
}
