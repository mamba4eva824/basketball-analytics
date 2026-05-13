"use client";

interface TeamLogoProps {
  abbreviation: string;
  primaryColor?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "w-8 h-8 text-[10px]",
  md: "w-10 h-10 text-xs",
  lg: "w-14 h-14 text-sm",
};

export function TeamLogo({
  abbreviation,
  primaryColor,
  size = "md",
  className = "",
}: TeamLogoProps) {
  const bgColor = primaryColor ? `${primaryColor}33` : "rgba(85,37,131,0.2)";
  const textColor = primaryColor ?? "#FDB927";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg font-bold ${SIZES[size]} ${className}`}
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {abbreviation}
    </span>
  );
}
