import type { ImapFlow } from 'imapflow';
import type { Transporter } from 'nodemailer';
import type { DAVClient } from 'tsdav';

export interface ImapCreds {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface SmtpCreds {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface CalDavCreds {
  serverUrl: string;
  user: string;
  pass: string;
}

export interface Capabilities {
  imap: { thread: boolean; condstore: boolean; idle: boolean };
  smtp: boolean;
  caldav: boolean;
}

export interface SessionRecord {
  token: string;
  creds: {
    imap: ImapCreds;
    smtp: SmtpCreds;
    caldav?: CalDavCreds;
  };
  email: string;
  displayName: string;
  capabilities: Capabilities;
  imapConnection: ImapFlow | null;
  imapKeepAliveTimer: NodeJS.Timeout | null;
  smtpTransport: Transporter | null;
  caldavClient: DAVClient | null;
  createdAt: number;
  lastUsed: number;
}
