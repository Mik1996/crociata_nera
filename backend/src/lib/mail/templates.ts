import { MailMessage } from './mailer';

export type MailLanguage = 'it-IT' | 'en-US' | 'es-ES';

export const MAIL_LANGUAGES: readonly MailLanguage[] = ['it-IT', 'en-US', 'es-ES'];

interface Copy {
  subject: string;
  greeting: (name: string) => string;
  body: string;
  action: string;
  expiry: string;
  ignore: string;
}

const RESET: Record<MailLanguage, Copy> = {
  'it-IT': {
    subject: 'Crociata Nera – reimposta la password',
    greeting: (name) => `Ciao ${name},`,
    body: 'abbiamo ricevuto una richiesta per reimpostare la password del tuo account.',
    action: 'Reimposta la password',
    expiry: 'Il link è valido per 1 ora e può essere usato una sola volta.',
    ignore: 'Se non sei stato tu, ignora questa email: la password resta invariata.',
  },
  'en-US': {
    subject: 'Crociata Nera – reset your password',
    greeting: (name) => `Hi ${name},`,
    body: 'we received a request to reset the password of your account.',
    action: 'Reset password',
    expiry: 'The link is valid for 1 hour and can be used only once.',
    ignore: 'If this was not you, ignore this email: your password stays the same.',
  },
  'es-ES': {
    subject: 'Crociata Nera – restablece tu contraseña',
    greeting: (name) => `Hola ${name}:`,
    body: 'hemos recibido una solicitud para restablecer la contraseña de tu cuenta.',
    action: 'Restablecer contraseña',
    expiry: 'El enlace es válido durante 1 hora y solo se puede usar una vez.',
    ignore: 'Si no has sido tú, ignora este correo: la contraseña no cambia.',
  },
};

const VERIFY: Record<MailLanguage, Copy> = {
  'it-IT': {
    subject: 'Crociata Nera – conferma la tua email',
    greeting: (name) => `Benvenuto ${name},`,
    body: 'conferma il tuo indirizzo email per completare la registrazione.',
    action: 'Conferma email',
    expiry: 'Il link è valido per 24 ore.',
    ignore: 'Se non ti sei registrato tu, ignora questa email.',
  },
  'en-US': {
    subject: 'Crociata Nera – confirm your email',
    greeting: (name) => `Welcome ${name},`,
    body: 'please confirm your email address to complete your registration.',
    action: 'Confirm email',
    expiry: 'The link is valid for 24 hours.',
    ignore: 'If you did not sign up, ignore this email.',
  },
  'es-ES': {
    subject: 'Crociata Nera – confirma tu email',
    greeting: (name) => `Bienvenido ${name}:`,
    body: 'confirma tu dirección de email para completar el registro.',
    action: 'Confirmar email',
    expiry: 'El enlace es válido durante 24 horas.',
    ignore: 'Si no te has registrado tú, ignora este correo.',
  },
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function render(copy: Copy, to: string, name: string, link: string): MailMessage {
  const text = [copy.greeting(name), '', copy.body, '', `${copy.action}: ${link}`, '', copy.expiry, copy.ignore].join('\n');
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0f1729;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#1f2b45;border:3px solid #0a1020;border-radius:14px;color:#ffffff">
    <tr><td style="padding:18px 24px;background:#e9ae1f;border-radius:11px 11px 0 0;color:#1d1503;font-size:20px;font-weight:bold;text-align:center">Crociata Nera</td></tr>
    <tr><td style="padding:24px;font-size:15px;line-height:1.5">
      <p style="margin:0 0 12px">${escapeHtml(copy.greeting(name))}</p>
      <p style="margin:0 0 20px">${escapeHtml(copy.body)}</p>
      <p style="margin:0 0 20px;text-align:center">
        <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;background:#367a19;border:2px solid #173a08;border-radius:10px;color:#ffffff;font-weight:bold;text-decoration:none">${escapeHtml(copy.action)}</a>
      </p>
      <p style="margin:0 0 8px;color:#c5cfe4;font-size:13px">${escapeHtml(copy.expiry)}</p>
      <p style="margin:0;color:#c5cfe4;font-size:13px">${escapeHtml(copy.ignore)}</p>
    </td></tr>
  </table>
</body></html>`;
  return { to, subject: copy.subject, text, html };
}

export function passwordResetMail(language: MailLanguage, to: string, name: string, link: string): MailMessage {
  return render(RESET[language], to, name, link);
}

export function verifyEmailMail(language: MailLanguage, to: string, name: string, link: string): MailMessage {
  return render(VERIFY[language], to, name, link);
}
