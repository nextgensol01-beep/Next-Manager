export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export interface ParsedDevice {
  os: string;
  browser: string;
  type: DeviceType;
  typeLabel: string;
  label: string;
}

export function parseDevice(userAgent?: string | null): ParsedDevice {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) {
    return { os: "Unknown OS", browser: "Unknown browser", type: "unknown", typeLabel: "Device", label: "Unknown device" };
  }

  // iPadOS 13+ can request desktop sites and identify itself as Macintosh.
  // The `Mobile/...` token is what distinguishes that UA from a real Mac.
  const isIPad = ua.includes("ipad") || (ua.includes("macintosh") && ua.includes("mobile/"));
  const isIPhone = ua.includes("iphone") || ua.includes("ipod");
  const isTablet = isIPad || (ua.includes("android") && !ua.includes("mobile"));
  const isMobile = isIPhone || (!isTablet && (ua.includes("mobile") || ua.includes("android")));

  let os = "Unknown OS";
  if (ua.includes("windows")) os = "Windows";
  else if (isIPad) os = "iPadOS";
  else if (isIPhone) os = "iOS";
  else if (ua.includes("mac os x") || ua.includes("macintosh")) os = "macOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("linux")) os = "Linux";

  let browser = "Unknown browser";
  if (ua.includes("edg/") || ua.includes("edgios/")) browser = "Edge";
  else if (ua.includes("opr/") || ua.includes("opios/") || ua.includes("opera")) browser = "Opera";
  else if (ua.includes("firefox/") || ua.includes("fxios/")) browser = "Firefox";
  else if (ua.includes("chrome/") || ua.includes("crios/")) browser = "Chrome";
  else if (ua.includes("safari/")) browser = "Safari";

  const type: DeviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
  const typeLabel = type === "desktop" ? "Desktop" : type === "tablet" ? "Tablet" : type === "mobile" ? "Mobile" : "Device";

  return {
    os,
    browser,
    type,
    typeLabel,
    label: `${os} ${typeLabel} - ${browser}`,
  };
}
