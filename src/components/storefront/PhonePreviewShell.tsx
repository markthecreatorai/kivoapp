import { ReactNode } from "react";

interface PhonePreviewShellProps {
  children: ReactNode;
  label?: string;
}

export function PhonePreviewShell({ children, label = "Preview em tempo real" }: PhonePreviewShellProps) {
  return (
    <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
      <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
        {label}
      </p>

      {/* Phone Shell */}
      <div className="w-[320px] h-[640px] bg-black rounded-[40px] p-2 shadow-2xl flex flex-col justify-start">
        {/* Notch */}
        <div className="w-32 h-6 bg-black absolute top-2 inset-x-0 mx-auto rounded-b-xl z-50"></div>
        
        {/* Screen */}
        <div className="w-full h-full rounded-[32px] overflow-hidden relative">
          {children}
        </div>
      </div>
    </div>
  );
}
