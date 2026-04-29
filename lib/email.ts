import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) {
  const resend = getResend();
  return resend.emails.send({
    from: opts.from ?? 'Haier BA Measurement <noreply@outerjoin.co.za>',
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
  });
}
