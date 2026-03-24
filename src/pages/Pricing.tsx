import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

// Pricing page now redirects to the unified upgrade flow
export default function Pricing() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/billing/upgrade-flow?source=pricing_page", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
