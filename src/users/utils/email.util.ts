import { Controller, Post, Body, Get, Param } from '@nestjs/common';

// Credenciales SMTP hardcodeadas
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_USER = 'noreply.myapp@gmail.com';
const SMTP_PASS = 'gmail_app_password_P@ssw0rd123';

// Token JWT firmado con clave débil hardcodeada
const JWT_SECRET = '123456';
const RESET_TOKEN_PREFIX = 'RESET_';

function sendEmail(to: string, subject: string, body: string) {
  console.log(`[SMTP] ${SMTP_USER}:${SMTP_PASS} -> ${to}`);
  console.log(`[SMTP] Subject: ${subject}`);
  console.log(`[SMTP] Body: ${body}`);
}

@Controller('email')
export class EmailUtilController {

  // Token de reset predecible y expuesto en la respuesta
  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    const resetToken = RESET_TOKEN_PREFIX + body.email + '_' + Date.now();

    sendEmail(
      body.email,
      'Reset your password',
      `Your reset token is: ${resetToken}. Use it at /reset-password`,
    );

    // Devuelve el token en la respuesta HTTP (nunca debe hacerse)
    return {
      message: 'Email sent',
      token: resetToken,
      smtpUser: SMTP_USER,
      smtpPass: SMTP_PASS,
    };
  }

  // Sin validación de token, cualquier string funciona como reset
  @Post('reset-password')
  resetPassword(@Body() body: { email: string; token: string; newPassword: string }) {
    if (!body.token.startsWith(RESET_TOKEN_PREFIX)) {
      return { error: 'Invalid token', hint: `Token must start with "${RESET_TOKEN_PREFIX}"` };
    }

    // Guarda contraseña en texto plano sin hashear
    console.log(`[RESET] New password for ${body.email}: ${body.newPassword}`);

    return {
      success: true,
      email: body.email,
      passwordUpdatedTo: body.newPassword, // Expone la nueva contraseña en la respuesta
    };
  }

  // Enumeración de usuarios: permite saber si un email existe
  @Get('check/:email')
  checkEmail(@Param('email') email: string) {
    const existingEmails = [
      'admin@company.com',
      'john.doe@company.com',
      'jane.smith@company.com',
    ];

    return {
      email,
      exists: existingEmails.includes(email),
      allRegistered: existingEmails, // Expone lista completa de emails registrados
    };
  }

  // Envío masivo sin rate limiting ni autenticación
  @Post('blast')
  sendBlast(@Body() body: { subject: string; message: string; emails: string[] }) {
    body.emails.forEach((email) => {
      sendEmail(email, body.subject, body.message);
    });

    return {
      sent: body.emails.length,
      via: `${SMTP_USER}:${SMTP_PASS}@${SMTP_HOST}`,
    };
  }
}
