export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

const LABELS = ["Muito fraca", "Fraca", "Razoável", "Forte", "Muito forte"];
const COLORS = [
  "bg-destructive",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-600",
];

const OBVIOUS_PASSWORDS = new Set([
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "12345",
  "senha",
  "senha123",
  "minhasenha",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "admin",
  "admin123",
  "administrador",
  "abc123",
  "abcd1234",
  "111111",
  "000000",
  "iloveyou",
  "letmein",
]);

export function getPasswordStrength(password: string): PasswordStrength {
  const pwd = password ?? "";

  const normalized = pwd.trim().toLowerCase();
  if (OBVIOUS_PASSWORDS.has(normalized)) {
    return { score: 0, label: LABELS[0], color: COLORS[0] };
  }

  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  const capped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

  return { score: capped, label: LABELS[capped], color: COLORS[capped] };
}
