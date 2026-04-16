export type EmailTokens = {
  brand: {
    primary: string;
    secondary: string;
  };
  background: {
    page: string;
    card: string;
    muted: string;
  };
  text: {
    primary: string;
    secondary: string;
    inverse: string;
  };
  border: {
    default: string;
    strong: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    pill: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  typography: {
    fontFamily: string;
    titleSize: string;
    bodySize: string;
    smallSize: string;
    lineHeight: string;
  };
  container: {
    maxWidth: number;
  };
  button: {
    primaryBg: string;
    primaryText: string;
    secondaryBg: string;
    secondaryText: string;
    border: string;
  };
};

export const KIVO_EMAIL_TOKENS: EmailTokens = {
  brand: {
    primary: "#F9423A",
    secondary: "#111827",
  },
  background: {
    page: "#F5F6F8",
    card: "#FFFFFF",
    muted: "#F9FAFB",
  },
  text: {
    primary: "#111827",
    secondary: "#4B5563",
    inverse: "#FFFFFF",
  },
  border: {
    default: "#E5E7EB",
    strong: "#D1D5DB",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    pill: "999px",
  },
  spacing: {
    xs: "8px",
    sm: "12px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    xxl: "40px",
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    titleSize: "28px",
    bodySize: "16px",
    smallSize: "13px",
    lineHeight: "1.6",
  },
  container: {
    maxWidth: 600,
  },
  button: {
    primaryBg: "#F9423A",
    primaryText: "#FFFFFF",
    secondaryBg: "#FFFFFF",
    secondaryText: "#111827",
    border: "#D1D5DB",
  },
};
