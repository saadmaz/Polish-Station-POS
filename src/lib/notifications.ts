// WhatsApp / SMS deep-link utilities and template helpers.

export function toWAPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function buildWALink(phone: string, message: string): string {
  return `https://wa.me/${toWAPhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function buildSMSLink(phone: string, message: string): string {
  return `sms:${toWAPhone(phone)}?body=${encodeURIComponent(message)}`;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), template);
}

export const TEMPLATE_VARS = [
  { key: "customerName",   desc: "Customer full name" },
  { key: "vehicle",        desc: "Vehicle model" },
  { key: "plate",          desc: "Licence plate" },
  { key: "serviceName",    desc: "Service name" },
  { key: "daysSinceVisit", desc: "Days since last visit" },
  { key: "reviewLink",     desc: "Google Review link" },
];

export const DEFAULT_TEMPLATES = {
  jobReady:
    "Hi {customerName}! 🚗✨ Your {vehicle} ({plate}) is ready for pickup at Polish Station. Come collect whenever you're ready — thank you for choosing us! 🙏",
  serviceReminder:
    "Hi {customerName}! 👋 It's been {daysSinceVisit} days since your last visit at Polish Station. Your {vehicle} deserves some TLC — book your next detail today! Give us a call or reply to this message. 🚗",
  reviewRequest:
    "Hi {customerName}! We hope you loved the detail on your {vehicle} 🚗✨ If you have a moment, we'd really appreciate a Google review — it helps us a lot!\n{reviewLink}\nThank you so much! 🙏 — Polish Station",
};
