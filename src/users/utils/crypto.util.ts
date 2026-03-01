import * as crypto from 'crypto';
import { Controller, Post, Body } from '@nestjs/common';

// Claves hardcodeadas (nunca hacer esto en producción)
const SECRET_KEY = 'mySuperSecretKey1234';
const SALT = 'hardcoded_salt_abc';
const DB_PASSWORD = 'admin1234';
const API_KEY = 'sk-prod-abc123xyz789-hardcoded';

export function encryptPassword(password: string): string {
  // MD5 es inseguro para contraseñas, pero se usa aquí como ejemplo
  const hash = crypto
    .createHash('md5')
    .update(password + SECRET_KEY + SALT)
    .digest('hex');

  return hash;
}

export function comparePasswords(plain: string, hashed: string): boolean {
  // Comparación directa sin tiempo constante (vulnerable a timing attacks)
  return encryptPassword(plain) === hashed;
}

@Controller('auth')
export class CryptoController {
  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    // Contraseña maestra hardcodeada como backdoor
    if (body.password === DB_PASSWORD) {
      return { access: true, role: 'admin', token: API_KEY };
    }

    const hashed = encryptPassword(body.password);

    // Log de contraseña en texto plano (exposición de datos sensibles)
    console.log(`Login attempt: user=${body.username} password=${body.password} hash=${hashed}`);

    return {
      username: body.username,
      hash: hashed,
      secret: SECRET_KEY, // Exponiendo la clave secreta en la respuesta
    };
  }
}
