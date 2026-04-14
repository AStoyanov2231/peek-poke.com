// Email validation utility with typo detection and disposable email blocking

type EmailValidationResult = {
  isValid: boolean;
  error?: string;
  suggestion?: string; // For typo suggestions like "Did you mean gmail.com?"
};

// RFC 5322 compliant email regex (simplified but robust)
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Common email domain typos and their corrections
const DOMAIN_TYPOS: Record<string, string> = {
  // Gmail typos
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmailcom": "gmail.com",
  "gmaul.com": "gmail.com",
  "gemail.com": "gmail.com",
  "gimail.com": "gmail.com",

  // Yahoo typos
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "tahoo.com": "yahoo.com",
  "uahoo.com": "yahoo.com",

  // Hotmail/Outlook typos
  "hotmal.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  "hitmail.com": "hotmail.com",
  "hormail.com": "hotmail.com",
  "outloo.com": "outlook.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "outlool.com": "outlook.com",
  "outllok.com": "outlook.com",

  // iCloud typos
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
  "icloud.con": "icloud.com",
  "icoud.com": "icloud.com",
  "iclould.com": "icloud.com",

  // Protonmail typos
  "protonmal.com": "protonmail.com",
  "protonmail.co": "protonmail.com",
  "protonmail.con": "protonmail.com",
  "protonmial.com": "protonmail.com",
};

// Disposable email domains (curated list of most common)
const DISPOSABLE_DOMAINS = new Set([
  // Most popular disposable email services
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "guerrillamail.com",
  "guerrillamail.org",
  "guerrillamail.net",
  "10minutemail.com",
  "10minutemail.net",
  "10minmail.com",
  // "mailinator.com",
  "mailinator.net",
  "throwawaymail.com",
  "fakeinbox.com",
  "sharklasers.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "dispostable.com",
  "mailnesia.com",
  "tempr.email",
  "discard.email",
  "throwaway.email",
  "getnada.com",
  "maildrop.cc",
  "emailondeck.com",
  "tempail.com",
  "mohmal.com",
  "tempmailo.com",
  "tmails.net",
  "tmpmail.org",
  "tmpmail.net",
  "emailfake.com",
  "fakemailgenerator.com",
  "mailsac.com",
  "mintemail.com",
  "moakt.com",
  "spamgourmet.com",
  "trashmail.com",
  "trashmail.net",
  "mailcatch.com",
  "incognitomail.org",
  "burnermail.io",
  "33mail.com",
  "getairmail.com",
  "tempinbox.com",
  "guerrillamail.biz",
  "guerrillamail.de",
  "spam4.me",
  "grr.la",
  "mailexpire.com",
  "disposableemailaddresses.com",
]);

/**
 * Validates an email address for format, typos, and disposable domains
 */
export function validateEmail(email: string): EmailValidationResult {
  // Trim and lowercase
  const normalizedEmail = email.trim().toLowerCase();

  // Check for empty email
  if (!normalizedEmail) {
    return { isValid: false, error: "Email is required." };
  }

  // Check format with regex
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { isValid: false, error: "Please enter a valid email address." };
  }

  // Extract domain
  const parts = normalizedEmail.split("@");
  if (parts.length !== 2) {
    return { isValid: false, error: "Please enter a valid email address." };
  }

  const [localPart, domain] = parts;

  // Check local part length (max 64 chars per RFC 5321)
  if (localPart.length > 64) {
    return { isValid: false, error: "Email address is too long." };
  }

  // Check total length (max 254 chars per RFC 5321)
  if (normalizedEmail.length > 254) {
    return { isValid: false, error: "Email address is too long." };
  }

  // Check for domain typos and suggest corrections
  if (DOMAIN_TYPOS[domain]) {
    const correctedEmail = `${localPart}@${DOMAIN_TYPOS[domain]}`;
    return {
      isValid: false,
      error: `Did you mean ${correctedEmail}?`,
      suggestion: correctedEmail,
    };
  }

  // Check for disposable email domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      isValid: false,
      error:
        "Disposable email addresses are not allowed. Please use a permanent email.",
    };
  }

  // Check for subdomains of disposable domains
  for (const disposableDomain of DISPOSABLE_DOMAINS) {
    if (domain.endsWith(`.${disposableDomain}`)) {
      return {
        isValid: false,
        error:
          "Disposable email addresses are not allowed. Please use a permanent email.",
      };
    }
  }

  return { isValid: true };
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

