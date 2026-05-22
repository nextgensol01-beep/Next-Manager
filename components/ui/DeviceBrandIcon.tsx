import { Chrome, Compass, Globe } from "lucide-react";
import type { ParsedDevice } from "@/lib/device";

type IconProps = {
  className?: string;
};

function WindowsLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#00A4EF" d="M3 4.6 10.8 3.5v7.9H3V4.6Z" />
      <path fill="#00A4EF" d="M12.2 3.3 21 2v9.4h-8.8V3.3Z" />
      <path fill="#00A4EF" d="M3 12.6h7.8v7.9L3 19.4v-6.8Z" />
      <path fill="#00A4EF" d="M12.2 12.6H21V22l-8.8-1.3v-8.1Z" />
    </svg>
  );
}

function AppleLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.4 13.1c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.9.9-3.6 2.2-1.6 2.7-.4 6.7 1.1 8.9.7 1.1 1.6 2.3 2.8 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.9.7c1.2 0 1.9-1.1 2.7-2.2.8-1.2 1.1-2.3 1.1-2.4 0-.1-2.4-1-2.4-3.7ZM14.3 6.7c.6-.8 1.1-1.8 1-2.9-1 .1-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.8 1.1.1 2.2-.6 2.8-1.4Z"
      />
    </svg>
  );
}

function AndroidLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#3DDC84" d="M7.1 9.2h9.8c1 0 1.8.8 1.8 1.8v5.5c0 1-.8 1.8-1.8 1.8H7.1c-1 0-1.8-.8-1.8-1.8V11c0-1 .8-1.8 1.8-1.8Z" />
      <path fill="#3DDC84" d="M7 8.2c.2-1.6 1.3-3 2.8-3.7L8.9 3.1a.5.5 0 0 1 .8-.5l1 1.6c.4-.1.8-.1 1.3-.1s.9 0 1.3.1l1-1.6a.5.5 0 1 1 .8.5l-.9 1.4c1.5.7 2.6 2.1 2.8 3.7H7Z" />
      <path fill="#fff" d="M9.1 6.7a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4ZM14.9 6.7a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4Z" />
      <path stroke="#3DDC84" strokeLinecap="round" strokeWidth="1.8" d="M3.5 11v5.2M20.5 11v5.2M8.5 18.4v2.4M15.5 18.4v2.4" />
    </svg>
  );
}

function EdgeLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="edge-a" x1="4" x2="20" y1="6" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0AA8F2" />
          <stop offset=".55" stopColor="#0AC7A8" />
          <stop offset="1" stopColor="#1167B1" />
        </linearGradient>
      </defs>
      <path fill="url(#edge-a)" d="M12 2.5a9.5 9.5 0 0 1 9.4 8.3c-1.2-2.1-3.5-3.5-6.2-3.5-3.8 0-6.9 2.9-7.2 6.6-.1 1.4.5 2.7 1.6 3.5.9.7 2.2 1.1 3.7 1.1 2.1 0 3.8-.8 4.9-2.1-.9 3-3.7 5.1-7 5.1A8.8 8.8 0 0 1 2.4 13C2.4 7.2 6.7 2.5 12 2.5Z" />
      <path fill="#fff" opacity=".9" d="M8.1 14.2c.4-2.7 2.8-4.8 5.7-4.8 2.7 0 4.8 1.7 5.4 4.1H8.1v.7Z" />
      <path fill="#0877BD" d="M8.2 15.1c.4 2.3 2.4 4 5.2 4 2.2 0 4-.9 5.1-2.4-1.4 2.8-4.3 4.7-7.6 4.7-4.5 0-8.4-3.5-8.4-8.4 0-2.3.9-4.3 2.2-5.7-.7 1.1-1 2.4-1 3.8 0 2.5 1.7 4 4.5 4Z" />
    </svg>
  );
}

function FirefoxLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#FF7139" d="M20.8 8.7c.5 1 .7 2.1.7 3.3a9.5 9.5 0 1 1-17.9-4.4c-.2 1.3.1 2.7.9 3.8C5.6 7.8 9 5.2 12.9 5.2c1.2 0 2.3.2 3.3.7-.7-.8-1.5-1.4-2.5-1.8 2.8.1 5.4 1.8 7.1 4.6Z" />
      <path fill="#FFB000" d="M6.6 13.2c0 3 2.4 5.4 5.4 5.4s5.4-2.4 5.4-5.4c0-1.4-.5-2.7-1.4-3.7 1.7.6 2.8 2.2 2.8 4.1 0 3.4-3 6.1-6.8 6.1-3.9 0-7-2.9-7-6.6 0-.6.1-1.2.2-1.7.3.7.8 1.3 1.4 1.8Z" />
    </svg>
  );
}

function OperaLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#FF1B2D" d="M12 2.5A9.5 9.5 0 1 0 12 21.5 9.5 9.5 0 0 0 12 2.5Zm0 3c2.2 0 4 2.9 4 6.5s-1.8 6.5-4 6.5-4-2.9-4-6.5 1.8-6.5 4-6.5Z" />
    </svg>
  );
}

export function DeviceOsIcon({ device, className }: { device: ParsedDevice; className?: string }) {
  if (device.os === "Windows") return <WindowsLogo className={className} />;
  if (device.os === "Android") return <AndroidLogo className={className} />;
  if (device.os === "macOS" || device.os === "iPhone" || device.os === "iPad") return <AppleLogo className={className} />;
  return <Globe className={className} />;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BrowserBrandIcon({ browser, className }: { browser: string; className?: string }) {
  if (browser === "Edge") return <EdgeLogo className={className} />;
  if (browser === "Chrome") return <Chrome className={className} />;
  if (browser === "Safari") return <Compass className={className} />;
  if (browser === "Firefox") return <FirefoxLogo className={className} />;
  if (browser === "Opera") return <OperaLogo className={className} />;
  return <Globe className={className} />;
}

export function iconColorClass(icon: "os" | "browser" | "network") {
  if (icon === "os") return "text-sky-500";
  if (icon === "browser") return "text-emerald-500";
  return "text-amber-500";
}
