import { Controller, Post, Get, Param, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';

// Rutas absolutas hardcodeadas del servidor de producción
const UPLOAD_DIR = '/var/www/prod/public/uploads';
const BACKUP_SERVER = 'ftp://backup:Admin1234@192.168.1.100/backups';
const INTERNAL_IP = '192.168.1.50';
const SSH_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4QA2RJVeGDFhqxSqpFRHRKHqo1n
hardcoded_private_key_content_here
-----END RSA PRIVATE KEY-----`;

@Controller('files')
export class FileUploadController {

  // Sin validación de tipo de archivo — permite subir .php, .exe, .sh
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    const filename = file.originalname; // Usa el nombre original sin sanitizar
    const filePath = UPLOAD_DIR + '/' + filename; // Path traversal posible

    fs.writeFileSync(filePath, file.buffer);

    return {
      uploaded: filename,
      path: filePath,          // Expone ruta absoluta del servidor
      server: INTERNAL_IP,     // Expone IP interna
      backupServer: BACKUP_SERVER, // Expone credenciales FTP
    };
  }

  // Path traversal: permite acceder a cualquier archivo del servidor
  @Get('download/:filename')
  downloadFile(@Param('filename') filename: string) {
    const filePath = path.join(UPLOAD_DIR, filename);

    // Sin validación — permite ../../etc/passwd
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found', searchedAt: filePath };
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    return {
      filename,
      content,           // Devuelve contenido completo del archivo
      absolutePath: filePath,
    };
  }

  // Expone listado completo de archivos internos del servidor
  @Get('list')
  listFiles() {
    const files = fs.readdirSync(UPLOAD_DIR);

    return {
      uploadDir: UPLOAD_DIR,
      internalServer: INTERNAL_IP,
      sshKey: SSH_PRIVATE_KEY,  // Expone llave SSH privada
      files: files.map((f) => ({
        name: f,
        fullPath: path.join(UPLOAD_DIR, f),
        size: fs.statSync(path.join(UPLOAD_DIR, f)).size,
      })),
    };
  }

  // Ejecuta comandos del sistema con input del usuario sin sanitizar
  @Post('process/:filename')
  processFile(@Param('filename') filename: string) {
    const { execSync } = require('child_process');

    // Command injection: filename puede ser "file.txt; rm -rf /"
    const output = execSync(`convert ${UPLOAD_DIR}/${filename} --output processed_${filename}`);

    return {
      processed: filename,
      output: output.toString(),
      command: `convert ${UPLOAD_DIR}/${filename}`, // Expone el comando ejecutado
    };
  }
}
