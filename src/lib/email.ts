import "server-only";

// Gửi email qua Resend REST API (https://resend.com/docs/api-reference/emails/send-email)
// — gọi thẳng bằng fetch, không cần SDK riêng. Cần RESEND_API_KEY +
// RESEND_FROM_EMAIL trong .env.local (domain gửi phải đã verify trong Resend).

interface SendEmailAttachment {
  filename: string;
  content: Buffer;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: SendEmailAttachment[];
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: SendEmailInput): Promise<{ error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      error:
        "Chưa cấu hình gửi email (thiếu RESEND_API_KEY/RESEND_FROM_EMAIL trong .env.local).",
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `Gửi email thất bại (${res.status}): ${body || res.statusText}` };
  }

  return {};
}
