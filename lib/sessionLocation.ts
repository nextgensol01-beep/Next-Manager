type IpLocationResponse = {
  success?: boolean;
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
};

export type SessionNetwork = {
  ip: string;
  location: string;
};

function decodeHeader(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function countryName(countryCode: string) {
  if (!countryCode) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode.toUpperCase()) || countryCode;
  } catch {
    return countryCode;
  }
}

export function normalizeClientIp(value?: string | null) {
  let ip = (value || "").split(",")[0]?.trim() || "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  return ip;
}

export function isPrivateOrLocalIp(value?: string | null) {
  const ip = normalizeClientIp(value).toLowerCase();
  if (!ip || ip === "::1" || ip === "localhost") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;

  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

export function locationFromRequestHeaders(headers: Headers) {
  const city = decodeHeader(headers.get("x-vercel-ip-city"));
  const region = decodeHeader(headers.get("x-vercel-ip-country-region"));
  const countryCode = decodeHeader(headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry"));
  const country = countryName(countryCode);
  return Array.from(new Set([city, region, country].filter(Boolean))).join(", ");
}

export async function lookupIpLocation(value?: string | null): Promise<SessionNetwork | null> {
  const ip = normalizeClientIp(value);
  if (ip && isPrivateOrLocalIp(ip)) return { ip, location: "Local network" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const endpoint = ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : "https://ipwho.is/";
    const response = await fetch(endpoint, {
      signal: controller.signal,
      next: { revalidate: 86_400 },
    });
    if (!response.ok) return null;
    const data = await response.json() as IpLocationResponse;
    if (data.success === false) return null;

    const resolvedIp = normalizeClientIp(data.ip || ip);
    const location = Array.from(new Set([data.city, data.region, data.country].filter(Boolean))).join(", ");
    if (!resolvedIp && !location) return null;
    return { ip: resolvedIp, location };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveSessionNetwork(headers: Headers, requestIp?: string | null): Promise<SessionNetwork> {
  const ip = normalizeClientIp(requestIp);
  const headerLocation = locationFromRequestHeaders(headers);
  if (headerLocation) return { ip, location: headerLocation };

  // During local development the request IP is loopback/private even though the
  // browser still has a public egress IP. Resolve that public IP so developers
  // can verify the same city/region UI they will see after deployment.
  if (ip && isPrivateOrLocalIp(ip)) {
    if (process.env.NODE_ENV === "development") {
      const developmentNetwork = await lookupIpLocation();
      if (developmentNetwork) return developmentNetwork;
    }
    return { ip, location: "Local network" };
  }
  const lookedUp = await lookupIpLocation(ip || (process.env.NODE_ENV === "development" ? undefined : null));
  return lookedUp || { ip, location: ip ? "Location unavailable" : "Local network" };
}
