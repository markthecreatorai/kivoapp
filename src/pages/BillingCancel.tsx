import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function BillingCancel() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to upgrade flow step 1 so user can retry
    navigate("/billing/upgrade-flow?step=cancel", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
