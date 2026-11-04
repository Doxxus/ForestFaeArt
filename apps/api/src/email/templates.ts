import { oneLine, type EmailMessage } from "./provider";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraphs = (s: string) =>
  s
    .split(/\r?\n\r?\n/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");

// Brand colours from the design tokens (ADR 005). Plain, accessible HTML with a text version alongside (EML-4).
const wrap = (heading: string, body: string, footer: string) =>
  `<!doctype html><html lang="en"><body style="margin:0;background:#F4EFE3;font-family:Georgia,'Times New Roman',serif;color:#2B1E16">` +
  `<div style="max-width:560px;margin:0 auto;padding:24px">` +
  `<h1 style="font-size:22px;color:#2F4A3A;margin:0 0 16px">${esc(heading)}</h1>` +
  `<div style="font-size:16px;line-height:1.5">${body}</div>` +
  `<p style="font-size:13px;color:#556B3A;margin-top:24px;border-top:1px solid #D6CFBF;padding-top:12px">${esc(footer)}</p>` +
  `</div></body></html>`;

export interface InquiryEmailInput {
  name: string;
  email: string;
  message: string;
  product?: { sku: string; title: string; url: string } | null;
}

/** To the inbox (asa@). Reply-To is the visitor, so replying from a mail app works (EML-5). */
export function inquiryNotification(input: InquiryEmailInput, opts: { businessName: string; from: string; to: string; adminUrl: string; idempotencyKey: string }): EmailMessage {
  const name = oneLine(input.name, 120);
  const productLine = input.product ? `About: ${input.product.title} (${input.product.sku})\n${input.product.url}\n\n` : "";
  const text = `${name} <${input.email}> sent a message through the website.\n\n${productLine}${input.message}\n\n---\nReply to this email to answer them, or open the inquiry: ${opts.adminUrl}\n`;
  const productHtml = input.product
    ? `<p style="margin:0 0 14px"><strong>About:</strong> <a href="${esc(input.product.url)}" style="color:#2F4A3A">${esc(input.product.title)}</a> (${esc(input.product.sku)})</p>`
    : "";
  return {
    from: `${opts.businessName} <${opts.from}>`,
    to: [opts.to],
    replyTo: input.email,
    subject: oneLine(input.product ? `Question about ${input.product.title}` : `New message from ${name}`),
    text,
    html: wrap(`New message from ${name}`, `<p style="margin:0 0 14px">${esc(name)} (<a href="mailto:${esc(input.email)}" style="color:#2F4A3A">${esc(input.email)}</a>) wrote:</p>${productHtml}${paragraphs(input.message)}`, `Reply to this email to answer them, or open it in your admin: ${opts.adminUrl}`),
    idempotencyKey: opts.idempotencyKey,
  };
}

/** The owner's answer, sent as asa@ with Reply-To asa@ (EML-5 a). */
export function inquiryReply(opts: { businessName: string; fromAddress: string; to: string; visitorName: string; originalMessage: string; body: string; idempotencyKey: string }): EmailMessage {
  const quoted = opts.originalMessage.split(/\r?\n/).map((l) => `> ${l}`).join("\n");
  return {
    from: `${opts.businessName} <${opts.fromAddress}>`,
    to: [opts.to],
    replyTo: opts.fromAddress,
    subject: oneLine(`Re: your message to ${opts.businessName}`),
    text: `${opts.body}\n\n---\nYou wrote:\n${quoted}\n`,
    html: wrap(`Hello ${oneLine(opts.visitorName, 120)}`, `${paragraphs(opts.body)}<blockquote style="margin:16px 0 0;padding-left:12px;border-left:3px solid #B7C3A3;color:#556B3A">${paragraphs(opts.originalMessage)}</blockquote>`, `${opts.businessName}. Just reply to this email to write back.`),
    idempotencyKey: opts.idempotencyKey,
  };
}
