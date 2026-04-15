import { Input } from "@/components/ui/input";
import { formatCPF, formatPhone } from "@/lib/cpf";

interface CustomerData {
  name: string;
  email: string;
  cpf: string;
  phone: string;
}

interface CustomerFormProps {
  data: CustomerData;
  onChange: (data: CustomerData) => void;
  onEmailBlur: () => void;
  errors: Record<string, string>;
}

export function CustomerForm({ data, onChange, onEmailBlur, errors }: CustomerFormProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dados de contato</p>
      
      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
        <Input
          value={data.email}
          onChange={(e) => onChange({ ...data, email: e.target.value })}
          onBlur={onEmailBlur}
          placeholder="Email *"
          type="email"
          className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
        />
        <Input
          value={data.phone}
          onChange={(e) => onChange({ ...data, phone: formatPhone(e.target.value) })}
          placeholder="WhatsApp (opcional)"
          inputMode="tel"
          className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
        />
        <Input
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="Nome completo *"
          className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
        />
        <Input
          value={data.cpf}
          onChange={(e) => onChange({ ...data, cpf: formatCPF(e.target.value) })}
          placeholder="CPF *"
          inputMode="numeric"
          className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
        />
      </div>

      {(errors.name || errors.email || errors.cpf) && (
        <div className="space-y-1">
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
        </div>
      )}
    </div>
  );
}
