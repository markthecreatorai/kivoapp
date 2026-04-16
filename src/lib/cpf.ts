export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(digits[10]);
}

export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function detectCardBrand(number: string): string {
  const d = number.replace(/\D/g, '');
  if (/^4/.test(d)) return 'visa';
  if (/^5[1-5]/.test(d)) return 'mastercard';
  if (/^3[47]/.test(d)) return 'amex';
  if (/^(636368|438935|504175|451416|636297)/.test(d) || /^(5067|4576|4011)/.test(d)) return 'elo';
  return 'generic';
}

/** Luhn checksum validation */
export function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length === 0) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/** Expected card number length by brand */
export function expectedCardLength(brand: string): number[] {
  if (brand === 'amex') return [15];
  if (brand === 'elo') return [16];
  return [16]; // visa, mastercard, generic
}

/** Expected CVC length by brand */
export function expectedCvcLength(brand: string): number {
  return brand === 'amex' ? 4 : 3;
}

/** Validate expiry MM/AA — must be current or future month */
export function validateExpiry(expiry: string): boolean {
  const parts = expiry.split('/');
  if (parts.length !== 2) return false;
  const month = parseInt(parts[0], 10);
  const year = parseInt(parts[1], 10);
  if (isNaN(month) || isNaN(year)) return false;
  if (month < 1 || month > 12) return false;
  const fullYear = 2000 + year;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  if (fullYear < currentYear) return false;
  if (fullYear === currentYear && month < currentMonth) return false;
  return true;
}

export interface CardValidationErrors {
  holder_name?: string;
  number?: string;
  expiry?: string;
  cvv?: string;
}

/** Full client-side card validation — returns empty object if valid */
export function validateCardFields(card: { holder_name: string; number: string; expiry: string; cvv: string }): CardValidationErrors {
  const errs: CardValidationErrors = {};
  if (!card.holder_name.trim()) errs.holder_name = 'Nome no cartão é obrigatório';
  const digits = card.number.replace(/\D/g, '');
  const brand = detectCardBrand(digits);
  const validLengths = expectedCardLength(brand);
  if (!validLengths.includes(digits.length)) {
    errs.number = 'Número do cartão inválido';
  } else if (!luhnCheck(digits)) {
    errs.number = 'Número do cartão inválido';
  }
  if (!validateExpiry(card.expiry)) {
    errs.expiry = 'Data de validade inválida ou expirada';
  }
  const cvcDigits = card.cvv.replace(/\D/g, '');
  if (cvcDigits.length !== expectedCvcLength(brand)) {
    errs.cvv = `CVC deve ter ${expectedCvcLength(brand)} dígitos`;
  }
  return errs;
}

/** Map backend/edge function errors to user-friendly PT-BR messages */
export function mapPaymentError(raw: string): string {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('declined') || lower.includes('recusado') || lower.includes('refused'))
    return 'Cartão recusado. Tente outro cartão ou forma de pagamento.';
  if (lower.includes('invalid') || lower.includes('inválid'))
    return 'Dados inválidos. Verifique as informações do cartão.';
  if (lower.includes('unauthorized') || lower.includes('não autoriza'))
    return 'Transação não autorizada pelo banco emissor.';
  if (lower.includes('insufficient') || lower.includes('insuficiente'))
    return 'Saldo insuficiente. Tente outro cartão.';
  if (lower.includes('expired') || lower.includes('expirad'))
    return 'Cartão expirado. Use outro cartão.';
  if (lower.includes('timeout') || lower.includes('tempo'))
    return 'Falha temporária. Tente novamente em alguns segundos.';
  if (lower.includes('non-2xx') || lower.includes('edge function') || lower.includes('functionsrelay'))
    return 'Falha temporária no processamento. Tente novamente.';
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  return 'Não foi possível processar o pagamento. Tente novamente.';
}
