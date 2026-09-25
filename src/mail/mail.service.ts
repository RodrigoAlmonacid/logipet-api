import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true', // true solo para el puerto 465
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  async send(to: string, subject: string, html: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar el mail a ${to}`, err);
      return false; // no rompemos el alta del empleado si falla el mail
    }
  }
}