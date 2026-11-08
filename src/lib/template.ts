// Shared by the browser (preview) and the send-sms function (real send),
// so the guest gets exactly the text the host saw.
export interface TemplateVars {
  name: string;
  business: string;
  wait: number | null;
  link: string;
}

export function fillTemplate(tpl: string, v: TemplateVars): string {
  const first = (v.name || "").trim().split(/\s+/)[0] || "there";
  return tpl
    .replace(/\{name\}/g, first)
    .replace(/\{business\}/g, v.business)
    .replace(/\{wait\}/g, String(v.wait ?? 15))
    .replace(/\{link\}/g, v.link)
    .trim();
}

export const statusLink = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/s/${token}`;
