import { useState } from "react";
import kivoLogo from "@/assets/kivo-logo.svg";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { StepProfile } from "./StepProfile";
import { StepPlan } from "./StepPlan";
import { StepProduct } from "./StepProduct";
import { StepCustomization } from "./StepCustomization";
import { StepPublish } from "./StepPublish";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";

export interface OnboardingData {
  profile: {
    avatar_url?: string;
    display_name: string;
    bio: string;
    username: string;
  };
  plan: 'free' | 'creator' | 'creator-pro';
  product?: {
    type: 'DIGITAL' | 'LEAD_MAGNET';
    name: string;
    price: number;
    thumbnail_url?: string;
  };
  customization?: {
    template: string;
    primary_color: string;
    background_color: string;
  };
}

const STEPS = [
  { id: 1, title: "Perfil", required: true },
  { id: 2, title: "Plano", required: false },
  { id: 3, title: "Produto", required: false },
  { id: 4, title: "Personalização", required: false },
  { id: 5, title: "Publicar", required: true },
];

export default function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({
    profile: {
      display_name: "",
      bio: "",
      username: "",
    },
    plan: 'free',
  });
  
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();

  const updateData = (stepData: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...stepData }));
  };

  const nextStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const skipStep = () => {
    if (currentStep < STEPS.length && !STEPS[currentStep - 1].required) {
      nextStep();
    }
  };

  const canSkip = currentStep > 1 && currentStep < STEPS.length && !STEPS[currentStep - 1].required;

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepProfile
            data={data.profile}
            onUpdate={(profileData) => updateData({ profile: profileData })}
            onNext={nextStep}
            user={user}
          />
        );
      case 2:
        return (
          <StepPlan
            selectedPlan={data.plan}
            onUpdate={(plan) => updateData({ plan })}
            onNext={nextStep}
          />
        );
      case 3:
        return (
          <StepProduct
            data={data.product}
            onUpdate={(product) => updateData({ product })}
            onNext={nextStep}
            workspaceId={currentWorkspace?.id || ""}
          />
        );
      case 4:
        return (
          <StepCustomization
            data={data.customization}
            onUpdate={(customization) => updateData({ customization })}
            onNext={nextStep}
            profileData={data.profile}
            productData={data.product}
          />
        );
      case 5:
        return (
          <StepPublish
            data={data}
            workspaceId={currentWorkspace?.id || ""}
            onComplete={() => navigate('/dashboard')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container max-w-4xl mx-auto px-6 py-8">
        {/* Header com Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <img src={kivoLogo} alt="Kivo" className="h-8" />
              <span className="text-xl font-bold text-primary">Kivo</span>
            </div>
            <span className="text-sm text-muted-foreground">
              Etapa {currentStep} de {STEPS.length}
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{STEPS[currentStep - 1].title}</span>
              <span>{Math.round((currentStep / STEPS.length) * 100)}%</span>
            </div>
            <Progress value={(currentStep / STEPS.length) * 100} className="h-2" />
          </div>
        </div>

        {/* Navigation */}
        {currentStep > 1 && (
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={prevStep}
              className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Voltar</span>
            </Button>
          </div>
        )}

        {/* Step Content */}
        <div className="animate-fade-in">
          {renderStep()}
        </div>

        {/* Skip Button */}
        {canSkip && (
          <div className="mt-6 text-center">
            <Button variant="ghost" onClick={skipStep} className="text-muted-foreground">
              Pular esta etapa
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}